// Waveform Renderer Module
// Handles waveform visualization rendering
import { ES } from "../constants";

interface DataPoint {
  t: number;
  x: number;
  y: number;
  z: number;
}

class WaveformRenderer {
  private ctxX: CanvasRenderingContext2D | null = null;
  private ctxY: CanvasRenderingContext2D | null = null;
  private ctxZ: CanvasRenderingContext2D | null = null;
  private canvasX: HTMLCanvasElement | null = null;
  private canvasY: HTMLCanvasElement | null = null;
  private canvasZ: HTMLCanvasElement | null = null;
  private animationId: number | null = null;
  private waveformUpdateTimer: NodeJS.Timeout | null = null;
  private scaleUpdateTimer: NodeJS.Timeout | null = null;
  private isInitialized: boolean = false;
  private TIME_WINDOW: number = ES.CANVAS.TIME_WINDOW_SECONDS * 1000; // 從配置讀取
  private currentScaleX: number = ES.CANVAS.DEFAULT_SCALE;
  private currentScaleY: number = ES.CANVAS.DEFAULT_SCALE;
  private currentScaleZ: number = ES.CANVAS.DEFAULT_SCALE;
  private targetScaleX: number = ES.CANVAS.DEFAULT_SCALE;
  private targetScaleY: number = ES.CANVAS.DEFAULT_SCALE;
  private targetScaleZ: number = ES.CANVAS.DEFAULT_SCALE;
  private lastWaveformUpdate: number = Date.now();
  private waveformUpdateInterval: number =
    ES.CANVAS.WAVEFORM_UPDATE_INTERVAL_SECONDS * 1000;
  private dataBuffer: DataPoint[] = [];

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
      this.ctxX = this.canvasX.getContext("2d");
      this.ctxY = this.canvasY.getContext("2d");
      this.ctxZ = this.canvasZ.getContext("2d");

      // Set canvas sizes
      this.setCanvasSizes();

      // Setup resize observer
      const resizeObserver = new ResizeObserver(() => {
        this.setCanvasSizes();
      });
      const chartArea = document.getElementById("chart-area");
      if (chartArea) {
        resizeObserver.observe(chartArea);
      }

      this.isInitialized = true;
    } else {
      console.error("Waveform canvases not found");
    }
  }

  // Set canvas sizes
  setCanvasSizes() {
    const chartArea = document.getElementById("chart-area");
    if (!chartArea || !this.canvasX || !this.canvasY || !this.canvasZ) return;

    const width = chartArea.clientWidth;
    const height = chartArea.clientHeight;
    const perH = Math.max(40, Math.floor(height / 3));

    [this.canvasX, this.canvasY, this.canvasZ].forEach((canvas) => {
      if (canvas) {
        canvas.width = width;
        canvas.height = perH;
      }
    });
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
    const now = Date.now();
    const rightEdgeTime = now;
    const leftEdgeTime = now - this.TIME_WINDOW;

    // Draw each axis (scales are updated separately)
    this.drawAxis(
      this.ctxX,
      this.canvasX,
      "x",
      ES.COLORS.WAVE_X,
      leftEdgeTime,
      width,
      height,
      this.currentScaleX,
    );
    this.drawAxis(
      this.ctxY,
      this.canvasY,
      "y",
      ES.COLORS.WAVE_Y,
      leftEdgeTime,
      width,
      height,
      this.currentScaleY,
    );
    this.drawAxis(
      this.ctxZ,
      this.canvasZ,
      "z",
      ES.COLORS.WAVE_Z,
      leftEdgeTime,
      width,
      height,
      this.currentScaleZ,
    );
  }

  // Reset scales to default when switching stations
  resetScales() {
    this.currentScaleX = ES.CANVAS.DEFAULT_SCALE;
    this.currentScaleY = ES.CANVAS.DEFAULT_SCALE;
    this.currentScaleZ = ES.CANVAS.DEFAULT_SCALE;
    this.targetScaleX = ES.CANVAS.DEFAULT_SCALE;
    this.targetScaleY = ES.CANVAS.DEFAULT_SCALE;
    this.targetScaleZ = ES.CANVAS.DEFAULT_SCALE;
  }

  // Update scales every frame for smooth scaling
  updateScales() {
    // Smooth decay for each scale with different speeds
    this.updateSingleScale("x");
    this.updateSingleScale("y");
    this.updateSingleScale("z");
  }

  private updateSingleScale(axis: "x" | "y" | "z") {
    const currentScale =
      axis === "x"
        ? this.currentScaleX
        : axis === "y"
          ? this.currentScaleY
          : this.currentScaleZ;
    const targetScale =
      axis === "x"
        ? this.targetScaleX
        : axis === "y"
          ? this.targetScaleY
          : this.targetScaleZ;

    if (targetScale > currentScale) {
      // 變大：快速跟上 (0.2)
      const newScale = currentScale * 0.8 + targetScale * 0.2;
      if (axis === "x") this.currentScaleX = newScale;
      else if (axis === "y") this.currentScaleY = newScale;
      else this.currentScaleZ = newScale;
    } else {
      // 變小：極慢速 (0.005)
      const newScale = currentScale * 0.995 + targetScale * 0.005;
      if (axis === "x") this.currentScaleX = newScale;
      else if (axis === "y") this.currentScaleY = newScale;
      else this.currentScaleZ = newScale;
    }
  }

  // Compute target scales (only calculate, no decay)
  computeTargetScales(leftEdgeTime: number) {
    let maxX = 0,
      maxY = 0,
      maxZ = 0;

    for (let i = 0; i < this.dataBuffer.length; i++) {
      let pt = this.dataBuffer[i];
      if (pt.t >= leftEdgeTime) {
        maxX = Math.max(maxX, Math.abs(pt.x));
        maxY = Math.max(maxY, Math.abs(pt.y));
        maxZ = Math.max(maxZ, Math.abs(pt.z));
      }
    }

    // 如果沒有數據，使用默認縮放；如果有數據，使用數據的最大值
    const defaultScale = ES.CANVAS.DEFAULT_SCALE;
    this.targetScaleX = Math.max(maxX || defaultScale, defaultScale) * ES.CANVAS.SCALE_BUFFER_RATIO;
    this.targetScaleY = Math.max(maxY || defaultScale, defaultScale) * ES.CANVAS.SCALE_BUFFER_RATIO;
    this.targetScaleZ = Math.max(maxZ || defaultScale, defaultScale) * ES.CANVAS.SCALE_BUFFER_RATIO;
  }

  // Draw single axis
  drawAxis(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    axis: "x" | "y" | "z",
    color: string,
    leftEdgeTime: number,
    width: number,
    height: number,
    scale: number,
  ) {
    ctx.clearRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);

    let gridTime =
      Math.ceil(leftEdgeTime / (ES.CANVAS.GRID_INTERVAL_SECONDS * 1000)) *
      (ES.CANVAS.GRID_INTERVAL_SECONDS * 1000);
    while (gridTime < Date.now()) {
      let x = ((gridTime - leftEdgeTime) / this.TIME_WINDOW) * width;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      gridTime += ES.CANVAS.GRID_INTERVAL_SECONDS * 1000;
    }
    ctx.stroke();

    // Draw waveform
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    let started = false;
    const yScale = scale > 0 ? height / 2 / scale : 0;

    for (let i = 0; i < this.dataBuffer.length; i++) {
      let pt = this.dataBuffer[i];
      let x = ((pt.t - leftEdgeTime) / this.TIME_WINDOW) * width;
      let y = height / 2 - pt[axis] * yScale;

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

  // Cleanup
  destroy() {
    this.stopAnimation();

    // Clear canvas context references
    this.ctxX = null;
    this.ctxY = null;
    this.ctxZ = null;
    this.canvasX = null;
    this.canvasY = null;
    this.canvasZ = null;
    this.dataBuffer = [];

    this.isInitialized = false;
  }
}

export default WaveformRenderer;
