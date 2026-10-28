// Webcam open/close via getUserMedia (mirrors python/camera.py).
// Mirroring happens when the frame is drawn to the processing canvas (main.js).

import * as config from "./config.js";

export class CameraError extends Error {
  constructor(kind, cause) {
    super(kind);
    this.kind = kind; // "insecure" | "denied" | "notfound" | "busy" | "unknown"
    this.cause = cause;
  }
}

export class Camera {
  constructor(video) {
    this.video = video;
    this.stream = null;
  }

  async open() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new CameraError("insecure");
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: config.CAMERA_IDEAL_WIDTH },
          height: { ideal: config.CAMERA_IDEAL_HEIGHT },
        },
      });
    } catch (err) {
      throw new CameraError(classify(err), err);
    }
    this.video.srcObject = this.stream;
    await this.video.play();
    if (!this.video.videoWidth) {
      await new Promise((resolve) =>
        this.video.addEventListener("loadedmetadata", resolve, { once: true }));
    }
    return this;
  }

  get width() { return this.video.videoWidth; }
  get height() { return this.video.videoHeight; }

  close() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }
}

function classify(err) {
  switch (err?.name) {
    case "NotAllowedError":
    case "SecurityError":
    case "PermissionDeniedError":
      return "denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "notfound";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "busy";
    default:
      return "unknown";
  }
}

export function cameraErrorMessage(err) {
  switch (err?.kind) {
    case "insecure":
      return "the camera only works on a secure page. open this site over https (or on localhost).";
    case "denied":
      return "camera access was blocked. allow the camera for this site in your browser settings, then try again.";
    case "notfound":
      return "no camera found. connect one (or try another device) and try again.";
    case "busy":
      return "your camera seems to be in use by another app. close that app and try again.";
    default:
      return "couldn't start the camera. reload the page and try again.";
  }
}
