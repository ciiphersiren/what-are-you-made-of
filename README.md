# are you human?

A small webcam toy. It finds your face and asks "are you human?", then
lingers and answers for you in typewriter text: "yes:(". After that it
rewrites your body as a stream of letters that reads "its your fault" over
and over.

**Live:** https://YOUR-USERNAME.github.io/are-you-human/ <!-- replace once GitHub Pages is on -->

Everything runs in your browser: face detection and body segmentation use
[MediaPipe](https://ai.google.dev/edge/mediapipe) on your own device. No video
is uploaded anywhere.

## Controls

| Key | Button | Does |
|-----|--------|------|
| `n` | not human | say "no" instead: "yes" gets deleted, and every person fades out of the video |
| `r` | reset | start the sequence over |
| `f` | | show/hide FPS |
| `d` | | debug view: show the body mask |
| `q` | | turn the camera off |

## Run locally

It's a static site with no build step, but ES modules don't load from
`file://`, so serve the folder:

```sh
python -m http.server 8000
# open http://localhost:8000
```

Browsers only allow camera access on `https://` or `localhost`.

## Host on GitHub Pages

1. Push this repo to GitHub.
2. In **Settings → Pages**, set the source to **Deploy from a branch**, then
   pick your branch and the `/ (root)` folder.
3. Put the resulting URL in the **Live** link above.

All paths are relative, so it works under `https://<user>.github.io/<repo>/`.

## Tweaking

Everything tunable is in [`config.js`](config.js): the phrase (`PHRASE`), how
long the question lingers (`QUESTION_LINGER_SECONDS`), typing speed, letter
grid size, colors, `"dark"` or `"video"` background, and the MediaPipe
delegate (`"CPU"` by default, `"GPU"` optional).

## Python version

The original desktop version (OpenCV window) is in [`python/`](python/), kept
for reference:

```sh
cd python
pip install -r requirements.txt
python scripts/download_models.py
python main.py
```
