# withnate-pet-photo-check

Check whether the photo you are about to send for a custom pet portrait will actually work, before
you send it.

**Runs entirely in the browser. The photo never leaves your device** — which matters here more than
convenience, because these are pictures of people's pets in their homes.

MIT licensed.

## Why this exists

Every pet portrait artist writes the same paragraph — *well lit, in focus, close up, not a
screenshot* — and then hopes the customer can judge their own photo against it. They mostly cannot,
which is why the paragraph is on every one of those sites and why the first email back is so often
asking for a better picture.

Searching turns up no tool that does this. **The advice is everywhere and the instrument is
nowhere.**

## What it measures

| Check | Measured as |
|---|---|
| Size | Pixel dimensions from the file header |
| Focus | High-frequency energy normalised by contrast, best native-resolution tile |
| Lighting | Luma histogram: mean, and clipping at both ends |
| Contrast | Spread between the 1st and 99th percentile |
| Framing | Where the fine detail sits in the frame — **advisory only** |

## The sharpness measure, and why not Laplacian variance

`std(highpass) / std(luma)`, carried over from this project's own compositing pipeline. The
normalisation is the important half. **Raw Laplacian variance — the usual choice — rises with
contrast and with resolution**, so a punchy small photo outscores a soft large one and the number
means nothing across a mixed set of photographs. Dividing by the overall spread removes both, and
there is a test that pins exactly that: doubling an image's contrast leaves this measure unchanged
to four decimals while the un-normalised version moves by more than 1.8×.

It is taken from the **sharpest 256px tile at native resolution**, not the whole frame. Two reasons,
and both are the difference between a useful answer and a wrong one:

- Scaling an image down destroys the high-frequency detail being measured, so a blurry photo and a
  sharp one converge.
- **A shallow depth of field blurs the background on purpose.** A whole-frame average marks a good
  portrait down for the very thing that makes it good.

## The thresholds are measured, not chosen

Calibrated against 14 real photographs from this business, best native tile in each: the range was
**0.12 to 0.61**, median 0.29. The low end was a 236 × 354 web thumbnail, the high end a 4000 × 3000
photo straight off a phone, so the measure tracks real quality across the set.

The other end came from a blur sweep on that same 12 megapixel photograph — a genuine customer
submission, which is exactly the input this tool exists to judge:

| Blur | Score | |
|---|---|---|
| none | 0.61 | sharp |
| σ 0.5 | 0.49 | slightly soft |
| σ 0.8 | 0.31 | noticeably soft |
| σ 1.2 | 0.25 | clearly soft |
| σ 1.8 | 0.17 | blurry |
| σ 2.5 | 0.10 | very blurry |

So **soft sits at 0.30 and blurry at 0.18**. Against the real set that flags one photo of fourteen,
and it is the 236px thumbnail, which genuinely is too soft.

⚠️ **Fourteen photographs and one sweep is a small sample.** These are honest numbers rather than
confident ones, and they are set at the generous end on purpose: telling somebody their good photo is
bad costs more than missing a marginal one.

The calibration was done in Python with numpy and PIL, because there is no JPEG decoder in Node here.
That only transfers if this implementation computes the same number, so **there is a test pinning it
against the reference value** to five decimal places.

## Two checks that were built and then dropped

Recorded because the measurements are the reason, and without them somebody will add them back.

- **Saturation**, as a "this looks washed out" check. The real customer photograph measures **0.045
  mean saturation** — lower than any threshold worth setting — because it is a dark dog indoors,
  which is most of this business's subject matter. It would have failed the one genuine submission
  available to test against. Grey animals, black animals, snow and overcast light all live down
  there legitimately.
- **Bytes per pixel**, as an "over-compressed screenshot" check. Across the same set it ranged 0.087
  to 0.257 with no useful separation — the genuine 12 megapixel submission sits mid-range at 0.187,
  and an efficient encoder is indistinguishable from a destructive one. It also catches nothing the
  focus check does not, since heavy compression softens.

## Honest about the framing check

It assumes an animal carries more fine texture than what is behind it — fur against a lawn, a sofa, a
wall. **A busy carpet or a garden full of leaves defeats it completely.** So it is advisory, phrased
as a question, and deliberately excluded from the overall verdict. A confident wrong answer here is
worse than no answer.

For the same reason, a failing verdict says outright that you should send the photo anyway if it is
the only one you have. It is somebody's pet, and sometimes there is only the one picture.

## Where it belongs

**This is not a traffic driver and it is not really a tool — it is a qualifier.** It will get far
fewer visits than anything else in this set, and a far higher proportion of the people who use it are
about to order something. It belongs in the commission flow rather than in a list of utilities.

## Integration

Plain IIFE, does nothing unless the page contains `data-ppc`. Copy `dist/pet-photo-check.js` and
`dist/pet-photo-check.css` into the site's assets. The markup is not built by the script — the page
ships real HTML and this fills it in. `demo/index.html` is the working contract.

| Attribute | Required | What it is |
|---|---|---|
| `data-ppc` | yes | The root. Absent, the script does nothing. |
| `data-ppc-intake` | yes | Drop target, containing an `<input type="file">` which is found, not created. |
| `data-ppc-results` | yes | Where the verdict is written. |
| `data-ppc-error` | no | Refusals land here. Give it `role="status"`. |
| `data-ppc-busy` | no | Shown while decoding. Give it `hidden` and `role="status"`. |

The stylesheet defines only `.ppc-` classes, with a smoke check that fails the build if that stops
being true.

## Structured data

`demo/index.html` carries a static JSON-LD `WebApplication` block. Safe to carry into the site for
two reasons, both checked in the site's own tooling rather than assumed: `scripts/check.mjs` fails a
page with a second inline `<script>` but **explicitly exempts `type="application/ld+json"`**, and
`scripts/seo.mjs` requires structured data to parse and to carry an `@type`, so a malformed block
fails the build rather than sitting there doing nothing. It claims no rating and no review count.

## Security posture

No server, no upload, no storage, no network call — so the surface is the DOM and the decoder.

- **Everything is built with `createElement` and `textContent`.** No `innerHTML`, no
  `insertAdjacentHTML`, no interpolation into markup anywhere in `src/`. No string from the file
  reaches the page at all: the only things rendered are this module's own literals and formatted
  numbers.
- **The decode is sized from the header, before any decoding happens.** A very large image is now
  decoded straight to a reduced size rather than decoded at full size and then shrunk. The earlier
  order allocated the whole RGBA buffer *before* the guard could fire, which is the entire hazard —
  a 100 megapixel photograph is 400MB as RGBA and takes a phone down.
- **Absurd declared dimensions are refused outright**, above 500 megapixels: far past any camera,
  and well short of what a crafted header can claim. The refusal says what to do instead.
- Hostile-input parsing lives in the core, where the header bytes are read, and is covered by that
  package's own bounds and caps.

There is no byte-size cap on the intake, deliberately. Dimensions are the risk here rather than file
size, and the header gives those before a single pixel is decoded — a byte cap would refuse a
legitimate large photograph while a small crafted file sailed straight past it.

## Testing

```bash
npm run lint    # tsc --noEmit
npm test        # 48 tests
npm run smoke   # 20 checks against the built bundle
npm run demo    # serves demo/ on :4174
```

## Built on

[`@nasdigitaluk/withnate-tool-core`](https://github.com/N-Graves/withnate-tool-core).

The canvas code lives here rather than in the core on purpose. This is the first tool that needs
pixels at all, and the core grows by extraction when a *second* tool needs something — guessing the
shared surface from one caller is how the MCP servers in this project ended up with three drifting
copies of the same module.

## Licence

MIT.
