"""Face box, question text, typewriter animation.

Run standalone to preview the animations without a camera:  python ui.py
"""

import math
import time

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

import config
from states import State


# --- FPS ----------------------------------------------------------------------

class FpsCounter:
    def __init__(self, smoothing=config.FPS_SMOOTHING):
        self.smoothing = smoothing
        self.fps = 0.0
        self.last = time.perf_counter()

    def tick(self):
        now = time.perf_counter()
        dt = now - self.last
        self.last = now
        if dt > 0:
            inst = 1.0 / dt
            self.fps = inst if self.fps == 0 else (
                self.smoothing * self.fps + (1 - self.smoothing) * inst)
        return self.fps


def draw_fps(frame, fps):
    cv2.putText(frame, f"FPS: {fps:.1f}", config.FPS_POS, config.FPS_FONT,
                config.FPS_FONT_SCALE, config.FPS_COLOR, config.FPS_THICKNESS,
                cv2.LINE_AA)


# --- Face box ---------------------------------------------------------------

def square_box(box, scale=config.FACE_BOX_SCALE):
    """Turn an (x, y, w, h) box into a square (cx, cy, side) around the same center."""
    x, y, w, h = box
    return x + w / 2, y + h / 2, max(w, h) * scale


class BoxSmoother:
    """Exponential smoothing of a square box's center and size."""

    def __init__(self, alpha=config.FACE_BOX_SMOOTHING):
        self.alpha = alpha  # weight of the new measurement (1 = no smoothing)
        self.state = None

    def update(self, square):
        if self.state is None:
            self.state = square
        else:
            a = self.alpha
            self.state = tuple(a * new + (1 - a) * old
                               for new, old in zip(square, self.state))
        return self.state

    def reset(self):
        self.state = None


def draw_face_box(frame, square, color=config.FACE_BOX_COLOR,
                  thickness=config.FACE_BOX_THICKNESS):
    cx, cy, side = square
    half = side / 2
    p1 = (int(round(cx - half)), int(round(cy - half)))
    p2 = (int(round(cx + half)), int(round(cy + half)))
    cv2.rectangle(frame, p1, p2, color, thickness, cv2.LINE_AA)


# --- Text rendering (Pillow TTF, cached as alpha masks) -----------------------

def load_font(paths, size, purpose="ui"):
    """Load the first TTF in `paths` that exists, else Pillow's built-in font."""
    for path in paths:
        if path.exists():
            print(f"[{purpose}] font: {path.name}")
            return ImageFont.truetype(str(path), size)
    print(f"[{purpose}] no TTF font found, using Pillow default "
          "(run scripts/download_models.py for the typewriter font)")
    return ImageFont.load_default(size)


class TextRenderer:
    def __init__(self, font_paths=config.TEXT_FONT_PATHS, size=config.TEXT_SIZE):
        self.font = load_font(font_paths, size)
        ascent, descent = self.font.getmetrics()
        self.height = ascent + descent
        self._cache = {}

    def width(self, text):
        return self.font.getlength(text)

    def mask(self, text):
        """Grayscale uint8 mask of the rendered text, cached per string."""
        m = self._cache.get(text)
        if m is None:
            img = Image.new("L", (math.ceil(self.width(text)) + 2, self.height))
            ImageDraw.Draw(img).text((0, 0), text, font=self.font, fill=255)
            m = np.asarray(img)
            if len(self._cache) > 64:
                self._cache.clear()
            self._cache[text] = m
        return m


_renderer = None


def get_renderer():
    global _renderer
    if _renderer is None:
        _renderer = TextRenderer()
    return _renderer


# --- Typewriter ---------------------------------------------------------------

class Typewriter:
    """Animate an edit from `old` to `new`: backspace what differs, pause, type the rest.

    Shared leading/trailing characters are kept, so "yes  no" -> "no" deletes
    "yes  " with the cursor sitting just before "no".
    """

    def __init__(self, old, new, start):
        self.start = start
        p = 0
        while p < min(len(old), len(new)) and old[p] == new[p]:
            p += 1
        s = 0
        while s < min(len(old), len(new)) - p and old[-1 - s] == new[-1 - s]:
            s += 1
        head, tail = old[:p], old[len(old) - s:]
        old_mid, new_mid = old[p:len(old) - s], new[p:len(new) - s]

        # When text is kept after the deletion, delete the word first and the
        # spaces before the kept text last ("ye  no", not "yeno").
        core = old_mid.rstrip(" ") if tail else old_mid
        spaces = old_mid[len(core):]

        # Keyframes: (time offset, text, cursor index).
        self.frames = [(0.0, old, p + len(core))]
        t = config.TYPE_START_DELAY
        for k in range(1, len(core) + 1):
            kept = core[:len(core) - k]
            self.frames.append((t, head + kept + spaces + tail, p + len(kept)))
            t += config.BACKSPACE_INTERVAL
        for k in range(1, len(spaces) + 1):
            self.frames.append((t, head + spaces[k:] + tail, p))
            t += config.BACKSPACE_INTERVAL
        if old_mid and new_mid:
            t += config.TYPE_PAUSE - config.BACKSPACE_INTERVAL
        for k in range(1, len(new_mid) + 1):
            self.frames.append((t, head + new_mid[:k] + tail, p + k))
            t += config.TYPE_INTERVAL
        self.duration = self.frames[-1][0] + config.TYPE_END_HOLD

    def at(self, now):
        """Return (text, cursor_index) at time `now`."""
        elapsed = now - self.start
        current = self.frames[0]
        for frame in self.frames:
            if frame[0] > elapsed:
                break
            current = frame
        return current[1], current[2]

    def done(self, now):
        return now - self.start >= self.duration


class QuestionLabel:
    """Tracks the answer text per state and runs the typewriter on transitions."""

    def __init__(self):
        self.answer = config.ANSWER_START
        self.cursor = None  # index into the answer, or None when no cursor
        self.typewriter = None
        self.state = None

    def update(self, state, now):
        if state is not self.state:
            self.state = state
            self.typewriter = None
            if state is State.CONFIRMING:
                self.typewriter = Typewriter(self.answer, config.ANSWER_HUMAN, now)
            elif state is State.REJECTED:
                self.typewriter = Typewriter(self.answer, config.ANSWER_REJECTED, now)
            elif state is State.LETTERED:
                self.answer = config.ANSWER_HUMAN
            else:  # IDLE, DETECTED
                self.answer = config.ANSWER_START

        self.cursor = None
        if self.typewriter is not None:
            self.answer, cursor = self.typewriter.at(now)
            if not self.typewriter.done(now):
                self.cursor = cursor

    def finished(self, now):
        """True once the current animation (if any) has played out."""
        return self.typewriter is not None and self.typewriter.done(now)

    def draw(self, frame, anchor, now):
        """Draw the label centered on anchor = (x, y), with its bottom just above y."""
        if self.state in (None, State.IDLE):
            return
        prefix = config.QUESTION + config.ANSWER_GAP
        cursor_visible = (self.cursor is not None and
                          (now - self.typewriter.start) % config.CURSOR_BLINK_PERIOD
                          < config.CURSOR_BLINK_PERIOD / 2)
        draw_label_above(frame, anchor, prefix + self.answer,
                         len(prefix) + self.cursor if cursor_visible else None)


def box_anchor(square):
    """Label anchor for a face box: center of its top edge."""
    cx, cy, side = square
    return cx, cy - side / 2


def head_anchor(mask, square, frame_h, threshold=config.LETTER_MASK_THRESHOLD,
                max_above=config.HEAD_TOP_MAX_ABOVE):
    """Label anchor at the top of the person mask, above the face.

    Finds the topmost mask row within the face box's column span. The result
    is clamped between the face box top and `max_above` box-sides above it,
    so raised hands don't pull the label up and it never covers the face.
    Falls back to the box top when the mask is empty there. `mask` may be
    any size with the frame's aspect ratio; `square` is in frame pixels.
    """
    cx, box_top = box_anchor(square)
    side = square[2]
    mh, mw = mask.shape
    scale = mh / frame_h  # mask px per frame px
    x0 = max(0, int((cx - side / 2) * scale))
    x1 = min(mw, int(math.ceil((cx + side / 2) * scale)))
    rows = np.flatnonzero(mask[:, x0:x1].max(axis=1) > threshold) if x1 > x0 else []
    if len(rows) == 0:
        return cx, box_top
    top = rows[0] / scale
    return cx, min(box_top, max(top, box_top - max_above * side))


def draw_label_above(frame, anchor, text, cursor_index=None):
    """Draw text centered above anchor = (x, y) on a translucent dark background.

    The left edge is anchored as if the widest answer were shown, so the
    question stays put while the answer is edited.
    """
    r = get_renderer()
    pad = config.TEXT_PAD
    prefix = config.QUESTION + config.ANSWER_GAP
    widest = max(r.width(prefix + a) for a in
                 (config.ANSWER_START, config.ANSWER_HUMAN, config.ANSWER_REJECTED))
    extra = pad * 2 + config.CURSOR_WIDTH + 2
    bw_anchor = int(math.ceil(widest)) + extra
    bw = int(math.ceil(r.width(text))) + extra
    bh = r.height + 2 * pad

    ax, ay = anchor
    fh, fw = frame.shape[:2]
    x1 = int(round(ax - bw_anchor / 2))
    y1 = int(round(ay - config.TEXT_MARGIN - bh))
    # Keep the label on screen.
    x1 = max(0, min(x1, fw - bw_anchor))
    y1 = max(0, min(y1, fh - bh))
    x2, y2 = min(x1 + bw, fw), min(y1 + bh, fh)

    roi = frame[y1:y2, x1:x2]
    bg = np.empty_like(roi)
    bg[:] = config.TEXT_BG_COLOR
    cv2.addWeighted(bg, config.TEXT_BG_ALPHA, roi, 1 - config.TEXT_BG_ALPHA, 0, dst=roi)

    # Alpha-blend the text mask into the ROI.
    mask = r.mask(text)
    tx, ty = pad, pad
    sub = roi[ty:ty + mask.shape[0], tx:tx + mask.shape[1]]
    m = mask[:sub.shape[0], :sub.shape[1], None].astype(np.float32) / 255.0
    color = np.array(config.TEXT_COLOR, dtype=np.float32)
    sub[:] = (sub * (1 - m) + color * m).astype(np.uint8)

    if cursor_index is not None:
        cx_ = x1 + tx + int(round(r.width(text[:cursor_index])))
        cv2.rectangle(frame, (cx_, y1 + ty), (cx_ + config.CURSOR_WIDTH - 1, y1 + ty + r.height - 1),
                      config.TEXT_COLOR, -1)


if __name__ == "__main__":
    # Preview: DETECTED -> CONFIRMING -> LETTERED, then 'n' -> REJECTED, looping.
    label = QuestionLabel()
    square = (320, 300, 180)
    script = [(State.DETECTED, 1.0), (State.CONFIRMING, None),
              (State.LETTERED, 1.5), (State.REJECTED, None), (State.REJECTED, 1.5)]
    step, step_start = 0, time.perf_counter()
    while True:
        now = time.perf_counter()
        state, hold = script[step]
        label.update(state, now)
        if (hold is None and label.finished(now)) or (hold and now - step_start >= hold):
            step, step_start = (step + 1) % len(script), now
            if step == 0:
                label = QuestionLabel()
        frame = np.full((480, 640, 3), (60, 90, 120), np.uint8)
        draw_face_box(frame, square)
        label.draw(frame, box_anchor(square), now)
        cv2.putText(frame, state.value, (10, 470), cv2.FONT_HERSHEY_SIMPLEX, 0.5,
                    (200, 200, 200), 1, cv2.LINE_AA)
        cv2.imshow("ui preview", frame)
        if cv2.waitKey(16) & 0xFF == ord("q"):
            break
    cv2.destroyAllWindows()
