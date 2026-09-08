/**
 * Pet photo check - entry point.
 *
 * Loaded on one page, does nothing on every other. The markup is not built
 * here; the page ships real HTML and this fills it in, because content must
 * never need JavaScript to become visible.
 *
 * Nothing is uploaded, nothing is stored, and no request leaves the page. The
 * photograph is decoded in the tab, measured, and dropped.
 */

import {
  attachIntake,
  measureImage,
  mount,
  readHeaderBytes,
} from "@nasdigitaluk/withnate-tool-core";
import { assess } from "./assess.js";
import { measureFile } from "./decode.js";
import { renderAssessment } from "./render.js";

mount("[data-ppc]", ({ root }) => {
  const intake = root.querySelector<HTMLElement>("[data-ppc-intake]");
  const results = root.querySelector<HTMLElement>("[data-ppc-results]");
  const errorOut = root.querySelector<HTMLElement>("[data-ppc-error]");
  const busy = root.querySelector<HTMLElement>("[data-ppc-busy]");
  if (!intake || !results) return;

  const setBusy = (on: boolean): void => {
    if (busy) busy.hidden = !on;
  };
  const showError = (message: string): void => {
    if (errorOut) errorOut.textContent = message;
    results.replaceChildren();
    setBusy(false);
  };

  attachIntake(intake, {
    onReject: showError,
    onFile: (file) => {
      if (errorOut) errorOut.textContent = "";
      results.replaceChildren();
      setBusy(true);

      void (async () => {
        // True dimensions come from the header, never from the decode - a very
        // large photo is decoded at a reduced size and judging its resolution
        // on that would report the size we chose rather than the size it is.
        const header = measureImage(await readHeaderBytes(file));
        if (!header) {
          showError(
            "That file could not be read as a PNG, JPEG, GIF or WebP. If it came off an iPhone it may be a HEIC — export it as JPEG and try again.",
          );
          return;
        }

        const m = await measureFile(file);
        results.replaceChildren(
          renderAssessment(
            assess({
              width: header.width,
              height: header.height,
              sharpness: m.sharpness,
              exposure: m.exposure,
              detail: m.detail,
            }),
          ),
        );
        setBusy(false);
      })().catch(() => {
        // Decoding is where this realistically fails: a corrupt file, a format
        // the browser will not take, or an image too large for the device.
        // Silence here is indistinguishable from a broken tool.
        showError(
          "That photo could not be opened. It may be damaged, or too large for this device — try a different one.",
        );
      });
    },
  });
});
