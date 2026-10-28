"""All tunable constants live here."""

import sys
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parent

# --- Camera ---
CAMERA_INDEX = 0
FRAME_WIDTH = 640
FRAME_HEIGHT = 480
MIRROR = True
# DirectShow opens much faster than the default MSMF backend on Windows.
CAMERA_BACKEND = cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY

# --- Window ---
WINDOW_NAME = "are you human?"

# --- FPS overlay ---
SHOW_FPS = True
FPS_SMOOTHING = 0.9  # exponential moving average factor (0 = no smoothing)
FPS_POS = (10, 25)
FPS_FONT = cv2.FONT_HERSHEY_SIMPLEX
FPS_FONT_SCALE = 0.6
FPS_COLOR = (0, 255, 0)  # BGR
FPS_THICKNESS = 2

# --- Face detection ---
FACE_MIN_CONFIDENCE = 0.5

# --- Face box ---
FACE_BOX_SCALE = 1.4        # side = max(w, h) * scale; BlazeFace boxes are tight
FACE_BOX_SMOOTHING = 0.3    # weight of the newest detection (1 = no smoothing)
FACE_BOX_COLOR = (255, 255, 255)  # BGR
FACE_BOX_THICKNESS = 2

# --- State machine ---
QUESTION_LINGER_SECONDS = 8.0  # question shown this long before "no" starts erasing
TYPE_START_DELAY = 0.4    # cursor blinks in place before the first keystroke
# Time in DETECTED; the typewriter's start delay makes up the rest of the linger.
CONFIRM_SECONDS = QUESTION_LINGER_SECONDS - TYPE_START_DELAY
LOST_TIMEOUT = 1.0        # face missing longer than this -> IDLE

# --- Question text ---
QUESTION = "are you human?"
ANSWER_GAP = "  "           # between the question and the answers
ANSWER_START = "yes  no"
ANSWER_HUMAN = "yes:("
ANSWER_REJECTED = "no"
# First font that exists is used; falls back to Pillow's built-in font.
TEXT_FONT_PATHS = [
    ROOT / "fonts" / "SpecialElite-Regular.ttf",
    Path("C:/Windows/Fonts/cour.ttf"),                        # Courier New
    Path("/System/Library/Fonts/Supplemental/Courier New.ttf"),
    Path("/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf"),
]
TEXT_SIZE = 22              # font size in pixels
TEXT_COLOR = (255, 255, 255)  # BGR
TEXT_BG_COLOR = (0, 0, 0)
TEXT_BG_ALPHA = 0.6         # 0 = transparent background, 1 = solid
TEXT_PAD = 6                # padding around the text inside its background
TEXT_MARGIN = 8             # gap between the background and the top of the box / head
HEAD_TOP_MAX_ABOVE = 0.5    # LETTERED: label may sit at most this many box-sides above
                            # the face box top (stops raised hands pulling it up)
HEAD_ANCHOR_SMOOTHING = 0.3 # weight of the newest head-top measurement

# --- Typewriter animation (seconds) ---
BACKSPACE_INTERVAL = 0.15   # per deleted character
TYPE_PAUSE = 0.5            # between deleting and typing
TYPE_INTERVAL = 0.22        # per typed character
TYPE_END_HOLD = 0.4         # after the last keystroke, before the animation counts as done
CURSOR_BLINK_PERIOD = 0.5   # full on+off cycle
CURSOR_WIDTH = 2            # pixels

# --- Person segmentation ---
SEGMENT_WIDTH = 256         # frame is downscaled to this width before segmenting
                            # (the selfie model's native input is 256x256)

# --- Debug mask view ('d') ---
DEBUG_MASK_COLOR = (255, 0, 255)  # BGR
DEBUG_MASK_ALPHA = 0.5            # tint strength where mask = 1

# --- Lettering ---
LETTER_COLS = 80            # grid columns; cell width = FRAME_WIDTH // LETTER_COLS
LETTER_CELL_ASPECT = 1.6    # cell height / width (letters are taller than wide)
LETTER_FONT_PATHS = [
    Path("C:/Windows/Fonts/consolab.ttf"),                    # Consolas Bold
    Path("C:/Windows/Fonts/courbd.ttf"),                      # Courier New Bold
    Path("/System/Library/Fonts/Menlo.ttc"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"),
]
LETTER_GLYPH_PAD = 1        # px kept empty around each glyph (font size auto-fits the rest)
LETTER_MASK_THRESHOLD = 0.5 # cell gets a letter if its average mask value exceeds this
LETTER_SOURCE = "phrase"    # "phrase" (PhraseLetterSource) or "random" (RandomLetterSource)
LETTER_REFRESH_FRAMES = 6   # RandomLetterSource: re-randomize letters every N frames
PHRASE = "its your fault"   # PhraseLetterSource: text flowed through the body
PHRASE_SEPARATOR = " "      # appended between repeats so words don't run together
PHRASE_SCROLL_FRAMES = 0    # advance the phrase by 1 character every N frames (0 = static)
LETTER_COLOR_GAIN = 1.3     # brighten cell colors so dark clothes stay visible
LETTER_BACKGROUND = "dark"  # "dark" (black) or "video" (dimmed video behind letters)
LETTER_VIDEO_DIM = 0.35     # brightness of the video in "video" mode (1 = undimmed);
                            # letters share the video's colors, so undimmed they vanish

# --- Ripple-in transition when entering LETTERED ---
REVEAL_SECONDS = 0.8        # time for the wavefront to cover the whole frame
REVEAL_EDGE = 90            # px width of the soft wavefront edge
REVEAL_DOWNSCALE = 8        # reveal weights computed at 1/N resolution, then upscaled

# --- Models ---
MODELS_DIR = ROOT / "models"
FACE_MODEL_PATH = MODELS_DIR / "blaze_face_short_range.tflite"
SEGMENTER_MODEL_PATH = MODELS_DIR / "selfie_segmenter.tflite"
