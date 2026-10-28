// FaceDetector + PersonSegmenter wrappers (MediaPipe Tasks Vision for Web).
// Mirrors python/detection.py.

import * as config from "./config.js";

let visionPromise = null;

/** Load the tasks-vision bundle and WASM fileset once (shared by both tasks). */
function loadVision() {
  visionPromise ??= (async () => {
    const mod = await import(config.TASKS_VISION_URL);
    const fileset = await mod.FilesetResolver.forVisionTasks(config.WASM_URL);
    return { mod, fileset };
  })();
  return visionPromise;
}

/** Create a task with the configured delegate, falling back to CPU if GPU fails. */
async function createTask(TaskClass, fileset, options) {
  const withDelegate = (delegate) => ({
    ...options,
    baseOptions: { ...options.baseOptions, delegate },
  });
  try {
    return await TaskClass.createFromOptions(fileset, withDelegate(config.DELEGATE));
  } catch (err) {
    if (config.DELEGATE === "CPU") throw err;
    console.warn(`[detection] ${config.DELEGATE} delegate failed, using CPU`, err);
    return TaskClass.createFromOptions(fileset, withDelegate("CPU"));
  }
}

/** Shared bits for MediaPipe tasks in VIDEO mode. */
class VideoTask {
  constructor(task) {
    this.task = task;
    this.lastTs = -1;
  }

  timestampMs() {
    // VIDEO mode requires strictly increasing timestamps.
    let ts = Math.floor(performance.now());
    if (ts <= this.lastTs) ts = this.lastTs + 1;
    this.lastTs = ts;
    return ts;
  }

  close() {
    this.task.close();
  }
}

/** Face Detector in VIDEO mode. Boxes are [x, y, w, h] in source pixels. */
export class FaceDetector extends VideoTask {
  static async create() {
    const { mod, fileset } = await loadVision();
    return new FaceDetector(await createTask(mod.FaceDetector, fileset, {
      baseOptions: { modelAssetPath: config.FACE_MODEL_URL },
      runningMode: "VIDEO",
      minDetectionConfidence: config.FACE_MIN_CONFIDENCE,
    }));
  }

  detect(source) {
    const result = this.task.detectForVideo(source, this.timestampMs());
    return result.detections.map(({ boundingBox: b }) => [b.originX, b.originY, b.width, b.height]);
  }

  /** Box of the largest face, or null. */
  largestFace(source) {
    let best = null;
    for (const box of this.detect(source)) {
      if (!best || box[2] * box[3] > best[2] * best[3]) best = box;
    }
    return best;
  }
}

/**
 * Image Segmenter (selfie model) run on a downscaled frame.
 * segment() returns { data: Float32Array, width, height } — person confidence
 * in [0, 1] at SEGMENT_WIDTH wide, same aspect as the source.
 */
export class PersonSegmenter extends VideoTask {
  static async create() {
    const { mod, fileset } = await loadVision();
    return new PersonSegmenter(await createTask(mod.ImageSegmenter, fileset, {
      baseOptions: { modelAssetPath: config.SEGMENTER_MODEL_URL },
      runningMode: "VIDEO",
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    }));
  }

  constructor(task) {
    super(task);
    this.small = document.createElement("canvas");
    this.smallCtx = this.small.getContext("2d");
  }

  segment(source) {
    const w = config.SEGMENT_WIDTH;
    const h = Math.max(1, Math.round(source.height * w / source.width));
    if (this.small.width !== w || this.small.height !== h) {
      this.small.width = w;
      this.small.height = h;
    }
    this.smallCtx.drawImage(source, 0, 0, w, h);
    let mask = null;
    // Callback form avoids an extra copy; the mask is only valid inside it.
    this.task.segmentForVideo(this.small, this.timestampMs(), (result) => {
      const m = result.confidenceMasks[0];
      mask = { data: m.getAsFloat32Array().slice(), width: m.width, height: m.height };
    });
    return mask;
  }
}

let overlayCanvas = null;

/** Tint where the person mask is (debug view). Draws in frame coordinates. */
export function drawMaskOverlay(ctx, mask, frameW, frameH,
                                color = config.DEBUG_MASK_COLOR, alpha = config.DEBUG_MASK_ALPHA) {
  overlayCanvas ??= document.createElement("canvas");
  if (overlayCanvas.width !== mask.width || overlayCanvas.height !== mask.height) {
    overlayCanvas.width = mask.width;
    overlayCanvas.height = mask.height;
  }
  const octx = overlayCanvas.getContext("2d");
  const img = octx.createImageData(mask.width, mask.height);
  const px = img.data;
  for (let i = 0, j = 0; i < mask.data.length; i++, j += 4) {
    px[j] = color[0];
    px[j + 1] = color[1];
    px[j + 2] = color[2];
    px[j + 3] = mask.data[i] * alpha * 255;
  }
  octx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(overlayCanvas, 0, 0, frameW, frameH);
}
