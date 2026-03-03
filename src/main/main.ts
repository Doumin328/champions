import { app, BrowserWindow, ipcMain, session, WebContents } from "electron";
import * as path from "path";
import { spawn, ChildProcess, execSync } from "child_process";

// ======= ffmpeg パス解決 =======
function resolveFfmpegPath(): string | null {
  // 1. 環境変数 FFMPEG_PATH が設定されていれば優先
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;

  // 2. システム PATH から探す
  try {
    const cmd = process.platform === "win32" ? "where ffmpeg" : "which ffmpeg";
    const result = execSync(cmd, { encoding: "utf8", timeout: 3000 }).trim();
    const first = result.split("\n")[0].trim();
    if (first) return first;
  } catch { /* not in PATH */ }

  // 3. OS ごとのよくあるインストール先
  const candidates: string[] = process.platform === "win32"
    ? [
        "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
        "C:\\ffmpeg\\bin\\ffmpeg.exe",
      ]
    : process.platform === "darwin"
    ? [
        "/usr/local/bin/ffmpeg",
        "/opt/homebrew/bin/ffmpeg",
      ]
    : [
        "/usr/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
        "/snap/bin/ffmpeg",
      ];

  for (const p of candidates) {
    try {
      execSync(`"${p}" -version`, { timeout: 3000 });
      return p;
    } catch { /* not found */ }
  }
  return null;
}

// ======= 配信プロセス管理 =======
let ffmpegProcess: ChildProcess | null = null;
let streamSender: WebContents | null = null;

/** 配信開始 IPC ハンドラ */
ipcMain.handle(
  "stream:start",
  async (
    event,
    settings: { rtmpUrl: string; videoBitrate: number }
  ): Promise<{ success: boolean; error?: string }> => {
    if (ffmpegProcess) {
      return { success: false, error: "既に配信中です" };
    }

    const ffmpegPath = resolveFfmpegPath();
    if (!ffmpegPath) {
      return {
        success: false,
        error:
          "ffmpeg が見つかりません。システムに ffmpeg をインストールするか、" +
          "環境変数 FFMPEG_PATH にパスを設定してください。",
      };
    }

    const bitrateKbps = Math.max(500, Math.floor(settings.videoBitrate / 1000));
    const rtmpUrl = settings.rtmpUrl;

    // WebM(MediaRecorder) → H.264/AAC → FLV → RTMP
    const args = [
      "-re",
      "-f", "webm",          // MediaRecorder の出力形式
      "-i", "pipe:0",        // stdin から受け取る
      "-vcodec", "libx264",
      "-preset", "veryfast",
      "-tune", "zerolatency",
      "-b:v", `${bitrateKbps}k`,
      "-maxrate", `${bitrateKbps}k`,
      "-bufsize", `${bitrateKbps * 2}k`,
      "-pix_fmt", "yuv420p",
      "-g", "50",            // キーフレーム間隔 (fps × 2)
      "-acodec", "aac",
      "-b:a", "128k",
      "-ar", "44100",
      "-f", "flv",
      rtmpUrl,
    ];

    streamSender = event.sender;
    ffmpegProcess = spawn(ffmpegPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    // ffmpeg の標準エラー（進捗ログ）をレンダラーに転送
    ffmpegProcess.stderr?.on("data", (data: Buffer) => {
      streamSender?.send("stream:status", {
        state: "running",
        message: data.toString(),
      });
    });

    ffmpegProcess.on("error", (err) => {
      streamSender?.send("stream:status", {
        state: "error",
        message: `ffmpeg エラー: ${err.message}`,
      });
      ffmpegProcess = null;
      streamSender = null;
    });

    ffmpegProcess.on("close", (code) => {
      streamSender?.send("stream:status", {
        state: "stopped",
        message: code === 0 ? "配信を終了しました" : `ffmpeg が終了しました (code: ${code})`,
      });
      ffmpegProcess = null;
      streamSender = null;
    });

    return { success: true };
  }
);

/** 映像チャンク受信 → ffmpeg stdin へ書き込み */
ipcMain.on("stream:data", (_event, buffer: Buffer) => {
  if (ffmpegProcess?.stdin && !ffmpegProcess.stdin.destroyed) {
    ffmpegProcess.stdin.write(buffer);
  }
});

/** 配信停止 IPC ハンドラ */
ipcMain.handle("stream:stop", (): { success: boolean } => {
  if (ffmpegProcess) {
    ffmpegProcess.stdin?.end();
    ffmpegProcess.kill("SIGTERM");
    ffmpegProcess = null;
    streamSender = null;
  }
  return { success: true };
});

// ======= ウィンドウ作成 =======
function createWindow(): void {
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

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  // アプリ終了時に配信も停止
  if (ffmpegProcess) {
    ffmpegProcess.stdin?.end();
    ffmpegProcess.kill("SIGTERM");
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
