const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const WSService = require('./js/websocket');

let mainWindow;
let dataService;

function initializeWaveformVisualizer() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('initialize-waveform');
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        title: 'ES-Net-Wave',
        width: 828,
        height: 628,
        resizable: false,
        maximizable: false,
        fullscreenable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: false,
            zoomFactor: 1.0
        },
    });
    mainWindow.setMenu(null);
    mainWindow.loadFile('src/view/index.html');
    mainWindow.on('closed', () => mainWindow = null);
}

app.whenReady().then(() => {
    createWindow();

    mainWindow.webContents.on('dom-ready', () => {
        mainWindow.webContents.removeAllListeners('before-input-event');

        mainWindow.webContents.on('before-input-event', (event, input) => {
            if (
                (input.control || input.meta) &&
                ['+', '-', '=', '0'].includes(input.key)
            ) {
                event.preventDefault();
            }
            if (input.key === 'F12') {
                event.preventDefault();
                mainWindow.webContents.openDevTools();
            }
            if (input.control && input.key === 'r') {
                event.preventDefault();
                mainWindow.webContents.reloadIgnoringCache();
            }
        });

        initializeWaveformVisualizer();
    });

    ipcMain.handle('set-station', (event, stationId) => {
        mainWindow.webContents.send('set-station-request', stationId);
        return true;
    });

    ipcMain.on('ws-message-to-main', (event, { channel, data }) => {
        mainWindow.webContents.send(channel, data);
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});