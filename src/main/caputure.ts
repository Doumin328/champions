import { app, BrowserWindow, screen } from "electron";
import * as path from "path";

function createWindow() {
  const primaryDisplayWorkArea = screen.getPrimaryDisplay().workArea;
  const win = new BrowserWindow({
    x: primaryDisplayWorkArea.x,
    y: primaryDisplayWorkArea.y,
    width: primaryDisplayWorkArea.width,
    height: primaryDisplayWorkArea.height,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true
    }
  });

  win.once("ready-to-show", () => {
    win.maximize();
    win.show();
  });

  win.loadFile("renderer/index.html");
}

app.whenReady().then(createWindow);
