import type { Box, Exposure } from "./metrics.js";

export type Verdict = "good" | "warn" | "bad";

export interface Check {
  id: string;
  label: string;
  verdict: Verdict;

  detail: string;

  advice?: string;

  advisory?: boolean;
}

export interface Facts {

  width: number;
  height: number;

  sharpness: number;
  exposure: Exposure;
  detail: Box;
}

export interface Assessment {
  checks: Check[];
  overall: Verdict;
  summary: string;
}

const SHARP_SOFT = 0.3;
const SHARP_BLURRY = 0.18;

const RES_SMALL = 1400;
const RES_TINY = 800;

const DARK = 55;
const VERY_DARK = 38;
const BRIGHT = 205;
const VERY_BRIGHT = 228;

const CLIP_WARN = 0.06;
const CLIP_BAD = 0.15;

const RANGE_FLAT = 70;

const FRAMING_TIGHT = 0.16;

const pct = (v: number): string => `${Math.round(v * 100)}%`;

type Body = { verdict: Verdict; detail: string; advice?: string; advisory?: true };

const named =
  (id: string, label: string) =>
  (body: Body): Check => ({ id, label, ...body });

const banded = (value: number, good: number, warn: number, bodies: [Body, Body, Body]): Body =>
  value >= good ? bodies[0] : value >= warn ? bodies[1] : bodies[2];

export const assess = (f: Facts): Assessment => {
  const size = `${f.width.toLocaleString()} × ${f.height.toLocaleString()} pixels`;
  const e = f.exposure;

  const checks: Check[] = [
    named("resolution", "Size")(
      banded(Math.max(f.width, f.height), RES_SMALL, RES_TINY, [
        { verdict: "good", detail: `${size} — plenty to work from.` },
        {
          verdict: "warn",
          detail: `${size} — on the small side.`,
          advice:
            "Usable, but if you have the original rather than a copy sent through a messaging app, send that instead. Apps shrink photos silently.",
        },
        {
          verdict: "bad",
          detail: `${size} — too small.`,
          advice:
            "This is about the size of a web thumbnail. Look for the original on your phone or camera; it will be several times bigger.",
        },
      ]),
    ),

    named("sharpness", "Focus")(
      banded(f.sharpness, SHARP_SOFT, SHARP_BLURRY, [
        { verdict: "good", detail: "Sharp where it matters." },
        {
          verdict: "warn",
          detail: "A little soft.",
          advice:
            "Workable, but a sharper one would give more to paint from — fur and eyes especially. Try a few shots in better light and pick the crispest.",
        },
        {
          verdict: "bad",
          detail: "Out of focus.",
          advice:
            "There is not enough detail here to paint from. Take another with the camera still and your pet still — tapping the screen on their face before you shoot helps.",
        },
      ]),
    ),

    named("exposure", "Lighting")(
      e.clippedLow >= CLIP_BAD
        ? {
            verdict: "bad",
            detail: `${pct(e.clippedLow)} of the photo is solid black with nothing in it.`,
            advice:
              "Shooting against a window does this. Turn so the light falls on your pet rather than behind them, or step outside on an overcast day — that is the kindest light there is.",
          }
        : e.clippedHigh >= CLIP_BAD
          ? {
              verdict: "bad",
              detail: `${pct(e.clippedHigh)} of the photo is blown out to pure white.`,
              advice: "Bright sun does this. Move into open shade and try again.",
            }
          : e.mean < VERY_DARK || e.mean > VERY_BRIGHT
            ? {
                verdict: "bad",
                detail: e.mean < VERY_DARK ? "Far too dark." : "Far too bright.",
                advice: "Try again in daylight, indoors near a window but not pointing at it.",
              }
            : e.mean < DARK ||
                e.mean > BRIGHT ||
                e.clippedLow >= CLIP_WARN ||
                e.clippedHigh >= CLIP_WARN
              ? {
                  verdict: "warn",
                  detail: e.mean < DARK ? "Rather dark." : "Rather bright.",
                  advice: "Usable, but more even light would show more of their coat.",
                }
              : { verdict: "good", detail: "Well lit, with detail at both ends." },
    ),

    named("contrast", "Contrast")(
      e.range >= RANGE_FLAT
        ? { verdict: "good", detail: "Good tonal range." }
        : {
            verdict: "warn",
            detail: "Flat and a bit grey.",
            advice:
              "Often a photo taken through glass, or a screenshot of a photo rather than the photo itself. The original file will have more in it.",
          },
    ),
  ];

  if (f.detail.coverage < FRAMING_TIGHT) {
    checks.push(
      named("framing", "Framing")({
        verdict: "warn",
        advisory: true,
        detail: `The detail sits in about ${pct(f.detail.coverage)} of the frame. Is your pet quite small in this one?`,
        advice:
          "If so, closer is better — head and shoulders filling most of the frame gives the most to work from. If they already fill it, ignore this.",
      }),
    );
  }

  const scored = checks.filter((c) => !c.advisory);
  const overall: Verdict = scored.some((c) => c.verdict === "bad")
    ? "bad"
    : scored.some((c) => c.verdict === "warn")
      ? "warn"
      : "good";

  return {
    checks,
    overall,
    summary:
      overall === "good"
        ? "This will work well."
        : overall === "warn"
          ? "This will work, with a caveat or two."
          : "This one will hold the portrait back.",
  };
};
