import { describe, expect, it } from "vitest";
import { REFUSE_ABOVE_PIXELS, decodeWidthFor } from "../src/decode.js";

const MAX = 40e6;

describe("decodeWidthFor", () => {
  it("asks for no reduction on anything a camera actually produces", () => {
    expect(decodeWidthFor({ width: 4000, height: 3000 })).toBeNull();
    expect(decodeWidthFor({ width: 8000, height: 5000 })).toBeNull();
  });

  it("asks for no reduction exactly at the ceiling", () => {
    expect(decodeWidthFor({ width: 8000, height: 5000 })).toBeNull();
    expect(decodeWidthFor({ width: MAX, height: 1 })).toBeNull();
  });

  it("brings an over-large image down to the ceiling, keeping its shape", () => {
    const natural = { width: 20000, height: 15000 };
    const width = decodeWidthFor(natural)!;
    expect(width).toBeGreaterThan(0);

    const height = Math.round((width * natural.height) / natural.width);
    expect(width * height).toBeLessThanOrEqual(MAX * 1.001);
    expect(width / height).toBeCloseTo(natural.width / natural.height, 2);
  });

  it("never asks for a zero-width decode, however extreme the shape", () => {
    expect(decodeWidthFor({ width: 1, height: 4e9 })).toBe(1);
  });

  it("refuses further up than it reduces, so the two guards cannot invert", () => {
    expect(REFUSE_ABOVE_PIXELS).toBeGreaterThan(MAX);
  });
});
