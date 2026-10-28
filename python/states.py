"""State machine: IDLE -> DETECTED -> CONFIRMING -> LETTERED, plus REJECTED.

Run standalone to simulate a sequence:  python states.py
"""

import time
from enum import Enum

import config


class State(Enum):
    IDLE = "IDLE"              # no face, plain video
    DETECTED = "DETECTED"      # face found, waiting for it to be stable
    CONFIRMING = "CONFIRMING"  # typewriter: "no" -> deleted, ":(" typed
    LETTERED = "LETTERED"      # person drawn as letters
    REJECTED = "REJECTED"      # manual 'n' override: "yes" deleted


class StateMachine:
    def __init__(self, verbose=True):
        self.verbose = verbose
        self.state = State.IDLE
        self.entered_at = time.perf_counter()
        self.last_face_at = None

    def _go(self, new_state, now):
        if new_state is self.state:
            return
        if self.verbose:
            print(f"[state] {self.state.value} -> {new_state.value}")
        self.state = new_state
        self.entered_at = now

    def time_in_state(self, now=None):
        now = time.perf_counter() if now is None else now
        return now - self.entered_at

    def update(self, face_present, now=None):
        """Advance the machine for one frame. Returns the current state."""
        now = time.perf_counter() if now is None else now

        if face_present:
            self.last_face_at = now
        elif (self.state is not State.IDLE and self.last_face_at is not None
              and now - self.last_face_at > config.LOST_TIMEOUT):
            self._go(State.IDLE, now)
            self.last_face_at = None
            return self.state

        if self.state is State.IDLE:
            if face_present:
                self._go(State.DETECTED, now)
        elif self.state is State.DETECTED:
            if self.time_in_state(now) >= config.CONFIRM_SECONDS:
                self._go(State.CONFIRMING, now)
        # CONFIRMING exits via finish_confirming() when the animation is done.
        # LETTERED and REJECTED only exit via face loss or reset.
        return self.state

    def finish_confirming(self, now=None):
        """Called when the typewriter animation ends: CONFIRMING -> LETTERED."""
        if self.state is State.CONFIRMING:
            self._go(State.LETTERED, time.perf_counter() if now is None else now)

    def reject(self, now=None):
        """'n' key: declare "not human". Only meaningful while a face is tracked."""
        if self.state is not State.IDLE:
            self._go(State.REJECTED, time.perf_counter() if now is None else now)

    def reset(self, now=None):
        """'r' key: back to IDLE; a visible face restarts the sequence next frame."""
        self._go(State.IDLE, time.perf_counter() if now is None else now)
        self.last_face_at = None


if __name__ == "__main__":
    sm = StateMachine()
    t = 0.0
    dt = 0.05

    def run(seconds, face):
        global t
        for _ in range(int(seconds / dt)):
            t += dt
            sm.update(face, t)

    print("face appears and stays");      run(config.CONFIRM_SECONDS + 0.5, True)
    print("animation finishes");          sm.finish_confirming(t)
    print("brief dropout (tolerated)");   run(config.LOST_TIMEOUT / 2, False); run(0.5, True)
    print("face lost");                   run(config.LOST_TIMEOUT + 0.2, False)
    print("face back, then 'n'");         run(0.5, True); sm.reject(t)
    print("'r' reset with face visible"); sm.reset(t); run(0.2, True)
