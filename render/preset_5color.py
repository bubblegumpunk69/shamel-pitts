"""One-off render driver for the 5-color stack preview.

Bypasses the YAML config and injects a custom 5-layer setup, then renders
the full sequence and encodes to MP4. Used for A/B comparison only.
"""

import shutil
import subprocess
from pathlib import Path

import numpy as np
import yaml

from render.halftone import render_sequence


PROJECT = Path(__file__).parent.parent


def main():
    with open(PROJECT / "config" / "pipeline.yaml") as f:
        config = yaml.safe_load(f)
    render_cfg = config["render"]

    render_cfg["halftone"]["layers"] = [
        # hue, saturation, dx, dy, opacity. saturation=0 → white.
        {"hue": 0.00, "saturation": 0.85, "dx":   0, "dy":   0, "opacity": 0.80},  # red
        {"hue": 0.17, "saturation": 0.85, "dx": -28, "dy": -12, "opacity": 0.65},  # yellow
        {"hue": 0.33, "saturation": 0.80, "dx":  28, "dy": -12, "opacity": 0.65},  # green
        {"hue": 0.62, "saturation": 0.85, "dx": -22, "dy":  18, "opacity": 0.65},  # blue
        {"hue": 0.00, "saturation": 0.00, "dx":  22, "dy":  18, "opacity": 0.55},  # white
    ]

    out_dir = PROJECT / render_cfg["output_dir"] / "frames_5color"
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)

    sil_dir = PROJECT / "segmentation" / "output" / "silhouette"
    fg_dir = PROJECT / "segmentation" / "output" / "foreground"
    print("Rendering 5-color stack...")
    render_sequence(sil_dir, fg_dir, out_dir, render_cfg)

    mp4 = PROJECT / render_cfg["output_dir"] / "halftone_5color.mp4"
    subprocess.run([
        "/usr/local/bin/ffmpeg", "-y",
        "-framerate", "15",
        "-i", str(out_dir / "render_%05d.png"),
        "-c:v", "libx264",
        "-profile:v", "high",
        "-level", "4.0",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-crf", "18",
        str(mp4),
    ], check=True, capture_output=True)
    print(f"Wrote {mp4}")
    subprocess.run(["open", str(mp4)])


if __name__ == "__main__":
    main()
