/*! withnate-pet-photo-check v0.1.0 - MIT
 * https://github.com/N-Graves/withnate-pet-photo-check#readme
 * Runs entirely in the browser. No network requests, no storage.
 */
"use strict";
(() => {
  // node_modules/@nasdigitaluk/withnate-tool-core/dist/bytes.js
  var u8 = (b, i) => {
    const v = b[i];
    if (v === void 0)
      throw new RangeError(`byte ${i} is past the end of the buffer`);
    return v;
  };
  var be16 = (b, i) => u8(b, i) << 8 | u8(b, i + 1);
  var le16 = (b, i) => u8(b, i) | u8(b, i + 1) << 8;
  var le24 = (b, i) => u8(b, i) | u8(b, i + 1) << 8 | u8(b, i + 2) << 16;
  var be32 = (b, i) => (u8(b, i) << 24 | u8(b, i + 1) << 16 | u8(b, i + 2) << 8 | u8(b, i + 3)) >>> 0;
  var le32 = (b, i) => (u8(b, i) | u8(b, i + 1) << 8 | u8(b, i + 2) << 16 | u8(b, i + 3) << 24) >>> 0;
  var matchBytes = (b, sig, offset = 0) => {
    if (b.length < offset + sig.length)
      return false;
    for (let i = 0; i < sig.length; i += 1) {
      if (b[offset + i] !== sig[i])
        return false;
    }
    return true;
  };
  var matchAscii = (b, offset, s) => {
    if (b.length < offset + s.length)
      return false;
    for (let i = 0; i < s.length; i += 1) {
      if (b[offset + i] !== s.charCodeAt(i))
        return false;
    }
    return true;
  };

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/sniff.js
  var PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  var JPEG_SIG = [255, 216, 255];
  var GIF87_SIG = [71, 73, 70, 56, 55, 97];
  var GIF89_SIG = [71, 73, 70, 56, 57, 97];
  var RIFF_SIG = [82, 73, 70, 70];
  var WEBP_SIG = [87, 69, 66, 80];
  var HEADER_BYTES = 64 * 1024;
  var sniffFormat = (bytes) => {
    if (matchBytes(bytes, PNG_SIG))
      return "png";
    if (matchBytes(bytes, JPEG_SIG))
      return "jpeg";
    if (matchBytes(bytes, GIF87_SIG) || matchBytes(bytes, GIF89_SIG))
      return "gif";
    if (matchBytes(bytes, RIFF_SIG) && matchBytes(bytes, WEBP_SIG, 8))
      return "webp";
    return null;
  };

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/units.js
  var MM_PER_INCH = 25.4;
  var CM_PER_INCH = MM_PER_INCH / 10;
  var MM_PER_METRE = 1e3;

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/exif.js
  var TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];
  var MAX_ENTRIES = 4096;
  var MAX_COMPONENTS = 1024;
  var MAX_BLOCK_BYTES = 4 * 1024 * 1024;
  var key = (ifd, tag) => `${ifd}:${tag}`;
  var findTiffBlock = (bytes) => {
    const format = sniffFormat(bytes);
    if (format === "jpeg") {
      let p = 2;
      while (p + 4 <= bytes.length) {
        if (u8(bytes, p) !== 255) {
          p += 1;
          continue;
        }
        const marker = u8(bytes, p + 1);
        if (marker === 216 || marker >= 208 && marker <= 217 || marker === 1) {
          p += 2;
          continue;
        }
        const len = u8(bytes, p + 2) << 8 | u8(bytes, p + 3);
        if (len < 2)
          return null;
        if (marker === 225 && matchAscii(bytes, p + 4, "Exif\0\0")) {
          return bytes.subarray(p + 10, p + 2 + len);
        }
        if (marker === 218)
          return null;
        p = p + 2 + len;
      }
      return null;
    }
    if (format === "png") {
      let p = 8;
      while (p + 8 <= bytes.length) {
        const len = be32(bytes, p);
        if (matchAscii(bytes, p + 4, "eXIf"))
          return bytes.subarray(p + 8, p + 8 + len);
        if (matchAscii(bytes, p + 4, "IDAT") || matchAscii(bytes, p + 4, "IEND"))
          return null;
        p += 12 + len;
      }
      return null;
    }
    if (format === "webp") {
      let p = 12;
      while (p + 8 <= bytes.length) {
        const len = le32(bytes, p + 4);
        if (matchAscii(bytes, p, "EXIF")) {
          const start = matchAscii(bytes, p + 8, "Exif\0\0") ? p + 14 : p + 8;
          return bytes.subarray(start, p + 8 + len);
        }
        p += 8 + len + len % 2;
      }
      return null;
    }
    return null;
  };
  var reader = (b, little) => ({
    u16: (i) => little ? u8(b, i) | u8(b, i + 1) << 8 : u8(b, i) << 8 | u8(b, i + 1),
    u32: (i) => little ? le32(b, i) : be32(b, i),
    i32: (i) => (little ? le32(b, i) : be32(b, i)) | 0,
    byte: (i) => u8(b, i)
  });
  var TEXT = new TextDecoder("utf-8", { fatal: false });
  var decodeAscii = (block, offset, count) => {
    let end = offset;
    const limit = offset + count;
    while (end < limit && block[end] !== 0)
      end += 1;
    return TEXT.decode(block.subarray(offset, end)).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  };
  var readValue = (r, block, type, count, offset) => {
    if (type === 2)
      return decodeAscii(block, offset, count);
    const size = TYPE_SIZE[type];
    const one = (i) => {
      const at = offset + i * size;
      switch (type) {
        case 1:
        case 7:
          return r.byte(at);
        case 3:
          return r.u16(at);
        case 4:
          return r.u32(at);
        case 9:
          return r.i32(at);
        case 5:
          return { numerator: r.u32(at), denominator: r.u32(at + 4) };
        case 10:
          return { numerator: r.i32(at), denominator: r.i32(at + 4) };
        default:
          return 0;
      }
    };
    if (count === 1)
      return one(0);
    const out = [];
    for (let i = 0; i < count; i += 1)
      out.push(one(i));
    return out;
  };
  var IFD_EXIF_POINTER = 34665;
  var IFD_GPS_POINTER = 34853;
  var readIfd = (r, block, start, ifd, entries, seen, depth) => {
    if (depth > 4 || seen.has(start) || start + 2 > block.length)
      return 0;
    seen.add(start);
    const count = r.u16(start);
    let p = start + 2;
    for (let i = 0; i < count; i += 1, p += 12) {
      if (p + 12 > block.length || entries.length >= MAX_ENTRIES)
        break;
      const tag = r.u16(p);
      const type = r.u16(p + 2);
      const n = r.u32(p + 4);
      const size = TYPE_SIZE[type] ?? 0;
      if (size === 0 || n === 0)
        continue;
      const bytesNeeded = size * n;
      const valueAt = bytesNeeded <= 4 ? p + 8 : r.u32(p + 8);
      if (valueAt + bytesNeeded > block.length)
        continue;
      if (tag === IFD_EXIF_POINTER || tag === IFD_GPS_POINTER) {
        const target = bytesNeeded <= 4 ? r.u32(p + 8) : valueAt;
        readIfd(r, block, target, tag === IFD_EXIF_POINTER ? "exif" : "gps", entries, seen, depth + 1);
        continue;
      }
      if (type !== 2 && n > MAX_COMPONENTS)
        continue;
      try {
        entries.push({ tag, ifd, type, count: n, value: readValue(r, block, type, n, valueAt) });
      } catch {
        continue;
      }
    }
    return p + 4 <= block.length ? r.u32(p) : 0;
  };
  var parseExif = (bytes) => {
    try {
      const block = findTiffBlock(bytes);
      if (!block || block.length < 8 || block.length > MAX_BLOCK_BYTES)
        return null;
      const order = block[0] === 73 && block[1] === 73 ? "little" : block[0] === 77 && block[1] === 77 ? "big" : null;
      if (!order)
        return null;
      const r = reader(block, order === "little");
      if (r.u16(2) !== 42)
        return null;
      const entries = [];
      const seen = /* @__PURE__ */ new Set();
      const next = readIfd(r, block, r.u32(4), "image", entries, seen, 0);
      if (next > 0)
        readIfd(r, block, next, "thumbnail", entries, seen, 1);
      const byKey = /* @__PURE__ */ new Map();
      for (const e of entries)
        byKey.set(key(e.ifd, e.tag), e);
      return { byteOrder: order, entries, byKey };
    } catch {
      return null;
    }
  };
  var ratioValue = (v) => {
    if (typeof v === "number")
      return v;
    if (typeof v === "object" && v !== null && "numerator" in v) {
      return v.denominator === 0 ? null : v.numerator / v.denominator;
    }
    return null;
  };
  var exifNumber = (data, ifd, tag) => {
    const e = data.byKey.get(key(ifd, tag));
    return e ? ratioValue(e.value) : null;
  };
  var TAG_X_RESOLUTION = 282;
  var TAG_Y_RESOLUTION = 283;
  var TAG_RESOLUTION_UNIT = 296;
  var exifResolution = (data) => {
    const x = exifNumber(data, "image", TAG_X_RESOLUTION);
    const y = exifNumber(data, "image", TAG_Y_RESOLUTION);
    if (x === null || y === null || x <= 0 || y <= 0)
      return null;
    const unit = exifNumber(data, "image", TAG_RESOLUTION_UNIT) ?? 2;
    if (unit === 2)
      return { x, y };
    if (unit === 3)
      return { x: x * CM_PER_INCH, y: y * CM_PER_INCH };
    return null;
  };

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/dimensions.js
  var measurePng = (b) => {
    const width = be32(b, 16);
    const height = be32(b, 20);
    let density = null;
    let p = 8;
    while (p + 8 <= b.length) {
      const len = be32(b, p);
      const type = p + 4;
      if (matchAscii(b, type, "IDAT") || matchAscii(b, type, "IEND"))
        break;
      if (matchAscii(b, type, "pHYs") && len === 9 && p + 8 + 9 <= b.length) {
        const d = p + 8;
        const perMetreX = be32(b, d);
        const perMetreY = be32(b, d + 4);
        if (u8(b, d + 8) === 1 && perMetreX > 0 && perMetreY > 0) {
          density = {
            x: perMetreX * MM_PER_INCH / MM_PER_METRE,
            y: perMetreY * MM_PER_INCH / MM_PER_METRE,
            source: "png-phys"
          };
        }
        break;
      }
      p += 12 + len;
    }
    return { format: "png", width, height, density };
  };
  var isSof = (m) => m >= 192 && m <= 195 || m >= 197 && m <= 199 || m >= 201 && m <= 203 || m >= 205 && m <= 207;
  var measureJpeg = (b) => {
    let density = null;
    let p = 2;
    while (p + 4 <= b.length) {
      if (u8(b, p) !== 255) {
        p += 1;
        continue;
      }
      const marker = u8(b, p + 1);
      if (marker === 255) {
        p += 1;
        continue;
      }
      if (marker === 216 || marker >= 208 && marker <= 217 || marker === 1) {
        p += 2;
        continue;
      }
      const len = be16(b, p + 2);
      if (len < 2)
        break;
      const payload = p + 4;
      if (isSof(marker)) {
        return { format: "jpeg", height: be16(b, payload + 1), width: be16(b, payload + 3), density };
      }
      if (marker === 224 && matchAscii(b, payload, "JFIF\0")) {
        const units = u8(b, payload + 7);
        const x = be16(b, payload + 8);
        const y = be16(b, payload + 10);
        if (x > 0 && y > 0) {
          if (units === 1)
            density = { x, y, source: "jfif" };
          else if (units === 2) {
            density = { x: x * CM_PER_INCH, y: y * CM_PER_INCH, source: "jfif" };
          }
        }
      }
      if (marker === 218)
        break;
      p = payload + len - 2;
    }
    throw new RangeError("no start-of-frame segment found");
  };
  var measureGif = (b) => ({
    format: "gif",
    width: le16(b, 6),
    height: le16(b, 8),
    density: null
  });
  var measureWebp = (b) => {
    const fourcc = String.fromCharCode(u8(b, 12), u8(b, 13), u8(b, 14), u8(b, 15));
    const data = 20;
    if (fourcc === "VP8X") {
      return {
        format: "webp",
        width: le24(b, data + 4) + 1,
        height: le24(b, data + 7) + 1,
        density: null
      };
    }
    if (fourcc === "VP8 ") {
      return {
        format: "webp",
        width: le16(b, data + 6) & 16383,
        height: le16(b, data + 8) & 16383,
        density: null
      };
    }
    if (fourcc === "VP8L") {
      if (u8(b, data) !== 47)
        throw new RangeError("VP8L signature byte missing");
      const bits = u8(b, data + 1) | u8(b, data + 2) << 8 | u8(b, data + 3) << 16 | u8(b, data + 4) << 24;
      return {
        format: "webp",
        width: (bits & 16383) + 1,
        height: (bits >>> 14 & 16383) + 1,
        density: null
      };
    }
    throw new RangeError(`unrecognised WebP chunk "${fourcc}"`);
  };
  var MEASURERS = {
    png: measurePng,
    jpeg: measureJpeg,
    gif: measureGif,
    webp: measureWebp
  };
  var measureImage = (bytes) => {
    const format = sniffFormat(bytes);
    if (format === null)
      return null;
    try {
      const m = MEASURERS[format](bytes);
      if (!Number.isFinite(m.width) || !Number.isFinite(m.height) || m.width < 1 || m.height < 1) {
        return null;
      }
      if (m.density === null) {
        const exif = parseExif(bytes);
        const res = exif ? exifResolution(exif) : null;
        if (res)
          m.density = { x: res.x, y: res.y, source: "exif" };
      }
      return m;
    } catch {
      return null;
    }
  };

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/intake.js
  var DEFAULT_DRAGGING_CLASS = "is-dragging";
  var humanBytes = (n) => n >= 1024 * 1024 ? `${Math.round(n / (1024 * 1024))}MB` : `${Math.round(n / 1024)}KB`;
  var attachIntake = (root, opts) => {
    const draggingClass = opts.draggingClass ?? DEFAULT_DRAGGING_CLASS;
    const input = root.querySelector('input[type="file"]');
    const accept = (file) => {
      if (!file)
        return;
      if (opts.maxBytes && file.size > opts.maxBytes) {
        opts.onReject?.(`That file is ${humanBytes(file.size)}. The limit here is ${humanBytes(opts.maxBytes)}.`);
        return;
      }
      if (file.size === 0) {
        opts.onReject?.("That file is empty.");
        return;
      }
      opts.onFile(file);
    };
    const onDragEnter = (e) => {
      e.preventDefault();
      root.classList.add(draggingClass);
    };
    const onDragOver = (e) => {
      e.preventDefault();
      if (e.dataTransfer)
        e.dataTransfer.dropEffect = "copy";
    };
    const onDragLeave = (e) => {
      if (e.relatedTarget instanceof Node && root.contains(e.relatedTarget))
        return;
      root.classList.remove(draggingClass);
    };
    const onDrop = (e) => {
      e.preventDefault();
      root.classList.remove(draggingClass);
      accept(e.dataTransfer?.files?.[0]);
    };
    const onChange = () => {
      accept(input?.files?.[0]);
      if (input)
        input.value = "";
    };
    const onPaste = (e) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.kind === "file");
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        accept(file);
      }
    };
    root.addEventListener("dragenter", onDragEnter);
    root.addEventListener("dragover", onDragOver);
    root.addEventListener("dragleave", onDragLeave);
    root.addEventListener("drop", onDrop);
    input?.addEventListener("change", onChange);
    document.addEventListener("paste", onPaste);
    return () => {
      root.removeEventListener("dragenter", onDragEnter);
      root.removeEventListener("dragover", onDragOver);
      root.removeEventListener("dragleave", onDragLeave);
      root.removeEventListener("drop", onDrop);
      input?.removeEventListener("change", onChange);
      document.removeEventListener("paste", onPaste);
      root.classList.remove(draggingClass);
    };
  };
  var readHeaderBytes = async (file, n = HEADER_BYTES) => {
    const buf = await file.slice(0, n).arrayBuffer();
    return new Uint8Array(buf);
  };

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/mount.js
  var getWn = () => globalThis.WN ?? null;
  var mount = (selector, init) => {
    const run = () => {
      const root = document.querySelector(selector);
      if (!root)
        return;
      const wn = getWn();
      const reduced = wn?.reduced ?? (typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)").matches : true);
      init({ root, wn, reduced });
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
      run();
    }
  };

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/dom.js
  var h = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v === null || v === void 0)
        continue;
      if (k === "class")
        node.className = String(v);
      else if (v === true)
        node.setAttribute(k, "");
      else
        node.setAttribute(k, String(v));
    }
    for (const c of children) {
      if (c === null || c === void 0)
        continue;
      node.append(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  };

  // src/assess.ts
  var SHARP_SOFT = 0.3;
  var SHARP_BLURRY = 0.18;
  var RES_SMALL = 1400;
  var RES_TINY = 800;
  var DARK = 55;
  var VERY_DARK = 38;
  var BRIGHT = 205;
  var VERY_BRIGHT = 228;
  var CLIP_WARN = 0.06;
  var CLIP_BAD = 0.15;
  var RANGE_FLAT = 70;
  var FRAMING_TIGHT = 0.16;
  var pct = (v) => `${Math.round(v * 100)}%`;
  var named = (id, label) => (body) => ({ id, label, ...body });
  var banded = (value, good, warn, bodies) => value >= good ? bodies[0] : value >= warn ? bodies[1] : bodies[2];
  var assess = (f) => {
    const size = `${f.width.toLocaleString()} \xD7 ${f.height.toLocaleString()} pixels`;
    const e = f.exposure;
    const checks = [
      named("resolution", "Size")(
        banded(Math.max(f.width, f.height), RES_SMALL, RES_TINY, [
          { verdict: "good", detail: `${size} \u2014 plenty to work from.` },
          {
            verdict: "warn",
            detail: `${size} \u2014 on the small side.`,
            advice: "Usable, but if you have the original rather than a copy sent through a messaging app, send that instead. Apps shrink photos silently."
          },
          {
            verdict: "bad",
            detail: `${size} \u2014 too small.`,
            advice: "This is about the size of a web thumbnail. Look for the original on your phone or camera; it will be several times bigger."
          }
        ])
      ),
      named("sharpness", "Focus")(
        banded(f.sharpness, SHARP_SOFT, SHARP_BLURRY, [
          { verdict: "good", detail: "Sharp where it matters." },
          {
            verdict: "warn",
            detail: "A little soft.",
            advice: "Workable, but a sharper one would give more to paint from \u2014 fur and eyes especially. Try a few shots in better light and pick the crispest."
          },
          {
            verdict: "bad",
            detail: "Out of focus.",
            advice: "There is not enough detail here to paint from. Take another with the camera still and your pet still \u2014 tapping the screen on their face before you shoot helps."
          }
        ])
      ),
      named("exposure", "Lighting")(
        e.clippedLow >= CLIP_BAD ? {
          verdict: "bad",
          detail: `${pct(e.clippedLow)} of the photo is solid black with nothing in it.`,
          advice: "Shooting against a window does this. Turn so the light falls on your pet rather than behind them, or step outside on an overcast day \u2014 that is the kindest light there is."
        } : e.clippedHigh >= CLIP_BAD ? {
          verdict: "bad",
          detail: `${pct(e.clippedHigh)} of the photo is blown out to pure white.`,
          advice: "Bright sun does this. Move into open shade and try again."
        } : e.mean < VERY_DARK || e.mean > VERY_BRIGHT ? {
          verdict: "bad",
          detail: e.mean < VERY_DARK ? "Far too dark." : "Far too bright.",
          advice: "Try again in daylight, indoors near a window but not pointing at it."
        } : e.mean < DARK || e.mean > BRIGHT || e.clippedLow >= CLIP_WARN || e.clippedHigh >= CLIP_WARN ? {
          verdict: "warn",
          detail: e.mean < DARK ? "Rather dark." : "Rather bright.",
          advice: "Usable, but more even light would show more of their coat."
        } : { verdict: "good", detail: "Well lit, with detail at both ends." }
      ),
      named("contrast", "Contrast")(
        e.range >= RANGE_FLAT ? { verdict: "good", detail: "Good tonal range." } : {
          verdict: "warn",
          detail: "Flat and a bit grey.",
          advice: "Often a photo taken through glass, or a screenshot of a photo rather than the photo itself. The original file will have more in it."
        }
      )
    ];
    if (f.detail.coverage < FRAMING_TIGHT) {
      checks.push(
        named("framing", "Framing")({
          verdict: "warn",
          advisory: true,
          detail: `The detail sits in about ${pct(f.detail.coverage)} of the frame. Is your pet quite small in this one?`,
          advice: "If so, closer is better \u2014 head and shoulders filling most of the frame gives the most to work from. If they already fill it, ignore this."
        })
      );
    }
    const scored = checks.filter((c) => !c.advisory);
    const overall = scored.some((c) => c.verdict === "bad") ? "bad" : scored.some((c) => c.verdict === "warn") ? "warn" : "good";
    return {
      checks,
      overall,
      summary: overall === "good" ? "This will work well." : overall === "warn" ? "This will work, with a caveat or two." : "This one will hold the portrait back."
    };
  };

  // src/metrics.ts
  var toLuma = (rgba, size) => {
    const out = new Float32Array(size.width * size.height);
    for (let i = 0, p = 0; i < out.length; i += 1, p += 4) {
      out[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
    }
    return out;
  };
  var mean = (a) => {
    if (a.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < a.length; i += 1) sum += a[i];
    return sum / a.length;
  };
  var stdDev = (a) => {
    if (a.length === 0) return 0;
    const m = mean(a);
    let acc = 0;
    for (let i = 0; i < a.length; i += 1) {
      const d = a[i] - m;
      acc += d * d;
    }
    return Math.sqrt(acc / a.length);
  };
  var gaussianBlur = (src, size, sigma) => {
    const { width: w, height: h2 } = size;
    const radius = Math.max(1, Math.ceil(sigma * 3));
    const kernel = new Float32Array(radius * 2 + 1);
    let norm = 0;
    for (let i = -radius; i <= radius; i += 1) {
      const v = Math.exp(-(i * i) / (2 * sigma * sigma));
      kernel[i + radius] = v;
      norm += v;
    }
    for (let i = 0; i < kernel.length; i += 1) kernel[i] = kernel[i] / norm;
    const tmp = new Float32Array(src.length);
    const out = new Float32Array(src.length);
    for (let y = 0; y < h2; y += 1) {
      for (let x = 0; x < w; x += 1) {
        let acc = 0;
        for (let k = -radius; k <= radius; k += 1) {
          const xx = Math.min(w - 1, Math.max(0, x + k));
          acc += src[y * w + xx] * kernel[k + radius];
        }
        tmp[y * w + x] = acc;
      }
    }
    for (let y = 0; y < h2; y += 1) {
      for (let x = 0; x < w; x += 1) {
        let acc = 0;
        for (let k = -radius; k <= radius; k += 1) {
          const yy = Math.min(h2 - 1, Math.max(0, y + k));
          acc += tmp[yy * w + x] * kernel[k + radius];
        }
        out[y * w + x] = acc;
      }
    }
    return out;
  };
  var sharpness = (luma, size, sigma = 1.4) => {
    const spread = stdDev(luma);
    if (spread < 1e-6) return 0;
    const blurred = gaussianBlur(luma, size, sigma);
    const high = new Float32Array(luma.length);
    for (let i = 0; i < luma.length; i += 1) high[i] = luma[i] - blurred[i];
    return stdDev(high) / spread;
  };
  var CLIP_LOW = 2;
  var CLIP_HIGH = 253;
  var exposure = (luma) => {
    const hist = new Uint32Array(256);
    for (let i = 0; i < luma.length; i += 1) {
      const bin = Math.min(255, Math.max(0, Math.round(luma[i])));
      hist[bin] = hist[bin] + 1;
    }
    const total = luma.length || 1;
    let low = 0;
    for (let v = 0; v <= CLIP_LOW; v += 1) low += hist[v];
    let high = 0;
    for (let v = CLIP_HIGH; v <= 255; v += 1) high += hist[v];
    const percentile = (p) => {
      const target = total * p;
      let seen = 0;
      for (let v = 0; v < 256; v += 1) {
        seen += hist[v];
        if (seen >= target) return v;
      }
      return 255;
    };
    return {
      mean: mean(luma),
      clippedLow: low / total,
      clippedHigh: high / total,
      range: percentile(0.99) - percentile(0.01)
    };
  };
  var minimalSpan = (energy, fraction) => {
    let total = 0;
    for (let i = 0; i < energy.length; i += 1) total += energy[i];
    if (total <= 0) return [0, energy.length - 1];
    const target = total * fraction;
    let best = [0, energy.length - 1];
    let bestLen = energy.length;
    let sum = 0;
    let lo = 0;
    for (let hi = 0; hi < energy.length; hi += 1) {
      sum += energy[hi];
      while (sum - energy[lo] >= target) {
        sum -= energy[lo];
        lo += 1;
      }
      if (sum >= target && hi - lo + 1 < bestLen) {
        bestLen = hi - lo + 1;
        best = [lo, hi];
      }
    }
    return best;
  };
  var detailBox = (luma, size, fraction = 0.75) => {
    const { width: w, height: h2 } = size;
    const rows = new Float32Array(h2);
    const cols = new Float32Array(w);
    for (let y = 1; y < h2 - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        const gx = luma[y * w + x + 1] - luma[y * w + x - 1];
        const gy = luma[(y + 1) * w + x] - luma[(y - 1) * w + x];
        const m = Math.abs(gx) + Math.abs(gy);
        rows[y] = rows[y] + m;
        cols[x] = cols[x] + m;
      }
    }
    const [y0, y1] = minimalSpan(rows, fraction);
    const [x0, x1] = minimalSpan(cols, fraction);
    const width = x1 - x0 + 1;
    const height = y1 - y0 + 1;
    return { x: x0, y: y0, width, height, coverage: width * height / (w * h2) };
  };

  // src/decode.ts
  var TILE = 256;
  var GRID = 4;
  var MAX_DECODE_PIXELS = 4e7;
  var REFUSE_ABOVE_PIXELS = 5e8;
  var STATS_LONG_EDGE = 512;
  var context = (w, h2) => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h2;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("this browser would not give us a 2d canvas");
    return ctx;
  };
  var bestTileSharpness = (bitmap) => {
    const { width: w, height: h2 } = bitmap;
    if (w <= TILE || h2 <= TILE) {
      const ctx2 = context(w, h2);
      ctx2.drawImage(bitmap, 0, 0);
      const data = ctx2.getImageData(0, 0, w, h2);
      const size2 = { width: w, height: h2 };
      return sharpness(toLuma(data.data, size2), size2);
    }
    const ctx = context(TILE, TILE);
    const size = { width: TILE, height: TILE };
    let best = 0;
    for (let gy = 0; gy < GRID; gy += 1) {
      for (let gx = 0; gx < GRID; gx += 1) {
        const sx = Math.round((w - TILE) * gx / (GRID - 1));
        const sy = Math.round((h2 - TILE) * gy / (GRID - 1));
        ctx.drawImage(bitmap, sx, sy, TILE, TILE, 0, 0, TILE, TILE);
        const data = ctx.getImageData(0, 0, TILE, TILE);
        const score = sharpness(toLuma(data.data, size), size);
        if (score > best) best = score;
      }
    }
    return best;
  };
  var wholeFrameStats = (bitmap) => {
    const scale = Math.min(1, STATS_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h2 = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = context(w, h2);
    ctx.drawImage(bitmap, 0, 0, w, h2);
    const data = ctx.getImageData(0, 0, w, h2);
    const size = { width: w, height: h2 };
    const luma = toLuma(data.data, size);
    return { exposure: exposure(luma), detail: detailBox(luma, size) };
  };
  var decodeWidthFor = (natural) => {
    const pixels = natural.width * natural.height;
    if (!(pixels > MAX_DECODE_PIXELS)) return null;
    return Math.max(1, Math.round(natural.width * Math.sqrt(MAX_DECODE_PIXELS / pixels)));
  };
  var measureFile = async (file, natural) => {
    const resizeWidth = natural ? decodeWidthFor(natural) : null;
    const bitmap = resizeWidth === null ? await createImageBitmap(file) : await createImageBitmap(file, { resizeWidth, resizeQuality: "high" });
    try {
      return {
        decodedWidth: bitmap.width,
        decodedHeight: bitmap.height,
        sharpness: bestTileSharpness(bitmap),
        ...wholeFrameStats(bitmap)
      };
    } finally {
      bitmap.close();
    }
  };

  // src/render.ts
  var VERDICT_WORD = {
    good: "Good",
    warn: "Worth a look",
    bad: "Needs another go"
  };
  var VERDICT_CLASS = {
    good: "fam fam-4",
    warn: "fam fam-2",
    bad: "fam fam-3"
  };
  var checkRow = (c) => h(
    "div",
    { class: `ppc-check ppc-${c.verdict}${c.advisory ? " ppc-advisory" : ""}` },
    h(
      "div",
      { class: "ppc-check-head" },
      h("span", { class: "ppc-check-label" }, c.label),
      h("span", { class: VERDICT_CLASS[c.verdict] }, c.advisory ? "Have a think" : VERDICT_WORD[c.verdict])
    ),
    h("p", { class: "ppc-check-detail" }, c.detail),
    c.advice ? h("p", { class: "ppc-advice" }, c.advice) : null
  );
  var renderAssessment = (a) => h(
    "div",
    { class: "ppc-results-inner" },
    h(
      "div",
      { class: `ppc-verdict ppc-${a.overall} glass` },
      h("p", { class: "eyebrow" }, "Verdict"),
      h("h2", {}, a.summary),
      a.overall === "bad" ? h(
        "p",
        { class: "ppc-note" },
        "Send it anyway if it is the only one you have \u2014 it is your pet and sometimes there is only the one photo. This is a guide, not a rule."
      ) : null
    ),
    h("div", { class: "ppc-checks" }, ...a.checks.map(checkRow)),
    h(
      "p",
      { class: "ppc-note ppc-footnote" },
      "Measured on your own device. Nothing was uploaded and nothing was kept."
    )
  );

  // src/index.ts
  mount("[data-ppc]", ({ root }) => {
    const intake = root.querySelector("[data-ppc-intake]");
    const results = root.querySelector("[data-ppc-results]");
    const errorOut = root.querySelector("[data-ppc-error]");
    const busy = root.querySelector("[data-ppc-busy]");
    if (!intake || !results) return;
    const setBusy = (on) => {
      if (busy) busy.hidden = !on;
    };
    const showError = (message) => {
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
              "That file could not be read as a PNG, JPEG, GIF or WebP. If it came off an iPhone it may be a HEIC \u2014 export it as JPEG and try again."
            );
            return;
          }
          if (header.width * header.height > REFUSE_ABOVE_PIXELS) {
            showError(
              "That image declares far more pixels than any camera produces, and opening it would be enough to bring the tab down. If it is a real photograph, save a copy at a normal size and try that."
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
                detail: m.detail
              })
            )
          );
          setBusy(false);
        })().catch(() => {
          showError(
            "That photo could not be opened. It may be damaged, or too large for this device \u2014 try a different one."
          );
        });
      }
    });
  });
})();
