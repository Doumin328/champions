type WorkerSceneKind = "idle" | "selection" | "battle" | "unknown";

type WorkerIndicator = {
  id: string;
  targetState: Exclude<WorkerSceneKind, "unknown">;
  detectFromScene?: Exclude<WorkerSceneKind, "unknown">;
  scanSlotRects?: "player";
  threshold: number;
  minTemplateScore?: number;
};

type WorkerTemplate = {
  id: string;
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

type InitMessage = {
  type: "init";
  indicators: WorkerIndicator[];
  templates: WorkerTemplate[];
};

type DetectSceneMessage = {
  type: "detect-scene";
  requestId: number;
  currentScene: WorkerSceneKind;
  indicatorIds: string[];
  samples: Array<{
    indicatorId: string;
    variants: Uint8ClampedArray[];
  }>;
};

type WorkerInputMessage = InitMessage | DetectSceneMessage;

type DetectSceneScore = {
  indicatorId: string;
  score: number;
  threshold: number;
  matched: boolean;
  detectFromScene?: Exclude<WorkerSceneKind, "unknown">;
};

type DetectSceneResultMessage = {
  type: "detect-scene-result";
  requestId: number;
  rawScene: WorkerSceneKind;
  scores: DetectSceneScore[];
};

const workerState = {
  indicatorsById: new Map<string, WorkerIndicator>(),
  templatesById: new Map<string, WorkerTemplate>(),
};

function workerComputeTemplateScore(observed: Uint8ClampedArray, template: Uint8ClampedArray): number {
  if (observed.length !== template.length || observed.length === 0) return 0;
  let totalDiff = 0;
  const pixelCount = observed.length / 4;
  for (let index = 0; index < observed.length; index += 4) {
    const observedGray = observed[index] * 0.299 + observed[index + 1] * 0.587 + observed[index + 2] * 0.114;
    const templateGray = template[index] * 0.299 + template[index + 1] * 0.587 + template[index + 2] * 0.114;
    totalDiff += Math.abs(observedGray - templateGray);
  }
  return Math.max(0, 1 - totalDiff / (pixelCount * 255));
}

function workerDetectIdleSceneFromScores(scores: DetectSceneScore[], currentScene: WorkerSceneKind): WorkerSceneKind {
  if (currentScene !== "battle") {
    return scores.every(({ matched }) => matched) ? "idle" : "unknown";
  }

  const battleSpecificScores = scores.filter(({ detectFromScene }) => detectFromScene === "battle");
  if (battleSpecificScores.length >= 2 && battleSpecificScores.every(({ matched }) => matched)) {
    return "idle";
  }

  const fallbackScores = scores.filter(({ detectFromScene }) => !detectFromScene);
  if (fallbackScores.length > 0 && fallbackScores.every(({ matched }) => matched)) {
    return "idle";
  }

  return "unknown";
}

function workerDetectSelectionSceneFromScores(scores: DetectSceneScore[]): WorkerSceneKind {
  const completeScore = scores.find(({ indicatorId }) => indicatorId === "selection-complete");
  if (!completeScore) {
    return scores.every(({ matched }) => matched) ? "selection" : "unknown";
  }

  if (!completeScore.matched) return "unknown";

  const arrowScores = scores.filter(({ indicatorId }) => indicatorId === "selection-arrow");
  if (arrowScores.length === 0 || arrowScores.some(({ matched }) => matched)) {
    return "selection";
  }

  return "selection";
}

function workerDetectScene(message: DetectSceneMessage): DetectSceneResultMessage {
  const sampleMap = new Map(message.samples.map((entry) => [entry.indicatorId, entry.variants]));
  const indicators = message.indicatorIds
    .map((id) => workerState.indicatorsById.get(id))
    .filter((indicator): indicator is WorkerIndicator => !!indicator);

  if (indicators.length === 0) {
    return {
      type: "detect-scene-result",
      requestId: message.requestId,
      rawScene: "unknown",
      scores: [],
    };
  }

  const nextScene = indicators[0].targetState ?? "unknown";
  const scores = indicators.map((indicator) => {
    const template = workerState.templatesById.get(indicator.id);
    const threshold = indicator.minTemplateScore ?? indicator.threshold ?? 0.8;
    const variants = sampleMap.get(indicator.id) ?? [];
    let score = 0;

    if (template) {
      for (const variant of variants) {
        score = Math.max(score, workerComputeTemplateScore(variant, template.data));
      }
    }

    return {
      indicatorId: indicator.id,
      score,
      threshold,
      matched: score >= threshold,
      detectFromScene: indicator.detectFromScene,
    };
  });

  let rawScene: WorkerSceneKind = "unknown";
  if (nextScene === "selection") {
    rawScene = workerDetectSelectionSceneFromScores(scores);
  } else if (nextScene === "idle") {
    rawScene = workerDetectIdleSceneFromScores(scores, message.currentScene);
  } else {
    const matchedScore = scores.find(({ matched }) => matched);
    rawScene = matchedScore ? nextScene : "unknown";
  }

  return {
    type: "detect-scene-result",
    requestId: message.requestId,
    rawScene,
    scores,
  };
}

self.onmessage = (event: MessageEvent<WorkerInputMessage>) => {
  const message = event.data;
  if (message.type === "init") {
    workerState.indicatorsById = new Map(message.indicators.map((indicator) => [indicator.id, indicator]));
    workerState.templatesById = new Map(message.templates.map((template) => [template.id, template]));
    return;
  }

  if (message.type === "detect-scene") {
    self.postMessage(workerDetectScene(message));
  }
};
