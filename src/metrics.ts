/**
 * Image measurements, as pure functions over pixel buffers.
 *
 * No canvas, no DOM, no browser. Everything takes a typed array and returns a
 * number, which is what makes the part with the judgement in it testable in
 * Node - and testable against synthesised inputs where the right answer is
 * known by construction, rather than against photographs where it is a matter
 * of opinion.
 */

export interface Size {
  width: number;
  height: number;
}

/**
 * ITU-R BT.601 luma.
 *
 * The same weights the image pipeline elsewhere in this project uses, and for
 * the same reason: pure green and pure blue have identical mean RGB and wildly
 * different apparent brightness, so a plain average of the channels is not a
 * measure of how light something looks.
 */
export const toLuma = (rgba: Uint8ClampedArray, size: Size): Float32Array => {
  const out = new Float32Array(size.width * size.height);
  for (let i = 0, p = 0; i < out.length; i += 1, p += 4) {
    out[i] = 0.299 * rgba[p]! + 0.587 * rgba[p + 1]! + 0.114 * rgba[p + 2]!;
  }
  return out;
};

export const mean = (a: Float32Array): number => {
  if (a.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i]!;
  return sum / a.length;
};

export const stdDev = (a: Float32Array): number => {
  if (a.length === 0) return 0;
  const m = mean(a);
  let acc = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i]! - m;
    acc += d * d;
  }
  return Math.sqrt(acc / a.length);
};

/** Separable Gaussian, clamped at the edges. */
export const gaussianBlur = (src: Float32Array, size: Size, sigma: number): Float32Array => {
  const { width: w, height: h } = size;
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(radius * 2 + 1);
  let norm = 0;
  for (let i = -radius; i <= radius; i += 1) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = v;
    norm += v;
  }
  for (let i = 0; i < kernel.length; i += 1) kernel[i] = kernel[i]! / norm;

  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let acc = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const xx = Math.min(w - 1, Math.max(0, x + k));
        acc += src[y * w + xx]! * kernel[k + radius]!;
      }
      tmp[y * w + x] = acc;
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let acc = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const yy = Math.min(h - 1, Math.max(0, y + k));
        acc += tmp[yy * w + x]! * kernel[k + radius]!;
      }
      out[y * w + x] = acc;
    }
  }
  return out;
};

/**
 * Sharpness as high-frequency energy normalised by overall contrast.
 *
 * Carried over from this project's own compositing pipeline, where it is used
 * to match a subject's micro-contrast to the scene it is being placed into.
 * The normalisation is the important half: raw Laplacian variance, the usual
 * choice, rises with contrast and with resolution, so a punchy small image
 * outscores a soft large one and the number means nothing across a mixed set
 * of photographs. Dividing by the overall spread removes both.
 *
 * Returns 0 for a flat image, where there is no contrast to normalise by and
 * the ratio is undefined rather than infinite.
 */
export const sharpness = (luma: Float32Array, size: Size, sigma = 1.4): number => {
  const spread = stdDev(luma);
  if (spread < 1e-6) return 0;
  const blurred = gaussianBlur(luma, size, sigma);
  const high = new Float32Array(luma.length);
  for (let i = 0; i < luma.length; i += 1) high[i] = luma[i]! - blurred[i]!;
  return stdDev(high) / spread;
};

// -------------------------------------------------------------- exposure

export interface Exposure {
  /** Mean luma, 0-255. */
  mean: number;
  /** Fraction of pixels crushed to black. */
  clippedLow: number;
  /** Fraction of pixels blown to white. */
  clippedHigh: number;
  /** Spread between the 1st and 99th percentile, 0-255. */
  range: number;
}

const CLIP_LOW = 2;
const CLIP_HIGH = 253;

export const exposure = (luma: Float32Array): Exposure => {
  const hist = new Uint32Array(256);
  for (let i = 0; i < luma.length; i += 1) {
    // Clamped into 0-255 first, so the index is always in range and the
    // read-back is safe. Blur and contrast scaling can both push a value
    // outside 0-255, and an unclamped index here would silently drop it.
    const bin = Math.min(255, Math.max(0, Math.round(luma[i]!)));
    hist[bin] = hist[bin]! + 1;
  }
  const total = luma.length || 1;

  let low = 0;
  for (let v = 0; v <= CLIP_LOW; v += 1) low += hist[v]!;
  let high = 0;
  for (let v = CLIP_HIGH; v <= 255; v += 1) high += hist[v]!;

  const percentile = (p: number): number => {
    const target = total * p;
    let seen = 0;
    for (let v = 0; v < 256; v += 1) {
      seen += hist[v]!;
      if (seen >= target) return v;
    }
    return 255;
  };

  return {
    mean: mean(luma),
    clippedLow: low / total,
    clippedHigh: high / total,
    range: percentile(0.99) - percentile(0.01),
  };
};

/**
 * Mean HSV saturation, 0-1. Catches the washed-out, greyed-over look that
 * comes off a screenshot or a photo taken through a window.
 */
export const saturation = (rgba: Uint8ClampedArray): number => {
  let acc = 0;
  let n = 0;
  for (let p = 0; p < rgba.length; p += 4) {
    const r = rgba[p]!;
    const g = rgba[p + 1]!;
    const b = rgba[p + 2]!;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    acc += max === 0 ? 0 : (max - min) / max;
    n += 1;
  }
  return n === 0 ? 0 : acc / n;
};

// ------------------------------------------------------------- detail box

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Share of the frame this box covers, 0-1. */
  coverage: number;
}

/** Smallest contiguous span of `energy` holding at least `fraction` of the total. */
const minimalSpan = (energy: Float32Array, fraction: number): [number, number] => {
  let total = 0;
  for (let i = 0; i < energy.length; i += 1) total += energy[i]!;
  if (total <= 0) return [0, energy.length - 1];
  const target = total * fraction;

  let best: [number, number] = [0, energy.length - 1];
  let bestLen = energy.length;
  let sum = 0;
  let lo = 0;
  for (let hi = 0; hi < energy.length; hi += 1) {
    sum += energy[hi]!;
    while (sum - energy[lo]! >= target) {
      sum -= energy[lo]!;
      lo += 1;
    }
    if (sum >= target && hi - lo + 1 < bestLen) {
      bestLen = hi - lo + 1;
      best = [lo, hi];
    }
  }
  return best;
};

/**
 * Where the detail in the frame is, as a bounding box.
 *
 * A heuristic and nothing more. It works on the assumption that an animal has
 * more fine texture than what is behind it - fur against a lawn, a sofa, a
 * wall - which is usually but not always true. A busy carpet or a garden full
 * of leaves defeats it completely.
 *
 * That is why the caller only ever reports this as a question rather than a
 * verdict. Telling somebody their pet is too small in a photograph where it
 * is not would be worse than not asking.
 */
export const detailBox = (luma: Float32Array, size: Size, fraction = 0.75): Box => {
  const { width: w, height: h } = size;
  const rows = new Float32Array(h);
  const cols = new Float32Array(w);

  // Central differences. Sobel would be smoother and makes no difference to a
  // measurement this coarse.
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const gx = luma[y * w + x + 1]! - luma[y * w + x - 1]!;
      const gy = luma[(y + 1) * w + x]! - luma[(y - 1) * w + x]!;
      const m = Math.abs(gx) + Math.abs(gy);
      rows[y] = rows[y]! + m;
      cols[x] = cols[x]! + m;
    }
  }

  const [y0, y1] = minimalSpan(rows, fraction);
  const [x0, x1] = minimalSpan(cols, fraction);
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  return { x: x0, y: y0, width, height, coverage: (width * height) / (w * h) };
};
