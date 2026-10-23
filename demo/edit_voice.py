"""Cut the main demo re-timed to a narration (2Claude.mov), using word timestamps from Whisper.

Final timeline (seconds; narration offset 2.0 s):
    0     – 41.0   intro_voice.mp4 (slides with ?voice cues)
    41.0  – 46.0   ask: question typed in slow motion while it is spoken
    46.0  – 52.7   investigation (≈13x)        "you can see it working… testing each one"
    52.7  – 57.0   report streams in (3x)      "it lands on the new caliper"
    57.0  – 62.0   verdict board held           "firmware did nothing… weather, nope"
    62.0  – 69.0   scroll to the Anatomy bench  "it even shows you where on the bike"

    .venv/bin/python demo/edit_voice.py   ->  demo/build/sherlock_main_voice.mp4
"""
import json
import pathlib
import subprocess

BUILD = pathlib.Path(__file__).resolve().parent / "build"
FONT = "/System/Library/Fonts/Supplemental/Courier New Bold.ttf"
M = json.loads((BUILD / "marks.json").read_text())
INTRO_CUT = 41.0
TOTAL = 69.0
# (raw start, raw end, target end on the final timeline, badge?)
PLAN = [
    (2.4, 6.0, 46.0, False),
    (6.0, M["report"], 52.67, True),
    (M["report"], M["done"], 57.0, True),
    (M["done"], M["scroll_start"], 62.0, False),
    (M["scroll_start"], M["scroll_end"], TOTAL, False),
]


def main():
    parts, t, rows = [], INTRO_CUT, []
    for i, (a, b, end, badge) in enumerate(PLAN):
        speed = (b - a) / (end - t)
        f = f"[1:v]trim={a:.3f}:{b:.3f},setpts=(PTS-STARTPTS)/{speed:.5f},fps=30"
        if badge:
            label = f">> {speed:.0f}x"
            f += f",drawbox=x=iw-252:y=96:w=196:h=64:color=0x16150f@1:t=fill,drawtext=fontfile='{FONT}':text='{label}':x=w-234:y=114:fontsize=34:fontcolor=0xff4f1a"
        parts.append(f"{f}[s{i}]")
        rows.append(f"  {t:5.2f}-{end:5.2f}s  raw {a:6.2f}-{b:6.2f}  x{speed:.2f}")
        t = end
    n = len(parts)
    graph = ";".join(
        parts
        + [
            "".join(f"[s{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=0,fps=30,settb=1/30[demo]",
            "[0:v]fps=30,settb=1/30[intro]",
            f"[intro][demo]xfade=transition=fade:duration=0.4:offset={INTRO_CUT - 0.4:.3f},format=yuv420p[v]",
        ]
    )
    out = BUILD / "sherlock_main_voice.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(BUILD / "intro_voice.mp4"), "-i", str(BUILD / "raw_app.mp4"), "-filter_complex", graph,
         "-map", "[v]", "-t", str(TOTAL), "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-movflags", "+faststart", str(out)],
        check=True,
    )
    print(f"wrote {out}")
    print("\n".join(rows))


if __name__ == "__main__":
    main()
