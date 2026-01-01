// Waveform visualization module - Main Controller
// Coordinates data processing and delegates rendering to UI modules
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

        // UI modules
        this.renderer = new WaveformRenderer();
        this.dataDisplay = new DataDisplay();
    }

    // Initialize waveform rendering system
    initialize() {
        if (this.isInitialized) {
            console.warn('WaveformVisualizer already initialized');
            return;
        }

        // Initialize UI modules
        this.dataDisplay.initialize();
        this.dataDisplay.initializeUI();

        // Initialize canvas contexts
        const canvasX = document.getElementById('waveform-x');
        const canvasY = document.getElementById('waveform-y');
        const canvasZ = document.getElementById('waveform-z');
        const canvasTime = document.getElementById('time-axis');

        // Initialize renderer
        this.renderer.initialize(canvasX, canvasY, canvasZ, canvasTime);

        // Start animation loop
        this.renderer.startAnimation();

        this.isInitialized = true;

        // Set up IPC listeners
        this.setupIPCHandlers();
    }

    // Handle window resize
    handleResize() {
        this.renderer.handleResize();
    }

    // Set up IPC event handlers
    setupIPCHandlers() {
        // Remove any existing listeners first to prevent duplicates
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

        // Start status check interval
        this.statusCheckInterval = setInterval(() => {
            this.checkDataStatus();
        }, 500);

        // Set station in main process
        this.setStation(constants.WAVEFORM_CONSTANTS.STATION.DEFAULT_ID);
    }

    // Handle WebSocket message
    handleWebSocketMessage(data) {
        this.lastDataTime = Date.now();

        // Parse the message (basic implementation)
        const parts = data.split('~');
        if (parts.length < 4) return;

        const stationId = parts[0];
        if (stationId !== constants.WAVEFORM_CONSTANTS.STATION.DEFAULT_ID) return; // Only process our station

        try {
            const payload = parts[2];
            // Convert base64 to binary
            const binaryString = atob(payload);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            if (bytes.length < 1) return;
            const msgType = bytes[0];

            if (msgType === 0x11) {
                // Intensity data
                const dataView = new DataView(bytes.buffer);
                const ts = dataView.getBigUint64(1, true); // Little endian
                const intensity = dataView.getFloat32(9, true);
                const pga = dataView.getFloat32(13, true);

                this.dataDisplay.updateIntensityData(intensity, pga, ts);
            } else if (msgType === 0x10) {
                // Sensor data (waveforms)
                const count = bytes[1];
                const xArr = [], yArr = [], zArr = [];
                let offset = 10; // After msgType, count, and possibly ts

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
                    // Push data to buffers
                    this.pushData(xArr, yArr, zArr);
                }
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    }

    // Set station via IPC
    async setStation(stationId) {
        try {
            await ipcRenderer.invoke('set-station', stationId);
        } catch (error) {
            console.error('Failed to set station:', error);
        }
    }

    // Clear waveform buffers
    clearWaveform() {
        this.bufX.fill(0);
        this.bufY.fill(0);
        this.bufZ.fill(0);
        // Update renderer with cleared data
        this.renderer.updateWaveformData(this.bufX, this.bufY, this.bufZ);
    }

    // Push new waveform data to buffers
    pushData(xArr, yArr, zArr) {
        if (!this.isInitialized) return;

        const len = xArr.length;
        this.bufX.splice(0, len);
        this.bufX.push(...xArr);
        this.bufY.splice(0, len);
        this.bufY.push(...yArr);
        this.bufZ.splice(0, len);
        this.bufZ.push(...zArr);

        // Update renderer with new data
        this.renderer.updateWaveformData(this.bufX, this.bufY, this.bufZ);
    }

    // Set current station
    setStation(station) {
        this.station = station;
        this.dataDisplay.updateStationInfo(station);
    }

    // Clear waveform buffers
    clearWaveform() {
        this.bufX.fill(0);
        this.bufY.fill(0);
        this.bufZ.fill(0);
    }

    // Update connection status
    updateConnectionStatus(status) {
        this.isConnected = (status === 'connected');
        if (this.isConnected) {
            this.lastDataTime = Date.now();
        }

        this.dataDisplay.updateConnectionStatus(status);
    }

    // Check if data is being received
    checkDataStatus() {
        if (this.isConnected) {
            const timeSinceLastData = Date.now() - this.lastDataTime;
            const hasData = timeSinceLastData <= 2000;
            this.dataDisplay.updateDataStatus(hasData);
        }
    }

    // Cleanup
    destroy() {
        // Remove IPC event listeners to prevent memory leaks
        ipcRenderer.removeAllListeners('ws-message');
        ipcRenderer.removeAllListeners('clear-waveform');
        ipcRenderer.removeAllListeners('connection-status');

        // Clear status check interval
        if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
            this.statusCheckInterval = null;
        }

        // Destroy UI modules
        this.renderer.destroy();
        this.dataDisplay.destroy();

        this.isInitialized = false;
    }
}

// Export for use in other modules
module.exports = WaveformVisualizer;