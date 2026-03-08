import { app, BrowserWindow, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";
import * as path from "path";

let mainWindow: BrowserWindow | null = null;
let dataService: any;

const gotTheLock = app.requestSingleInstanceLock();

function initializeWaveformVisualizer() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("initialize-waveform");
  }
}

function createWindow() {
  const iconPath = process.platform === "win32" ? "app.ico" : "app.png";
  mainWindow = new BrowserWindow({
    title: `ES-Net-Wave v${app.getVersion()}`,
    width: 828,
    height: 628,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      zoomFactor: 1.0,
      backgroundThrottling: false,
      offscreen: false,
    },
    icon: path.join(__dirname, "..", iconPath),
  });
  mainWindow.setMenu(null);
  mainWindow.loadFile(path.join(app.getAppPath(), "src", "view", "index.html"));

  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow!.show();
  });

  mainWindow.on("closed", () => (mainWindow = null));
}

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();

    // Auto-updater configuration
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = true; // Since version is beta
    autoUpdater.allowDowngrade = false;

    if (app.isPackaged) {
      autoUpdater.setFeedURL({
        provider: 'github',
        owner: 'ExpTechTW',
        repo: 'ES-Net-Wave',
        vPrefixedTagName: false,
      });
    }

    autoUpdater.on('update-available', (info) => {
      console.log('Update available:', info.version);
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('Update downloaded:', info.version);
      setTimeout(() => {
        autoUpdater.quitAndInstall(true, true);
      }, 3000);
    });

    autoUpdater.on('error', (err) => {
      console.error('Update error:', err.message);
    });

    if (app.isPackaged) {
      autoUpdater.checkForUpdates().catch(() => {});
      setInterval(() => {
        autoUpdater.checkForUpdates().catch(() => {});
      }, 300000); // Check every 5 minutes
    }

    mainWindow!.webContents.on("dom-ready", () => {
      mainWindow!.webContents.removeAllListeners("before-input-event");

      mainWindow!.webContents.on("before-input-event", (event, input) => {
        if (
          (input.control || input.meta) &&
          ["+", "-", "=", "0"].includes(input.key)
        ) {
          event.preventDefault();
        }
        if (input.key === "F12") {
          event.preventDefault();
          mainWindow!.webContents.openDevTools();
        }
        if (input.control && input.key === "r") {
          event.preventDefault();
          mainWindow!.webContents.reloadIgnoringCache();
        }
      });

      initializeWaveformVisualizer();
    });

    ipcMain.handle("set-station", (event, stationId) => {
      mainWindow!.webContents.send("set-station-request", stationId);
      return true;
    });

    ipcMain.on("ws-message-to-main", (event, { channel, data }) => {
      mainWindow!.webContents.send(channel, data);
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
