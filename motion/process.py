"""Stage 4 — Smooth pose trajectories while preserving choreographic phrasing.

A Savitzky-Golay filter removes high-frequency jitter without flattening the
acceleration peaks that carry the dancer's weight shifts. We deliberately use
a short window (5 frames @ 24 fps ≈ 200 ms) so pauses, snaps, and sudden
direction changes survive.

Also derives per-frame velocity, acceleration, and a stillness score that the
renderer can use to modulate dot lag and motion trails.
"""

import json
from pathlib import Path

import numpy as np
import yaml
from scipy.signal import savgol_filter


def load_config():
    with open(Path(__file__).parent.parent / "config" / "pipeline.yaml") as f:
        return yaml.safe_load(f)


def smooth_trajectories(keypoints: np.ndarray, window: int, polyorder: int) -> np.ndarray:
    """Apply Savitzky-Golay along the time axis for each keypoint and axis."""
    if keypoints.shape[0] < window:
        return keypoints
    smoothed = np.empty_like(keypoints)
    for k in range(keypoints.shape[1]):
        for axis in range(2):
            smoothed[:, k, axis] = savgol_filter(
                keypoints[:, k, axis], window_length=window, polyorder=polyorder
            )
    return smoothed


def compute_derivatives(keypoints: np.ndarray, fps: float) -> tuple[np.ndarray, np.ndarray]:
    """Per-frame velocity and acceleration magnitudes per keypoint (pixels/sec)."""
    dt = 1.0 / fps
    velocity = np.gradient(keypoints, dt, axis=0)
    acceleration = np.gradient(velocity, dt, axis=0)
    vel_mag = np.linalg.norm(velocity, axis=2)
    acc_mag = np.linalg.norm(acceleration, axis=2)
    return vel_mag, acc_mag


def stillness_score(vel_mag: np.ndarray) -> np.ndarray:
    """Per-frame stillness in [0, 1]. 1 = fully still, 0 = peak motion."""
    body_vel = vel_mag.mean(axis=1)
    p95 = np.percentile(body_vel, 95)
    if p95 < 1e-6:
        return np.ones_like(body_vel)
    normalized = np.clip(body_vel / p95, 0.0, 1.0)
    return 1.0 - normalized


def main():
    config = load_config()
    motion_cfg = config["motion"]
    project_root = Path(__file__).parent.parent

    pose_path = project_root / "pose" / "output" / "pose.json"
    out_dir = project_root / motion_cfg["output_dir"]
    out_dir.mkdir(parents=True, exist_ok=True)

    pose = json.load(open(pose_path))
    fps = pose["fps"]
    keypoints = np.array([f["keypoints"] for f in pose["frames"]], dtype=np.float32)
    scores = np.array([f["scores"] for f in pose["frames"]], dtype=np.float32)

    window = motion_cfg["smoothing"]["window"]
    polyorder = motion_cfg["smoothing"]["polyorder"]
    print(f"Smoothing {keypoints.shape[0]} frames × {keypoints.shape[1]} keypoints (window={window}, polyorder={polyorder})")
    smoothed = smooth_trajectories(keypoints, window, polyorder)

    vel_mag, acc_mag = compute_derivatives(smoothed, fps)
    stillness = stillness_score(vel_mag)

    # Sanity: how much did we change vs raw?
    delta = np.linalg.norm(smoothed - keypoints, axis=2).mean()
    print(f"Mean per-joint smoothing displacement: {delta:.2f} px (small = phrasing preserved)")
    print(f"Stillest frames: {np.argsort(stillness)[-5:][::-1].tolist()}")
    print(f"Most active frames: {np.argsort(stillness)[:5].tolist()}")

    out = {
        "fps": fps,
        "width": pose["width"],
        "height": pose["height"],
        "keypoint_names": pose["keypoint_names"],
        "smoothing": {"method": "savgol", "window": window, "polyorder": polyorder},
        "frames": [
            {
                "index": i,
                "keypoints": smoothed[i].tolist(),
                "scores": scores[i].tolist(),
                "velocity": vel_mag[i].tolist(),
                "acceleration": acc_mag[i].tolist(),
                "stillness": float(stillness[i]),
            }
            for i in range(len(smoothed))
        ],
    }

    out_path = out_dir / "motion.json"
    with open(out_path, "w") as f:
        json.dump(out, f)
    print(f"\n✓ Stage 4 complete")
    print(f"  Motion JSON: {out_path}")


if __name__ == "__main__":
    main()
