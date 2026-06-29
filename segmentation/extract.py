"""Stage 2 — Extract the dancer from each frame.

Generates:
  - alpha matte (RGBA PNG with transparent background)
  - silhouette (binary white-on-black mask)
  - foreground (RGB on black background)

Uses rembg with the u2net_human_seg model, which is tuned for people and
gives stable, low-jitter masks suitable for dance footage.
"""

import io
import subprocess
import sys
from pathlib import Path

import numpy as np
import yaml
from PIL import Image
from rembg import new_session, remove
from tqdm import tqdm


def load_config():
    config_path = Path(__file__).parent.parent / "config" / "pipeline.yaml"
    with open(config_path) as f:
        return yaml.safe_load(f)


def process_frame(frame_path: Path, session, out_alpha: Path, out_silhouette: Path, out_foreground: Path):
    """Run segmentation on a single frame and write three outputs."""
    with open(frame_path, "rb") as f:
        input_bytes = f.read()

    output_bytes = remove(input_bytes, session=session)
    rgba = Image.open(io.BytesIO(output_bytes)).convert("RGBA")

    # 1. Alpha matte (RGBA, transparent background)
    rgba.save(out_alpha, optimize=True)

    # 2. Silhouette: binary mask from alpha channel
    alpha = np.array(rgba)[..., 3]
    silhouette = (alpha > 127).astype(np.uint8) * 255
    Image.fromarray(silhouette, mode="L").save(out_silhouette, optimize=True)

    # 3. Foreground on black background (for later brightness sampling)
    arr = np.array(rgba)
    rgb = arr[..., :3]
    a = arr[..., 3:4] / 255.0
    foreground = (rgb * a).astype(np.uint8)
    Image.fromarray(foreground, mode="RGB").save(out_foreground, optimize=True)


def make_preview(silhouette_dir: Path, output_path: Path):
    """Generate a 4x3 contact sheet of silhouettes for visual verification."""
    frames = sorted(silhouette_dir.glob("*.png"))
    if not frames:
        return
    # Sample 12 evenly spaced frames
    indices = np.linspace(0, len(frames) - 1, 12).astype(int)
    samples = [frames[i] for i in indices]

    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i", str(silhouette_dir / "frame_%05d.png"),
            "-vf", f"select='not(mod(n\\,{max(1, len(frames)//12)}))',scale=320:-1,tile=4x3",
            "-frames:v", "1",
            "-vsync", "vfr",
            str(output_path),
        ],
        check=True,
        capture_output=True,
    )


def main():
    config = load_config()
    seg_cfg = config["segmentation"]

    project_root = Path(__file__).parent.parent
    frames_dir = project_root / "video" / "output" / "frames"
    out_root = project_root / seg_cfg["output_dir"]

    alpha_dir = out_root / "alpha"
    silhouette_dir = out_root / "silhouette"
    foreground_dir = out_root / "foreground"
    for d in (alpha_dir, silhouette_dir, foreground_dir):
        d.mkdir(parents=True, exist_ok=True)

    frame_files = sorted(frames_dir.glob("*.png"))
    if not frame_files:
        print(f"No frames found in {frames_dir} — run Stage 1 first.", file=sys.stderr)
        sys.exit(1)

    print(f"Loading u2net_human_seg model (first run downloads ~170 MB)...")
    session = new_session("u2net_human_seg")

    print(f"Processing {len(frame_files)} frames...")
    for frame_path in tqdm(frame_files):
        name = frame_path.name
        out_alpha = alpha_dir / name
        out_silhouette = silhouette_dir / name
        out_foreground = foreground_dir / name
        if out_alpha.exists() and out_silhouette.exists() and out_foreground.exists():
            continue
        process_frame(frame_path, session, out_alpha, out_silhouette, out_foreground)

    print("Generating preview contact sheet...")
    preview = out_root / "preview_silhouettes.png"
    make_preview(silhouette_dir, preview)

    print("\n✓ Stage 2 complete")
    print(f"  Alpha mattes:  {alpha_dir}")
    print(f"  Silhouettes:   {silhouette_dir}")
    print(f"  Foregrounds:   {foreground_dir}")
    print(f"  Preview:       {preview}")


if __name__ == "__main__":
    main()
