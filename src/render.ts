import { h } from "@nasdigitaluk/withnate-tool-core";
import type { Assessment, Check, Verdict } from "./assess.js";

const VERDICT_WORD: Record<Verdict, string> = {
  good: "Good",
  warn: "Worth a look",
  bad: "Needs another go",
};

const VERDICT_CLASS: Record<Verdict, string> = {
  good: "fam fam-4",
  warn: "fam fam-2",
  bad: "fam fam-3",
};

const checkRow = (c: Check): HTMLElement =>
  h(
    "div",
    { class: `ppc-check ppc-${c.verdict}${c.advisory ? " ppc-advisory" : ""}` },
    h(
      "div",
      { class: "ppc-check-head" },
      h("span", { class: "ppc-check-label" }, c.label),

      h("span", { class: VERDICT_CLASS[c.verdict] }, c.advisory ? "Have a think" : VERDICT_WORD[c.verdict]),
    ),
    h("p", { class: "ppc-check-detail" }, c.detail),
    c.advice ? h("p", { class: "ppc-advice" }, c.advice) : null,
  );

export const renderAssessment = (a: Assessment): HTMLElement =>
  h(
    "div",
    { class: "ppc-results-inner" },
    h(
      "div",
      { class: `ppc-verdict ppc-${a.overall} glass` },
      h("p", { class: "eyebrow" }, "Verdict"),
      h("h2", {}, a.summary),
      a.overall === "bad"
        ? h(
            "p",
            { class: "ppc-note" },
            "Send it anyway if it is the only one you have — it is your pet and sometimes there is only the one photo. This is a guide, not a rule.",
          )
        : null,
    ),
    h("div", { class: "ppc-checks" }, ...a.checks.map(checkRow)),
    h(
      "p",
      { class: "ppc-note ppc-footnote" },
      "Measured on your own device. Nothing was uploaded and nothing was kept.",
    ),
  );
