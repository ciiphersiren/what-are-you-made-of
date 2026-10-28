"""Download the MediaPipe .tflite models into models/ and the label font into fonts/.

Usage:  python scripts/download_models.py [--force]
"""

import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

BASE = "https://storage.googleapis.com/mediapipe-models"
FILES = {
    ROOT / "models" / "blaze_face_short_range.tflite":
        f"{BASE}/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite",
    ROOT / "models" / "selfie_segmenter.tflite":
        f"{BASE}/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
    # Typewriter-style font (Apache 2.0, Google Fonts).
    ROOT / "fonts" / "SpecialElite-Regular.ttf":
        "https://github.com/google/fonts/raw/main/apache/specialelite/SpecialElite-Regular.ttf",
}


def download(url, dest):
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(url) as resp, open(tmp, "wb") as f:
        f.write(resp.read())
    tmp.replace(dest)


def main():
    force = "--force" in sys.argv
    for dest, url in FILES.items():
        dest.parent.mkdir(exist_ok=True)
        name = dest.relative_to(ROOT)
        if dest.exists() and not force:
            print(f"[skip] {name} already exists")
            continue
        print(f"[get ] {name} ...", end=" ", flush=True)
        download(url, dest)
        print(f"{dest.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
