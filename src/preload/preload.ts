import { contextBridge, ipcRenderer } from "electron";

// レンダラーから安全に使う API をここで公開する
contextBridge.exposeInMainWorld("electronAPI", {
  getAppVersion: () => "0.1.0",

  // ===== 配信 API =====
  startStream: (config: {
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
  }) => ipcRenderer.invoke("stream:start", config),

  stopStream: () => ipcRenderer.invoke("stream:stop"),

  onStreamStatus: (callback: (status: { state: "connecting" | "live" | "idle" | "error"; message?: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, status: { state: "connecting" | "live" | "idle" | "error"; message?: string }) => callback(status);
    ipcRenderer.on("stream:status", handler);
    // クリーンアップ用に解除関数を返す
    return () => ipcRenderer.off("stream:status", handler);
  },

  // MediaRecorder のチャンクを main プロセスへ送る（一方向）
  sendStreamChunk: (chunk: ArrayBuffer) => ipcRenderer.send("stream:chunk", chunk),
  startRecognitionWorker: () => ipcRenderer.invoke("recognition:start-worker"),
  stopRecognitionWorker: () => ipcRenderer.invoke("recognition:stop-worker"),
  recognizeOpponentSlots: (slots: Array<{ slotIndex: number; imageBase64: string; timestamp: number }>) =>
    ipcRenderer.invoke("recognition:recognize-slots", { slots }),
  recognizePlayerSelection: (
    slots: Array<{ slotIndex: number; imageBase64: string; timestamp: number }>,
    rects: {
      selectionBadgeRect: { x: number; y: number; width: number; height: number };
      pokemonNameRect: { x: number; y: number; width: number; height: number };
      itemNameRect: { x: number; y: number; width: number; height: number };
    },
    trackedSelections?: Array<{ slotIndex: number; selectionOrder: number }>
  ) => ipcRenderer.invoke("recognition:recognize-player-selection", { slots, rects, trackedSelections }),
  detectPlayerSelectionBadges: (
    slots: Array<{ slotIndex: number; imageBase64: string; timestamp: number }>,
    rects: {
      selectionBadgeRect: { x: number; y: number; width: number; height: number };
    }
  ) => ipcRenderer.invoke("recognition:detect-player-selection-badges", { slots, rects }),
  saveOpponentSlotImages: (slots: Array<{ slotIndex: number; imageBase64: string }>) =>
    ipcRenderer.invoke("recognition:save-opponent-slot-images", { slots }),
  savePlayerDebugImages: (payload: {
    slots: Array<{ slotIndex: number; imageBase64: string; itemImageBase64: string }>;
    selectedSlots: Array<{ selectionOrder: number; imageBase64: string; itemImageBase64: string }>;
  }) => ipcRenderer.invoke("recognition:save-player-debug-images", payload),
  syncPlayerSelectionImages: (slots: Array<{ selectionOrder: number; pokemonId: string | null }>) =>
    ipcRenderer.invoke("recognition:sync-player-selection-images", { slots }),
});
