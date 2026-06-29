"""Stage 3 — Per-frame pose estimation.

Runs the chosen backend on every frame, fills in low-confidence joints by
temporal interpolation, and writes one JSON file containing the full sequence.

Output schema:
    {
        "backend": "rtmpose",
        "keypoint_names": [...],
        "fps": 23.976,
        "width": 1920, "height": 1080,
        "frames": [
            {"index": 0, "keypoints": [[x, y], ...], "scores": [...]},
            ...
        ]
    }
"""

import json
import subprocess
from pathlib import Path

import cv2
import numpy as np
import yaml
from tqdm import tqdm

from pose.backends import get_backend_with_fallback


CONFIDENCE_THRESHOLD = 0.3


def load_config():
    with open(Path(__file__).parent.parent / "config" / "pipeline.yaml") as f:
        return yaml.safe_load(f)


def get_video_meta(video_path: Path) -> tuple[int, int, float]:
    cap = cv2.VideoCapture(str(video_path))
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    cap.release()
    return w, h, fps


def interpolate_missing(keypoints: np.ndarray, scores: np.ndarray) -> np.ndarray:
    """Replace low-confidence joints with linear interpolation across time.

    keypoints: (T, K, 2)
    scores:    (T, K)
    """
    T, K, _ = keypoints.shape
    out = keypoints.copy()
    for k in range(K):
        valid = scores[:, k] >= CONFIDENCE_THRESHOLD
        if valid.sum() < 2:
            continue
        t = np.arange(T)
        for axis in range(2):
            out[:, k, axis] = np.interp(t, t[valid], keypoints[valid, k, axis])
    return out


def main():
    config = load_config()
    pose_cfg = config["pose"]
    project_root = Path(__file__).parent.parent

    trimmed = project_root / "video" / "output" / "trimmed.mp4"
    frames_dir = project_root / "video" / "output" / "frames"
    out_dir = project_root / pose_cfg["output_dir"]
    out_dir.mkdir(parents=True, exist_ok=True)

    w, h, fps = get_video_meta(trimmed)

    backend = get_backend_with_fallback(pose_cfg["fallback_order"])
    print(f"Using backend: {backend.name}")

    frame_files = sorted(frames_dir.glob("*.png"))
    T = len(frame_files)
    K = len(backend.keypoint_names)

    all_keypoints = np.zeros((T, K, 2), dtype=np.float32)
    all_scores = np.zeros((T, K), dtype=np.float32)

    print(f"Estimating pose on {T} frames...")
    for i, fp in enumerate(tqdm(frame_files)):
        img = cv2.imread(str(fp))
        kp, sc = backend.estimate(img)
        if kp.size == 0 or len(kp) == 0:
            continue
        all_keypoints[i] = kp[0]
        all_scores[i] = sc[0]

    if pose_cfg.get("interpolate_missing", True):
        print("Interpolating missing joints...")
        all_keypoints = interpolate_missing(all_keypoints, all_scores)

    out_data = {
        "backend": backend.name,
        "keypoint_names": backend.keypoint_names,
        "fps": fps,
        "width": w,
        "height": h,
        "frames": [
            {
                "index": i,
                "keypoints": all_keypoints[i].tolist(),
                "scores": all_scores[i].tolist(),
            }
            for i in range(T)
        ],
    }

    out_json = out_dir / "pose.json"
    with open(out_json, "w") as f:
        json.dump(out_data, f)
    print(f"Wrote {out_json}")

    write_pose_overlay_preview(frame_files, all_keypoints, all_scores, backend, out_dir)

    print("\n✓ Stage 3 complete")
    print(f"  Pose JSON: {out_json}")


def write_pose_overlay_preview(frame_files, keypoints, scores, backend, out_dir: Path):
    """Render skeleton overlay video for visual QC.

    This is a debug preview only — the final animation never shows the skeleton.
    """
    preview_dir = out_dir / "overlay_frames"
    preview_dir.mkdir(exist_ok=True)

    indices = np.linspace(0, len(frame_files) - 1, 12).astype(int)
    for slot, i in enumerate(indices):
        img = cv2.imread(str(frame_files[i]))
        for (x, y), s in zip(keypoints[i], scores[i]):
            if s < CONFIDENCE_THRESHOLD:
                continue
            cv2.circle(img, (int(x), int(y)), 6, (0, 255, 0), -1)
        cv2.imwrite(str(preview_dir / f"sample_{slot:02d}.png"), img)

    tile = out_dir / "preview_pose.png"
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-pattern_type", "glob",
            "-i", str(preview_dir / "sample_*.png"),
            "-vf", "scale=320:-1,tile=4x3",
            "-frames:v", "1",
            str(tile),
        ],
        check=True,
        capture_output=True,
    )
    print(f"Pose overlay preview: {tile}")


if __name__ == "__main__":
    main()
