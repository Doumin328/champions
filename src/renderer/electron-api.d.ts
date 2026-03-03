// contextBridge で公開される electronAPI の型宣言
interface Window {
  electronAPI: {
    getAppVersion: () => string;
    streamStart: (settings: {
      rtmpUrl: string;
      videoBitrate: number;
    }) => Promise<{ success: boolean; error?: string }>;
    streamStop: () => Promise<{ success: boolean }>;
    streamSendData: (buffer: ArrayBuffer) => void;
    onStreamStatus: (
      callback: (status: { state: string; message?: string }) => void
    ) => void;
    removeStreamStatusListener: () => void;
  };
}
