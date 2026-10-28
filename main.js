// "are you human?" page: start screen and buttons. The app itself is in app.js.
// Keys: q = stop camera, n = "not human", r = reset, f = toggle FPS, d = debug mask view

import * as config from "./config.js";
import { bindKeys, launch, LaunchError } from "./app.js";
import { typeInto } from "./ui.js";

const $ = (id) => document.getElementById(id);
const els = {
  start: $("start"),
  title: $("title"),
  titleCursor: $("title-cursor"),
  startBtn: $("start-btn"),
  status: $("status"),
  stage: $("stage"),
  view: $("view"),
  video: $("video"),
  reject: $("btn-reject"),
  reset: $("btn-reset"),
};

let app = null;

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.classList.toggle("error", isError);
}

function showStart(message = "", isError = false) {
  els.stage.hidden = true;
  els.start.hidden = false;
  typeInto(els.title, config.QUESTION, { cursor: els.titleCursor });
  els.startBtn.disabled = false;
  els.startBtn.textContent = isError ? "try again" : "turn on camera";
  setStatus(message, isError);
}

async function start() {
  els.startBtn.disabled = true;
  try {
    app = await launch({ view: els.view, video: els.video, status: setStatus });
  } catch (err) {
    showStart(err instanceof LaunchError ? err.message : "something went wrong. reload and try again.", true);
    return;
  }
  els.start.hidden = true;
  els.stage.hidden = false;
}

function stop() {
  app?.stop();
  app = null;
  showStart("camera off.");
}

els.startBtn.addEventListener("click", start);
els.reject.addEventListener("click", () => app?.reject());
els.reset.addEventListener("click", () => app?.resetAll());
bindKeys(() => app, { stop, reset: () => app.resetAll() });

showStart();
