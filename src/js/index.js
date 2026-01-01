const WaveformVisualizer = require('../js/visualization/waveform');
const { ipcRenderer } = require('electron');

function initializeApplication() {
    try {
        // Create waveform visualizer instance and initialize
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
});

// Listen for initialization signal from main process
ipcRenderer.on('initialize-waveform', () => {
    initializeApplication();
});