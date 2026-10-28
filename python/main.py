"""Entry point: main loop and keyboard handling.

Keys: q = quit, n = "not human", r = reset, f = toggle FPS, d = debug mask view
"""

import time

import cv2

import config
import ui
from camera import Camera
from detection import FaceDetector, PersonSegmenter, draw_mask_overlay
from lettering import LetterRenderer, RippleReveal
from states import State, StateMachine


def main():
    show_fps = config.SHOW_FPS
    show_mask = False
    fps_counter = ui.FpsCounter()
    smoother = ui.BoxSmoother()
    head_smoother = ui.BoxSmoother(alpha=config.HEAD_ANCHOR_SMOOTHING)  # smooths (head_top_y,)
    machine = StateMachine()
    label = ui.QuestionLabel()
    renderer = LetterRenderer()
    reveal = RippleReveal()
    lettering_active = False

    with Camera() as cam, FaceDetector() as detector, PersonSegmenter() as segmenter:
        cv2.namedWindow(config.WINDOW_NAME)
        while True:
            frame = cam.read()
            if frame is None:
                print("Camera read failed, exiting.")
                break

            face = detector.largest_face(frame)
            if face is not None:
                smoother.update(ui.square_box(face))
            now = time.perf_counter()
            state = machine.update(face is not None, now)
            label.update(state, now)
            if state is State.CONFIRMING and label.finished(now):
                machine.finish_confirming(now)
                state = machine.state
                label.update(state, now)

            # The box holds its last position through brief dropouts until
            # the state machine gives up on the face.
            if state is State.IDLE:
                smoother.reset()

            # Entering LETTERED starts the ripple; leaving it for any reason
            # (face lost, 'r', 'n') resets so the next visit starts fresh.
            lettered = state is State.LETTERED and smoother.state is not None
            if lettered and not lettering_active:
                reveal.start(now)
                lettering_active = True
            elif not lettered and lettering_active:
                renderer.reset()
                reveal.reset()
                head_smoother.reset()
                lettering_active = False

            # Only segment when something needs the mask (it costs FPS).
            mask = segmenter.segment(frame) if (show_mask or lettered) else None

            if show_mask:
                out = frame
                draw_mask_overlay(out, mask)
            elif lettered:
                face_center = smoother.state[:2]
                out = reveal.apply(frame, renderer.render(frame, mask), face_center, now)
            else:
                out = frame

            if lettered:
                # No box: the lettered body replaces it. The label rides on
                # the top of the head, gliding there from the old box top.
                cx, box_top = ui.box_anchor(smoother.state)
                if head_smoother.state is None:
                    head_smoother.update((box_top,))
                _, head_y = ui.head_anchor(mask, smoother.state, frame.shape[0])
                (anchor_y,) = head_smoother.update((head_y,))
                label.draw(out, (cx, anchor_y), now)
            elif state is not State.IDLE and smoother.state is not None:
                ui.draw_face_box(out, smoother.state)
                label.draw(out, ui.box_anchor(smoother.state), now)

            fps = fps_counter.tick()
            if show_fps:
                ui.draw_fps(out, fps)

            cv2.imshow(config.WINDOW_NAME, out)

            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            if key == ord("f"):
                show_fps = not show_fps
            if key == ord("d"):
                show_mask = not show_mask
            if key == ord("n"):
                machine.reject()
            if key == ord("r"):
                machine.reset()
                smoother.reset()
            # Also quit when the window's close button is clicked.
            if cv2.getWindowProperty(config.WINDOW_NAME, cv2.WND_PROP_VISIBLE) < 1:
                break

    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
