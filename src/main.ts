import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { initAutoUpdater } from "./ts/utils/ota.js";
import { ntpManager } from "./ts/utils/ntp.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

  app.whenReady().then(async () => {
    await ntpManager.initialize();

    createWindow();

    ipcMain.once("init-ota", () => {
      initAutoUpdater(() => mainWindow);
    });

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

    // ============================================
    // Ring Buffer 数据同步 IPC 处理器
    // ============================================
    ipcMain.handle("request-data-sync", async (event, args) => {
      const { station, timeWindow, timestamp } = args;

      try {
        console.log(
          `[DATA SYNC] Requesting sync for station: ${station}, window: ${timeWindow}ms`
        );

        // 计算查询时间范围
        const endTime = timestamp;
        const startTime = timestamp - timeWindow;

        // 从数据库或历史缓存中查询数据
        const historicalData = await queryHistoricalData({
          stationId: station,
          startTime: startTime,
          endTime: endTime,
          limit: 10000,
        });

        console.log(
          `[DATA SYNC] Retrieved ${historicalData.length} data points`
        );

        // 向 Renderer 发送历史数据
        sendSyncDataToRenderer(mainWindow, {
          station: station,
          data: historicalData,
          timestamp: Date.now(),
        });

        return { success: true, count: historicalData.length };
      } catch (error) {
        console.error("[DATA SYNC] Error:", error);
        return { success: false, error: (error as Error).message };
      }
    });
  });
}

// ============================================
// 辅助函数：向 Renderer 发送同步数据
// ============================================
function sendSyncDataToRenderer(
  mainWindowRef: BrowserWindow | null,
  data: any
) {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send("sync-data", {
      station: data.station,
      data: data.data,
      timestamp: data.timestamp,
      count: data.data?.length || 0,
    });
  }
}

// ============================================
// 辅助函数：从数据库查询历史数据
// ============================================
async function queryHistoricalData(options: {
  stationId: string;
  startTime: number;
  endTime: number;
  limit: number;
}) {
  const { stationId, startTime, endTime, limit } = options;

  try {
    // TODO: 根据你的数据库实现替换此部分
    // 示例：使用 sqlite3, knex, TypeORM 等
    console.log(
      `[DB QUERY] Station: ${stationId}, Range: ${startTime}-${endTime}`
    );

    // 伪代码 - 需要实现
    // const data = await database.query(
    //   `SELECT timestamp as t, acc_x as x, acc_y as y, acc_z as z
    //    FROM sensor_data
    //    WHERE station_id = ? AND timestamp BETWEEN ? AND ?
    //    ORDER BY timestamp ASC
    //    LIMIT ?`,
    //   [stationId, startTime, endTime, limit]
    // );

    // 临时返回空数组，实现你的数据库查询
    return [];
  } catch (error) {
    console.error("[DB QUERY] Error:", error);
    return [];
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
