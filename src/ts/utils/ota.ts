import { app, BrowserWindow } from 'electron';
import { createRequire } from 'module';
import { logger } from './logger.js';

const require = createRequire(import.meta.url);
const { autoUpdater } = require('electron-updater');

let updateCheckInterval: NodeJS.Timeout | null = null;
let getMainWindowRef: (() => BrowserWindow | null) | null = null;

/**
 * Log helper that sends log to both main process console and renderer process
 */
function logOTA(message: string) {
  logger.info(`[OTA] ${message}`);
  if (getMainWindowRef) {
    const mainWindow = getMainWindowRef();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ota-log', message);
    }
  }
}

/**
 * Initialize auto updater with GitHub as the update source
 */
function initAutoUpdater(getMainWindow: () => BrowserWindow | null) {
  getMainWindowRef = getMainWindow;
  logOTA('initAutoUpdater called');
  try {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = true; // Allow beta/alpha versions
    autoUpdater.allowDowngrade = false;

    if (app.isPackaged) {
      autoUpdater.setFeedURL({
        provider: 'github',
        owner: 'ExpTechTW',
        repo: 'ES-Net-Wave',
        vPrefixedTagName: false,
      });
    }

    // Event handlers
    autoUpdater.on('checking-for-update', () => {
      logOTA('Checking for update...');
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-checking');
      }
    });

    autoUpdater.on('update-available', (info: any) => {
      logOTA(`Update available: ${info.version}`);
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-available', info);
      }
    });

    autoUpdater.on('update-not-available', (info: any) => {
      logOTA(`Update not available: ${info.version}`);
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-not-available', info);
      }
    });

    autoUpdater.on('download-progress', (progressObj: any) => {
      logOTA(`Download progress: ${progressObj.percent.toFixed(2)}%`);
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-progress', progressObj);
      }
    });

    autoUpdater.on('update-downloaded', (info: any) => {
      logOTA(`Update downloaded: ${info.version}`);
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-downloaded', info);
      }
      // Wait 3 seconds before installing
      setTimeout(() => {
        autoUpdater.quitAndInstall(true, true);
      }, 3000);
    });

    autoUpdater.on('error', (err: any) => {
      const message = err && err.message ? err.message : String(err);
      logOTA(`Update error: ${message}`);
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-error', message);
      }
    });

    startAutoUpdateScheduler();
    logOTA('Auto updater initialized');
  } catch (err) {
    logOTA(`Initialization error: ${err}`);
  }
}

/**
 * Start the auto update scheduler
 */
function startAutoUpdateScheduler() {
  if (!app.isPackaged) {
    logOTA('Auto update skipped (not packaged)');
    return;
  }

  if (updateCheckInterval) {
    logOTA('Auto update scheduler already running');
    return;
  }

  logOTA('Auto update scheduler started');
  // Check immediately
  autoUpdater.checkForUpdates().catch(() => undefined);
  // Then check every 5 minutes
  updateCheckInterval = setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => undefined);
  }, 300000);
}

/**
 * Stop the auto update scheduler
 */
function stopAutoUpdateScheduler() {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
    logOTA('Auto update scheduler stopped');
  }
}

export { initAutoUpdater, stopAutoUpdateScheduler };
