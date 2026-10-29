<div align="center">

# what are you made of?

**humans are made of words, not flesh. this is just a little mirror.**

[**→ try it**](https://ciiphersiren.github.io/are-you-human/)

<!-- demo gif goes here:
<img src="docs/demo.gif" alt="someone types 'guilt', a box finds their face, 'are you human? yes no' appears, 'no' is deleted, and their body dissolves into the word 'guilt'" width="640">
-->

*runs entirely in your browser. no video ever leaves your device.*

</div>

---

It asks you first.

```
what are you made up of?  ____________
```

You type something. *stardust.* *guilt.* *my mother's hands.* *चाय.* *🌊.*
Then the camera turns on, and a box finds your face.

```
are you human?  yes  no
```

It waits. Eight seconds is a long time to be looked at.

Then, one keystroke at a time, it deletes **no** and types its answer for you:

```
are you human?  yes:(
```

…and your body comes apart into your own words, rippling out from your face.
Every part of you the camera can see is rewritten as what you said you were,
repeated, flowing unbroken through the shape of you:

```
                 guilt guilt
              guilt guilt guilt
             ilt guilt guilt gu
          guilt guilt guilt guilt g
       uilt guilt guilt guilt guilt gui
```

The letters take their color from you: your skin, your shirt, the light on
your face. Move, and the words move with you.

Can't think of anything? There's an example at the bottom of the page:
*its your fault.*

## refusing

Disagree with the machine? Press **not human**. It deletes "yes" instead, and
then you're gone. Not rewritten, gone: every person in the frame fades out of
the video, and the room behind them takes their place. The question stays,
floating where your head was.

## sending it to someone

Once you've turned into words, **share** copies a link with your answer in it.
Whoever opens it skips the question and becomes what you are:

```
ciiphersiren.github.io/are-you-human/?text=stardust
```

## controls

| | | |
|:-:|---|---|
| **n** | *not human* | refuse the answer, and disappear |
| **r** | *reset* | back to the question, for the next person |
| | *share* | copy a link to your answer |
| **d** | | see what the machine sees: the body mask |
| **f** | | frames per second |
| **q** | | turn the camera off |

On a phone, the buttons under the video do the same.

## how it works

Everything happens on your device, live, about 20 to 50 times a second.

- **Finding you.** Google's [MediaPipe](https://ai.google.dev/edge/mediapipe)
  runs two small neural networks in the browser via WebAssembly: one finds
  faces, the other draws an outline of every person in view.
- **Becoming words.** The frame is cut into a grid of about 80 × 36 cells.
  Any cell that's mostly *you* gets a character, read left to right, top to
  bottom, skipping everything that isn't you, so your answer flows through
  your silhouette like water through a mold. Each glyph is pre-drawn once,
  then stamped and tinted on the GPU, thousands per frame.
- **Any language.** Text is split into what you'd call characters ("कि",
  "క్ష", "👩‍🚀"), not raw code points, so every script lands one glyph per
  cell, each one measured and fitted so nothing overlaps.
- **Disappearing.** While you sit there, the app quietly memorizes the room
  behind you from every part of the frame you're not covering. When you
  choose *not human*, it paints that memory back over you. Anywhere it never
  got to see, it fills with a smear of the surroundings.

No server, no uploads, no analytics, no build step. It's a handful of
JavaScript files and a canvas.

## running it yourself

```sh
git clone https://github.com/ciiphersiren/are-you-human.git
cd are-you-human
python -m http.server 8000     # any static server works
```

Then open <http://localhost:8000>. Cameras only work on `https://` or
`localhost`, and modules don't load from `file://`, so a local server is needed.

Everything tunable is in [`config.js`](config.js): the question, the example
answer (`PHRASE`), how long it stares at you (`QUESTION_LINGER_SECONDS`),
typing speed, grid size, colors, and more.

The original desktop prototype (OpenCV + MediaPipe, "its your fault" only)
is in [`python/`](python/), kept for reference.

<div align="center">
<br>
<sub>made with a webcam, a typewriter font, and some unresolved feelings.</sub>
</div>
