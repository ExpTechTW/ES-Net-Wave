import { ES } from "../constants";
import { ipcRenderer } from "electron";
import WaveformRenderer from "../ui/waveform-renderer";
import DataDisplay from "../ui/data-display";
import { FilterManager } from "../utils/filter";
import { parseWebSocketMessage, ParsedMessage } from "../utils/data-parser";

class WaveformVisualizer {
  private maxPoints: number = ES.CANVAS.MAX_POINTS;
  private bufX: number[] = new Array(this.maxPoints).fill(NaN);
  private bufY: number[] = new Array(this.maxPoints).fill(NaN);
  private bufZ: number[] = new Array(this.maxPoints).fill(NaN);
  private isInitialized: boolean = false;
  private isConnected: boolean = false;
  private lastDataTime: number = 0;
  private statusCheckInterval: NodeJS.Timeout | null = null;
  private currentStation: string = ES.STATION.DEFAULT_ID;
  private renderer: WaveformRenderer = new WaveformRenderer();
  private dataDisplay: DataDisplay = new DataDisplay();
  private filterManager: FilterManager = new FilterManager();
  private totalMessages: number = 0;
  private validMessages: number = 0;

  initialize() {
    if (this.isInitialized) {
      console.warn("WaveformVisualizer already initialized");
      return;
    }

    this.dataDisplay.initialize();
    this.dataDisplay.initializeUI();

    const canvasX = document.getElementById("waveform-x") as HTMLCanvasElement;
    const canvasY = document.getElementById("waveform-y") as HTMLCanvasElement;
    const canvasZ = document.getElementById("waveform-z") as HTMLCanvasElement;
    const canvasTime = document.getElementById(
      "time-axis",
    ) as HTMLCanvasElement;

    this.renderer.initialize(canvasX, canvasY, canvasZ, canvasTime);
    this.renderer.startAnimation();
    this.renderer.updateWaveformData(this.bufX, this.bufY, this.bufZ);
    this.isInitialized = true;

    this.resetStats();
    this.setupIPCHandlers();
  }

  handleResize() {
    this.renderer.handleResize();
  }

  setupIPCHandlers() {
    ipcRenderer.removeAllListeners("ws-message");
    ipcRenderer.removeAllListeners("clear-waveform");
    ipcRenderer.removeAllListeners("connection-status");

    ipcRenderer.on("ws-message", (event, data) => {
      this.handleWebSocketMessage(data);
    });

    ipcRenderer.on("clear-waveform", () => {
      this.clearWaveform();
    });

    ipcRenderer.on("connection-status", (event, status) => {
      this.updateConnectionStatus(status);
    });

    this.statusCheckInterval = setInterval(() => {
      this.checkDataStatus();
    }, 500);
  }

  handleWebSocketMessage(data: any) {
    this.lastDataTime = Date.now();
    this.totalMessages++;

    const parsed = parseWebSocketMessage(data, this.currentStation);

    if (parsed) {
      this.validMessages++;

      if (parsed.type === "intensity" && parsed.intensityData) {
        this.dataDisplay.updateIntensityData(
          parsed.intensityData.intensity,
          parsed.intensityData.pga,
          parsed.intensityData.timestamp,
        );
      } else if (parsed.type === "sensor" && parsed.sensorData) {
        this.pushData(
          parsed.sensorData.x,
          parsed.sensorData.y,
          parsed.sensorData.z,
        );
      }
    }

    const errorRate =
      this.totalMessages > 0
        ? ((this.totalMessages - this.validMessages) / this.totalMessages) * 100
        : 0;
    this.dataDisplay.updateErrorRate(errorRate);
  }

  async changeStation(stationId: string) {
    this.setStation(stationId);
    this.clearWaveform();
    // Reset filter state when changing stations
    this.filterManager.resetFilter(stationId);
    await ipcRenderer.invoke("set-station", stationId);
  }

  clearWaveform() {
    this.bufX.fill(NaN);
    this.bufY.fill(NaN);
    this.bufZ.fill(NaN);
    // Reset filter state when clearing waveform
    this.filterManager.resetFilter(this.currentStation);
    this.renderer.updateWaveformData(this.bufX, this.bufY, this.bufZ);
  }

  resetStats() {
    this.totalMessages = 0;
    this.validMessages = 0;
    this.dataDisplay.updateErrorRate(0);
  }

  resetDataDisplay() {
    this.dataDisplay.resetDisplay();
  }

  pushData(xArr: number[], yArr: number[], zArr: number[]) {
    if (!this.isInitialized) return;

    const len = xArr.length;

    // Apply filtering to each axis with separate filter instances
    const filterX = this.filterManager.getFilter(this.currentStation, "x");
    const filterY = this.filterManager.getFilter(this.currentStation, "y");
    const filterZ = this.filterManager.getFilter(this.currentStation, "z");

    const filteredX = xArr.map((x) => filterX.filter(x));
    const filteredY = yArr.map((y) => filterY.filter(y));
    const filteredZ = zArr.map((z) => filterZ.filter(z));

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
    this.isConnected = status === "connected";
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
    ipcRenderer.removeAllListeners("ws-message");
    ipcRenderer.removeAllListeners("clear-waveform");
    ipcRenderer.removeAllListeners("connection-status");

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
