import { describe, expect, it } from "vitest";
import { assess, type Facts } from "../src/assess.js";

const good = (): Facts => ({
  width: 4000,
  height: 3000,
  sharpness: 0.61,
  exposure: { mean: 140, clippedLow: 0.001, clippedHigh: 0, range: 198 },
  detail: { x: 0, y: 0, width: 3000, height: 2400, coverage: 0.6 },
});

const verdictOf = (f: Facts, id: string): string =>
  assess(f).checks.find((c) => c.id === id)!.verdict;

describe("a good photo", () => {
  it("passes every check", () => {
    const a = assess(good());
    expect(a.overall).toBe("good");
    expect(a.checks.every((c) => c.verdict === "good")).toBe(true);
  });

  it("offers no advice when there is nothing to do", () => {
    expect(assess(good()).checks.some((c) => c.advice)).toBe(false);
  });
});

describe("sharpness, against the measured calibration", () => {
  it("passes the real customer photograph", () => {
    expect(verdictOf({ ...good(), sharpness: 0.61 }, "sharpness")).toBe("good");
  });

  it("passes that photo blurred at sigma 0.8, which measured 0.31", () => {

    expect(verdictOf({ ...good(), sharpness: 0.31 }, "sharpness")).toBe("good");
  });

  it("warns on sigma 1.2, which measured 0.25", () => {
    expect(verdictOf({ ...good(), sharpness: 0.25 }, "sharpness")).toBe("warn");
  });

  it("fails on sigma 1.8, which measured 0.17", () => {
    expect(verdictOf({ ...good(), sharpness: 0.17 }, "sharpness")).toBe("bad");
  });

  it("fails the 236px web thumbnail from the real set, which measured 0.12", () => {
    expect(verdictOf({ ...good(), sharpness: 0.1168 }, "sharpness")).toBe("bad");
  });

  it("passes every other photograph in the real set", () => {

    const measured = [0.202, 0.219, 0.2449, 0.2517, 0.2802, 0.2934, 0.3044, 0.3272, 0.338, 0.3411, 0.4293, 0.482, 0.6128];
    const bad = measured.filter((s) => verdictOf({ ...good(), sharpness: s }, "sharpness") === "bad");
    expect(bad).toEqual([]);
  });
});

describe("resolution", () => {
  it("accepts a phone photo", () => {
    expect(verdictOf(good(), "resolution")).toBe("good");
  });

  it("warns on something a messaging app has shrunk", () => {
    expect(verdictOf({ ...good(), width: 1200, height: 900 }, "resolution")).toBe("warn");
  });

  it("rejects a web thumbnail", () => {
    expect(verdictOf({ ...good(), width: 236, height: 354 }, "resolution")).toBe("bad");
  });

  it("judges on the long edge, so a tall crop is not punished", () => {
    expect(verdictOf({ ...good(), width: 900, height: 2600 }, "resolution")).toBe("good");
  });
});

describe("lighting", () => {
  const withExposure = (e: Partial<Facts["exposure"]>): Facts => ({
    ...good(),
    exposure: { ...good().exposure, ...e },
  });

  it("fails a photo crushed to a silhouette", () => {

    expect(verdictOf(withExposure({ clippedLow: 0.3, mean: 60 }), "exposure")).toBe("bad");
  });

  it("fails a photo blown out by sun", () => {
    expect(verdictOf(withExposure({ clippedHigh: 0.25, mean: 190 }), "exposure")).toBe("bad");
  });

  it("separates dark from crushed, because the advice differs", () => {

    expect(verdictOf(withExposure({ mean: 48, clippedLow: 0.005 }), "exposure")).toBe("warn");
    expect(verdictOf(withExposure({ mean: 48, clippedLow: 0.2 }), "exposure")).toBe("bad");
  });

  it("passes ordinary indoor light", () => {
    expect(verdictOf(withExposure({ mean: 95, range: 170 }), "exposure")).toBe("good");
  });
});

describe("contrast", () => {
  it("warns on a flat grey image", () => {
    expect(verdictOf({ ...good(), exposure: { ...good().exposure, range: 40 } }, "contrast")).toBe(
      "warn",
    );
  });
});

describe("framing", () => {
  it("says nothing when the subject fills the frame", () => {
    expect(assess(good()).checks.some((c) => c.id === "framing")).toBe(false);
  });

  it("asks a question, and does not drag the overall verdict down", () => {

    const tight = { ...good(), detail: { x: 0, y: 0, width: 400, height: 300, coverage: 0.1 } };
    const a = assess(tight);
    const framing = a.checks.find((c) => c.id === "framing")!;
    expect(framing.advisory).toBe(true);
    expect(framing.detail).toContain("?");
    expect(a.overall).toBe("good");
  });
});

describe("the overall verdict", () => {
  it("takes the worst of the real checks", () => {
    expect(assess({ ...good(), sharpness: 0.25 }).overall).toBe("warn");
    expect(assess({ ...good(), sharpness: 0.1 }).overall).toBe("bad");
  });

  it("is bad if anything is bad, however good the rest is", () => {
    expect(assess({ ...good(), width: 300, height: 200 }).overall).toBe("bad");
  });

  it("always says something in plain words", () => {
    for (const f of [good(), { ...good(), sharpness: 0.25 }, { ...good(), sharpness: 0.1 }]) {
      expect(assess(f).summary.length).toBeGreaterThan(10);
    }
  });
});
