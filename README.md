# withnate-pet-photo-check

Check whether the photo you are about to send for a custom pet portrait will actually work, before
you send it.

**Runs entirely in the browser. The photo never leaves your device.**

MIT licensed. Status: **not built yet** — see the roadmap below.

## Why this exists

Every pet portrait artist writes the same paragraph — *well lit, in focus, close up, not a screenshot*
— and then hopes the customer can judge their own photo against it. They mostly cannot, which is why
the paragraph is on every one of those sites and why the first email back is so often asking for a
better picture.

Searching turns up no tool that does this. The advice is everywhere and the instrument is nowhere.

Every failure mode artists actually complain about is mechanically detectable:

| Complaint | Measured as |
|---|---|
| Blurry, soft, out of focus | high-frequency energy, normalised for contrast |
| Dimly lit, too dark | histogram distribution and clipping at both ends |
| Too far away, face too small | subject extent within the frame |
| Greyed out, washed out | saturation and dynamic range |
| Screenshot, sent over WhatsApp | pixel count against file size |

## Honest about what it is

This is **not a traffic driver**, and it is not really a tool. It is a qualifier, and it belongs in
the commission flow rather than in a list of utilities. It will get far fewer visits than anything
else in this set, and a far higher proportion of the people who use it are about to order something.

The sharpness measure is `std(highpass) / std(luma)` — contrast- and scale-normalised, which raw
Laplacian variance is not. It is carried over from this project's own compositing pipeline, where it
was measured across four approved pet references and sat in the range 0.68 to 1.00.

**Subject framing is a heuristic and will say so on screen.** Detecting where an animal is in a
photograph without a model is genuinely approximate, and a confident wrong answer here would be
worse than an honest hedge.

## Built on

[`@nasdigitaluk/withnate-tool-core`](https://github.com/N-Graves/withnate-tool-core).

## Licence

MIT.
