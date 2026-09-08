

import {
  detailBox,
  exposure,
  sharpness,
  toLuma,
  type Box,
  type Exposure,
  type Size,
} from "./metrics.js";


const TILE = 256;
const GRID = 4;


const MAX_DECODE_PIXELS = 40e6;

export const REFUSE_ABOVE_PIXELS = 500e6;


const STATS_LONG_EDGE = 512;

export interface Measured {
  
  decodedWidth: number;
  decodedHeight: number;
  sharpness: number;
  exposure: Exposure;
  detail: Box;
}

const context = (w: number, h: number): CanvasRenderingContext2D => {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("this browser would not give us a 2d canvas");
  return ctx;
};


const bestTileSharpness = (bitmap: ImageBitmap): number => {
  const { width: w, height: h } = bitmap;

  if (w <= TILE || h <= TILE) {
    const ctx = context(w, h);
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, w, h);
    const size: Size = { width: w, height: h };
    return sharpness(toLuma(data.data, size), size);
  }

  const ctx = context(TILE, TILE);
  const size: Size = { width: TILE, height: TILE };
  let best = 0;
  for (let gy = 0; gy < GRID; gy += 1) {
    for (let gx = 0; gx < GRID; gx += 1) {
      const sx = Math.round(((w - TILE) * gx) / (GRID - 1));
      const sy = Math.round(((h - TILE) * gy) / (GRID - 1));
      
      
      ctx.drawImage(bitmap, sx, sy, TILE, TILE, 0, 0, TILE, TILE);
      const data = ctx.getImageData(0, 0, TILE, TILE);
      const score = sharpness(toLuma(data.data, size), size);
      if (score > best) best = score;
    }
  }
  return best;
};

const wholeFrameStats = (bitmap: ImageBitmap): { exposure: Exposure; detail: Box } => {
  const scale = Math.min(1, STATS_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = context(w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const size: Size = { width: w, height: h };
  const luma = toLuma(data.data, size);
  return { exposure: exposure(luma), detail: detailBox(luma, size) };
};

export const decodeWidthFor = (natural: Size): number | null => {
  const pixels = natural.width * natural.height;
  if (!(pixels > MAX_DECODE_PIXELS)) return null;
  return Math.max(1, Math.round(natural.width * Math.sqrt(MAX_DECODE_PIXELS / pixels)));
};

export const measureFile = async (file: File, natural?: Size): Promise<Measured> => {
  const resizeWidth = natural ? decodeWidthFor(natural) : null;
  const bitmap =
    resizeWidth === null
      ? await createImageBitmap(file)
      : await createImageBitmap(file, { resizeWidth, resizeQuality: "high" });
  try {
    return {
      decodedWidth: bitmap.width,
      decodedHeight: bitmap.height,
      sharpness: bestTileSharpness(bitmap),
      ...wholeFrameStats(bitmap),
    };
  } finally {
    
    
    bitmap.close();
  }
};
