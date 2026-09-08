import {
  attachIntake,
  measureImage,
  mount,
  readHeaderBytes,
} from "@nasdigitaluk/withnate-tool-core";
import { assess } from "./assess.js";
import { REFUSE_ABOVE_PIXELS, measureFile } from "./decode.js";
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

        const header = measureImage(await readHeaderBytes(file));
        if (!header) {
          showError(
            "That file could not be read as a PNG, JPEG, GIF or WebP. If it came off an iPhone it may be a HEIC — export it as JPEG and try again.",
          );
          return;
        }

        if (header.width * header.height > REFUSE_ABOVE_PIXELS) {
          showError(
            "That image declares far more pixels than any camera produces, and opening it would be enough to bring the tab down. If it is a real photograph, save a copy at a normal size and try that.",
          );
          return;
        }

        const m = await measureFile(file, { width: header.width, height: header.height });
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

        showError(
          "That photo could not be opened. It may be damaged, or too large for this device — try a different one.",
        );
      });
    },
  });
});
