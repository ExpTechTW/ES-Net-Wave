import { app, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";

let updateCheckInterval: NodeJS.Timeout | null = null;

function stopAutoUpdateScheduler(): void {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }
}

function startAutoUpdateScheduler(): void {
  if (!app.isPackaged) {
    console.log('[OTA] startAutoUpdateScheduler skipped (not packaged)');
    return;
  }
  if (updateCheckInterval) {
    console.log('[OTA] startAutoUpdateScheduler skipped (already running)');
    return;
  }

  console.log('[OTA] Auto update scheduler started');
  autoUpdater.checkForUpdates().catch(() => undefined);
  updateCheckInterval = setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => undefined);
  }, 300000); // 5 minutes
}

function refreshAutoUpdateScheduler(reason = 'refresh'): void {
  console.log(`[OTA] refreshAutoUpdateScheduler reason=${reason} packaged=${app.isPackaged}`);
  if (!app.isPackaged) {
    stopAutoUpdateScheduler();
    return;
  }

  startAutoUpdateScheduler();
}

interface InitAutoUpdaterOptions {
  getMainWindow: () => BrowserWindow | null;
}

function initAutoUpdater(options: InitAutoUpdaterOptions): {
  refresh: (reason?: string) => void;
} {
  const { getMainWindow } = options;

  const sendToWindow = (channel: string, payload?: any): void => {
    const mainWin = getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send(channel, payload);
    }
  };

  try {
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

    autoUpdater.on('checking-for-update', () => {
      console.log('Checking for update...');
      sendToWindow('update-checking');
    });

    autoUpdater.on('update-available', (info) => {
      console.log('Update available:', info.version);
      sendToWindow('update-available', info);
    });

    autoUpdater.on('update-not-available', (info) => {
      console.log('Update not available:', info.version);
      sendToWindow('update-not-available', info);
    });

    autoUpdater.on('download-progress', (progressObj) => {
      console.log('Download progress:', progressObj.percent);
      sendToWindow('download-progress', progressObj);
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('Update downloaded:', info.version);
      sendToWindow('update-downloaded', info);
      setTimeout(() => {
        autoUpdater.quitAndInstall(true, true);
      }, 3000);
    });

    autoUpdater.on('error', (err) => {
      const message = err && err.message ? err.message : err;
      console.error('Update error:', message);
      sendToWindow('update-error', err?.message);
    });

    refreshAutoUpdateScheduler('init');
  } catch (err) {
    console.error('Auto-updater init error:', err);
  }

  return {
    refresh: (reason = 'refresh') => refreshAutoUpdateScheduler(reason),
  };
}

export { initAutoUpdater };