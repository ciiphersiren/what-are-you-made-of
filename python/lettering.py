"""Letter renderer + LetterSource classes.

Run standalone to test with the webcam:  python lettering.py
Keys: q = quit, d = debug mask view, b = toggle background, f = FPS,
      r = replay the ripple-in from the frame center
"""

import string

import cv2
import numpy as np
from PIL import Image, ImageDraw

import config
from ui import load_font


# --- Letter sources -----------------------------------------------------------

class LetterSource:
    """Decides which character goes in each grid cell.

    Subclasses set `charset` (every character they may produce, used to build
    the glyph atlas) and implement generate(). generate() is called every
    frame; each source decides itself how often its letters actually change.
    Spaces (and any character missing from the atlas) render as empty cells.
    """

    charset = ""

    def generate(self, rows, cols, mask):
        """Return a (rows, cols) array of single characters.

        `mask` is a (rows, cols) bool array of the cells that will be drawn.
        Characters outside the mask are ignored.
        """
        raise NotImplementedError

    def reset(self):
        """Start over (called when the person leaves LETTERED)."""


class RandomLetterSource(LetterSource):
    """Random A-Z, re-randomized every `refresh_frames` frames."""

    charset = string.ascii_uppercase

    def __init__(self, refresh_frames=config.LETTER_REFRESH_FRAMES, seed=None):
        self.refresh_frames = max(1, refresh_frames)
        self.rng = np.random.default_rng(seed)
        self.chars = np.array(list(self.charset))
        self.reset()

    def reset(self):
        self.grid = None
        self.frame_count = 0

    def generate(self, rows, cols, mask):
        if (self.grid is None or self.grid.shape != (rows, cols)
                or self.frame_count % self.refresh_frames == 0):
            self.grid = self.rng.choice(self.chars, size=(rows, cols))
        self.frame_count += 1
        return self.grid


class PhraseLetterSource(LetterSource):
    """A phrase repeated through the masked cells only.

    Cells are read left to right, top to bottom, skipping cells outside the
    mask, so the text flows unbroken through the body shape. The text is laid
    out fresh every frame (the mask changes every frame). With scroll_frames
    > 0 the phrase offset advances by one character every scroll_frames frames.
    """

    def __init__(self, phrase=config.PHRASE, separator=config.PHRASE_SEPARATOR,
                 scroll_frames=config.PHRASE_SCROLL_FRAMES):
        self.sequence = np.array(list(phrase + separator))
        self.charset = "".join(sorted(set(phrase + separator)))
        self.scroll_frames = scroll_frames
        self.reset()

    def reset(self):
        self.offset = 0
        self.frame_count = 0

    def generate(self, rows, cols, mask):
        grid = np.full((rows, cols), " ")
        n = int(mask.sum())
        # Boolean indexing walks the grid in row-major order: left to right, top to bottom.
        grid[mask] = self.sequence[(np.arange(n) + self.offset) % len(self.sequence)]
        if self.scroll_frames > 0:
            self.frame_count += 1
            if self.frame_count % self.scroll_frames == 0:
                self.offset = (self.offset + 1) % len(self.sequence)
        return grid


def make_letter_source(name=config.LETTER_SOURCE):
    sources = {"phrase": PhraseLetterSource, "random": RandomLetterSource}
    if name not in sources:
        raise ValueError(f"LETTER_SOURCE must be one of {list(sources)}, got {name!r}")
    return sources[name]()


# --- Glyph atlas --------------------------------------------------------------

class GlyphAtlas:
    """Pre-rendered glyphs as float32 alpha tiles of one cell size.

    Always includes A-Z and a-z on top of the source's charset. Index 0 is a
    blank glyph, used for spaces and for cells outside the mask. All glyphs
    share one baseline so mixed-case text reads as a line.
    """

    def __init__(self, charset, cell_w, cell_h, font_paths=config.LETTER_FONT_PATHS,
                 pad=config.LETTER_GLYPH_PAD):
        drawable = set(charset) | set(string.ascii_letters)
        self.chars = [""] + sorted(c for c in drawable if not c.isspace())
        glyphs = self.chars[1:]
        font = self._fit_font(font_paths, glyphs, cell_w - 2 * pad, cell_h - 2 * pad)

        # Shared vertical placement: center the union of all glyphs' ink bounds.
        boxes = {c: font.getbbox(c) for c in glyphs}
        top = min(b[1] for b in boxes.values())
        bottom = max(b[3] for b in boxes.values())
        y = (cell_h - (bottom - top)) / 2 - top

        tiles = np.zeros((len(self.chars), cell_h, cell_w), np.float32)
        for i, c in enumerate(glyphs, start=1):
            left, _, right, _ = boxes[c]
            x = (cell_w - (right - left)) / 2 - left
            img = Image.new("L", (cell_w, cell_h))
            ImageDraw.Draw(img).text((x, y), c, font=font, fill=255)
            tiles[i] = np.asarray(img, np.float32) / 255.0
        self.tiles = tiles

        # Code point -> atlas index table, so lookups are pure numpy.
        self.table = np.zeros(max(map(ord, glyphs)) + 1, np.intp)
        for i, c in enumerate(glyphs, start=1):
            self.table[ord(c)] = i

    @staticmethod
    def _fit_font(paths, chars, max_w, max_h):
        """Largest font size at which every glyph fits in max_w x max_h, all on
        a shared baseline (height = highest ascender to lowest descender)."""
        base = load_font(paths, 100, "lettering")

        def extent(font):
            boxes = [font.getbbox(c) for c in chars]
            w = max(b[2] - b[0] for b in boxes)
            h = max(b[3] for b in boxes) - min(b[1] for b in boxes)
            return w, h

        w, h = extent(base)
        size = int(min(max_w / w, max_h / h) * 100) + 1
        while size > 1:
            font = base.font_variant(size=size)
            w, h = extent(font)
            if w <= max_w and h <= max_h:
                return font
            size -= 1
        return base.font_variant(size=1)

    def lookup(self, char_grid):
        """Map a (rows, cols) array of single characters to atlas indices (unknown -> blank)."""
        codes = np.asarray(char_grid, dtype="<U1").view(np.uint32)
        known = codes < len(self.table)
        return np.where(known, self.table[np.where(known, codes, 0)], 0)


# --- Renderer -----------------------------------------------------------------

class LetterRenderer:
    def __init__(self, source=None, frame_w=config.FRAME_WIDTH,
                 frame_h=config.FRAME_HEIGHT, cols=config.LETTER_COLS,
                 background=config.LETTER_BACKGROUND):
        self.source = source or make_letter_source()
        self.cell_w = max(1, frame_w // cols)
        self.cell_h = max(1, round(self.cell_w * config.LETTER_CELL_ASPECT))
        self.cols = frame_w // self.cell_w
        self.rows = frame_h // self.cell_h
        # The grid may not fill the frame exactly; center it.
        self.x0 = (frame_w - self.cols * self.cell_w) // 2
        self.y0 = (frame_h - self.rows * self.cell_h) // 2
        self.atlas = GlyphAtlas(self.source.charset, self.cell_w, self.cell_h)
        self.background = background

    def reset(self):
        """Start the letter source over (fresh letters / phrase offset)."""
        self.source.reset()

    def toggle_background(self):
        self.background = "video" if self.background == "dark" else "dark"

    def render(self, frame, mask):
        """Return a new image with the person drawn as letters.

        `frame` is the original BGR video frame, `mask` a float person mask
        of any size (it is resized to the grid).
        """
        rows, cols, cw, ch = self.rows, self.cols, self.cell_w, self.cell_h
        gx, gy, gw, gh = self.x0, self.y0, cols * cw, rows * ch
        region = frame[gy:gy + gh, gx:gx + gw]

        # One value per cell: average color and average mask coverage.
        colors = cv2.resize(region, (cols, rows), interpolation=cv2.INTER_AREA)
        if config.LETTER_COLOR_GAIN != 1:
            colors = cv2.convertScaleAbs(colors, alpha=config.LETTER_COLOR_GAIN)
        coverage = cv2.resize(mask, (cols, rows), interpolation=cv2.INTER_AREA)
        on = coverage > config.LETTER_MASK_THRESHOLD

        letters = self.atlas.lookup(self.source.generate(rows, cols, on))

        # Gather glyph tiles into one full-size alpha image.
        idx = np.where(on, letters, 0)
        alpha = self.atlas.tiles[idx]                      # (rows, cols, ch, cw)
        alpha = alpha.transpose(0, 2, 1, 3).reshape(gh, gw)
        color_img = cv2.resize(colors, (gw, gh), interpolation=cv2.INTER_NEAREST)

        if self.background == "video":
            out = cv2.convertScaleAbs(frame, alpha=config.LETTER_VIDEO_DIM)
        else:
            out = np.zeros_like(frame)
        base = out[gy:gy + gh, gx:gx + gw]
        out[gy:gy + gh, gx:gx + gw] = cv2.blendLinear(base, color_img, 1 - alpha, alpha)
        return out


class RippleReveal:
    """Circular wavefront from a center point that crossfades video -> letters.

    Weights are computed on a coarse grid and upscaled, so the cost is one
    small numpy op, one resize and one blend per frame, and only while the
    ripple is running.
    """

    def __init__(self, frame_w=config.FRAME_WIDTH, frame_h=config.FRAME_HEIGHT,
                 duration=config.REVEAL_SECONDS, edge=config.REVEAL_EDGE,
                 downscale=config.REVEAL_DOWNSCALE):
        self.size = (frame_w, frame_h)
        self.duration = duration
        self.edge = edge
        sw, sh = max(1, frame_w // downscale), max(1, frame_h // downscale)
        # Pixel coordinates of each coarse cell's center.
        self.xs = (np.arange(sw, dtype=np.float32) + 0.5) * frame_w / sw
        self.ys = (np.arange(sh, dtype=np.float32) + 0.5) * frame_h / sh
        self.max_dist = float(np.hypot(frame_w, frame_h))
        self.start_time = None

    def start(self, now):
        self.start_time = now

    def reset(self):
        self.start_time = None

    def running(self, now):
        return self.start_time is not None and now - self.start_time < self.duration

    def apply(self, video, lettered, center, now):
        """Blend `lettered` over `video` inside the current ripple radius."""
        if not self.running(now):
            return lettered
        t = (now - self.start_time) / self.duration
        t = 1 - (1 - t) ** 2  # ease out: fast start, gentle finish
        radius = t * (self.max_dist + self.edge)
        cx, cy = center
        dist = np.hypot(self.xs[None, :] - cx, self.ys[:, None] - cy)
        weight = np.clip((radius - dist) / self.edge, 0, 1).astype(np.float32)
        weight = cv2.resize(weight, self.size, interpolation=cv2.INTER_LINEAR)
        return cv2.blendLinear(video, lettered, 1 - weight, weight)


if __name__ == "__main__":
    import ui
    from camera import Camera
    from detection import PersonSegmenter, draw_mask_overlay

    import time

    renderer = LetterRenderer()
    reveal = RippleReveal()
    center = (config.FRAME_WIDTH / 2, config.FRAME_HEIGHT / 2)
    print(f"[lettering] grid {renderer.cols}x{renderer.rows}, "
          f"cell {renderer.cell_w}x{renderer.cell_h}px, background={renderer.background}")
    fps_counter = ui.FpsCounter()
    show_mask, show_fps = False, config.SHOW_FPS
    with Camera() as cam, PersonSegmenter() as seg:
        while True:
            frame = cam.read()
            if frame is None:
                break
            mask = seg.segment(frame)
            if show_mask:
                out = frame
                draw_mask_overlay(out, mask)
            else:
                out = reveal.apply(frame, renderer.render(frame, mask), center,
                                   time.perf_counter())
            fps = fps_counter.tick()
            if show_fps:
                ui.draw_fps(out, fps)
            cv2.imshow("lettering test", out)
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            if key == ord("d"):
                show_mask = not show_mask
            if key == ord("b"):
                renderer.toggle_background()
                print(f"[lettering] background={renderer.background}")
            if key == ord("f"):
                show_fps = not show_fps
            if key == ord("r"):
                reveal.start(time.perf_counter())
    cv2.destroyAllWindows()
