import { describe, expect, it } from "vitest";
import { gaussianBlur, sharpness, stdDev } from "../src/metrics.js";

describe("agreement with the calibration reference", () => {
  const W = 128;
  const H = 128;
  const size = { width: W, height: H };
  const luma = new Float32Array(W * H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) luma[y * W + x] = (x * 7 + y * 13) % 256;
  }

  it("matches the reference standard deviation of the source", () => {
    expect(stdDev(luma)).toBeCloseTo(73.7024674684, 4);
  });

  it("matches the reference standard deviation of the high-pass", () => {
    const blurred = gaussianBlur(luma, size, 1.4);
    const hp = new Float32Array(luma.length);
    for (let i = 0; i < luma.length; i += 1) hp[i] = luma[i]! - blurred[i]!;
    expect(stdDev(hp)).toBeCloseTo(34.5879232901, 4);
  });

  it("matches the reference sharpness, which is what the thresholds are in terms of", () => {
    expect(sharpness(luma, size)).toBeCloseTo(0.4692912528, 5);
  });
});
