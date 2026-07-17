// Waveform Renderer Module
// Handles waveform visualization rendering
import { ES } from "../constants";
import { logger } from "../utils/logger";
import ntpNow from "../utils/ntp";
import {
  SPEC,
  computeSpectrogram,
  infernoLut,
  SpectrogramResult,
} from "../utils/spectrogram";

interface DataPoint {
  t: number;
  x: number;
  y: number;
  z: number;
}

// Data is streamed at 50 Hz (20 ms per sample); used for spectrogram frequencies.
const SAMPLE_RATE_HZ = 50;

type ViewMode = "waveform" | "spectrogram";

class WaveformRenderer {
  private ctxX: CanvasRenderingContext2D | null = null;
  private ctxY: CanvasRenderingContext2D | null = null;
  private ctxZ: CanvasRenderingContext2D | null = null;
  private ctxOverlay: CanvasRenderingContext2D | null = null;
  private canvasX: HTMLCanvasElement | null = null;
  private canvasY: HTMLCanvasElement | null = null;
  private canvasZ: HTMLCanvasElement | null = null;
  private canvasOverlay: HTMLCanvasElement | null = null;
  private animationId: number | null = null;
  private waveformUpdateTimer: NodeJS.Timeout | null = null;
  private scaleUpdateTimer: NodeJS.Timeout | null = null;
  private isInitialized: boolean = false;
  private TIME_WINDOW: number = ES.CANVAS.TIME_WINDOW_SECONDS * 1000; // 從配置讀取
  private currentScaleX: number = ES.CANVAS.DEFAULT_SCALE;
  private currentScaleY: number = ES.CANVAS.DEFAULT_SCALE;
  private currentScaleZ: number = ES.CANVAS.DEFAULT_SCALE;
  private currentScaleOverlay: number = ES.CANVAS.DEFAULT_SCALE;
  private targetScaleX: number = ES.CANVAS.DEFAULT_SCALE;
  private targetScaleY: number = ES.CANVAS.DEFAULT_SCALE;
  private targetScaleZ: number = ES.CANVAS.DEFAULT_SCALE;
  private targetScaleOverlay: number = ES.CANVAS.DEFAULT_SCALE;
  private lastWaveformUpdate: number = Date.now();
  private waveformUpdateInterval: number =
    ES.CANVAS.WAVEFORM_UPDATE_INTERVAL_SECONDS * 1000;
  private dataBuffer: DataPoint[] = [];

  // Right-click toggles between the waveform view and the spectrogram (時頻圖).
  private mode: ViewMode = "waveform";
  // Offscreen canvas holding one spectrogram at column/bin resolution, then
  // stretched onto the panel — avoids thousands of per-cell fillRects.
  private specScratch: HTMLCanvasElement | null = null;

  constructor() {
    // Constructor is empty as properties are initialized above
  }

  // Initialize renderer with canvas contexts
  initialize(
    canvasX: HTMLElement | null,
    canvasY: HTMLElement | null,
    canvasZ: HTMLElement | null,
  ) {
    if (canvasX && canvasY && canvasZ) {
      this.canvasX = canvasX as HTMLCanvasElement;
      this.canvasY = canvasY as HTMLCanvasElement;
      this.canvasZ = canvasZ as HTMLCanvasElement;
      this.canvasOverlay = document.getElementById("waveform-overlay") as HTMLCanvasElement;
      this.ctxX = this.canvasX.getContext("2d");
      this.ctxY = this.canvasY.getContext("2d");
      this.ctxZ = this.canvasZ.getContext("2d");
      this.ctxOverlay = this.canvasOverlay?.getContext("2d") || null;

      // Set canvas sizes
      this.setCanvasSizes();

      // Setup resize observer
      const resizeObserver = new ResizeObserver(() => {
        this.setCanvasSizes();
      });
      const chartArea = document.getElementById("chart-area");
      if (chartArea) {
        resizeObserver.observe(chartArea);
        // Right-click toggles waveform <-> spectrogram view.
        chartArea.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          this.toggleMode();
        });
      }

      this.isInitialized = true;
    } else {
      logger.error("Waveform canvases not found");
    }
  }

  // Set canvas sizes
  setCanvasSizes() {
    const chartArea = document.getElementById("chart-area");
    if (!chartArea || !this.canvasX || !this.canvasY || !this.canvasZ) return;

    const width = chartArea.clientWidth;
    const height = chartArea.clientHeight;
    const perH = Math.max(40, Math.floor(height / 4)); // 现在有4个部分：3个单独 + 1个重叠

    [this.canvasX, this.canvasY, this.canvasZ].forEach((canvas) => {
      if (canvas) {
        canvas.width = width;
        canvas.height = perH;
      }
    });

    if (this.canvasOverlay) {
      this.canvasOverlay.width = width;
      this.canvasOverlay.height = perH;
    }
  }

  // Handle window resize
  handleResize() {
    this.setCanvasSizes();
  }

  // Update waveform data and render
  updateWaveformData(dataBuffer: DataPoint[]) {
    if (!this.isInitialized) return;
    this.dataBuffer = dataBuffer;

  }

  // Start animation loop
  startAnimation() {
    if (this.waveformUpdateTimer || this.scaleUpdateTimer) {
      this.stopAnimation();
    }

    // 縮放更新：每100ms (平滑過渡)
    this.scaleUpdateTimer = setInterval(() => {
      this.updateScales();
    }, 100);

    // 波形繪製：每0.5秒 (包含縮放計算)
    this.waveformUpdateTimer = setInterval(() => {
      this.computeTargetScales(Date.now() - this.TIME_WINDOW);
      this.drawWaveforms();
    }, this.waveformUpdateInterval);
  }

  // Stop animation loop
  stopAnimation() {
    if (this.waveformUpdateTimer) {
      clearInterval(this.waveformUpdateTimer);
      this.waveformUpdateTimer = null;
    }
    if (this.scaleUpdateTimer) {
      clearInterval(this.scaleUpdateTimer);
      this.scaleUpdateTimer = null;
    }
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  // Draw all waveforms
  drawWaveforms() {
    if (
      !this.ctxX ||
      !this.ctxY ||
      !this.ctxZ ||
      !this.canvasX ||
      !this.canvasY ||
      !this.canvasZ
    )
      return;

    const width = this.canvasX.width;
    const height = this.canvasX.height;

    // Define time window: [now - 120s] to [now]
    const now = ntpNow();
    const leftEdgeTime = now - this.TIME_WINDOW;

    if (this.mode === "spectrogram") {
      const xs = this.dataBuffer.map((p) => p.x);
      const ys = this.dataBuffer.map((p) => p.y);
      const zs = this.dataBuffer.map((p) => p.z);
      // Frequency axis depends on the true sample spacing; measure it from the
      // data rather than assuming a rate (delivery is ~100 Hz, not 50 Hz).
      const fs = this.estimateSampleRate();
      // Each axis panel shows its own spectrogram; the overlay shows the
      // 3-component total power (matching the reference GUI).
      this.drawSpectrogramPanel(this.ctxX, [xs], leftEdgeTime, width, height, fs);
      this.drawSpectrogramPanel(this.ctxY, [ys], leftEdgeTime, width, height, fs);
      this.drawSpectrogramPanel(this.ctxZ, [zs], leftEdgeTime, width, height, fs);
      if (this.ctxOverlay) {
        this.drawSpectrogramPanel(this.ctxOverlay, [xs, ys, zs], leftEdgeTime, width, height, fs);
      }
    } else {
      // Draw each axis (scales are updated separately)
      this.drawAxis(this.ctxX, "x", ES.COLORS.WAVE_X, leftEdgeTime, width, height, this.currentScaleX);
      this.drawAxis(this.ctxY, "y", ES.COLORS.WAVE_Y, leftEdgeTime, width, height, this.currentScaleY);
      this.drawAxis(this.ctxZ, "z", ES.COLORS.WAVE_Z, leftEdgeTime, width, height, this.currentScaleZ);
      this.drawOverlayWaveform(leftEdgeTime, width, height);
    }

    // Time axis (T0 ~ T{window}s) along the bottom (Z) panel, both modes.
    this.drawTimeAxis(this.ctxZ, width, height);
  }

  // Toggle between waveform and spectrogram views (right-click).
  toggleMode() {
    this.mode = this.mode === "waveform" ? "spectrogram" : "waveform";
    if (this.mode === "waveform") {
      this.computeTargetScales(ntpNow() - this.TIME_WINDOW);
      this.updateScales();
    }
    this.drawWaveforms();
  }

  // Reset scales to default when switching stations
  resetScales() {
    this.currentScaleX = ES.CANVAS.DEFAULT_SCALE;
    this.currentScaleY = ES.CANVAS.DEFAULT_SCALE;
    this.currentScaleZ = ES.CANVAS.DEFAULT_SCALE;
    this.currentScaleOverlay = ES.CANVAS.DEFAULT_SCALE;
    this.targetScaleX = ES.CANVAS.DEFAULT_SCALE;
    this.targetScaleY = ES.CANVAS.DEFAULT_SCALE;
    this.targetScaleZ = ES.CANVAS.DEFAULT_SCALE;
    this.targetScaleOverlay = ES.CANVAS.DEFAULT_SCALE;
  }

  // Update scales (縮放即時跟隨目標值，無平滑衰減)
  updateScales() {
    this.currentScaleX = this.targetScaleX;
    this.currentScaleY = this.targetScaleY;
    this.currentScaleZ = this.targetScaleZ;
    this.currentScaleOverlay = this.targetScaleOverlay;
  }

  // Compute target scales (only calculate, no decay)
  computeTargetScales(leftEdgeTime: number) {
    let maxX = 0,
      maxY = 0,
      maxZ = 0;

    for (let i = 0; i < this.dataBuffer.length; i++) {
      const pt = this.dataBuffer[i];
      if (pt.t >= leftEdgeTime) {
        const ax = Math.abs(pt.x);
        const ay = Math.abs(pt.y);
        const az = Math.abs(pt.z);
        if (ax > maxX) maxX = ax;
        if (ay > maxY) maxY = ay;
        if (az > maxZ) maxZ = az;
      }
    }

    // maxX/Y/Z >= 0，defaultScale 為下限；max(maxN, defaultScale) 即等價於原邏輯
    const defaultScale = ES.CANVAS.DEFAULT_SCALE;
    const ratio = ES.CANVAS.SCALE_BUFFER_RATIO;
    this.targetScaleX = Math.max(maxX, defaultScale) * ratio;
    this.targetScaleY = Math.max(maxY, defaultScale) * ratio;
    this.targetScaleZ = Math.max(maxZ, defaultScale) * ratio;

    // Overlay 使用所有軸的綜合最大值
    const maxOverall = Math.max(maxX, maxY, maxZ);
    this.targetScaleOverlay = Math.max(maxOverall, defaultScale) * ratio;
  }

  // Draw the horizontal midline and time grid (shared by all panels)
  private drawGrid(
    ctx: CanvasRenderingContext2D,
    leftEdgeTime: number,
    width: number,
    height: number,
  ) {
    const gridMs = ES.CANVAS.GRID_INTERVAL_SECONDS * 1000;
    const xScale = width / this.TIME_WINDOW;
    const midY = height / 2;
    const now = Date.now();

    ctx.strokeStyle = "#222";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);

    for (
      let gridTime = Math.ceil(leftEdgeTime / gridMs) * gridMs;
      gridTime < now;
      gridTime += gridMs
    ) {
      const x = (gridTime - leftEdgeTime) * xScale;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    ctx.stroke();
  }

  // Draw a single trace for the given axis (shared by single/overlay panels)
  private drawTrace(
    ctx: CanvasRenderingContext2D,
    axis: "x" | "y" | "z",
    color: string,
    leftEdgeTime: number,
    width: number,
    height: number,
    yScale: number,
  ) {
    const xScale = width / this.TIME_WINDOW;
    const midY = height / 2;

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    let started = false;

    for (let i = 0; i < this.dataBuffer.length; i++) {
      const pt = this.dataBuffer[i];
      const x = (pt.t - leftEdgeTime) * xScale;
      const y = midY - pt[axis] * yScale;

      if (x < -10 && !started) continue;

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }

      if (x > width) break;
    }
    ctx.stroke();
  }

  // Draw single axis
  drawAxis(
    ctx: CanvasRenderingContext2D,
    axis: "x" | "y" | "z",
    color: string,
    leftEdgeTime: number,
    width: number,
    height: number,
    scale: number,
  ) {
    ctx.clearRect(0, 0, width, height);
    this.drawGrid(ctx, leftEdgeTime, width, height);

    const yScale = scale > 0 ? height / 2 / scale : 0;
    this.drawTrace(ctx, axis, color, leftEdgeTime, width, height, yScale);
  }

  // Draw overlay waveform with all three axes
  drawOverlayWaveform(leftEdgeTime: number, width: number, height: number) {
    if (!this.ctxOverlay || !this.canvasOverlay) return;

    const ctx = this.ctxOverlay;
    ctx.clearRect(0, 0, width, height);
    this.drawGrid(ctx, leftEdgeTime, width, height);

    // Use overlay's own scale based on combined maximum of all axes
    const yScale =
      this.currentScaleOverlay > 0 ? height / 2 / this.currentScaleOverlay : 0;

    // Draw waveforms in order: X (bottom), Y (middle), Z (top)
    this.drawTrace(ctx, "x", ES.COLORS.WAVE_X, leftEdgeTime, width, height, yScale);
    this.drawTrace(ctx, "y", ES.COLORS.WAVE_Y, leftEdgeTime, width, height, yScale);
    this.drawTrace(ctx, "z", ES.COLORS.WAVE_Z, leftEdgeTime, width, height, yScale);
  }

  // Estimate the sample rate (Hz) from the median gap between consecutive
  // buffered samples, so the spectrogram frequency axis is correct regardless
  // of the actual delivery rate. Falls back to SAMPLE_RATE_HZ when unknown.
  private estimateSampleRate(): number {
    const n = this.dataBuffer.length;
    if (n < 2) return SAMPLE_RATE_HZ;

    const dts: number[] = [];
    const step = Math.max(1, Math.floor(n / 500));
    for (let i = step; i < n; i += step) {
      const dt = this.dataBuffer[i].t - this.dataBuffer[i - 1].t;
      if (dt > 0) dts.push(dt);
    }
    if (dts.length === 0) return SAMPLE_RATE_HZ;

    dts.sort((a, b) => a - b);
    const medianDt = dts[dts.length >> 1];
    const fs = 1000 / medianDt;
    return Number.isFinite(fs) ? Math.min(200, Math.max(10, fs)) : SAMPLE_RATE_HZ;
  }

  // Lazily created/resized offscreen canvas for spectrogram pixels.
  private getSpecScratch(w: number, h: number): HTMLCanvasElement {
    if (!this.specScratch) this.specScratch = document.createElement("canvas");
    if (this.specScratch.width !== w) this.specScratch.width = w;
    if (this.specScratch.height !== h) this.specScratch.height = h;
    return this.specScratch;
  }

  // Draw the band edges the filter passes: HPF edge (1 Hz) as a faint thin
  // blue line, LPF edge (10 Hz) as a faint thin red line.
  private drawSpecBandLines(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    topHz: number,
  ) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    const lines: [number, string][] = [
      [SPEC.BAND_LO_HZ, "rgba(120,165,255,0.55)"], // HPF edge - faint blue
      [SPEC.BAND_HI_HZ, "rgba(255,120,120,0.55)"], // LPF edge - faint red
    ];
    for (const [hz, color] of lines) {
      const y = height * (1 - hz / topHz);
      if (y < 0 || y > height) continue;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Draw one spectrogram panel from one (per-axis) or three (combined) signals.
  private drawSpectrogramPanel(
    ctx: CanvasRenderingContext2D,
    signals: number[][],
    leftEdgeTime: number,
    width: number,
    height: number,
    fs: number,
  ) {
    ctx.clearRect(0, 0, width, height);

    const spec: SpectrogramResult | null = computeSpectrogram(signals, fs);
    if (!spec || spec.nCols < 2) {
      this.drawSpecBandLines(ctx, width, height, spec?.topHz ?? SPEC.MAX_DISPLAY_HZ);
      this.drawSpecFrame(ctx, width, height);
      return;
    }

    // Render at column x bin resolution, then stretch onto the panel.
    const scratch = this.getSpecScratch(spec.nCols, spec.nBins);
    const sctx = scratch.getContext("2d");
    if (!sctx) return;

    const img = sctx.createImageData(spec.nCols, spec.nBins);
    const lut = infernoLut();
    const span = SPEC.DB_HI - SPEC.DB_LO;
    for (let c = 0; c < spec.nCols; c++) {
      for (let b = 0; b < spec.nBins; b++) {
        const rel = spec.rel[c * spec.nBins + b];
        let idx = Math.round(((rel - SPEC.DB_LO) / span) * 255);
        if (idx < 0) idx = 0;
        else if (idx > 255) idx = 255;
        // Image row 0 = panel top = highest frequency, so flip the bin index.
        const px = ((spec.nBins - 1 - b) * spec.nCols + c) * 4;
        img.data[px] = lut[idx * 3];
        img.data[px + 1] = lut[idx * 3 + 1];
        img.data[px + 2] = lut[idx * 3 + 2];
        img.data[px + 3] = 255;
      }
    }
    sctx.putImageData(img, 0, 0);

    // Position the block by the timestamps of its first/last columns.
    const xScale = width / this.TIME_WINDOW;
    const tFirst = this.dataBuffer[spec.colEndIdx[0]].t;
    const tLast = this.dataBuffer[spec.colEndIdx[spec.nCols - 1]].t;
    const x0 = (tFirst - leftEdgeTime) * xScale;
    const drawW = Math.max(1, (tLast - leftEdgeTime) * xScale - x0);
    // Nearest-neighbour: keep cells crisp instead of blurring the STFT bins.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(scratch, 0, 0, spec.nCols, spec.nBins, x0, 0, drawW, height);

    this.drawSpecBandLines(ctx, width, height, spec.topHz);
    this.drawSpecFrame(ctx, width, height);
  }

  // White frame around a spectrogram channel.
  private drawSpecFrame(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
    ctx.restore();
  }

  // Draw the relative time axis: T0 at the right edge (newest = now) to
  // T{window}s at the left edge (oldest), rendered along the bottom panel.
  private drawTimeAxis(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) {
    const windowSec = Math.round(this.TIME_WINDOW / 1000);
    const ticks = 4;
    ctx.save();
    ctx.fillStyle = "#888";
    ctx.font = "10px 'Segoe UI', Roboto, sans-serif";
    ctx.textBaseline = "bottom";
    for (let i = 0; i <= ticks; i++) {
      const frac = i / ticks;
      // Newest (now) is at the right edge -> seconds increase leftward.
      const label = `T${Math.round((1 - frac) * windowSec)}s`;
      let x = frac * width;
      if (i === 0) {
        ctx.textAlign = "left";
        x += 3;
      } else if (i === ticks) {
        ctx.textAlign = "right";
        x -= 3;
      } else {
        ctx.textAlign = "center";
      }
      ctx.fillText(label, x, height - 2);
    }
    ctx.restore();
  }

  // Cleanup
  destroy() {
    this.stopAnimation();

    // Clear canvas context references
    this.ctxX = null;
    this.ctxY = null;
    this.ctxZ = null;
    this.ctxOverlay = null;
    this.canvasX = null;
    this.canvasY = null;
    this.canvasZ = null;
    this.canvasOverlay = null;
    this.dataBuffer = [];

    this.isInitialized = false;
  }
}

export default WaveformRenderer;
