// Face box, question text, typewriter animation, FPS. Mirrors python/ui.py.
// All drawing is in processing-frame coordinates (the output context is pre-scaled).

import * as config from "./config.js";
import { State } from "./states.js";

// --- FPS ----------------------------------------------------------------------

export class FpsCounter {
  constructor(smoothing = config.FPS_SMOOTHING) {
    this.smoothing = smoothing;
    this.fps = 0;
    this.last = performance.now();
  }

  tick() {
    const now = performance.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0) {
      const inst = 1 / dt;
      this.fps = this.fps === 0 ? inst : this.smoothing * this.fps + (1 - this.smoothing) * inst;
    }
    return this.fps;
  }
}

export function drawFps(ctx, fps) {
  ctx.font = config.FPS_FONT;
  ctx.fillStyle = config.FPS_COLOR;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`FPS: ${fps.toFixed(1)}`, ...config.FPS_POS);
}

// --- Face box -----------------------------------------------------------------

/** Turn an [x, y, w, h] box into a square [cx, cy, side] around the same center. */
export function squareBox([x, y, w, h], scale = config.FACE_BOX_SCALE) {
  return [x + w / 2, y + h / 2, Math.max(w, h) * scale];
}

/** Exponential smoothing of a tuple (box center + size, or any numbers). */
export class BoxSmoother {
  constructor(alpha = config.FACE_BOX_SMOOTHING) {
    this.alpha = alpha; // weight of the new measurement (1 = no smoothing)
    this.state = null;
  }

  update(values) {
    const a = this.alpha;
    this.state = this.state === null
      ? [...values]
      : values.map((v, i) => a * v + (1 - a) * this.state[i]);
    return this.state;
  }

  reset() {
    this.state = null;
  }
}

export function drawFaceBox(ctx, [cx, cy, side]) {
  ctx.strokeStyle = config.FACE_BOX_COLOR;
  ctx.lineWidth = config.FACE_BOX_THICKNESS;
  ctx.strokeRect(cx - side / 2, cy - side / 2, side, side);
}

// --- Typewriter ---------------------------------------------------------------

/**
 * Animate an edit from `old` to `next`: backspace what differs, pause, type the rest.
 * Shared leading/trailing characters are kept, so "yes  no" -> "no" deletes
 * "yes  " with the cursor sitting just before "no".
 */
export class Typewriter {
  /** `timing` overrides any of { startDelay, backspace, pause, type, endHold } (seconds). */
  constructor(old, next, start, timing = {}) {
    const tm = {
      startDelay: config.TYPE_START_DELAY,
      backspace: config.BACKSPACE_INTERVAL,
      pause: config.TYPE_PAUSE,
      type: config.TYPE_INTERVAL,
      endHold: config.TYPE_END_HOLD,
      ...timing,
    };
    this.start = start;
    const n = Math.min(old.length, next.length);
    let p = 0;
    while (p < n && old[p] === next[p]) p++;
    let s = 0;
    while (s < n - p && old[old.length - 1 - s] === next[next.length - 1 - s]) s++;
    const head = old.slice(0, p);
    const tail = old.slice(old.length - s);
    const oldMid = old.slice(p, old.length - s);
    const newMid = next.slice(p, next.length - s);

    // When text is kept after the deletion, delete the word first and the
    // spaces before the kept text last ("ye  no", not "yeno").
    const core = tail ? oldMid.replace(/ +$/, "") : oldMid;
    const spaces = oldMid.slice(core.length);

    // Keyframes: [time offset, text, cursor index].
    this.frames = [[0, old, p + core.length]];
    let t = tm.startDelay;
    for (let k = 1; k <= core.length; k++) {
      const kept = core.slice(0, core.length - k);
      this.frames.push([t, head + kept + spaces + tail, p + kept.length]);
      t += tm.backspace;
    }
    for (let k = 1; k <= spaces.length; k++) {
      this.frames.push([t, head + spaces.slice(k) + tail, p]);
      t += tm.backspace;
    }
    if (oldMid && newMid) t += tm.pause - tm.backspace;
    for (let k = 1; k <= newMid.length; k++) {
      this.frames.push([t, head + newMid.slice(0, k) + tail, p + k]);
      t += tm.type;
    }
    this.duration = this.frames[this.frames.length - 1][0] + tm.endHold;
  }

  /** [text, cursorIndex] at time `now`. */
  at(now) {
    const elapsed = now - this.start;
    let current = this.frames[0];
    for (const frame of this.frames) {
      if (frame[0] > elapsed) break;
      current = frame;
    }
    return [current[1], current[2]];
  }

  done(now) {
    return now - this.start >= this.duration;
  }
}

/** Tracks the answer text per state and runs the typewriter on transitions. */
export class QuestionLabel {
  constructor() {
    this.answer = config.ANSWER_START;
    this.cursor = null; // index into the answer, or null when no cursor
    this.typewriter = null;
    this.state = null;
  }

  update(state, now) {
    if (state !== this.state) {
      this.state = state;
      this.typewriter = null;
      if (state === State.CONFIRMING) {
        this.typewriter = new Typewriter(this.answer, config.ANSWER_HUMAN, now);
      } else if (state === State.REJECTED) {
        this.typewriter = new Typewriter(this.answer, config.ANSWER_REJECTED, now);
      } else if (state === State.LETTERED) {
        this.answer = config.ANSWER_HUMAN;
      } else { // IDLE, DETECTED
        this.answer = config.ANSWER_START;
      }
    }

    this.cursor = null;
    if (this.typewriter) {
      const [answer, cursor] = this.typewriter.at(now);
      this.answer = answer;
      if (!this.typewriter.done(now)) this.cursor = cursor;
    }
  }

  /** True once the current animation (if any) has played out. */
  finished(now) {
    return this.typewriter !== null && this.typewriter.done(now);
  }

  /** Draw the label centered on anchor = [x, y], with its bottom just above y. */
  draw(ctx, frameSize, anchor, now) {
    if (this.state === null || this.state === State.IDLE) return;
    const prefix = config.QUESTION + config.ANSWER_GAP;
    const cursorVisible = this.cursor !== null &&
      (now - this.typewriter.start) % config.CURSOR_BLINK_PERIOD < config.CURSOR_BLINK_PERIOD / 2;
    drawLabelAbove(ctx, frameSize, anchor, prefix + this.answer,
                   cursorVisible ? prefix.length + this.cursor : null);
  }
}

/** Label anchor for a face box: center of its top edge. */
export function boxAnchor([cx, cy, side]) {
  return [cx, cy - side / 2];
}

/**
 * Label anchor at the top of the person mask, above the face.
 * Finds the topmost mask row within the face box's column span, clamped
 * between the face box top and `maxAbove` box-sides above it (so raised hands
 * don't pull the label up and it never covers the face). Falls back to the
 * box top when the mask is empty there.
 */
export function headAnchor(mask, square, frameH, threshold = config.LETTER_MASK_THRESHOLD,
                           maxAbove = config.HEAD_TOP_MAX_ABOVE) {
  const [cx, boxTop] = boxAnchor(square);
  const side = square[2];
  const { data, width: mw, height: mh } = mask;
  const scale = mh / frameH; // mask px per frame px
  const x0 = Math.max(0, Math.floor((cx - side / 2) * scale));
  const x1 = Math.min(mw, Math.ceil((cx + side / 2) * scale));
  for (let y = 0; y < mh && x1 > x0; y++) {
    for (let x = x0; x < x1; x++) {
      if (data[y * mw + x] > threshold) {
        const top = y / scale;
        return [cx, Math.min(boxTop, Math.max(top, boxTop - maxAbove * side))];
      }
    }
  }
  return [cx, boxTop];
}

// --- Label drawing --------------------------------------------------------------

const textFont = () => `${config.TEXT_SIZE}px ${config.TEXT_FONT_FAMILY}`;
let textMetrics = null; // { ascent, height } for the label font

function labelMetrics(ctx) {
  if (!textMetrics) {
    const m = ctx.measureText("Hgy");
    const ascent = m.fontBoundingBoxAscent ?? config.TEXT_SIZE * 0.8;
    const descent = m.fontBoundingBoxDescent ?? config.TEXT_SIZE * 0.25;
    textMetrics = { ascent, height: ascent + descent };
  }
  return textMetrics;
}

/**
 * Draw text centered above anchor = [x, y] on a translucent dark background.
 * The left edge is anchored as if the widest answer were shown, so the
 * question stays put while the answer is edited.
 */
export function drawLabelAbove(ctx, [fw, fh], [ax, ay], text, cursorIndex = null) {
  ctx.font = textFont();
  ctx.textBaseline = "alphabetic";
  const { ascent, height } = labelMetrics(ctx);
  const pad = config.TEXT_PAD;
  const prefix = config.QUESTION + config.ANSWER_GAP;
  const widest = Math.max(...[config.ANSWER_START, config.ANSWER_HUMAN, config.ANSWER_REJECTED]
    .map((a) => ctx.measureText(prefix + a).width));
  const extra = pad * 2 + config.CURSOR_WIDTH + 2;
  const bwAnchor = Math.ceil(widest) + extra;
  const bw = Math.ceil(ctx.measureText(text).width) + extra;
  const bh = height + 2 * pad;

  // Keep the label on screen.
  const x1 = Math.max(0, Math.min(Math.round(ax - bwAnchor / 2), fw - bwAnchor));
  const y1 = Math.max(0, Math.min(Math.round(ay - config.TEXT_MARGIN - bh), fh - bh));

  ctx.globalAlpha = config.TEXT_BG_ALPHA;
  ctx.fillStyle = config.TEXT_BG_COLOR;
  ctx.fillRect(x1, y1, Math.min(bw, fw - x1), bh);
  ctx.globalAlpha = 1;

  ctx.fillStyle = config.TEXT_COLOR;
  ctx.fillText(text, x1 + pad, y1 + pad + ascent);

  if (cursorIndex !== null) {
    const cx = x1 + pad + Math.round(ctx.measureText(text.slice(0, cursorIndex)).width);
    ctx.fillRect(cx, y1 + pad, config.CURSOR_WIDTH, height);
  }
}
