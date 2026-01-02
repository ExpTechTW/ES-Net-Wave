import WaveformVisualizer from './visualization/waveform';
import WSService from './websocket';
import { StationSelector } from './ui/station-selector';
import type { IpcRendererEvent } from 'electron';

declare const require: any;
const { ipcRenderer } = require('electron');

let wsService: WSService | null = null;
let stationSelector: StationSelector | null = null;

function initializeApplication() {
    try {
        wsService = new WSService();
        wsService.connect();
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

ipcRenderer.on('set-station-request', (event: IpcRendererEvent, stationId: string) => {
    if (wsService && typeof wsService.setStation === 'function') {
        wsService.setStation(stationId);
    }
});

ipcRenderer.on('initialize-waveform', () => {
    initializeApplication();
});