// Entry point: start screen, main loop, keyboard + button handling.
// Mirrors python/main.py.
// Keys: q = stop camera, n = "not human", r = reset, f = toggle FPS, d = debug mask view

import * as config from "./config.js";
import * as ui from "./ui.js";
import { Camera, cameraErrorMessage } from "./camera.js";
import { FaceDetector, PersonSegmenter, drawMaskOverlay } from "./detection.js";
import { HumanEraser } from "./erase.js";
import { LetterRenderer, RippleReveal } from "./lettering.js";
import { State, StateMachine } from "./states.js";

const $ = (id) => document.getElementById(id);
const els = {
  start: $("start"),
  startBtn: $("start-btn"),
  status: $("status"),
  stage: $("stage"),
  view: $("view"),
  video: $("video"),
  reject: $("btn-reject"),
  reset: $("btn-reset"),
};

// Models and fonts start loading right away; the camera waits for a click.
let modelsPromise = null;
function loadModels() {
  modelsPromise ??= Promise.all([FaceDetector.create(), PersonSegmenter.create()]);
  return modelsPromise;
}
loadModels().catch(() => {}); // surfaced (and retried) when the user clicks start
const fontsPromise = Promise.all([
  document.fonts.load(`${config.TEXT_SIZE}px ${config.TEXT_FONT_FAMILY}`),
  document.fonts.load(`${config.LETTER_FONT_WEIGHT} 20px ${config.LETTER_FONT_FAMILY}`),
]).catch(() => {});

class App {
  constructor(camera, detector, segmenter) {
    this.camera = camera;
    this.detector = detector;
    this.segmenter = segmenter;
    this.procCanvas = document.createElement("canvas"); // mirrored frame, processing size
    this.procCtx = this.procCanvas.getContext("2d");
    this.ctx = els.view.getContext("2d");

    this.showFps = config.SHOW_FPS;
    this.showMask = false;
    this.fpsCounter = new ui.FpsCounter();
    this.smoother = new ui.BoxSmoother();
    this.headSmoother = new ui.BoxSmoother(config.HEAD_ANCHOR_SMOOTHING); // smooths [headTopY]
    this.machine = new StateMachine();
    this.label = new ui.QuestionLabel();

    this.lastFace = null;
    this.lastMask = null;
    this.maskAge = Infinity; // frames since lastMask was computed
    this.frameIndex = 0;
    this.eraseStart = null;  // when people started fading out (REJECTED)

    this.running = true;
    this.lastVideoTime = -1;
    this.videoSize = [0, 0];
    this.warned = false;
    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
  }

  /** (Re)size everything to the camera's current resolution (it can change on rotation). */
  resize() {
    const vw = this.camera.width, vh = this.camera.height;
    const s = Math.min(1, config.PROCESS_MAX_SIDE / Math.max(vw, vh));
    this.W = Math.round(vw * s);
    this.H = Math.round(vh * s);
    this.procCanvas.width = this.W;
    this.procCanvas.height = this.H;
    els.view.width = this.W * config.RENDER_SCALE;
    els.view.height = this.H * config.RENDER_SCALE;
    this.ctx.setTransform(config.RENDER_SCALE, 0, 0, config.RENDER_SCALE, 0, 0);
    this.renderer = new LetterRenderer(this.W, this.H);
    this.reveal = new RippleReveal(this.W, this.H);
    this.eraser = new HumanEraser(this.W, this.H);
    this.letteringActive = false;
    this.headSmoother.reset();
    this.lastMask = null;
    this.maskAge = Infinity;
    this.videoSize = [vw, vh];
  }

  tick() {
    if (!this.running) return;
    requestAnimationFrame(this.tick);
    const v = els.video;
    // Only process new camera frames.
    if (v.readyState < 2 || v.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = v.currentTime;
    if (v.videoWidth !== this.videoSize[0] || v.videoHeight !== this.videoSize[1]) this.resize();
    try {
      this.step();
    } catch (err) {
      if (!this.warned) console.error(err);
      this.warned = true;
    }
  }

  step() {
    const { W, H } = this;
    const p = this.procCtx;
    if (config.MIRROR) p.setTransform(-1, 0, 0, 1, W, 0);
    p.drawImage(els.video, 0, 0, W, H);
    p.setTransform(1, 0, 0, 1, 0, 0);
    const frame = this.procCanvas;

    // The segmenter initializes lazily on first use (a noticeable hitch);
    // do that now rather than when the ripple starts.
    if (!this.segmenterWarm) {
      this.segmenter.segment(frame);
      this.segmenterWarm = true;
    }

    // Which model runs this frame. In LETTERED/REJECTED (mask needed) face
    // detection and segmentation alternate (MASK_INTERLEAVE). Elsewhere it's
    // face detection, except every PLATE_SAMPLE_FRAMES frames a segmentation
    // sample feeds the background plate instead. Skipped models reuse their
    // last result.
    this.frameIndex++;
    this.maskAge++;
    let freshMask = false;
    const segment = () => {
      this.lastMask = this.segmenter.segment(frame);
      this.maskAge = 0;
      freshMask = true;
    };
    const prev = this.machine.state;
    const maskState = prev === State.LETTERED || prev === State.REJECTED;
    let segmentTurn, detectTurn;
    if (this.showMask || (maskState && !config.MASK_INTERLEAVE)) {
      segmentTurn = detectTurn = true;
    } else if (maskState) {
      segmentTurn = this.frameIndex % 2 === 1;
      detectTurn = !segmentTurn;
    } else {
      segmentTurn = this.frameIndex % config.PLATE_SAMPLE_FRAMES === 0;
      detectTurn = !segmentTurn;
    }
    if (segmentTurn) segment();

    const face = detectTurn ? this.detector.largestFace(frame) : this.lastFace;
    this.lastFace = face;
    if (face) this.smoother.update(ui.squareBox(face));
    const now = performance.now() / 1000;
    let state = this.machine.update(face !== null, now);
    this.label.update(state, now);
    if (state === State.CONFIRMING && this.label.finished(now)) {
      this.machine.finishConfirming(now);
      state = this.machine.state;
      this.label.update(state, now);
    }

    // The box holds its last position through brief dropouts until
    // the state machine gives up on the face.
    if (state === State.IDLE) this.smoother.reset();

    // Entering LETTERED starts the ripple; leaving it for any reason
    // (face lost, 'r', 'n') resets so the next visit starts fresh.
    const lettered = state === State.LETTERED && this.smoother.state !== null;
    if (lettered && !this.letteringActive) {
      this.reveal.start(now);
      this.letteringActive = true;
    } else if (!lettered && this.letteringActive) {
      this.renderer.reset();
      this.reveal.reset();
      this.letteringActive = false;
    }

    // "not human": once "no" is typed, people fade out of the video.
    const rejected = state === State.REJECTED && this.smoother.state !== null;
    if (rejected && this.eraseStart === null && this.label.finished(now)) this.eraseStart = now;
    if (!rejected) this.eraseStart = null;
    const erasing = this.eraseStart !== null;
    if (!lettered && !erasing) this.headSmoother.reset();

    // A mask at most one frame old for whatever needs it this frame.
    const needMask = this.showMask || lettered || rejected;
    if (needMask && this.maskAge > 1) segment();
    const mask = needMask ? this.lastMask : null;

    // Keep learning the background plate from every fresh mask.
    if (freshMask) {
      this.eraser.setMask(this.lastMask);
      this.eraser.cut(frame);
      this.eraser.learn();
    } else if (erasing) {
      this.eraser.setMask(mask);
      this.eraser.cut(frame);
    }

    const ctx = this.ctx;
    const size = [W, H];
    if (this.showMask) {
      ctx.drawImage(frame, 0, 0, W, H);
      drawMaskOverlay(ctx, mask, W, H);
    } else if (erasing) {
      ctx.drawImage(frame, 0, 0, W, H);
      this.eraser.draw(ctx, frame, (now - this.eraseStart) / config.ERASE_FADE_SECONDS);
    } else if (lettered) {
      const layer = this.renderer.render(frame, mask);
      // During the ripple the layer is cut to a circle; show video around it.
      if (this.reveal.apply(this.renderer.layerCtx, this.smoother.state.slice(0, 2), now)) {
        ctx.drawImage(frame, 0, 0, W, H);
      }
      ctx.drawImage(layer, 0, 0, W, H);
    } else {
      ctx.drawImage(frame, 0, 0, W, H);
    }

    if (lettered || erasing) {
      // No box: the lettered (or erased) body replaces it. The label rides on
      // the top of the head, gliding there from the old box top.
      const [cx, boxTop] = ui.boxAnchor(this.smoother.state);
      if (this.headSmoother.state === null) this.headSmoother.update([boxTop]);
      const [, headY] = ui.headAnchor(mask, this.smoother.state, H);
      const [anchorY] = this.headSmoother.update([headY]);
      this.label.draw(ctx, size, [cx, anchorY], now);
    } else if (state !== State.IDLE && this.smoother.state !== null) {
      ui.drawFaceBox(ctx, this.smoother.state);
      this.label.draw(ctx, size, ui.boxAnchor(this.smoother.state), now);
    }

    const fps = this.fpsCounter.tick();
    if (this.showFps) ui.drawFps(ctx, fps);
  }

  reject() {
    this.machine.reject();
  }

  resetAll() {
    this.machine.reset();
    this.smoother.reset();
  }

  stop() {
    this.running = false;
    this.camera.close();
  }
}

let app = null;

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.classList.toggle("error", isError);
}

function showStart(message = "", isError = false) {
  els.stage.hidden = true;
  els.start.hidden = false;
  els.startBtn.disabled = false;
  els.startBtn.textContent = isError ? "try again" : "turn on camera";
  setStatus(message, isError);
}

async function start() {
  els.startBtn.disabled = true;
  setStatus("starting camera…");
  const camera = new Camera(els.video);
  try {
    await camera.open();
  } catch (err) {
    console.error(err);
    showStart(cameraErrorMessage(err), true);
    return;
  }

  setStatus("loading models…");
  let detector, segmenter;
  try {
    [detector, segmenter] = await loadModels();
  } catch (err) {
    console.error(err);
    modelsPromise = null; // allow a retry
    camera.close();
    showStart("couldn't load the face models. check your internet connection and try again.", true);
    return;
  }
  await fontsPromise;

  els.start.hidden = true;
  els.stage.hidden = false;
  app = new App(camera, detector, segmenter);
  window.app = app; // handy for poking at state from the dev console
}

function stop() {
  app?.stop();
  app = null;
  showStart("camera off.");
}

els.startBtn.addEventListener("click", start);
els.reject.addEventListener("click", () => app?.reject());
els.reset.addEventListener("click", () => app?.resetAll());

document.addEventListener("keydown", (e) => {
  if (!app || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  switch (e.key.toLowerCase()) {
    case "q": stop(); break;
    case "f": app.showFps = !app.showFps; break;
    case "d": app.showMask = !app.showMask; break;
    case "n": app.reject(); break;
    case "r": app.resetAll(); break;
  }
});
