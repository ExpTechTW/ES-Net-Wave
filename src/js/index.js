const WaveformVisualizer = require('../js/visualization/waveform');
const WSService = require('../js/websocket');
const { ipcRenderer } = require('electron');

let wsService;

function initializeApplication() {
    try {
        wsService = new WSService();

        window.waveformVisualizer = new WaveformVisualizer();
        window.waveformVisualizer.initialize();
    } catch (error) {
        console.error('Failed to initialize application:', error);
    }
}

// Handle window resize
window.addEventListener('resize', () => {
    if (window.waveformVisualizer) {
        window.waveformVisualizer.handleResize();
    }
});

// Handle window before unload (cleanup)
window.addEventListener('beforeunload', () => {
    if (window.waveformVisualizer) {
        window.waveformVisualizer.destroy();
        window.waveformVisualizer = null;
    }
    if (wsService) {
        wsService = null;
    }
});

ipcRenderer.on('set-station-request', (event, stationId) => {
    if (wsService && typeof wsService.setStation === 'function') {
        wsService.setStation(stationId);
    }
});

// Listen for initialization signal from main process
ipcRenderer.on('initialize-waveform', () => {
    initializeApplication();
});