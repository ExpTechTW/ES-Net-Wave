import { ES } from '../constants';
import { ipcRenderer } from 'electron';
import WaveformRenderer from '../ui/waveform-renderer';
import DataDisplay from '../ui/data-display';
import { FilterManager } from '../utils/filter';

class WaveformVisualizer {
    private maxPoints: number = ES.CANVAS.MAX_POINTS;
    private bufX: number[] = new Array(this.maxPoints).fill(0);
    private bufY: number[] = new Array(this.maxPoints).fill(0);
    private bufZ: number[] = new Array(this.maxPoints).fill(0);
    private isInitialized: boolean = false;
    private isConnected: boolean = false;
    private lastDataTime: number = 0;
    private statusCheckInterval: NodeJS.Timeout | null = null;
    private currentStation: string = ES.STATION.DEFAULT_ID;
    private renderer: WaveformRenderer = new WaveformRenderer();
    private dataDisplay: DataDisplay = new DataDisplay();
    private filterManager: FilterManager = new FilterManager();

    initialize() {
        if (this.isInitialized) {
            console.warn('WaveformVisualizer already initialized');
            return;
        }

        this.dataDisplay.initialize();
        this.dataDisplay.initializeUI();

        const canvasX = document.getElementById('waveform-x') as HTMLCanvasElement;
        const canvasY = document.getElementById('waveform-y') as HTMLCanvasElement;
        const canvasZ = document.getElementById('waveform-z') as HTMLCanvasElement;
        const canvasTime = document.getElementById('time-axis') as HTMLCanvasElement;

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

    handleWebSocketMessage(data: any) {
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

                this.dataDisplay.updateIntensityData(intensity, pga, Number(ts));
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

    async changeStation(stationId: string) {
        this.setStation(stationId);
        // Reset filter state when changing stations
        this.filterManager.resetFilter(stationId);
        await ipcRenderer.invoke('set-station', stationId);
    }

    clearWaveform() {
        this.bufX.fill(0);
        this.bufY.fill(0);
        this.bufZ.fill(0);
        // Reset filter state when clearing waveform
        this.filterManager.resetFilter(this.currentStation);
        this.renderer.updateWaveformData(this.bufX, this.bufY, this.bufZ);
    }

    pushData(xArr: number[], yArr: number[], zArr: number[]) {
        if (!this.isInitialized) return;

        const len = xArr.length;

        // Apply filtering to each axis with separate filter instances
        const filterX = this.filterManager.getFilter(this.currentStation, 'x');
        const filterY = this.filterManager.getFilter(this.currentStation, 'y');
        const filterZ = this.filterManager.getFilter(this.currentStation, 'z');

        const filteredX = xArr.map(x => filterX.filter(x));
        const filteredY = yArr.map(y => filterY.filter(y));
        const filteredZ = zArr.map(z => filterZ.filter(z));

        this.bufX.splice(0, len);
        this.bufX.push(...filteredX);
        this.bufY.splice(0, len);
        this.bufY.push(...filteredY);
        this.bufZ.splice(0, len);
        this.bufZ.push(...filteredZ);

        this.renderer.updateWaveformData(this.bufX, this.bufY, this.bufZ);
    }

    setStation(station: any) {
        this.currentStation = station;
        this.dataDisplay.updateStationInfo(station);
    }

    updateConnectionStatus(status: string) {
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

export default WaveformVisualizer;