<div align="center">

# are you human?

**a webcam that asks you a question, then answers it for you.**

[**→ try it**](https://ciiphersiren.github.io/are-you-human/) &nbsp;·&nbsp;
[**→ what are you made of?**](https://ciiphersiren.github.io/are-you-human/made-of/)

<!-- demo gif goes here:
<img src="docs/demo.gif" alt="a face is boxed, 'are you human? yes no' appears, 'no' is deleted, and the body dissolves into the words 'its your fault'" width="640">
-->

*runs entirely in your browser. no video ever leaves your device.*

</div>

---

You sit down. A box finds your face.

```
are you human?  yes  no
```

It waits. Eight seconds is a long time to be looked at.

Then, one keystroke at a time, it deletes **no** and types its answer for you:

```
are you human?  yes:(
```

…and your body comes apart into text, rippling out from your face. Every
part of you that the camera can see is rewritten as one sentence, repeated,
flowing unbroken through the shape of you:

```
                 its your fau
              lt its your fault
             its your fault its
          your fault its your fault
       its your fault its your fault it
```

The letters take their color from you: your skin, your shirt, the light on
your face. Move, and the sentence moves with you.

## two ways in

### [are you human?](https://ciiphersiren.github.io/are-you-human/)

The original. It asks, it decides, and it's your fault.

Disagree? Press **not human**. It deletes "yes" instead, and then
you're gone. Not lettered, gone: every person in the frame fades out of
the video, and the room behind them takes their place. The question stays,
floating where your head was.

### [what are you made of?](https://ciiphersiren.github.io/are-you-human/made-of/)

This one asks first. Type your answer (*stardust*, *guilt*, *my mother's
dreams*, *🌊*) and then become it. Any language, any script, emoji too.

Every answer gets its own link, so you can send someone what you're made of:

```
ciiphersiren.github.io/are-you-human/made-of/?text=stardust
```

## controls

| | | |
|:-:|---|---|
| **n** | *not human* | refuse the answer, and disappear |
| **r** | *reset* | start over (on *made of*: a new person, a new answer) |
| | *share* | copy a link to your answer (*made of*) |
| **d** | | see what the machine sees: the body mask |
| **f** | | frames per second |
| **q** | | turn the camera off |

On a phone, the buttons under the video do the same.

## how it works

Everything happens on your device, live, about 20 to 50 times a second.

- **Finding you.** Google's [MediaPipe](https://ai.google.dev/edge/mediapipe)
  runs two small neural networks in the browser via WebAssembly: one finds
  faces, the other draws an outline of every person in view.
- **Becoming text.** The frame is cut into a grid of about 80 × 36 cells.
  Any cell that's mostly *you* gets a character, read left to right, top to
  bottom, skipping everything that isn't you, so the sentence flows through
  your silhouette like water through a mold. Each glyph is pre-drawn once,
  then stamped and tinted on the GPU, thousands per frame.
- **Disappearing.** While you sit there, the app quietly memorizes the room
  behind you, pixel by pixel, from every part of the frame you're not
  covering. When you choose *not human*, it paints that memory back over you.
  Anywhere it never got to see, it fills with a smear of the surroundings.
- **Speaking any language.** Text is split into what you'd call characters
  ("कि", "క్ష", "👩‍🚀"), not raw code points, so every script lands one
  glyph per cell, each one measured and fitted so nothing overlaps.

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

Want it to say something else? Everything is in [`config.js`](config.js):
the sentence (`PHRASE`), how long it stares at you
(`QUESTION_LINGER_SECONDS`), typing speed, grid size, colors, and more.

There's also the original desktop prototype in [`python/`](python/)
(OpenCV + MediaPipe), kept for reference.

<div align="center">
<br>
<sub>made with a webcam, a typewriter font, and some unresolved feelings.</sub>
</div>
