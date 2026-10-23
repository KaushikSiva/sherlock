"""Record the Sherlock demo video at 1920x1080.

Frames come from Chrome's DevTools screencast with real timestamps (sharper than Playwright's built-in recorder),
then ffmpeg turns them into constant-30fps H.264 clips:

    demo/build/intro.mp4   slides: hero 0-7s · why 7-17s · architecture 17-27s
    demo/build/raw_app.mp4 a real Sherlock case, start to finish (≈1.5-2 min, sped up later by edit.py)
    demo/build/marks.json  timestamps of key moments in raw_app.mp4 (for the edit)

    .venv/bin/python demo/record.py intro
    .venv/bin/python demo/record.py app "Why are brake complaints up since May?"
"""
import base64
import json
import pathlib
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent
BUILD = ROOT / "build"
W, H = 1920, 1080


class Screencast:
    def __init__(self, page, name):
        self.page, self.name = page, name
        self.dir = BUILD / f"frames_{name}"
        self.dir.mkdir(parents=True, exist_ok=True)
        for f in self.dir.glob("*.jpg"):
            f.unlink()
        self.frames: list[tuple[float, str]] = []
        self.cdp = page.context.new_cdp_session(page)
        self.cdp.on("Page.screencastFrame", self._frame)

    def _frame(self, ev):
        path = self.dir / f"{len(self.frames):06d}.jpg"
        path.write_bytes(base64.b64decode(ev["data"]))
        self.frames.append((ev["metadata"]["timestamp"], path.name))
        self.cdp.send("Page.screencastFrameAck", {"sessionId": ev["sessionId"]})

    def start(self):
        self.t0 = time.time()
        self.cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 92, "maxWidth": W, "maxHeight": H, "everyNthFrame": 1})

    def now(self):
        return time.time() - self.t0

    def stop(self, out):
        self.page.wait_for_timeout(300)
        self.cdp.send("Page.stopScreencast")
        end = time.time()
        frames = self.frames
        lines = []
        for i, (ts, name) in enumerate(frames):
            nxt = frames[i + 1][0] if i + 1 < len(frames) else end
            lines.append(f"file '{name}'\nduration {max(nxt - ts, 1 / 120):.4f}")
        lines.append(f"file '{frames[-1][1]}'")
        (self.dir / "list.txt").write_text("\n".join(lines))
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(self.dir / "list.txt"),
             "-vf", f"fps=30,scale={W}:{H}:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "16", str(out)],
            check=True,
        )
        return frames[0][0] - self.t0 if frames else 0.0


def browser(p):
    b = p.chromium.launch(channel="chrome", headless=True, args=["--hide-scrollbars", "--force-device-scale-factor=1"])
    return b, b.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)


def intro(voice=False):
    with sync_playwright() as p:
        b, page = browser(p)
        page.goto((ROOT / "slides.html").as_uri() + "?manual" + ("&voice" if voice else ""))
        page.evaluate("document.fonts.ready")
        page.wait_for_timeout(800)
        cast = Screencast(page, "intro")
        cast.start()
        page.evaluate("window.go()")
        page.wait_for_timeout(41_500 if voice else 27_200)
        cast.stop(BUILD / ("intro_voice.mp4" if voice else "intro.mp4"))
        b.close()


def app(question):
    marks = {}
    with sync_playwright() as p:
        b, page = browser(p)
        page.goto("http://localhost:8420/")
        page.wait_for_timeout(1500)
        cast = Screencast(page, "app")
        cast.start()
        page.wait_for_timeout(3500)  # landing animation
        # Type the question into the hero composer so viewers see the ask.
        box = page.locator(".composer-inline textarea")
        box.click()
        box.type(question, delay=28)
        marks["typed"] = cast.now()
        page.wait_for_timeout(500)
        page.locator(".composer-inline .send").click()
        marks["asked"] = cast.now()
        page.wait_for_selector(".dash", timeout=900_000)
        marks["report"] = cast.now()
        page.wait_for_function("!document.querySelector('.composer.busy')", timeout=900_000)
        marks["done"] = cast.now()
        page.wait_for_timeout(2500)
        # Glide down through the report: verdicts (CAUSE stamp), the Anatomy bench, charts.
        stage = page.locator(".stage")
        height = page.evaluate("document.querySelector('.stage').scrollHeight")
        marks["scroll_start"] = cast.now()
        steps = 140
        for i in range(steps + 1):
            y = (height - H + 200) * (0.5 - 0.5 * __import__("math").cos(3.14159 * i / steps))
            stage.evaluate(f"el => el.scrollTo(0, {y})")
            page.wait_for_timeout(55)
        marks["scroll_end"] = cast.now()
        page.wait_for_timeout(1500)
        offset = cast.stop(BUILD / "raw_app.mp4")
        b.close()
    marks = {k: round(v - offset, 2) for k, v in marks.items()}
    (BUILD / "marks.json").write_text(json.dumps(marks, indent=2))
    print(json.dumps(marks, indent=2))


if __name__ == "__main__":
    BUILD.mkdir(parents=True, exist_ok=True)
    if sys.argv[1] == "intro":
        intro()
    elif sys.argv[1] == "intro-voice":
        intro(voice=True)
    else:
        app(sys.argv[2])
