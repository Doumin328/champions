import { contextBridge, ipcRenderer } from "electron";

// レンダラーから安全に使う API をここで公開する
contextBridge.exposeInMainWorld("electronAPI", {
  getAppVersion: () => "0.1.0",

  // ======= 配信 IPC =======
  /** 配信開始: RTMP URL とビットレートを main プロセスに渡す */
  streamStart: (settings: { rtmpUrl: string; videoBitrate: number }) =>
    ipcRenderer.invoke("stream:start", settings),

  /** 配信停止 */
  streamStop: () => ipcRenderer.invoke("stream:stop"),

  /** 映像チャンク(ArrayBuffer)を main プロセスへ送信 */
  streamSendData: (buffer: ArrayBuffer) =>
    ipcRenderer.send("stream:data", Buffer.from(buffer)),

  /** ffmpeg の状態通知を受け取るコールバックを登録 */
  onStreamStatus: (callback: (status: { state: string; message?: string }) => void) =>
    ipcRenderer.on("stream:status", (_event, status) => callback(status)),

  /** ステータスリスナーを解除 */
  removeStreamStatusListener: () =>
    ipcRenderer.removeAllListeners("stream:status"),
});
