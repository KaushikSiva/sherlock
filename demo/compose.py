"""Put the presenter's face-cam in a round bubble over the main demo and use their voice as the soundtrack.

    .venv/bin/python demo/compose.py path/to/presenter.mov [--offset 0.0] [--corner br|bl] [--size 380]

--offset   seconds to skip at the start of the presenter clip (e.g. the beat before you start talking)
Output:    demo/build/sherlock_demo_final.mp4  (60 s, 1080p30, H.264 + AAC, loudness-normalised)
"""
import argparse
import pathlib
import subprocess

BUILD = pathlib.Path(__file__).resolve().parent / "build"
MAIN = BUILD / "sherlock_main.mp4"
OUT = BUILD / "sherlock_demo_final.mp4"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("presenter")
    ap.add_argument("--offset", type=float, default=0.0)
    ap.add_argument("--corner", choices=["br", "bl"], default="br")
    ap.add_argument("--size", type=int, default=320)
    a = ap.parse_args()

    d = a.size  # bubble diameter
    ring = d + 14  # orange ring around it
    r, rr = d / 2, ring / 2
    margin = 56
    x = f"W-{ring}-{margin}" if a.corner == "br" else f"{margin}"
    y = f"H-{ring}-{margin + 40}"
    inset = (ring - d) // 2

    graph = ";".join(
        [
            # presenter: square crop from the centre, scale, round alpha mask
            f"[1:v]trim=start={a.offset},setpts=PTS-STARTPTS,crop='min(iw,ih)':'min(iw,ih)',scale={d}:{d}:flags=lanczos,fps=30,format=rgba,"
            f"geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lt(hypot(X-{r},Y-{r}),{r - 1}),255,0)'[face]",
            # ring: a solid signal-orange disc a little larger than the face
            f"color=c=0xff4f1a:s={ring}x{ring}:r=30,format=rgba,geq=r='255':g='79':b='26':a='if(lt(hypot(X-{rr},Y-{rr}),{rr - 1}),255,0)'[ring]",
            f"[ring][face]overlay={inset}:{inset}:shortest=1[bubble]",
            f"[0:v][bubble]overlay={x}:{y}:shortest=0:eof_action=pass,format=yuv420p[v]",
            # voice: skip the same offset, clean up, normalise to -16 LUFS
            f"[1:a]atrim=start={a.offset},asetpts=PTS-STARTPTS,highpass=f=80,acompressor=threshold=-20dB:ratio=3:attack=5:release=120,loudnorm=I=-16:TP=-1.5:LRA=11[a]",
        ]
    )
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(MAIN), "-i", a.presenter, "-filter_complex", graph,
         "-map", "[v]", "-map", "[a]", "-t", "60", "-c:v", "libx264", "-preset", "slow", "-crf", "17",
         "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(OUT)],
        check=True,
    )
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
