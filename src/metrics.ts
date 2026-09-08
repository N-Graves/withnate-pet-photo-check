

export interface Size {
  width: number;
  height: number;
}


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


export const sharpness = (luma: Float32Array, size: Size, sigma = 1.4): number => {
  const spread = stdDev(luma);
  if (spread < 1e-6) return 0;
  const blurred = gaussianBlur(luma, size, sigma);
  const high = new Float32Array(luma.length);
  for (let i = 0; i < luma.length; i += 1) high[i] = luma[i]! - blurred[i]!;
  return stdDev(high) / spread;
};



export interface Exposure {
  
  mean: number;
  
  clippedLow: number;
  
  clippedHigh: number;
  
  range: number;
}

const CLIP_LOW = 2;
const CLIP_HIGH = 253;

export const exposure = (luma: Float32Array): Exposure => {
  const hist = new Uint32Array(256);
  for (let i = 0; i < luma.length; i += 1) {
    
    
    
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



export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  
  coverage: number;
}


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


export const detailBox = (luma: Float32Array, size: Size, fraction = 0.75): Box => {
  const { width: w, height: h } = size;
  const rows = new Float32Array(h);
  const cols = new Float32Array(w);

  
  
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
