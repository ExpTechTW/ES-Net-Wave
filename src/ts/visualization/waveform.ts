import { ES } from "../constants";
import { ipcRenderer } from "electron";
import WaveformRenderer from "../ui/waveform-renderer";
import DataDisplay from "../ui/data-display";
import { FilterManager } from "../utils/filter";
import { parseWebSocketMessage, ParsedMessage } from "../utils/data-parser";

interface DataPoint {
  t: number;
  x: number;
  y: number;
  z: number;
}

interface SecondData {
  timestamp: number;
  totalMessages: number;
  errorMessages: number;
}

class SlidingWindowErrorRate {
  private window: SecondData[] = [];
  private windowSize: number = 60; // 60 seconds
  private lastUpdateTime: number = 0;

  addMessage(isValid: boolean) {
    const now = Math.floor(Date.now() / 1000); // seconds

    if (now !== this.lastUpdateTime) {
      // New second, add new entry and remove old ones
      this.window.push({
        timestamp: now,
        totalMessages: 0,
        errorMessages: 0,
      });

      // Remove entries older than 60 seconds
      const cutoff = now - this.windowSize;
      this.window = this.window.filter((entry) => entry.timestamp > cutoff);

      this.lastUpdateTime = now;
    }

    // Update current second
    if (this.window.length > 0) {
      const current = this.window[this.window.length - 1];
      current.totalMessages++;
      if (!isValid) {
        current.errorMessages++;
      }
    }
  }

  getErrorRate(): number {
    const totalMessages = this.window.reduce(
      (sum, entry) => sum + entry.totalMessages,
      0,
    );
    const errorMessages = this.window.reduce(
      (sum, entry) => sum + entry.errorMessages,
      0,
    );

    return totalMessages > 0 ? (errorMessages / totalMessages) * 100 : 0;
  }

  reset() {
    this.window = [];
    this.lastUpdateTime = 0;
  }
}

class WaveformVisualizer {
  private TIME_WINDOW: number = ES.CANVAS.TIME_WINDOW_SECONDS * 1000; // 動態從配置讀取
  private dataBuffer: DataPoint[] = [];
  private isInitialized: boolean = false;
  private isConnected: boolean = false;
  private lastDataTime: number = 0;
  private statusCheckInterval: NodeJS.Timeout | null = null;
  private currentStation: string = ES.STATION.DEFAULT_ID;
  private renderer: WaveformRenderer = new WaveformRenderer();
  private dataDisplay: DataDisplay = new DataDisplay();
  private filterManager: FilterManager = new FilterManager();
  private errorRateWindow: SlidingWindowErrorRate =
    new SlidingWindowErrorRate();

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

    this.renderer.initialize(canvasX, canvasY, canvasZ);
    this.renderer.startAnimation();
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

    const parsed = parseWebSocketMessage(data, this.currentStation);
    const isValid = parsed !== null;

    this.errorRateWindow.addMessage(isValid);

    if (parsed) {
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
          parsed.sensorData.timestamp,
        );
      }
    }

    const errorRate = this.errorRateWindow.getErrorRate();
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
    this.dataBuffer = [];
    // Reset filter state when clearing waveform
    this.filterManager.resetFilter(this.currentStation);
    this.renderer.updateWaveformData(this.dataBuffer);
    this.resetStats();
  }

  resetStats() {
    this.errorRateWindow.reset();
    this.dataDisplay.updateErrorRate(0);
  }

  resetDataDisplay() {
    this.dataDisplay.resetDisplay();
  }

  pushData(xArr: number[], yArr: number[], zArr: number[], timestamp: number) {
    if (!this.isInitialized) return;

    const len = xArr.length;
    const packetDuration = len * 20; // 20ms per sample

    // Apply filtering to each axis with separate filter instances
    const filterX = this.filterManager.getFilter(this.currentStation, "x");
    const filterY = this.filterManager.getFilter(this.currentStation, "y");
    const filterZ = this.filterManager.getFilter(this.currentStation, "z");

    const filteredX = xArr.map((x) => filterX.filter(x));
    const filteredY = yArr.map((y) => filterY.filter(y));
    const filteredZ = zArr.map((z) => filterZ.filter(z));

    // Add data points with timestamps
    for (let i = 0; i < len; i++) {
      const ptTime = timestamp + i * 20;
      this.dataBuffer.push({
        t: ptTime,
        x: filteredX[i],
        y: filteredY[i],
        z: filteredZ[i],
      });
    }

    // Remove old data (keep 2 minutes + buffer)
    const cutoffTime = Date.now() - this.TIME_WINDOW - 2000;
    this.dataBuffer = this.dataBuffer.filter((pt) => pt.t > cutoffTime);

    this.renderer.updateWaveformData(this.dataBuffer);
  }

  setStation(station: any) {
    this.currentStation = station;
    this.dataDisplay.updateStationInfo(station);
    this.renderer.resetScales();
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
      const hasData = timeSinceLastData <= 1000;
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
