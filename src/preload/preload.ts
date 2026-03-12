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
});
