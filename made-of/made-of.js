// "what are you made of?" page: ask for an answer, then run the shared app
// (../app.js) with the answer as the phrase flowing through the body.
//
// The answer only ever reaches the page via textContent, input.value, canvas
// fillText and URLSearchParams, never as HTML.

import * as config from "../config.js";
import { bindKeys, launch, LaunchError, State } from "../app.js";
import { PhraseLetterSource, graphemes } from "../lettering.js";
import { Typewriter } from "../ui.js";

const $ = (id) => document.getElementById(id);
const els = {
  ask: $("ask"),
  question: $("ask-question"),
  cursor: $("ask-cursor"),
  form: $("ask-form"),
  answer: $("answer"),
  goBtn: $("go-btn"),
  askStatus: $("ask-status"),
  ready: $("ready"),
  readyText: $("ready-text"),
  readyBtn: $("ready-btn"),
  readyStatus: $("ready-status"),
  stage: $("stage"),
  view: $("view"),
  video: $("video"),
  reject: $("btn-reject"),
  reset: $("btn-reset"),
  share: $("btn-share"),
};

let app = null;
let text = "";            // the current answer
let fromLink = false;     // text came from ?text=... (show the ready screen, not the question)

/** Trim, collapse whitespace, cap at MADE_OF_MAX_LENGTH graphemes. "" if nothing left. */
function normalize(raw) {
  const clean = String(raw ?? "").replace(/\s+/g, " ").trim();
  return graphemes(clean).slice(0, config.MADE_OF_MAX_LENGTH).join("").trim();
}

// --- typewriter text on the page ------------------------------------------------

let typingToken = 0;

/** Type `message` into `el` (textContent only) with the app's typewriter. */
function typeInto(el, message, { cursor = null } = {}) {
  const token = ++typingToken;
  const start = performance.now() / 1000;
  const tw = new Typewriter("", message, start, {
    startDelay: 0.15, type: config.MADE_OF_TYPE_INTERVAL, endHold: 0,
  });
  cursor?.classList.add("typing");
  return new Promise((resolve) => {
    const frame = () => {
      if (token !== typingToken) return resolve(); // superseded
      const now = performance.now() / 1000;
      el.textContent = tw.at(now)[0];
      if (tw.done(now)) {
        cursor?.classList.remove("typing");
        resolve();
      } else {
        requestAnimationFrame(frame);
      }
    };
    frame();
  });
}

// --- screens -----------------------------------------------------------------------

function setStatus(el, message, isError = false) {
  el.textContent = message;
  el.classList.toggle("error", isError);
}

function showAsk({ keepText = false, message = "", isError = false } = {}) {
  els.stage.hidden = true;
  els.ready.hidden = true;
  els.ask.hidden = false;
  els.goBtn.disabled = false;
  if (!keepText) els.answer.value = "";
  setStatus(els.askStatus, message, isError);
  typeInto(els.question, config.MADE_OF_QUESTION, { cursor: els.cursor });
  els.answer.focus({ preventScroll: true });
}

function showReady({ message = "", isError = false } = {}) {
  els.stage.hidden = true;
  els.ask.hidden = true;
  els.ready.hidden = false;
  els.readyText.textContent = text;
  els.readyBtn.disabled = false;
  els.readyBtn.textContent = isError ? "try again" : "turn on camera";
  setStatus(els.readyStatus, message, isError);
}

/** Drop ?text=... from the address bar (e.g. on reset), without reloading. */
function clearUrlText() {
  const url = new URL(location.href);
  if (url.searchParams.has(config.MADE_OF_URL_PARAM)) {
    url.searchParams.delete(config.MADE_OF_URL_PARAM);
    history.replaceState(null, "", url);
  }
}

// --- running -----------------------------------------------------------------------

async function start(statusEl) {
  const button = fromLink ? els.readyBtn : els.goBtn;
  button.disabled = true;
  try {
    app = await launch({
      view: els.view,
      video: els.video,
      letters: { source: new PhraseLetterSource(text), includeLatin: false },
      text,
      onStateChange: (state) => { els.share.hidden = state !== State.LETTERED; },
      status: (m) => setStatus(statusEl, m),
    });
  } catch (err) {
    const message = err instanceof LaunchError ? err.message : "something went wrong. reload and try again.";
    if (fromLink) showReady({ message, isError: true });
    else { setStatus(els.askStatus, message, true); els.goBtn.disabled = false; }
    return;
  }
  els.ask.hidden = true;
  els.ready.hidden = true;
  els.share.hidden = true;
  els.stage.hidden = false;
}

function stopApp() {
  app?.stop();
  app = null;
}

/** 'q': camera off, back to where the answer came from. */
function stop() {
  stopApp();
  if (fromLink) showReady({ message: "camera off." });
  else showAsk({ keepText: true, message: "camera off." });
}

/** 'r' / reset: a new person gets to type their own answer. */
function reset() {
  stopApp();
  fromLink = false;
  text = "";
  clearUrlText();
  showAsk();
}

// --- share -------------------------------------------------------------------------

function shareUrl() {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set(config.MADE_OF_URL_PARAM, text); // encodes safely
  return url.href;
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // Older browsers / no clipboard permission: the textarea + execCommand fallback.
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.className = "offscreen";
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

let shareTimer = 0;
els.share.addEventListener("click", async () => {
  const url = shareUrl();
  const ok = await copyText(url);
  if (!ok) window.prompt("copy this link:", url);
  els.share.textContent = ok ? "link copied" : "share";
  clearTimeout(shareTimer);
  shareTimer = setTimeout(() => { els.share.textContent = "share"; }, 1800);
});

// --- wiring ------------------------------------------------------------------------

// Cap the answer while typing (by graphemes, so emoji and Indic text count right).
els.answer.addEventListener("input", () => {
  const parts = graphemes(els.answer.value);
  if (parts.length > config.MADE_OF_MAX_LENGTH) {
    els.answer.value = parts.slice(0, config.MADE_OF_MAX_LENGTH).join("");
  }
});

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (app) return;
  const answer = normalize(els.answer.value);
  if (!answer) {
    els.answer.value = "";
    els.askStatus.classList.remove("error");
    typeInto(els.askStatus, config.MADE_OF_EMPTY_REPLY);
    els.answer.focus();
    return;
  }
  text = answer;
  fromLink = false;
  start(els.askStatus); // this click/Enter is what triggers the camera prompt
});

els.readyBtn.addEventListener("click", () => start(els.readyStatus));
els.reject.addEventListener("click", () => app?.reject());
els.reset.addEventListener("click", reset);
bindKeys(() => app, { stop, reset });

// A shared link (?text=...) skips the question; the camera still waits for a tap.
const fromParam = normalize(new URLSearchParams(location.search).get(config.MADE_OF_URL_PARAM));
if (fromParam) {
  text = fromParam;
  fromLink = true;
  showReady();
} else {
  clearUrlText(); // e.g. ?text= with only spaces
  showAsk();
}
