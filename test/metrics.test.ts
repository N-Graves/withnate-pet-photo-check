import { describe, expect, it } from "vitest";
import {
  detailBox,
  exposure,
  gaussianBlur,
  mean,
  saturation,
  sharpness,
  stdDev,
  toLuma,
} from "../src/metrics.js";
import { blur, flat, gradient, noise, patch, rgbaOf, scaleContrast, size, toRgba } from "./synth.js";

const S = size(96, 96);

describe("toLuma", () => {
  it("uses BT.601 weights rather than a channel average", () => {

    const green = toLuma(rgbaOf(size(1, 1), 0, 255, 0), size(1, 1));
    const blue = toLuma(rgbaOf(size(1, 1), 0, 0, 255), size(1, 1));
    expect(green[0]).toBeCloseTo(149.685, 2);
    expect(blue[0]).toBeCloseTo(29.07, 2);
    expect(green[0]).toBeGreaterThan(blue[0]! * 4);
  });
});

describe("gaussianBlur", () => {
  it("preserves the overall brightness", () => {
    const src = noise(S, 3);
    expect(mean(blur(src, S, 2))).toBeCloseTo(mean(src), 0);
  });

  it("reduces spread, and more so at a larger radius", () => {
    const src = noise(S, 4);
    const a = stdDev(blur(src, S, 1));
    const b = stdDev(blur(src, S, 3));
    expect(a).toBeLessThan(stdDev(src));
    expect(b).toBeLessThan(a);
  });

  it("leaves a flat field flat", () => {
    const out = blur(flat(S, 77), S, 2);
    expect(stdDev(out)).toBeLessThan(1e-3);
    expect(mean(out)).toBeCloseTo(77, 3);
  });
});

describe("sharpness", () => {
  it("falls monotonically as the image is blurred", () => {

    const src = noise(S, 5);
    const scores = [0, 0.8, 1.5, 2.5, 4].map((sigma) =>
      sigma === 0 ? sharpness(src, S) : sharpness(blur(src, S, sigma), S),
    );
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]!).toBeLessThan(scores[i - 1]!);
    }
  });

  it("is unchanged by contrast, which is the reason for the normalisation", () => {

    const src = noise(S, 6, 80, 176);
    const punchy = scaleContrast(src, 2);
    expect(sharpness(punchy, S)).toBeCloseTo(sharpness(src, S), 4);

    const highpassSpread = (a: Float32Array): number => {
      const b = gaussianBlur(a, S, 1.4);
      const h = new Float32Array(a.length);
      for (let i = 0; i < a.length; i += 1) h[i] = a[i]! - b[i]!;
      return stdDev(h);
    };
    expect(highpassSpread(punchy)).toBeGreaterThan(highpassSpread(src) * 1.8);
  });

  it("scores a smooth gradient far below noise, despite similar contrast", () => {

    const g = gradient(S);
    const n = noise(S, 8);
    expect(stdDev(g)).toBeGreaterThan(50);
    expect(sharpness(g, S)).toBeLessThan(sharpness(n, S) / 10);
  });

  it("returns zero for a flat image rather than dividing by zero", () => {
    expect(sharpness(flat(S, 128), S)).toBe(0);
  });
});

describe("exposure", () => {
  it("finds pixels crushed to black and blown to white", () => {
    const half = new Float32Array(S.width * S.height);
    half.fill(0, 0, half.length / 2);
    half.fill(255, half.length / 2);
    const e = exposure(half);
    expect(e.clippedLow).toBeCloseTo(0.5, 2);
    expect(e.clippedHigh).toBeCloseTo(0.5, 2);
  });

  it("reports a narrow range for a low-contrast image", () => {
    const e = exposure(noise(S, 9, 120, 136));
    expect(e.range).toBeLessThan(24);
    expect(e.mean).toBeGreaterThan(120);
    expect(e.mean).toBeLessThan(136);
  });

  it("reports a wide range for a full-tonal image", () => {
    expect(exposure(gradient(S)).range).toBeGreaterThan(200);
  });

  it("does not call an ordinary dark image clipped", () => {

    const e = exposure(noise(S, 10, 20, 90));
    expect(e.mean).toBeLessThan(90);
    expect(e.clippedLow).toBeLessThan(0.01);
  });
});

describe("saturation", () => {
  it("is zero for grey and one for a pure hue", () => {
    expect(saturation(rgbaOf(S, 128, 128, 128))).toBeCloseTo(0, 6);
    expect(saturation(rgbaOf(S, 255, 0, 0))).toBeCloseTo(1, 6);
  });

  it("is zero for a greyscale image however contrasty", () => {
    expect(saturation(toRgba(noise(S, 11)))).toBeCloseTo(0, 6);
  });

  it("sits in between for a muted colour", () => {
    const s = saturation(rgbaOf(S, 200, 170, 160));
    expect(s).toBeGreaterThan(0.1);
    expect(s).toBeLessThan(0.3);
  });
});

describe("detailBox", () => {
  it("finds a textured patch on a flat field", () => {
    const box = { x: 30, y: 20, width: 24, height: 30 };
    const b = detailBox(patch(S, box), S, 0.9);

    expect(b.x).toBeGreaterThanOrEqual(box.x - 2);
    expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width + 2);
    expect(b.y).toBeGreaterThanOrEqual(box.y - 2);
    expect(b.y + b.height).toBeLessThanOrEqual(box.y + box.height + 2);
  });

  it("reports low coverage for a small subject and high for a full frame", () => {
    const small = detailBox(patch(S, { x: 40, y: 40, width: 16, height: 16 }), S, 0.9);
    const full = detailBox(noise(S, 12), S, 0.9);
    expect(small.coverage).toBeLessThan(0.15);
    expect(full.coverage).toBeGreaterThan(0.7);
  });

  it("falls back to the whole frame when there is no detail anywhere", () => {
    const b = detailBox(flat(S, 128), S);
    expect(b.coverage).toBeCloseTo(1, 2);
  });
});
