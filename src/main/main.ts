import { app, BrowserWindow, ipcMain, screen, session } from "electron";
import { ChildProcess, spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as readline from "readline";
import ffmpegStatic from "ffmpeg-static";

// バンドル済み FFmpeg を優先し、なければシステムの ffmpeg にフォールバック
const FFMPEG_BIN = ffmpegStatic ?? "ffmpeg";
const PYTHON_BIN = process.env.PYTHON_BIN ?? "python";
const RECOGNITION_SCRIPT_PATH = path.resolve(process.cwd(), "scripts", "recognize_opponent_slots.py");

type RecognitionWorkerReadyMessage = {
  type: "ready";
  templateCount: number;
};

type RecognitionWorkerErrorMessage = {
  type: "error";
  message: string;
};

type RecognitionWorkerResultMessage = {
  type: "result";
  requestId: string;
  results: Array<{
    slotIndex: number;
    pokemonId: string | null;
    pokemonName: string | null;
    score: number;
    topCandidates?: Array<{ pokemonId: string | null; pokemonName: string | null; score: number }>;
  }>;
};

type PlayerSelectionWorkerResultMessage = {
  type: "player-result";
  requestId: string;
  results: Array<{
    slotIndex: number;
    selectionOrder: number | null;
    pokemonName: string | null;
    itemName: string | null;
    score: number;
    debugOcrTexts?: {
      slot: string[];
      pokemonName: string[];
      itemName: string[];
      badge: string[];
      selectedPokemonName: string[];
      selectedItemName: string[];
    };
  }>;
};

type PlayerSelectionBadgeWorkerResultMessage = {
  type: "player-badge-result";
  requestId: string;
  results: Array<{
    slotIndex: number;
    isSelected: boolean;
    confidence: number;
    selectionOrder: number | null;
    selectionOrderScore: number;
    debugFeatures?: Record<string, number | null>;
  }>;
};

type RecognitionWorkerMessage =
  | RecognitionWorkerReadyMessage
  | RecognitionWorkerErrorMessage
  | RecognitionWorkerResultMessage
  | PlayerSelectionWorkerResultMessage
  | PlayerSelectionBadgeWorkerResultMessage;

type PlayerDebugImagePayload = {
  slots: Array<{ slotIndex: number; imageBase64: string; itemImageBase64: string }>;
  selectedSlots: Array<{ selectionOrder: number; imageBase64: string; itemImageBase64: string }>;
};

function createWindow(): void {
  // キャプチャーボード（getUserMedia）の映像を許可する
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      if (permission === "media") {
        callback(true);
      } else {
        callback(false);
      }
    }
  );

  const primaryDisplayWorkArea = screen.getPrimaryDisplay().workArea;
  const mainWindow = new BrowserWindow({
    x: primaryDisplayWorkArea.x,
    y: primaryDisplayWorkArea.y,
    width: primaryDisplayWorkArea.width,
    height: primaryDisplayWorkArea.height,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  if (process.env.NODE_ENV === "development") {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

// ===== 配信 IPC ハンドラー =====
let ffmpegProcess: ChildProcess | null = null;
let streamingWindow: BrowserWindow | null = null;
let recognitionWorker: ChildProcess | null = null;
let recognitionWorkerReady = false;
let recognitionWorkerReadyPromise: Promise<{ success: boolean; error?: string; templateCount?: number }> | null = null;
let recognitionRequestCounter = 0;
const recognitionPendingRequests = new Map<
  string,
  {
    resolve: (value: { success: boolean; results?: unknown; error?: string }) => void;
    reject: (reason?: unknown) => void;
  }
>();

function rejectRecognitionPending(reason: string): void {
  for (const pending of recognitionPendingRequests.values()) {
    pending.resolve({ success: false, error: reason });
  }
  recognitionPendingRequests.clear();
}

function stopRecognitionWorkerInternal(): { success: boolean; error?: string } {
  if (!recognitionWorker) {
    recognitionWorkerReady = false;
    recognitionWorkerReadyPromise = null;
    return { success: true };
  }

  recognitionWorker.kill();
  recognitionWorker = null;
  recognitionWorkerReady = false;
  recognitionWorkerReadyPromise = null;
  rejectRecognitionPending("Recognition worker stopped");
  return { success: true };
}

function ensureRecognitionWorker(): Promise<{ success: boolean; error?: string; templateCount?: number }> {
  if (recognitionWorkerReady && recognitionWorker && !recognitionWorker.killed) {
    return Promise.resolve({ success: true });
  }
  if (recognitionWorkerReadyPromise) return recognitionWorkerReadyPromise;
  if (!fs.existsSync(RECOGNITION_SCRIPT_PATH)) {
    return Promise.resolve({ success: false, error: `Recognition script not found: ${RECOGNITION_SCRIPT_PATH}` });
  }

  recognitionWorkerReadyPromise = new Promise((resolve) => {
    const worker = spawn(PYTHON_BIN, [RECOGNITION_SCRIPT_PATH], {
      cwd: process.cwd(),
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    recognitionWorker = worker;
    recognitionWorkerReady = false;

    const rl = readline.createInterface({ input: worker.stdout! });

    const finalizeReady = (result: { success: boolean; error?: string; templateCount?: number }) => {
      if (recognitionWorkerReadyPromise) {
        recognitionWorkerReadyPromise = null;
      }
      resolve(result);
    };

    rl.on("line", (line) => {
      let message: RecognitionWorkerMessage;
      try {
        message = JSON.parse(line) as RecognitionWorkerMessage;
      } catch {
        return;
      }

      if (message.type === "ready") {
        recognitionWorkerReady = true;
        finalizeReady({ success: true, templateCount: message.templateCount });
        return;
      }
      if (message.type === "error") {
        if (!recognitionWorkerReady) {
          finalizeReady({ success: false, error: message.message });
        }
        rejectRecognitionPending(message.message);
        return;
      }
      if (message.type === "result" || message.type === "player-result" || message.type === "player-badge-result") {
        const pending = recognitionPendingRequests.get(message.requestId);
        if (!pending) return;
        recognitionPendingRequests.delete(message.requestId);
        pending.resolve({ success: true, results: message.results });
      }
    });

    worker.stderr?.on("data", (data: Buffer) => {
      const message = data.toString().trim();
      if (!message) return;
      if (!recognitionWorkerReady && recognitionWorkerReadyPromise) {
        finalizeReady({ success: false, error: message });
      }
      rejectRecognitionPending(message);
    });

    worker.on("error", (error) => {
      recognitionWorker = null;
      recognitionWorkerReady = false;
      finalizeReady({ success: false, error: error.message });
      rejectRecognitionPending(error.message);
    });

    worker.on("exit", (code, signal) => {
      rl.close();
      recognitionWorker = null;
      recognitionWorkerReady = false;
      const reason = `Recognition worker exited (${signal ?? code ?? "unknown"})`;
      if (recognitionWorkerReadyPromise) {
        finalizeReady({ success: false, error: reason });
      }
      rejectRecognitionPending(reason);
    });
  });

  return recognitionWorkerReadyPromise;
}

function sendRecognitionWorkerRequest<TResults>(payload: object): Promise<{ success: boolean; results?: TResults; error?: string }> {
  return new Promise(async (resolve) => {
    const ready = await ensureRecognitionWorker();
    if (!ready.success || !recognitionWorker?.stdin || recognitionWorker.stdin.destroyed) {
      resolve({ success: false, error: ready.error ?? "Recognition worker unavailable" });
      return;
    }

    const requestId = `req-${Date.now()}-${recognitionRequestCounter += 1}`;
    recognitionPendingRequests.set(requestId, {
      resolve: (value) => resolve(value as { success: boolean; results?: TResults; error?: string }),
      reject: () => undefined,
    });
    recognitionWorker.stdin.write(`${JSON.stringify({ ...payload, requestId })}\n`);
  });
}

// FFmpeg 起動前に届いたチャンクを一時的にバッファリング
let streamChunkBuffer: Buffer[] = [];

ipcMain.handle("recognition:start-worker", async () => ensureRecognitionWorker());

ipcMain.handle("recognition:stop-worker", async () => stopRecognitionWorkerInternal());

ipcMain.handle("recognition:recognize-slots", async (_event, payload: {
  slots: Array<{ slotIndex: number; imageBase64: string; timestamp: number }>;
}) => {
  return sendRecognitionWorkerRequest<RecognitionWorkerResultMessage["results"]>({
    type: "recognize",
    slots: payload.slots,
  });
});

ipcMain.handle("recognition:recognize-player-selection", async (_event, payload: {
  slots: Array<{ slotIndex: number; imageBase64: string; timestamp: number }>;
  rects: {
    selectionBadgeRect: { x: number; y: number; width: number; height: number };
    pokemonNameRect: { x: number; y: number; width: number; height: number };
    itemNameRect: { x: number; y: number; width: number; height: number };
  };
  trackedSelections?: Array<{ slotIndex: number; selectionOrder: number }>;
}) => {
  return sendRecognitionWorkerRequest<PlayerSelectionWorkerResultMessage["results"]>({
    type: "recognize-player-selection",
    slots: payload.slots,
    rects: payload.rects,
    trackedSelections: payload.trackedSelections ?? [],
  });
});

ipcMain.handle("recognition:detect-player-selection-badges", async (_event, payload: {
  slots: Array<{ slotIndex: number; imageBase64: string; timestamp: number }>;
  rects: {
    selectionBadgeRect: { x: number; y: number; width: number; height: number };
  };
}) => {
  return sendRecognitionWorkerRequest<PlayerSelectionBadgeWorkerResultMessage["results"]>({
    type: "detect-player-selection-badges",
    slots: payload.slots,
    rects: payload.rects,
  });
});

ipcMain.handle("recognition:save-opponent-slot-images", async (_event, payload: {
  slots: Array<{ slotIndex: number; imageBase64: string }>;
}) => {
  try {
    const outputDir = path.resolve(process.cwd(), "outputImg");
    fs.mkdirSync(outputDir, { recursive: true });
    for (const slot of payload.slots) {
      if (typeof slot.slotIndex !== "number" || !slot.imageBase64) continue;
      const filename = `opoPoke${slot.slotIndex + 1}.png`;
      fs.writeFileSync(path.join(outputDir, filename), Buffer.from(slot.imageBase64, "base64"));
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("recognition:save-player-debug-images", async (_event, payload: PlayerDebugImagePayload) => {
  try {
    const outputDir = path.resolve(process.cwd(), "outputImg");
    fs.mkdirSync(outputDir, { recursive: true });

    for (let index = 1; index <= 3; index += 1) {
      for (const filename of [`myPokeSelected_${index}.png`, `myPokeSelected_item_${index}.png`]) {
        const filepath = path.join(outputDir, filename);
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
      }
    }

    for (const slot of payload.slots ?? []) {
      if (typeof slot.slotIndex !== "number" || slot.slotIndex < 0 || slot.slotIndex > 5) continue;
      if (slot.imageBase64) {
        fs.writeFileSync(path.join(outputDir, `myPoke_${slot.slotIndex + 1}.png`), Buffer.from(slot.imageBase64, "base64"));
      }
      if (slot.itemImageBase64) {
        fs.writeFileSync(path.join(outputDir, `myPoke_item_${slot.slotIndex + 1}.png`), Buffer.from(slot.itemImageBase64, "base64"));
      }
    }

    for (const slot of payload.selectedSlots ?? []) {
      if (typeof slot.selectionOrder !== "number" || slot.selectionOrder < 1 || slot.selectionOrder > 3) continue;
      if (slot.imageBase64) {
        fs.writeFileSync(path.join(outputDir, `myPokeSelected_${slot.selectionOrder}.png`), Buffer.from(slot.imageBase64, "base64"));
      }
      if (slot.itemImageBase64) {
        fs.writeFileSync(path.join(outputDir, `myPokeSelected_item_${slot.selectionOrder}.png`), Buffer.from(slot.itemImageBase64, "base64"));
      }
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// MediaRecorder chunks from the renderer are forwarded to FFmpeg stdin.
ipcMain.on("stream:chunk", (_event, chunk: ArrayBuffer) => {
  const buf = Buffer.from(chunk);
  if (ffmpegProcess?.stdin && !ffmpegProcess.stdin.destroyed) {
    // 未送信バッファがあれば先に流す
    if (streamChunkBuffer.length > 0) {
      for (const b of streamChunkBuffer) ffmpegProcess.stdin.write(b);
      streamChunkBuffer = [];
    }
    ffmpegProcess.stdin.write(buf);
  } else {
    // FFmpeg 未起動の場合はバッファに積む（上限 300 チャンク）
    if (streamChunkBuffer.length < 300) streamChunkBuffer.push(buf);
  }
});

ipcMain.handle("stream:start", async (event, config: {
  rtmpUrl: string;
  streamKey: string;
  videoBitrate: number;
  audioBitrate: number;
  encoder: string;
  rateControl: string;
  preset: string;
  profile: string;
  keyframe: number;
  resolution: string;
  fps: number;
}) => {
  if (ffmpegProcess) {
    return { success: false, error: "既に配信中です" };
  }

  streamingWindow = BrowserWindow.fromWebContents(event.sender);
  const rtmpDest = `${config.rtmpUrl}/${config.streamKey}`;

  // エンコーダー名マッピング
  const VCODEC_MAP: Record<string, string> = {
    x264:  "libx264",
    nvenc: "h264_nvenc",
    amf:   "h264_amf",
    qsv:   "h264_qsv",
  };
  const vcodec = VCODEC_MAP[config.encoder] ?? "libx264";
  const [outW, outH] = config.resolution.split("x");
  const keyframeFrames = config.keyframe === 0 ? "0" : String(config.keyframe * config.fps);

  // x264 固有オプション（NVENC/AMF/QSV では不要）
  const x264Only = config.encoder === "x264"
    ? ["-preset", config.preset, "-profile:v", config.profile]
    : [];

  // CBR の場合は maxrate/bufsize を設定
  const rateArgs = config.rateControl === "CBR"
    ? ["-maxrate", `${config.videoBitrate}k`, "-bufsize", `${config.videoBitrate * 2}k`]
    : [];

  // レンダラーの MediaRecorder チャンクを stdin で受け取り RTMP へ送信
  try {
    ffmpegProcess = spawn(FFMPEG_BIN, [
      "-f", "matroska",         // webm は matroska のサブセット。パイプ入力に対応
      "-i", "pipe:0",           // stdin から受信
      "-vcodec", vcodec,
      ...x264Only,
      "-b:v", `${config.videoBitrate}k`,
      ...rateArgs,
      "-pix_fmt", "yuv420p",
      "-vf", `scale=${outW}:${outH}`,
      "-r", String(config.fps),
      "-g", keyframeFrames,
      "-acodec", "aac",
      "-b:a", `${config.audioBitrate}k`,
      "-ar", "44100",
      "-f", "flv",
      rtmpDest,
    ], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });

    // FFmpeg 起動前にバッファしたチャンクを即座に流す
    if (streamChunkBuffer.length > 0) {
      for (const b of streamChunkBuffer) ffmpegProcess.stdin?.write(b);
      streamChunkBuffer = [];
    }

    // stderr をキャプチャしてエラーメッセージを取得
    let stderrLines: string[] = [];
    ffmpegProcess.stderr?.on("data", (d: Buffer) => {
      const lines = d.toString().split("\n").filter((l) => l.trim());
      stderrLines.push(...lines);
      if (stderrLines.length > 50) stderrLines = stderrLines.slice(-50);
    });

    ffmpegProcess.on("error", (err) => {
      streamingWindow?.webContents.send("stream:status", {
        state: "error",
        message: `FFmpeg 起動エラー: ${err.message}`,
      });
      streamChunkBuffer = [];
      ffmpegProcess = null;
    });

    ffmpegProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        const lastLine = stderrLines.filter((l) => l.includes("Error") || l.includes("error") || l.includes("Invalid") || l.includes("failed")).pop()
          ?? stderrLines[stderrLines.length - 1]
          ?? `終了コード: ${code}`;
        streamingWindow?.webContents.send("stream:status", {
          state: "error",
          message: `FFmpeg: ${lastLine}`,
        });
      } else {
        streamingWindow?.webContents.send("stream:status", { state: "idle" });
      }
      streamChunkBuffer = [];
      ffmpegProcess = null;
    });

    streamingWindow?.webContents.send("stream:status", { state: "connecting" });

    // FFmpeg の起動確認（3秒後に生存していれば配信中とみなす）
    await new Promise<void>((resolve) => setTimeout(resolve, 3000));
    if (ffmpegProcess && !ffmpegProcess.killed) {
      streamingWindow?.webContents.send("stream:status", { state: "live" });
      return { success: true };
    } else {
      return { success: false, error: "FFmpeg の起動に失敗しました。設定を確認してください。" };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    streamingWindow?.webContents.send("stream:status", { state: "error", message: msg });
    return { success: false, error: msg };
  }
});

ipcMain.handle("stream:stop", async () => {
  if (!ffmpegProcess) {
    return { success: false, error: "配信していません" };
  }
  ffmpegProcess.kill("SIGTERM");
  ffmpegProcess = null;
  streamChunkBuffer = [];
  streamingWindow?.webContents.send("stream:status", { state: "idle" });
  return { success: true };
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  stopRecognitionWorkerInternal();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("before-quit", () => {
  stopRecognitionWorkerInternal();
});
