import { describe, expect, it } from "vitest";
import { gaussianBlur, sharpness, stdDev } from "../src/metrics.js";

/**
 * Agreement with the reference implementation the thresholds were set from.
 *
 * The sharpness thresholds in assess.ts come from measuring real photographs,
 * and that measuring was done in Python with numpy and PIL, because there is
 * no JPEG decoder in Node here. That calibration only transfers if this
 * implementation computes the same number as the one that produced it - so
 * this pins it against a value taken from that script.
 *
 * The input is integer-only by construction, so there is no floating point in
 * it and any disagreement is genuinely in the algorithm rather than in how two
 * languages happen to round a sine.
 *
 * Reference, from numpy float64:
 *   std_luma      73.7024674684
 *   std_highpass  34.5879232901
 *   sharpness      0.4692912528
 *
 * This runs on Float32Array, so agreement is expected to about six decimals
 * rather than exactly.
 */
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
