// All tunable constants live here (mirrors python/config.py).
// Colors are CSS strings (RGB), not OpenCV BGR tuples.

// --- MediaPipe Tasks Vision (CDN, no build step) ---
const TASKS_VISION_VERSION = "1.1.1";
const TASKS_VISION_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}`;
export const TASKS_VISION_URL = `${TASKS_VISION_BASE}/vision_bundle.mjs`;
export const WASM_URL = `${TASKS_VISION_BASE}/wasm`;
const MODELS_BASE = "https://storage.googleapis.com/mediapipe-models";
export const FACE_MODEL_URL =
  `${MODELS_BASE}/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite`;
export const SEGMENTER_MODEL_URL =
  `${MODELS_BASE}/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite`;
export const DELEGATE = "CPU"; // "CPU" or "GPU" (falls back to CPU if GPU fails)

// --- Camera ---
export const CAMERA_IDEAL_WIDTH = 640;
export const CAMERA_IDEAL_HEIGHT = 480;
export const MIRROR = true;
export const PROCESS_MAX_SIDE = 640; // frames are processed at most this big (longest side)
export const RENDER_SCALE = 2;       // output canvas resolution multiplier, for crisp text

// --- FPS overlay ---
export const SHOW_FPS = true;
export const FPS_SMOOTHING = 0.9; // exponential moving average factor (0 = no smoothing)
export const FPS_POS = [10, 25];
export const FPS_FONT = "bold 15px system-ui, sans-serif";
export const FPS_COLOR = "rgb(0, 255, 0)";

// --- Face detection ---
export const FACE_MIN_CONFIDENCE = 0.5;

// --- Face box ---
export const FACE_BOX_SCALE = 1.4;     // side = max(w, h) * scale; BlazeFace boxes are tight
export const FACE_BOX_SMOOTHING = 0.3; // weight of the newest detection (1 = no smoothing)
export const FACE_BOX_COLOR = "rgb(255, 255, 255)";
export const FACE_BOX_THICKNESS = 2;

// --- State machine (seconds) ---
export const QUESTION_LINGER_SECONDS = 7.0; // question shown this long before "no" starts erasing
export const TYPE_START_DELAY = 0.4;        // cursor blinks in place before the first keystroke
// Time in DETECTED; the typewriter's start delay makes up the rest of the linger.
export const CONFIRM_SECONDS = QUESTION_LINGER_SECONDS - TYPE_START_DELAY;
export const LOST_TIMEOUT = 1.0;            // face missing longer than this -> IDLE

// --- Question text ---
export const QUESTION = "are you human?";
export const ANSWER_GAP = "  ";
export const ANSWER_START = "yes  no";
export const ANSWER_HUMAN = "yes:(";
export const ANSWER_REJECTED = "no";
export const TEXT_FONT_FAMILY = '"Special Elite", "Courier New", monospace';
export const TEXT_SIZE = 22;          // px (in processing-frame pixels)
export const TEXT_COLOR = "rgb(255, 255, 255)";
export const TEXT_BG_COLOR = "rgb(0, 0, 0)";
export const TEXT_BG_ALPHA = 0.6;     // 0 = transparent background, 1 = solid
export const TEXT_PAD = 6;            // padding around the text inside its background
export const TEXT_MARGIN = 8;         // gap between the background and the top of the box / head
export const HEAD_TOP_MAX_ABOVE = 0.5;    // LETTERED: label at most this many box-sides above the box top
export const HEAD_ANCHOR_SMOOTHING = 0.3; // weight of the newest head-top measurement

// --- Typewriter animation (seconds) ---
export const BACKSPACE_INTERVAL = 0.15;
export const TYPE_PAUSE = 0.5;
export const TYPE_INTERVAL = 0.22;
export const TYPE_END_HOLD = 0.4;
export const CURSOR_BLINK_PERIOD = 0.5;
export const CURSOR_WIDTH = 2;

// --- Person segmentation ---
export const SEGMENT_WIDTH = 256; // frame is downscaled to this width before segmenting
// In LETTERED and REJECTED (both need the mask), run face detection and
// segmentation on alternating frames, each reusing the other's last result.
// In-browser (WASM) inference costs ~16 ms (face) + ~33 ms (mask) per frame on
// a laptop CPU, which alone would cap those states near 15 FPS.
// false = run both every frame like the Python version.
export const MASK_INTERLEAVE = true;

// --- "not human": erase people from the video (REJECTED) ---
export const ERASE_FADE_SECONDS = 1.0; // people fade out after "no" is typed
export const ERASE_MASK_LOW = 0.15;    // mask values ramp low..high -> fully erased,
export const ERASE_MASK_HIGH = 0.5;    // so faint edges (hair) are erased too
export const ERASE_DILATE = 2;         // grow the mask by this many mask px (~5 frame px)
export const PLATE_LEARN_RATE = 0.15;  // how fast the background plate takes in new pixels
export const ERASE_SOLIDIFY_PASSES = 6; // hole-fill: alpha a -> 1-(1-a)^(2^passes); 6 makes a=0.07 opaque
// Outside LETTERED/REJECTED the mask isn't otherwise needed; take a sample
// every N frames (instead of that frame's face detection) to keep learning
// the background, so it's ready when "not human" is pressed.
export const PLATE_SAMPLE_FRAMES = 10;

// --- Debug mask view ('d') ---
export const DEBUG_MASK_COLOR = [255, 0, 255]; // RGB
export const DEBUG_MASK_ALPHA = 0.5;

// --- Lettering ---
export const LETTER_COLS = 80;          // grid columns along the frame's longer side
export const LETTER_CELL_ASPECT = 1.6;  // cell height / width
export const LETTER_FONT_FAMILY = '"Inconsolata", Consolas, "Courier New", monospace';
export const LETTER_FONT_WEIGHT = "700";
export const LETTER_GLYPH_PAD = 1;      // px kept empty around each glyph (font size auto-fits)
export const LETTER_MASK_THRESHOLD = 0.5;
export const LETTER_SOURCE = "phrase";  // "phrase" or "random"
export const LETTER_REFRESH_FRAMES = 6; // RandomLetterSource: re-randomize every N frames
export const PHRASE = "its your fault";
export const PHRASE_SEPARATOR = " ";
export const PHRASE_SCROLL_FRAMES = 0;  // advance the phrase 1 character every N frames (0 = static)
export const LETTER_COLOR_GAIN = 1.3;   // brighten cell colors so dark clothes stay visible
export const LETTER_BACKGROUND = "dark"; // "dark" or "video" (dimmed video behind letters)
export const LETTER_VIDEO_DIM = 0.35;

// --- Typed start-screen text (both pages) ---
export const PAGE_TYPE_DELAY = 0.15;    // pause before the first character (s)
export const PAGE_TYPE_INTERVAL = 0.06; // per typed character (s)

// --- "made of" version (made-of/) ---
export const MADE_OF_QUESTION = "what are you made up of?";
export const MADE_OF_EMPTY_REPLY = "hm. you have to be made of something.";
export const MADE_OF_MAX_LENGTH = 60;       // in graphemes (user-perceived characters)
export const MADE_OF_URL_PARAM = "text";    // made-of/?text=stardust skips the question

// --- Ripple-in transition when entering LETTERED ---
export const REVEAL_SECONDS = 0.8;
export const REVEAL_EDGE = 90; // px width of the soft wavefront edge
