const WaveformVisualizer = require('../js/visualization/waveform');
const WSService = require('../js/websocket');
const { StationSelector } = require('../js/ui/station-selector');
const { ipcRenderer } = require('electron');

let wsService;
let stationSelector;

function initializeApplication() {
    try {
        wsService = new WSService();

        window.waveformVisualizer = new WaveformVisualizer();
        window.waveformVisualizer.initialize();

        // Initialize station selector
        stationSelector = new StationSelector();
        stationSelector.initialize();
        window.stationSelector = stationSelector;
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

// Handle keyboard shortcuts for reload (fallback)
window.addEventListener('keydown', (event) => {
    // Ctrl+R or F5 for reload
    if ((event.ctrlKey && event.key === 'r') || event.key === 'F5') {
        event.preventDefault();
        window.location.reload();
    }
});

// Handle window before unload (cleanup)
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

    // Reset initialization flag for potential reload
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