import { app, BrowserWindow, ipcMain, session } from "electron";
import { ChildProcess, spawn } from "child_process";
import * as path from "path";
import ffmpegStatic from "ffmpeg-static";

// バンドル済み FFmpeg を優先し、なければシステムの ffmpeg にフォールバック
const FFMPEG_BIN = ffmpegStatic ?? "ffmpeg";

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

  const mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
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

// FFmpeg 起動前に届いたチャンクを一時的にバッファリング
let streamChunkBuffer: Buffer[] = [];

// レンダラーから送られる MediaRecorder チャンクを FFmpeg stdin へ流す
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
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
