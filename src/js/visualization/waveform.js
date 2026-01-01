const constants = require('../constants');
const { ipcRenderer } = require('electron');
const WaveformRenderer = require('../ui/waveform-renderer');
const DataDisplay = require('../ui/data-display');

class WaveformVisualizer {
    constructor() {
        this.maxPoints = constants.WAVEFORM_CONSTANTS.CANVAS.MAX_POINTS;
        this.bufX = new Array(this.maxPoints).fill(0);
        this.bufY = new Array(this.maxPoints).fill(0);
        this.bufZ = new Array(this.maxPoints).fill(0);
        this.isInitialized = false;
        this.isConnected = false;
        this.lastDataTime = 0;
        this.statusCheckInterval = null;
        this.currentStation = constants.WAVEFORM_CONSTANTS.STATION.DEFAULT_ID;
        this.renderer = new WaveformRenderer();
        this.dataDisplay = new DataDisplay();
    }

    initialize() {
        if (this.isInitialized) {
            console.warn('WaveformVisualizer already initialized');
            return;
        }

        this.dataDisplay.initialize();
        this.dataDisplay.initializeUI();

        const canvasX = document.getElementById('waveform-x');
        const canvasY = document.getElementById('waveform-y');
        const canvasZ = document.getElementById('waveform-z');
        const canvasTime = document.getElementById('time-axis');

        this.renderer.initialize(canvasX, canvasY, canvasZ, canvasTime);
        this.renderer.startAnimation();
        this.isInitialized = true;

        this.setupIPCHandlers();
    }

    handleResize() {
        this.renderer.handleResize();
    }

    setupIPCHandlers() {
        ipcRenderer.removeAllListeners('ws-message');
        ipcRenderer.removeAllListeners('clear-waveform');
        ipcRenderer.removeAllListeners('connection-status');

        ipcRenderer.on('ws-message', (event, data) => {
            this.handleWebSocketMessage(data);
        });

        ipcRenderer.on('clear-waveform', () => {
            this.clearWaveform();
        });

        ipcRenderer.on('connection-status', (event, status) => {
            this.updateConnectionStatus(status);
        });

        this.statusCheckInterval = setInterval(() => {
            this.checkDataStatus();
        }, 500);
    }

    handleWebSocketMessage(data) {
        this.lastDataTime = Date.now();

        const parts = data.split('~');
        if (parts.length < 4) return;

        const stationId = parts[0];
        if (stationId !== this.currentStation) return;

        try {
            const payload = parts[2];
            const binaryString = atob(payload);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            if (bytes.length < 1) return;
            const msgType = bytes[0];

            if (msgType === 0x11) {
                const dataView = new DataView(bytes.buffer);
                const ts = dataView.getBigUint64(1, true);
                const intensity = dataView.getFloat32(9, true);
                const pga = dataView.getFloat32(13, true);

                this.dataDisplay.updateIntensityData(intensity, pga, ts);
            } else if (msgType === 0x10) {
                const count = bytes[1];
                const xArr = [], yArr = [], zArr = [];
                let offset = 10;

                for (let i = 0; i < count; i++) {
                    if (offset + 12 > bytes.length) break;
                    const dataView = new DataView(bytes.buffer);
                    const x = dataView.getFloat32(offset, true);
                    const y = dataView.getFloat32(offset + 4, true);
                    const z = dataView.getFloat32(offset + 8, true);
                    xArr.push(x);
                    yArr.push(y);
                    zArr.push(z);
                    offset += 12;
                }

                if (xArr.length > 0) {
                    this.pushData(xArr, yArr, zArr);
                }
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    }

    async changeStation(stationId) {
        this.setStation(stationId);
        await this.setStationIPC(stationId);
    }

    clearWaveform() {
        this.bufX.fill(0);
        this.bufY.fill(0);
        this.bufZ.fill(0);
        this.renderer.updateWaveformData(this.bufX, this.bufY, this.bufZ);
    }

    pushData(xArr, yArr, zArr) {
        if (!this.isInitialized) return;

        const len = xArr.length;
        this.bufX.splice(0, len);
        this.bufX.push(...xArr);
        this.bufY.splice(0, len);
        this.bufY.push(...yArr);
        this.bufZ.splice(0, len);
        this.bufZ.push(...zArr);

        this.renderer.updateWaveformData(this.bufX, this.bufY, this.bufZ);
    }

    setStation(station) {
        this.currentStation = station;
        this.dataDisplay.updateStationInfo(station);
    }

    clearWaveform() {
        this.bufX.fill(0);
        this.bufY.fill(0);
        this.bufZ.fill(0);
        this.renderer.updateWaveformData(this.bufX, this.bufY, this.bufZ);
    }

    updateConnectionStatus(status) {
        this.isConnected = (status === 'connected');
        if (this.isConnected) {
            this.lastDataTime = Date.now();
        }

        this.dataDisplay.updateConnectionStatus(status);
    }

    checkDataStatus() {
        if (this.isConnected) {
            const timeSinceLastData = Date.now() - this.lastDataTime;
            const hasData = timeSinceLastData <= 2000;
            this.dataDisplay.updateDataStatus(hasData);
        }
    }

    destroy() {
        ipcRenderer.removeAllListeners('ws-message');
        ipcRenderer.removeAllListeners('clear-waveform');
        ipcRenderer.removeAllListeners('connection-status');

        if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
            this.statusCheckInterval = null;
        }

        this.renderer.destroy();
        this.dataDisplay.destroy();
        this.isInitialized = false;
    }
}

module.exports = WaveformVisualizer;