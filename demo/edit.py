"""Cut the 60-second main demo from demo/build/intro.mp4 + demo/build/raw_app.mp4 (see record.py).

0-27s   intro slides (hero · why · architecture)
27-60s  live case: ask (1x) · investigation (8x) · report streams in (2x) · filed report · scroll through it

    .venv/bin/python demo/edit.py      ->  demo/build/sherlock_main.mp4
"""
import json
import pathlib
import subprocess

BUILD = pathlib.Path(__file__).resolve().parent / "build"
FONT = "/System/Library/Fonts/Supplemental/Courier New Bold.ttf"
MARKS = json.loads((BUILD / "marks.json").read_text())
TARGET_DEMO = 33.0


def segments():
    asked, report, done = MARKS["asked"], MARKS["report"], MARKS["done"]
    s0, s1 = MARKS["scroll_start"], MARKS["scroll_end"]
    investigation = report - (asked + 0.3)
    # (start, end, speed, badge)
    return [
        (max(0.0, MARKS["typed"] - 3.8), asked + 0.3, 1.0, None),
        (asked + 0.3, report, investigation / 11.0, "{:.0f}x".format(investigation / 11.0)),
        (report, done, 2.0, "2x"),
        (done, s0, 1.0, None),
        (s0, s1 + 0.4, 1.0, None),
    ]


def main():
    parts = []
    for i, (a, b, speed, badge) in enumerate(segments()):
        f = f"[1:v]trim={a:.3f}:{b:.3f},setpts=(PTS-STARTPTS)/{speed:.4f},fps=30"
        if badge:
            f += (
                f",drawbox=x=iw-252:y=96:w=196:h=64:color=0x16150f@1:t=fill"
                f",drawtext=fontfile='{FONT}':text='>> {badge}':x=w-234:y=114:fontsize=34:fontcolor=0xff4f1a"
            )
        parts.append(f"{f}[s{i}]")
    n = len(parts)
    concat = "".join(f"[s{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=0,fps=30,settb=1/30[demo]"
    intro_len = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(BUILD / "intro.mp4")]))
    offset = intro_len - 0.5
    graph = ";".join(parts + [concat, f"[0:v]fps=30,settb=1/30[intro]", f"[intro][demo]xfade=transition=fade:duration=0.5:offset={offset:.3f},format=yuv420p[v]"])
    out = BUILD / "sherlock_main.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(BUILD / "intro.mp4"), "-i", str(BUILD / "raw_app.mp4"),
         "-filter_complex", graph, "-map", "[v]", "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-movflags", "+faststart", "-t", "60", str(out)],
        check=True,
    )
    dur = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(out)]).decode().strip()
    print(f"wrote {out} ({dur}s)")
    for a, b, speed, badge in segments():
        print(f"  {a:6.1f}-{b:6.1f}s raw  x{speed:.2f}  -> {(b - a) / speed:5.1f}s {badge or ''}")


if __name__ == "__main__":
    main()
