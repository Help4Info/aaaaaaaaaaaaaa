// FlowWhisper — processus principal Electron.
//
// Lance le serveur Python (transcription locale + raffinage) puis ouvre une
// fenêtre qui charge l'interface web. Enregistre un raccourci global pour
// afficher/masquer rapidement la fenêtre de dictée.
//
// Roadmap bureau (voir README) : collage automatique du texte dans n'importe
// quelle application via nut.js / robotjs, overlay flottant, empaquetage.

const { app, BrowserWindow, globalShortcut } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

const SERVER_URL = "http://127.0.0.1:8000";
const PROJECT_ROOT = path.resolve(__dirname, "..");

let mainWindow = null;
let serverProcess = null;

function startServer() {
  // Utilise le venv s'il existe, sinon "python" du système.
  const isWin = process.platform === "win32";
  const venvPython = isWin
    ? path.join(PROJECT_ROOT, "server", ".venv", "Scripts", "python.exe")
    : path.join(PROJECT_ROOT, "server", ".venv", "bin", "python");

  const fs = require("fs");
  const python = fs.existsSync(venvPython) ? venvPython : (isWin ? "python" : "python3");

  serverProcess = spawn(python, ["main.py"], {
    cwd: path.join(PROJECT_ROOT, "server"),
    stdio: "inherit",
  });
  serverProcess.on("error", (e) => console.error("Serveur Python :", e));
}

function waitForServer(retries = 40) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      http
        .get(SERVER_URL + "/api/health", (res) => {
          res.statusCode === 200 ? resolve() : retry(n);
        })
        .on("error", () => retry(n));
    };
    const retry = (n) =>
      n <= 0 ? reject(new Error("Serveur indisponible")) : setTimeout(() => attempt(n - 1), 500);
    attempt(retries);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 760,
    minWidth: 420,
    minHeight: 560,
    backgroundColor: "#0b0e14",
    title: "FlowWhisper",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadURL(SERVER_URL);
  mainWindow.on("closed", () => (mainWindow = null));
}

function toggleWindow() {
  if (!mainWindow) return createWindow();
  mainWindow.isVisible() && mainWindow.isFocused() ? mainWindow.hide() : (mainWindow.show(), mainWindow.focus());
}

app.whenReady().then(async () => {
  startServer();
  try {
    await waitForServer();
  } catch (e) {
    console.error(e);
  }
  createWindow();

  // Raccourci global : Ctrl/Cmd + Shift + Espace pour afficher/masquer.
  globalShortcut.register("CommandOrControl+Shift+Space", toggleWindow);

  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on("window-all-closed", () => process.platform !== "darwin" && app.quit());

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (serverProcess) serverProcess.kill();
});
