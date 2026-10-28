"""Webcam open/read/release, with optional mirroring.

Run standalone to test the camera:  python camera.py
"""

import cv2

import config


class Camera:
    def __init__(self, index=config.CAMERA_INDEX, width=config.FRAME_WIDTH,
                 height=config.FRAME_HEIGHT, mirror=config.MIRROR,
                 backend=config.CAMERA_BACKEND):
        self.index = index
        self.width = width
        self.height = height
        self.mirror = mirror
        self.backend = backend
        self.cap = None

    def open(self):
        self.cap = cv2.VideoCapture(self.index, self.backend)
        if not self.cap.isOpened():
            raise RuntimeError(f"Could not open camera {self.index}")
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        return self

    def read(self):
        """Return a BGR frame, or None if the read failed."""
        ok, frame = self.cap.read()
        if not ok:
            return None
        if frame.shape[1] != self.width or frame.shape[0] != self.height:
            frame = cv2.resize(frame, (self.width, self.height))
        if self.mirror:
            frame = cv2.flip(frame, 1)
        return frame

    def release(self):
        if self.cap is not None:
            self.cap.release()
            self.cap = None

    def __enter__(self):
        return self.open()

    def __exit__(self, *exc):
        self.release()


if __name__ == "__main__":
    with Camera() as cam:
        while True:
            frame = cam.read()
            if frame is None:
                break
            cv2.imshow("camera test", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    cv2.destroyAllWindows()
