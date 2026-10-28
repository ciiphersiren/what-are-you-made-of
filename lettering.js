// Letter renderer + LetterSource classes. Mirrors python/lettering.py.
//
// Grids are flat row-major arrays of length rows * cols. A mask grid is a
// Uint8Array (1 = cell is drawn); a letter grid is an array of 1-char strings.

import * as config from "./config.js";

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = UPPER.toLowerCase();

// --- Letter sources -----------------------------------------------------------

/**
 * Decides which character goes in each grid cell.
 * Subclasses set `charset` (every character they may produce, used to build
 * the glyph atlas) and implement generate(). generate() is called every
 * frame; each source decides itself how often its letters actually change.
 * Spaces (and any character missing from the atlas) render as empty cells.
 */
export class LetterSource {
  charset = "";

  /** Return a flat (rows * cols) array of single characters. Cells outside `mask` are ignored. */
  generate(rows, cols, mask) {
    throw new Error("not implemented");
  }

  /** Start over (called when the person leaves LETTERED). */
  reset() {}
}

/** Random A-Z, re-randomized every `refreshFrames` frames. */
export class RandomLetterSource extends LetterSource {
  constructor(refreshFrames = config.LETTER_REFRESH_FRAMES, random = Math.random) {
    super();
    this.charset = UPPER;
    this.refreshFrames = Math.max(1, refreshFrames);
    this.random = random;
    this.reset();
  }

  reset() {
    this.grid = null;
    this.frameCount = 0;
  }

  generate(rows, cols, mask) {
    const n = rows * cols;
    if (!this.grid || this.grid.length !== n || this.frameCount % this.refreshFrames === 0) {
      this.grid = Array.from({ length: n }, () => UPPER[Math.floor(this.random() * UPPER.length)]);
    }
    this.frameCount++;
    return this.grid;
  }
}

/**
 * A phrase repeated through the masked cells only.
 * Cells are read left to right, top to bottom, skipping cells outside the
 * mask, so the text flows unbroken through the body shape. Laid out fresh
 * every frame (the mask changes every frame). With scrollFrames > 0 the
 * phrase offset advances by one character every scrollFrames frames.
 */
export class PhraseLetterSource extends LetterSource {
  constructor(phrase = config.PHRASE, separator = config.PHRASE_SEPARATOR,
              scrollFrames = config.PHRASE_SCROLL_FRAMES) {
    super();
    this.sequence = [...(phrase + separator)];
    this.charset = [...new Set(this.sequence)].sort().join("");
    this.scrollFrames = scrollFrames;
    this.reset();
  }

  reset() {
    this.offset = 0;
    this.frameCount = 0;
  }

  generate(rows, cols, mask) {
    const grid = new Array(rows * cols).fill(" ");
    const len = this.sequence.length;
    let k = 0;
    for (let i = 0; i < grid.length; i++) {
      if (mask[i]) grid[i] = this.sequence[(k++ + this.offset) % len];
    }
    if (this.scrollFrames > 0) {
      this.frameCount++;
      if (this.frameCount % this.scrollFrames === 0) this.offset = (this.offset + 1) % len;
    }
    return grid;
  }
}

export function makeLetterSource(name = config.LETTER_SOURCE) {
  const sources = { phrase: PhraseLetterSource, random: RandomLetterSource };
  if (!(name in sources)) {
    throw new Error(`LETTER_SOURCE must be one of ${Object.keys(sources)}, got ${name}`);
  }
  return new sources[name]();
}

// --- Glyph atlas --------------------------------------------------------------

/**
 * Pre-rendered white glyphs in one row of an offscreen canvas, one tile per char.
 * Always includes A-Z and a-z on top of the source's charset. Index 0 is
 * blank (spaces, unknown chars). All glyphs share one baseline so mixed-case
 * text reads as a line. Tiles are rendered at `scale` x the cell size.
 */
export class GlyphAtlas {
  constructor(charset, cellW, cellH, scale = 1) {
    const drawable = new Set([...charset, ...UPPER, ...LOWER]);
    this.chars = ["", ...[...drawable].filter((c) => c.trim()).sort()];
    this.index = new Map(this.chars.map((c, i) => [c, i]));
    this.tileW = cellW * scale;
    this.tileH = cellH * scale;

    this.canvas = document.createElement("canvas");
    this.canvas.width = this.tileW * this.chars.length;
    this.canvas.height = this.tileH;
    const ctx = this.canvas.getContext("2d");
    const pad = config.LETTER_GLYPH_PAD * scale;
    const glyphs = this.chars.slice(1);
    const { size, ascent, descent } =
      fitFont(ctx, glyphs, this.tileW - 2 * pad, this.tileH - 2 * pad);

    ctx.font = letterFont(size);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    // Shared baseline: center the union of all glyphs' ink bounds vertically.
    const baseline = (this.tileH - (ascent + descent)) / 2 + ascent;
    glyphs.forEach((c, i) => {
      const m = ctx.measureText(c);
      const inkW = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
      const x = (i + 1) * this.tileW + (this.tileW - inkW) / 2 + m.actualBoundingBoxLeft;
      ctx.fillText(c, x, baseline);
    });
  }

  lookup(char) {
    return this.index.get(char) ?? 0;
  }
}

const letterFont = (size) => `${config.LETTER_FONT_WEIGHT} ${size}px ${config.LETTER_FONT_FAMILY}`;

/** Largest font size at which every glyph fits maxW x maxH on a shared baseline. */
function fitFont(ctx, chars, maxW, maxH) {
  const extent = (size) => {
    ctx.font = letterFont(size);
    let w = 0, ascent = 0, descent = 0;
    for (const c of chars) {
      const m = ctx.measureText(c);
      w = Math.max(w, m.actualBoundingBoxLeft + m.actualBoundingBoxRight);
      ascent = Math.max(ascent, m.actualBoundingBoxAscent);
      descent = Math.max(descent, m.actualBoundingBoxDescent);
    }
    return { size, w, ascent, descent };
  };
  let e = extent(100);
  let size = Math.floor(Math.min(maxW / e.w, maxH / (e.ascent + e.descent)) * 100) + 1;
  for (; size > 1; size--) {
    e = extent(size);
    if (e.w <= maxW && e.ascent + e.descent <= maxH) return e;
  }
  return extent(1);
}

// --- Renderer -----------------------------------------------------------------

export class LetterRenderer {
  constructor(frameW, frameH, { source = makeLetterSource(), background = config.LETTER_BACKGROUND,
                                scale = config.RENDER_SCALE } = {}) {
    this.source = source;
    this.background = background;
    this.frameW = frameW;
    this.frameH = frameH;
    this.scale = scale;
    // Cell size comes from the longer side so portrait frames get the same letter size.
    this.cellW = Math.max(1, Math.floor(Math.max(frameW, frameH) / config.LETTER_COLS));
    this.cellH = Math.max(1, Math.round(this.cellW * config.LETTER_CELL_ASPECT));
    this.cols = Math.floor(frameW / this.cellW);
    this.rows = Math.floor(frameH / this.cellH);
    // The grid may not fill the frame exactly; center it.
    this.x0 = Math.floor((frameW - this.cols * this.cellW) / 2);
    this.y0 = Math.floor((frameH - this.rows * this.cellH) / 2);
    this.atlas = new GlyphAtlas(source.charset, this.cellW, this.cellH, scale);

    const n = this.rows * this.cols;
    this.sums = new Float32Array(n);
    this.counts = new Uint32Array(n);
    this.on = new Uint8Array(n);
    this.maskMap = null; // per-mask-size pixel -> cell lookup

    // Cell colors stay on the GPU: no getImageData readback (that cost ~10 ms/frame).
    this.colorCanvas = makeCanvas(this.cols, this.rows);
    this.colorCtx = this.colorCanvas.getContext("2d");
    this.gainCanvas = makeCanvas(this.cols, this.rows);
    this.gainCtx = this.gainCanvas.getContext("2d");
    this.lettersCanvas = makeCanvas(this.cols * this.atlas.tileW, this.rows * this.atlas.tileH);
    this.lettersCtx = this.lettersCanvas.getContext("2d");
    this.layer = makeCanvas(frameW * scale, frameH * scale);
    this.layerCtx = this.layer.getContext("2d");
    this.layerCtx.setTransform(scale, 0, 0, scale, 0, 0);
  }

  /** Start the letter source over (fresh letters / phrase offset). */
  reset() {
    this.source.reset();
  }

  toggleBackground() {
    this.background = this.background === "dark" ? "video" : "dark";
  }

  /** Per-cell average mask value > threshold, over the grid region. */
  _coverage(mask) {
    const { data, width: mw, height: mh } = mask;
    if (!this.maskMap || this.maskMap.mw !== mw || this.maskMap.mh !== mh) {
      const colOf = Int32Array.from({ length: mw }, (_, x) => {
        const c = Math.floor(((x + 0.5) * this.frameW / mw - this.x0) / this.cellW);
        return c >= 0 && c < this.cols ? c : -1;
      });
      const rowOf = Int32Array.from({ length: mh }, (_, y) => {
        const r = Math.floor(((y + 0.5) * this.frameH / mh - this.y0) / this.cellH);
        return r >= 0 && r < this.rows ? r : -1;
      });
      this.maskMap = { mw, mh, colOf, rowOf };
    }
    const { colOf, rowOf } = this.maskMap;
    const { sums, counts, on } = this;
    sums.fill(0);
    counts.fill(0);
    for (let y = 0; y < mh; y++) {
      const r = rowOf[y];
      if (r < 0) continue;
      const base = r * this.cols;
      const rowStart = y * mw;
      for (let x = 0; x < mw; x++) {
        const c = colOf[x];
        if (c < 0) continue;
        sums[base + c] += data[rowStart + x];
        counts[base + c]++;
      }
    }
    for (let i = 0; i < on.length; i++) {
      on[i] = counts[i] > 0 && sums[i] / counts[i] > config.LETTER_MASK_THRESHOLD ? 1 : 0;
    }
    return on;
  }

  /**
   * Render the person as letters onto this.layer (frame-sized, fully opaque)
   * and return it. `frame` is the mirrored processing canvas.
   */
  render(frame, mask) {
    const { rows, cols, cellW, cellH, x0, y0, atlas } = this;
    const gw = cols * cellW, gh = rows * cellH;

    // One color per cell: area-average of the frame, brightened.
    const cctx = this.colorCtx;
    cctx.imageSmoothingEnabled = true;
    cctx.imageSmoothingQuality = "high";
    cctx.drawImage(frame, x0, y0, gw, gh, 0, 0, cols, rows);
    let colors = this.colorCanvas;
    if (config.LETTER_COLOR_GAIN > 1) {
      // color * gain (clamped) = color + (gain - 1) * color, via additive blending.
      const g = this.gainCtx;
      g.globalCompositeOperation = "copy";
      g.drawImage(this.colorCanvas, 0, 0);
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = Math.min(1, config.LETTER_COLOR_GAIN - 1);
      g.drawImage(this.colorCanvas, 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
      colors = this.gainCanvas;
    }

    const on = this._coverage(mask);
    const letters = this.source.generate(rows, cols, on);

    // White glyphs from the atlas, one drawImage per drawn cell...
    const lctx = this.lettersCtx;
    const tw = atlas.tileW, th = atlas.tileH;
    lctx.globalCompositeOperation = "source-over";
    lctx.clearRect(0, 0, this.lettersCanvas.width, this.lettersCanvas.height);
    for (let i = 0; i < on.length; i++) {
      if (!on[i]) continue;
      const g = atlas.lookup(letters[i]);
      if (!g) continue;
      lctx.drawImage(atlas.canvas, g * tw, 0, tw, th, (i % cols) * tw, Math.floor(i / cols) * th, tw, th);
    }
    // ...then tint every glyph with its cell color in one composite.
    lctx.globalCompositeOperation = "source-in";
    lctx.imageSmoothingEnabled = false;
    lctx.drawImage(colors, 0, 0, this.lettersCanvas.width, this.lettersCanvas.height);
    lctx.globalCompositeOperation = "source-over";

    const ctx = this.layerCtx;
    if (this.background === "video") {
      ctx.drawImage(frame, 0, 0, this.frameW, this.frameH);
      ctx.fillStyle = `rgba(0, 0, 0, ${1 - config.LETTER_VIDEO_DIM})`;
    } else {
      ctx.fillStyle = "#000";
    }
    ctx.fillRect(0, 0, this.frameW, this.frameH);
    ctx.drawImage(this.lettersCanvas, x0, y0, gw, gh);
    return this.layer;
  }
}

/**
 * Circular wavefront from a center point that crossfades video -> letters.
 * Cuts the letter layer with a radial gradient (destination-in), so the video
 * drawn underneath shows through outside the radius. Free once finished.
 */
export class RippleReveal {
  constructor(frameW, frameH, duration = config.REVEAL_SECONDS, edge = config.REVEAL_EDGE) {
    this.frameW = frameW;
    this.frameH = frameH;
    this.duration = duration;
    this.edge = edge;
    this.maxDist = Math.hypot(frameW, frameH);
    this.startTime = null;
  }

  start(now) { this.startTime = now; }
  reset() { this.startTime = null; }

  running(now) {
    return this.startTime !== null && now - this.startTime < this.duration;
  }

  /** Mask `layerCtx` to the current ripple. Returns false (no-op) when not running. */
  apply(layerCtx, [cx, cy], now) {
    if (!this.running(now)) return false;
    let t = (now - this.startTime) / this.duration;
    t = 1 - (1 - t) ** 2; // ease out: fast start, gentle finish
    const radius = t * (this.maxDist + this.edge);
    const g = layerCtx.createRadialGradient(cx, cy, Math.max(0, radius - this.edge),
                                            cx, cy, Math.max(radius, 1e-3));
    g.addColorStop(0, "rgba(0, 0, 0, 1)");
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    layerCtx.globalCompositeOperation = "destination-in";
    layerCtx.fillStyle = g;
    layerCtx.fillRect(0, 0, this.frameW, this.frameH);
    layerCtx.globalCompositeOperation = "source-over";
    return true;
  }
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
