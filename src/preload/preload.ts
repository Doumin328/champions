import { contextBridge } from "electron";

// レンダラーから安全に使う API をここで公開する
contextBridge.exposeInMainWorld("electronAPI", {
  // 今後、メインプロセスと通信する API を追加
  getAppVersion: () => "0.1.0",
});
