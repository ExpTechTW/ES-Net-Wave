// Spectrogram (STFT) utilities for ES-Net-Wave
// Mirrors the presentation of ml-p-s-picking/gui.py:
//   - runs on the SAME 1-10 Hz band-pass filtered trace the waveform draws
//   - 64-sample window (1.28 s @ 50 Hz), hop 4 samples (0.08 s)
//   - 3-component total power (sum of |FFT|^2 over axes), 10*log10 -> dB
//   - each frequency normalised against its OWN median (noise floor -> 0 dB)
//   - colour scale 3..30 dB, inferno colormap, 1/10 Hz band edges highlighted

export const SPEC = {
  NPERSEG: 64, // window length (samples)  -> 1.28 s @ 50 Hz
  NOVERLAP: 60, // overlap -> hop = 4 samples (0.08 s)
  DB_LO: 3.0, // colour scale low (dB above per-frequency noise floor)
  DB_HI: 30.0, // colour scale high
  BAND_LO_HZ: 1.0, // band-pass low edge (highlighted line)
  BAND_HI_HZ: 10.0, // band-pass high edge (highlighted line)
  MAX_DISPLAY_HZ: 15.0, // above ~10 Hz the filter already removed everything
};

export interface SpectrogramResult {
  rel: Float32Array; // nCols*nBins, index = col*nBins + bin; bin 0 = lowest freq
  nCols: number;
  nBins: number;
  colEndIdx: number[]; // signal index at each column's right edge (causal)
  binHz: number; // frequency resolution (fs / NPERSEG)
  topHz: number; // frequency at the top of the displayed bins
}

// In-place iterative radix-2 FFT (length must be a power of two).
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const vr = re[b] * cr - im[b] * ci;
        const vi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - vr;
        im[b] = im[a] - vi;
        re[a] += vr;
        im[a] += vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

// Hann window, cached by length.
const hannCache = new Map<number, Float64Array>();
function hann(n: number): Float64Array {
  let w = hannCache.get(n);
  if (!w) {
    w = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    }
    hannCache.set(n, w);
  }
  return w;
}

/**
 * Compute a right-aligned (causal) spectrogram from one or more uniformly
 * sampled signals. When several signals are given their powers are summed
 * (3-component total power, as in the reference GUI).
 *
 * Each frequency bin is normalised against its own median across the window,
 * so a flat noise floor maps to ~0 dB and only real energy stands out.
 */
export function computeSpectrogram(
  signals: number[][],
  fs: number,
): SpectrogramResult | null {
  const N = SPEC.NPERSEG;
  const hop = N - SPEC.NOVERLAP;
  const len = signals[0].length;
  if (len < N) return null;

  const binHz = fs / N;
  const nBins = Math.min(N >> 1, Math.round(SPEC.MAX_DISPLAY_HZ / binHz));
  const nCols = Math.floor((len - N) / hop) + 1;
  const win = hann(N);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const db = new Float32Array(nCols * nBins);
  const colEndIdx = new Array<number>(nCols);
  const pow = new Float64Array(nBins);

  for (let c = 0; c < nCols; c++) {
    const start = c * hop;
    colEndIdx[c] = start + N - 1;
    pow.fill(0);

    for (const sig of signals) {
      for (let k = 0; k < N; k++) {
        re[k] = sig[start + k] * win[k];
        im[k] = 0;
      }
      fft(re, im);
      for (let b = 0; b < nBins; b++) {
        pow[b] += re[b] * re[b] + im[b] * im[b];
      }
    }

    const base = c * nBins;
    for (let b = 0; b < nBins; b++) {
      db[base + b] = 10 * Math.log10(pow[b] + 1e-12);
    }
  }

  // Per-frequency median baseline -> subtract so noise sits at 0 dB.
  const rel = new Float32Array(nCols * nBins);
  const col = new Float64Array(nCols);
  for (let b = 0; b < nBins; b++) {
    for (let c = 0; c < nCols; c++) col[c] = db[c * nBins + b];
    const sorted = Array.from(col).sort((p, q) => p - q);
    const mid = sorted.length >> 1;
    const median =
      sorted.length % 2
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
    for (let c = 0; c < nCols; c++) {
      rel[c * nBins + b] = db[c * nBins + b] - median;
    }
  }

  return { rel, nCols, nBins, colEndIdx, binHz, topHz: nBins * binHz };
}

// Polynomial approximation of matplotlib's "inferno" colormap
// (Matt Zucker, https://www.shadertoy.com/view/WlfXRN). Input t in [0,1],
// output [r,g,b] in 0..255.
export function inferno(t: number): [number, number, number] {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  const r =
    0.0002189 +
    x * (0.1065134 + x * (11.6024931 + x * (-41.7039961 + x * (77.1629357 + x * (-71.3194282 + x * 25.1311262)))));
  const g =
    0.001651 +
    x * (0.5639564 + x * (-3.9728540 + x * (17.4363989 + x * (-33.4023589 + x * (32.6260643 + x * -12.2426690)))));
  const b =
    -0.0194809 +
    x * (3.9327124 + x * (-15.9423941 + x * (44.3541452 + x * (-81.8073093 + x * (73.2095199 + x * -23.070325)))));
  const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 255 : Math.round(v * 255));
  return [clamp(r), clamp(g), clamp(b)];
}

// 256-entry inferno lookup table (r,g,b interleaved) for fast per-pixel mapping.
const INFERNO_LUT = (() => {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = inferno(i / 255);
    lut[i * 3] = r;
    lut[i * 3 + 1] = g;
    lut[i * 3 + 2] = b;
  }
  return lut;
})();

export function infernoLut(): Uint8ClampedArray {
  return INFERNO_LUT;
}
