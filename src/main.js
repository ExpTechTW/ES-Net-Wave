const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const WSService = require('./js/websocket');

let mainWindow;
let dataService;

function initializeWaveformVisualizer() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        // Send initialization signal to renderer process
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

    // Set up keyboard shortcuts after window is created
    mainWindow.webContents.on('dom-ready', () => {
        // Remove existing event listener if any
        mainWindow.webContents.removeAllListeners('before-input-event');
        
        // Set up keyboard shortcuts
        mainWindow.webContents.on('before-input-event', (event, input) => {
            // Prevent zoom shortcuts
            if (
                (input.control || input.meta) &&
                ['+', '-', '=', '0'].includes(input.key)
            ) {
                event.preventDefault();
            }
            
            // Handle F12 for dev tools
            if (input.key === 'F12') {
                event.preventDefault();
                mainWindow.webContents.openDevTools();
            }
            
            // Handle Ctrl+R for reload
            if (input.control && input.key === 'r') {
                event.preventDefault();
                console.log('Reloading application (Ctrl+R)...');
                mainWindow.webContents.reloadIgnoringCache();
            }
            
            // Handle F5 for reload as alternative
            if (input.key === 'F5') {
                event.preventDefault();
                console.log('Reloading application (F5)...');
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