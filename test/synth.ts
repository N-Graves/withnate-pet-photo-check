import { gaussianBlur, type Size } from "../src/metrics.js";

export const rng = (seed: number): (() => number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xffffffff;
  };
};

export const size = (width: number, height: number): Size => ({ width, height });

export const noise = (s: Size, seed = 1, lo = 0, hi = 255): Float32Array => {
  const r = rng(seed);
  const out = new Float32Array(s.width * s.height);
  for (let i = 0; i < out.length; i += 1) out[i] = lo + r() * (hi - lo);
  return out;
};

export const flat = (s: Size, value: number): Float32Array =>
  new Float32Array(s.width * s.height).fill(value);

export const gradient = (s: Size): Float32Array => {
  const out = new Float32Array(s.width * s.height);
  for (let y = 0; y < s.height; y += 1) {
    for (let x = 0; x < s.width; x += 1) out[y * s.width + x] = (x / (s.width - 1)) * 255;
  }
  return out;
};

export const patch = (
  s: Size,
  box: { x: number; y: number; width: number; height: number },
  seed = 7,
): Float32Array => {
  const out = flat(s, 128);
  const r = rng(seed);
  for (let y = box.y; y < box.y + box.height; y += 1) {
    for (let x = box.x; x < box.x + box.width; x += 1) {
      out[y * s.width + x] = r() * 255;
    }
  }
  return out;
};

export const blur = (src: Float32Array, s: Size, sigma: number): Float32Array =>
  gaussianBlur(src, s, sigma);

export const scaleContrast = (src: Float32Array, factor: number, mid = 128): Float32Array => {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 1) out[i] = mid + (src[i]! - mid) * factor;
  return out;
};

export const toRgba = (luma: Float32Array): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(luma.length * 4);
  for (let i = 0; i < luma.length; i += 1) {
    const v = luma[i]!;
    out[i * 4] = v;
    out[i * 4 + 1] = v;
    out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
};

export const rgbaOf = (s: Size, r: number, g: number, b: number): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(s.width * s.height * 4);
  for (let i = 0; i < s.width * s.height; i += 1) {
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = 255;
  }
  return out;
};
