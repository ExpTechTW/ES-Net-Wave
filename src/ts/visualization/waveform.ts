import { ES } from "../constants";
import { ipcRenderer } from "electron";
import WaveformRenderer from "../ui/waveform-renderer";
import DataDisplay from "../ui/data-display";
import { FilterManager } from "../utils/filter";
import { parseWebSocketMessage, ParsedMessage } from "../utils/data-parser";
import ntpNow from "../utils/ntp";
import { RingBuffer, DataPoint } from "../utils/ring-buffer";

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
    const now = Math.floor(ntpNow() / 1000); // seconds

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
  private dataBuffer: RingBuffer; // Changed from DataPoint[] to RingBuffer
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
  private syncRequestTimeout: NodeJS.Timeout | null = null;
  private isSyncing: boolean = false;

  // Debug: measure the real sample rate from incoming sensor packets.
  private lastSensorTs: number | null = null;

  constructor() {
    // Pre-allocate the RingBuffer to cover the full TIME_WINDOW at 50 Hz
    // (20 ms per sample), plus 10% headroom for timing jitter. Duplicate
    // packets are dropped in pushData, so this density is now correct and
    // history reaches the full window. Old points outside it are not drawn.
    const bufferCapacity = Math.ceil((this.TIME_WINDOW / 20) * 1.1);
    this.dataBuffer = new RingBuffer(bufferCapacity);
  }

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
    ipcRenderer.removeAllListeners("sync-data");

    ipcRenderer.on("ws-message", (event, data) => {
      this.handleWebSocketMessage(data);
    });

    ipcRenderer.on("clear-waveform", () => {
      this.clearWaveform();
    });

    ipcRenderer.on("connection-status", (event, status) => {
      this.updateConnectionStatus(status);
    });

    // Handle synced historical data from server
    ipcRenderer.on("sync-data", (event, data) => {
      this.handleSyncedData(data);
    });

    this.statusCheckInterval = setInterval(() => {
      this.checkDataStatus();
    }, 500);
  }

  handleWebSocketMessage(data: any) {
    this.lastDataTime = ntpNow();

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
    this.dataBuffer.clear();
    // Reset filter state when clearing waveform
    this.filterManager.resetFilter(this.currentStation);
    this.renderer.updateWaveformData(this.dataBuffer.getAll());
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

    // The feed delivers each packet twice with an identical timestamp. Pushing
    // the duplicate doubles the buffer density (history capped at ~T65) and
    // corrupts the spectrogram (every block replayed -> broadband energy), so
    // drop any packet whose timestamp matches the previous one.
    if (timestamp === this.lastSensorTs) return;
    this.lastSensorTs = timestamp;

    const len = xArr.length;

    // Apply filtering to each axis with separate filter instances
    const filterX = this.filterManager.getFilter(this.currentStation, "x");
    const filterY = this.filterManager.getFilter(this.currentStation, "y");
    const filterZ = this.filterManager.getFilter(this.currentStation, "z");

    // Filter and push in a single pass - O(1) per point, no temp arrays
    for (let i = 0; i < len; i++) {
      this.dataBuffer.push({
        t: timestamp + i * 20,
        x: filterX.filter(xArr[i]),
        y: filterY.filter(yArr[i]),
        z: filterZ.filter(zArr[i]),
      });
    }

    // Get current data from ring buffer and send to renderer
    this.renderer.updateWaveformData(this.dataBuffer.getAll());
  }

  setStation(station: any) {
    this.currentStation = station;
    this.dataDisplay.updateStationInfo(station);
    this.renderer.resetScales();
  }

  updateConnectionStatus(status: string) {
    this.isConnected = status === "connected";
    if (this.isConnected) {
      this.lastDataTime = ntpNow();

      // Schedule sync request after 2 seconds of connection
      if (this.syncRequestTimeout) {
        clearTimeout(this.syncRequestTimeout);
      }
      this.syncRequestTimeout = setTimeout(() => {
        this.requestDataSync();
      }, 2000);
    }

    this.dataDisplay.updateConnectionStatus(status);

    if (status === "disconnected") {
      this.dataDisplay.updateDataStatus(false);
      if (this.syncRequestTimeout) {
        clearTimeout(this.syncRequestTimeout);
        this.syncRequestTimeout = null;
      }
    }
  }

  checkDataStatus() {
    if (this.isConnected) {
      const timeSinceLastData = ntpNow() - this.lastDataTime;
      const hasData = timeSinceLastData <= 1000;
      this.dataDisplay.updateDataStatus(hasData);
    }
  }

  /**
   * Request synced historical data from server
   * Server should return data covering at least the time window
   */
  private requestDataSync() {
    if (this.isSyncing || !this.isConnected) return;

    this.isSyncing = true;

    // Calculate required time window for sync
    const timeWindowMs = this.TIME_WINDOW;

    // Send sync request to main process
    ipcRenderer.invoke("request-data-sync", {
      station: this.currentStation,
      timeWindow: timeWindowMs,
      timestamp: ntpNow(),
    }).catch((err) => {
      console.error("Data sync request failed:", err);
      this.isSyncing = false;
    });
  }

  /**
   * Handle synced historical data from server
   * Merges with existing real-time data and maintains sorted order
   */
  private handleSyncedData(syncedData: any) {
    if (!syncedData || !syncedData.data || !Array.isArray(syncedData.data)) {
      console.error("Invalid synced data format");
      this.isSyncing = false;
      return;
    }

    try {
      // Extract the data points from synced data
      const historicalPoints = syncedData.data as DataPoint[];

      // Merge historical data with current ring buffer
      // This handles deduplication and maintains sorted order
      this.dataBuffer.mergeData(historicalPoints);

      // Update renderer with merged data
      this.renderer.updateWaveformData(this.dataBuffer.getAll());

      console.log(`Synced ${historicalPoints.length} historical data points`);
    } catch (err) {
      console.error("Error processing synced data:", err);
    } finally {
      this.isSyncing = false;
    }
  }

  destroy() {
    ipcRenderer.removeAllListeners("ws-message");
    ipcRenderer.removeAllListeners("clear-waveform");
    ipcRenderer.removeAllListeners("connection-status");
    ipcRenderer.removeAllListeners("sync-data");

    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
      this.statusCheckInterval = null;
    }

    if (this.syncRequestTimeout) {
      clearTimeout(this.syncRequestTimeout);
      this.syncRequestTimeout = null;
    }

    this.renderer.destroy();
    this.dataDisplay.destroy();
    this.dataBuffer.clear();
    this.isInitialized = false;
  }
}

export default WaveformVisualizer;
