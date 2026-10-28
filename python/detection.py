"""FaceDetector + PersonSegmenter wrappers (MediaPipe Tasks API).

Run standalone to see raw face detections:  python detection.py
"""

import time

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision

import config


def _check_model(path):
    if not path.exists():
        raise FileNotFoundError(f"{path} not found. Run: python scripts/download_models.py")


def _to_mp_image(frame_bgr):
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    return mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)


class _VideoTask:
    """Shared bits for MediaPipe tasks in VIDEO mode."""

    task = None  # set by subclasses

    def __init__(self):
        self.last_ts = -1

    def _timestamp_ms(self):
        # VIDEO mode requires strictly increasing timestamps.
        ts = int(time.perf_counter() * 1000)
        if ts <= self.last_ts:
            ts = self.last_ts + 1
        self.last_ts = ts
        return ts

    def close(self):
        self.task.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


class FaceDetector(_VideoTask):
    """MediaPipe Face Detector in VIDEO mode. Returns boxes as (x, y, w, h) in pixels."""

    def __init__(self, model_path=config.FACE_MODEL_PATH,
                 min_confidence=config.FACE_MIN_CONFIDENCE):
        super().__init__()
        _check_model(model_path)
        options = vision.FaceDetectorOptions(
            base_options=BaseOptions(model_asset_path=str(model_path)),
            running_mode=vision.RunningMode.VIDEO,
            min_detection_confidence=min_confidence,
        )
        self.task = vision.FaceDetector.create_from_options(options)

    def detect(self, frame_bgr):
        """Return a list of face boxes (x, y, w, h)."""
        result = self.task.detect_for_video(_to_mp_image(frame_bgr), self._timestamp_ms())
        return [(d.bounding_box.origin_x, d.bounding_box.origin_y,
                 d.bounding_box.width, d.bounding_box.height)
                for d in result.detections]

    def largest_face(self, frame_bgr):
        """Return the box of the largest face, or None."""
        boxes = self.detect(frame_bgr)
        if not boxes:
            return None
        return max(boxes, key=lambda b: b[2] * b[3])


class PersonSegmenter(_VideoTask):
    """MediaPipe Image Segmenter (selfie model) run on a downscaled frame.

    segment() returns a float32 person-confidence mask in [0, 1] at the
    downscaled resolution (SEGMENT_WIDTH wide, same aspect as the frame).
    Callers resize it to whatever they need.
    """

    def __init__(self, model_path=config.SEGMENTER_MODEL_PATH,
                 width=config.SEGMENT_WIDTH):
        super().__init__()
        _check_model(model_path)
        options = vision.ImageSegmenterOptions(
            base_options=BaseOptions(model_asset_path=str(model_path)),
            running_mode=vision.RunningMode.VIDEO,
            output_confidence_masks=True,
            output_category_mask=False,
        )
        self.task = vision.ImageSegmenter.create_from_options(options)
        self.width = width

    def segment(self, frame_bgr):
        h, w = frame_bgr.shape[:2]
        small_size = (self.width, max(1, round(h * self.width / w)))
        small = cv2.resize(frame_bgr, small_size, interpolation=cv2.INTER_AREA)
        result = self.task.segment_for_video(_to_mp_image(small), self._timestamp_ms())
        # Copy: the view points into MediaPipe-owned memory.
        return result.confidence_masks[0].numpy_view()[..., 0].copy()


def draw_mask_overlay(frame, mask, color=config.DEBUG_MASK_COLOR,
                      alpha=config.DEBUG_MASK_ALPHA):
    """Tint the frame where the person mask is, in place."""
    h, w = frame.shape[:2]
    weight = cv2.resize(mask, (w, h), interpolation=cv2.INTER_LINEAR) * np.float32(alpha)
    tint = np.empty_like(frame)
    tint[:] = color
    # cv2.blendLinear does the per-pixel weighted blend in C++ (numpy was ~60 ms).
    frame[:] = cv2.blendLinear(frame, tint, 1 - weight, weight)


if __name__ == "__main__":
    from camera import Camera

    with Camera() as cam, FaceDetector() as det, PersonSegmenter() as seg:
        while True:
            frame = cam.read()
            if frame is None:
                break
            draw_mask_overlay(frame, seg.segment(frame))
            for x, y, w, h in det.detect(frame):
                cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 0, 255), 1)
            cv2.imshow("detection test (raw boxes + mask)", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    cv2.destroyAllWindows()
