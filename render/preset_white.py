"""Pure white halftone — single layer, no chromatic separation."""

import shutil
import subprocess
from pathlib import Path

import yaml

from render.halftone import render_sequence


PROJECT = Path(__file__).parent.parent


def main():
    with open(PROJECT / "config" / "pipeline.yaml") as f:
        config = yaml.safe_load(f)
    render_cfg = config["render"]

    render_cfg["halftone"]["layers"] = [
        {"hue": 0.0, "saturation": 0.0, "dx": 0, "dy": 0, "opacity": 1.0},
    ]

    out_dir = PROJECT / render_cfg["output_dir"] / "frames_white"
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)

    sil_dir = PROJECT / "segmentation" / "output" / "silhouette"
    fg_dir = PROJECT / "segmentation" / "output" / "foreground"
    print("Rendering pure white...")
    render_sequence(sil_dir, fg_dir, out_dir, render_cfg)

    mp4 = PROJECT / render_cfg["output_dir"] / "halftone_white.mp4"
    subprocess.run([
        "/usr/local/bin/ffmpeg", "-y",
        "-framerate", "15",
        "-i", str(out_dir / "render_%05d.png"),
        "-c:v", "libx264", "-profile:v", "high", "-level", "4.0",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-crf", "18",
        str(mp4),
    ], check=True, capture_output=True)
    print(f"Wrote {mp4}")
    subprocess.run(["open", str(mp4)])


if __name__ == "__main__":
    main()
