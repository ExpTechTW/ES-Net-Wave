const WaveformVisualizer = require('../js/visualization/waveform');
const WSService = require('../js/websocket');
const { StationSelector } = require('../js/ui/station-selector');
const { ipcRenderer } = require('electron');

let wsService;
let stationSelector;

function initializeApplication() {
    try {
        wsService = new WSService();
        window.wsService = wsService;

        window.waveformVisualizer = new WaveformVisualizer();
        window.waveformVisualizer.initialize();

        stationSelector = new StationSelector();
        stationSelector.initialize();
        window.stationSelector = stationSelector;
    } catch (error) {
        console.error('Failed to initialize application:', error);
    }
}

window.addEventListener('resize', () => {
    if (window.waveformVisualizer) {
        window.waveformVisualizer.handleResize();
    }
});

window.addEventListener('keydown', (event) => {
    if ((event.ctrlKey && event.key === 'r') || event.key === 'F5') {
        event.preventDefault();
        window.location.reload();
    }
});

window.addEventListener('beforeunload', () => {

    if (window.waveformVisualizer) {
        window.waveformVisualizer.destroy();
        window.waveformVisualizer = null;
    }
    if (wsService) {
        wsService.destroy();
        wsService = null;
    }
    if (stationSelector) {
        stationSelector.destroy();
        stationSelector = null;
    }
});

ipcRenderer.on('set-station-request', (event, stationId) => {
    if (wsService && typeof wsService.setStation === 'function') {
        wsService.setStation(stationId);
    }
});

ipcRenderer.on('initialize-waveform', () => {
    initializeApplication();
});