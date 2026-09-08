/**
 * The canvas adapter: a File in, a set of measurements out.
 *
 * This is the only part that touches the browser. Everything with a judgement
 * in it lives in metrics.ts and assess.ts as pure functions, which is why the
 * thresholds could be calibrated against real photographs in a completely
 * different language and still transfer.
 *
 * Deliberately kept in this repo rather than pushed into the shared core. This
 * is the first tool that needs pixels at all; the core grows by extraction
 * when a SECOND tool needs something, and the watermarker will be that second
 * tool. Guessing the shared surface from one caller is how the nine MCP
 * servers in this project ended up with three drifting copies of the same
 * module.
 */

import {
  detailBox,
  exposure,
  sharpness,
  toLuma,
  type Box,
  type Exposure,
  type Size,
} from "./metrics.js";

/**
 * Tile geometry, and it MUST match the calibration script that set the
 * thresholds: a 4x4 grid of 256px tiles, sampled at native resolution, best
 * score wins. Changing either number silently invalidates every threshold in
 * assess.ts.
 */
const TILE = 256;
const GRID = 4;

/**
 * Above this, decode at a reduced size. A 100 megapixel image is 400MB as
 * RGBA and will fail on a phone; 40 is roughly 160MB, which is survivable.
 * Anything this large is far past the point where resolution is in question.
 */
const MAX_DECODE_PIXELS = 40e6;

/** Whole-frame statistics are measured here. Exposure and layout do not need detail. */
const STATS_LONG_EDGE = 512;

export interface Measured {
  /**
   * The size actually analysed, which is REDUCED for a very large image.
   * Never use this for the resolution check - that has to come from the file
   * header, or a 100 megapixel photo would be judged on the size we chose to
   * decode it at rather than the size it is.
   */
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

/**
 * Sharpness from the sharpest tile, at native resolution.
 *
 * Two reasons it works this way rather than measuring the whole frame. Scaling
 * the image down destroys exactly the high-frequency detail being measured, so
 * a blurry photo and a sharp one converge; and a shallow depth of field blurs
 * the background ON PURPOSE, so a whole-frame average marks a good portrait
 * down for the thing that makes it good. Taking the best tile answers the
 * question actually being asked - is anything in this photograph sharp.
 */
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
      // 1:1 - source rectangle and destination rectangle are the same size,
      // so no resampling happens and the detail survives.
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

export const measureFile = async (file: File): Promise<Measured> => {
  let bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > MAX_DECODE_PIXELS) {
    const scale = Math.sqrt(MAX_DECODE_PIXELS / (bitmap.width * bitmap.height));
    const reduced = await createImageBitmap(file, {
      resizeWidth: Math.round(bitmap.width * scale),
      resizeQuality: "high",
    });
    bitmap.close();
    bitmap = reduced;
  }
  try {
    return {
      decodedWidth: bitmap.width,
      decodedHeight: bitmap.height,
      sharpness: bestTileSharpness(bitmap),
      ...wholeFrameStats(bitmap),
    };
  } finally {
    // Without this the decoded bitmap stays alive until the collector gets to
    // it, and a few large photos in a row is hundreds of megabytes.
    bitmap.close();
  }
};
