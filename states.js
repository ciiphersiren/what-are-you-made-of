// State machine: IDLE -> DETECTED -> CONFIRMING -> LETTERED, plus REJECTED.
// Mirrors python/states.py. Times are in seconds.

import * as config from "./config.js";

export const State = Object.freeze({
  IDLE: "IDLE",             // no face, plain video
  DETECTED: "DETECTED",     // face found, question lingers
  CONFIRMING: "CONFIRMING", // typewriter: "no" -> deleted, ":(" typed
  LETTERED: "LETTERED",     // person drawn as letters
  REJECTED: "REJECTED",     // manual 'n' override: "yes" deleted
});

const nowSeconds = () => performance.now() / 1000;

export class StateMachine {
  constructor(verbose = true) {
    this.verbose = verbose;
    this.state = State.IDLE;
    this.enteredAt = nowSeconds();
    this.lastFaceAt = null;
  }

  _go(newState, now) {
    if (newState === this.state) return;
    if (this.verbose) console.log(`[state] ${this.state} -> ${newState}`);
    this.state = newState;
    this.enteredAt = now;
  }

  timeInState(now = nowSeconds()) {
    return now - this.enteredAt;
  }

  /** Advance the machine for one frame. Returns the current state. */
  update(facePresent, now = nowSeconds()) {
    if (facePresent) {
      this.lastFaceAt = now;
    } else if (this.state !== State.IDLE && this.lastFaceAt !== null &&
               now - this.lastFaceAt > config.LOST_TIMEOUT) {
      this._go(State.IDLE, now);
      this.lastFaceAt = null;
      return this.state;
    }

    if (this.state === State.IDLE) {
      if (facePresent) this._go(State.DETECTED, now);
    } else if (this.state === State.DETECTED) {
      if (this.timeInState(now) >= config.CONFIRM_SECONDS) this._go(State.CONFIRMING, now);
    }
    // CONFIRMING exits via finishConfirming() when the animation is done.
    // LETTERED and REJECTED only exit via face loss or reset.
    return this.state;
  }

  /** Called when the typewriter animation ends: CONFIRMING -> LETTERED. */
  finishConfirming(now = nowSeconds()) {
    if (this.state === State.CONFIRMING) this._go(State.LETTERED, now);
  }

  /** 'n' key: declare "not human". Only meaningful while a face is tracked. */
  reject(now = nowSeconds()) {
    if (this.state !== State.IDLE) this._go(State.REJECTED, now);
  }

  /** 'r' key: back to IDLE; a visible face restarts the sequence next frame. */
  reset(now = nowSeconds()) {
    this._go(State.IDLE, now);
    this.lastFaceAt = null;
  }
}
