"""Steady and lightly retouch a presenter clip for the round face-cam bubble.

1. Track the face in every frame (OpenCV YuNet detector; Haar cascade as fallback), smooth the path heavily (~2 s Gaussian),
   and crop a fixed-size square that follows it: the presenter stays centred without jitter.
2. Retouch with ffmpeg: edge-preserving skin smoothing blended at 50%, lifted shadows for a backlit face,
   a slightly warmer tone and light sharpening. Audio is copied through untouched.

Needs opencv-python-headless + numpy (not in requirements.txt; only used for the demo video).

    python demo/face.py ~/Desktop/2Claude.mov demo/build/presenter_clean.mp4 [yunet.onnx]

YuNet model: https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet
"""
import subprocess
import sys

import cv2
import numpy as np

SIZE = 720  # output square


def track(path, model=None):
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    yunet = cv2.FaceDetectorYN.create(model, "", (w, h), score_threshold=0.6) if model else None
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    frames, boxes = [], []
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frames.append(frame)
        box = None
        if yunet is not None:
            _, faces = yunet.detect(frame)
            if faces is not None and len(faces):
                x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])[:4]
                box = (x + fw / 2, y + fh / 2, fw)
        if box is None:
            gray = cv2.equalizeHist(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY))
            faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(90, 90))
            if len(faces):
                x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])
                box = (x + fw / 2, y + fh / 2, fw)
        boxes.append(box)
    return frames, boxes, fps


def smooth_path(boxes, sigma):
    idx = [i for i, b in enumerate(boxes) if b]
    arr = np.array([boxes[i] for i in idx], dtype=float)
    full = np.stack([np.interp(np.arange(len(boxes)), idx, arr[:, k]) for k in range(3)], axis=1)
    radius = int(sigma * 3)
    kernel = np.exp(-0.5 * (np.arange(-radius, radius + 1) / sigma) ** 2)
    kernel /= kernel.sum()
    padded = np.pad(full, ((radius, radius), (0, 0)), mode="edge")
    return np.stack([np.convolve(padded[:, k], kernel, mode="valid") for k in range(3)], axis=1), len(idx) / len(boxes)


def main(src, out, model=None):
    frames, boxes, fps = track(src, model)
    path, hit = smooth_path(boxes, sigma=fps * 0.7)
    h, w = frames[0].shape[:2]
    crop = int(np.clip(np.median(path[:, 2]) * 2.9, 320, min(h, w)))
    print(f"{len(frames)} frames · face found in {hit:.0%} · crop {crop}px square · path std x {path[:, 0].std():.1f}px")
    retouch = (
        "split[o][s];[s]bilateral=sigmaS=8:sigmaR=0.07[b];[o][b]blend=all_mode=normal:all_opacity=0.5,"
        "curves=all='0/0 0.18/0.24 0.5/0.57 1/1',eq=contrast=1.04:saturation=1.08:brightness=0.01,"
        "colorbalance=rm=0.04:gm=0.005:bm=-0.03:rh=0.02:bh=-0.02,unsharp=5:5:0.3:5:5:0,format=yuv420p"
    )
    enc = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{SIZE}x{SIZE}", "-r", str(fps), "-i", "-",
         "-i", src, "-map", "0:v", "-map", "1:a", "-vf", retouch, "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-c:a", "copy", "-shortest", out],
        stdin=subprocess.PIPE,
    )
    for frame, (cx, cy, _) in zip(frames, path):
        # Keep the eyes a little above centre so shoulders fill the bottom of the circle.
        x0 = int(np.clip(cx - crop / 2, 0, w - crop))
        y0 = int(np.clip(cy - crop * 0.44, 0, h - crop))
        tile = cv2.resize(frame[y0 : y0 + crop, x0 : x0 + crop], (SIZE, SIZE), interpolation=cv2.INTER_LANCZOS4)
        enc.stdin.write(tile.tobytes())
    enc.stdin.close()
    enc.wait()
    print(f"wrote {out}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
