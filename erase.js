// Human eraser for the REJECTED state: replaces every person in the frame
// with the background behind them.
//
// A clean background plate is learned continuously from pixels the person
// mask says are not human. Where the plate has never seen the background
// (someone stood there the whole time), a blurred smear of the surrounding
// background fills in. Everything is canvas compositing; no pixel readbacks.

import * as config from "./config.js";

export class HumanEraser {
  constructor(frameW, frameH) {
    this.W = frameW;
    this.H = frameH;
    this.cutout = makeCanvas(frameW, frameH); // current frame with people cut out
    this.plate = makeCanvas(frameW, frameH);  // learned background (alpha = how known)
    this.result = makeCanvas(frameW, frameH); // frame with people erased
    // Shrinking pyramid of the cutout for the hole-filling smear. Each step
    // halves (a big one-step drawImage shrink samples instead of averaging,
    // so holes would stay holes). Ends in 1x1, the average background color.
    this.chain = [];
    for (let w = frameW, h = frameH; w > 1 || h > 1;) {
      w = Math.max(1, Math.round(w / 2));
      h = Math.max(1, Math.round(h / 2));
      this.chain.push(makeCanvas(w, h));
    }
    // Only every other level (1/4, 1/16, ...) plus the 1x1 gets stacked.
    this.levels = this.chain.filter((_, i) => i % 2 === 1 || i === this.chain.length - 1);
    this.scratch = makeCanvas(this.levels[0].width, this.levels[0].height);
    this.maskSmall = null; // person alpha at mask resolution
    this.maskDilated = null;
  }

  /** Build the (softened, dilated) removal mask from a segmenter mask. */
  setMask(mask) {
    const { width: mw, height: mh, data } = mask;
    if (!this.maskSmall || this.maskSmall.width !== mw || this.maskSmall.height !== mh) {
      this.maskSmall = makeCanvas(mw, mh);
      this.maskDilated = makeCanvas(mw, mh);
      this.maskImage = this.maskSmall.getContext("2d").createImageData(mw, mh);
    }
    // Ramp low..high -> 0..1, so faint edges (hair) still count as person.
    const px = this.maskImage.data;
    const lo = config.ERASE_MASK_LOW, span = config.ERASE_MASK_HIGH - config.ERASE_MASK_LOW;
    for (let i = 0, j = 3; i < data.length; i++, j += 4) {
      px[j] = Math.max(0, Math.min(1, (data[i] - lo) / span)) * 255;
    }
    this.maskSmall.getContext("2d").putImageData(this.maskImage, 0, 0);

    // Dilate by stamping the mask at small offsets (additive alpha saturates).
    const d = this.maskDilated.getContext("2d");
    d.clearRect(0, 0, mw, mh);
    d.globalCompositeOperation = "lighter";
    const r = config.ERASE_DILATE;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) d.drawImage(this.maskSmall, dx, dy);
    }
    d.globalCompositeOperation = "source-over";
  }

  /** Cut people out of `frame` (needs setMask first). */
  cut(frame) {
    const c = this.cutout.getContext("2d");
    c.globalCompositeOperation = "copy";
    c.drawImage(frame, 0, 0, this.W, this.H);
    c.globalCompositeOperation = "destination-out";
    c.imageSmoothingEnabled = true;
    c.drawImage(this.maskDilated, 0, 0, this.W, this.H);
    c.globalCompositeOperation = "source-over";
  }

  /** Blend the current cutout into the background plate. Call only with a fresh mask. */
  learn(rate = config.PLATE_LEARN_RATE) {
    const p = this.plate.getContext("2d");
    p.globalAlpha = rate;
    p.drawImage(this.cutout, 0, 0);
    p.globalAlpha = 1;
  }

  /**
   * Make partially transparent pixels opaque without changing their color:
   * drawing an image over itself keeps the color and turns alpha a into
   * 1 - (1 - a)^2, so a few doublings take any visible alpha to ~1.
   * Fully transparent pixels stay transparent (the coarser level shows there).
   */
  _solidify(level) {
    const l = level.getContext("2d");
    const s = this.scratch.getContext("2d");
    const { width: w, height: h } = level;
    for (let k = 0; k < config.ERASE_SOLIDIFY_PASSES; k++) {
      s.globalCompositeOperation = "copy";
      s.drawImage(level, 0, 0, w, h, 0, 0, w, h);
      l.drawImage(this.scratch, 0, 0, w, h, 0, 0, w, h);
    }
  }

  reset() {
    this.plate.getContext("2d").clearRect(0, 0, this.W, this.H);
  }

  /** Draw `frame` with people erased, crossfaded in by `amount` (0..1), onto ctx. */
  draw(ctx, frame, amount) {
    const r = this.result.getContext("2d");
    r.imageSmoothingEnabled = true;

    // Smear: shrink the cutout repeatedly (holes average with their
    // surroundings), then stack the levels coarsest-first under everything.
    let src = this.cutout;
    for (const level of this.chain) {
      const l = level.getContext("2d");
      l.imageSmoothingEnabled = true;
      l.clearRect(0, 0, level.width, level.height);
      l.drawImage(src, 0, 0, level.width, level.height);
      src = level;
    }
    // Shrinking keeps colors premultiplied, so a pixel that was mostly person
    // ends up mostly transparent and the person would ghost through.
    // Solidify each level first (keeps the shrunk copies above intact).
    this.levels.forEach((level) => this._solidify(level));

    r.globalCompositeOperation = "copy";
    r.drawImage(frame, 0, 0, this.W, this.H); // only shows if the whole frame is people
    r.globalCompositeOperation = "source-over";
    for (let i = this.levels.length - 1; i >= 0; i--) {
      r.drawImage(this.levels[i], 0, 0, this.W, this.H);
    }
    r.drawImage(this.plate, 0, 0);  // the real background, where known
    r.drawImage(this.cutout, 0, 0); // live background around the people

    ctx.globalAlpha = Math.max(0, Math.min(1, amount));
    ctx.drawImage(this.result, 0, 0, this.W, this.H);
    ctx.globalAlpha = 1;
  }
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
