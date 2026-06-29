"""Stage 5 — Procedural halftone renderer.

The dancer is rendered as a field of white dots on pure black.

Per frame:
  1. Sample an offset (hex-like) dot grid across the canvas.
  2. Keep only dots that fall inside the silhouette mask.
  3. Modulate dot radius by local brightness from the original frame.
     (Brighter regions of the body -> larger dots, sculpting the form.)
  4. Soften the silhouette edge via a distance transform so dots fade
     gracefully at the boundary instead of clipping.
  5. Apply a temporal decay buffer for motion trails. Slow / still moments
     show clean dots; fast moments leave subtle delayed settling.

Nothing about a skeleton, mesh, or stick figure ever touches the canvas.
The pose data is used only as a sanity reference (we don't draw it).
"""

import json
import subprocess
from pathlib import Path

import cv2
import numpy as np
import yaml
from tqdm import tqdm


def load_config():
    with open(Path(__file__).parent.parent / "config" / "pipeline.yaml") as f:
        return yaml.safe_load(f)


def build_atmospheric_gradient(width: int, height: int, center_color: tuple, falloff: float = 1.15) -> np.ndarray:
    """Radial dark gradient — warm darkness at center, deeper black at the edges.

    Returns an HxWx3 float32 image to be added to the rendered frame. Values
    are deliberately small (peak < ~25 on uint8 scale) so the effect reads
    as atmosphere, not as a visible vignette.
    """
    yy, xx = np.indices((height, width), dtype=np.float32)
    cx, cy = width / 2.0, height / 2.0
    rx = (xx - cx) / cx
    ry = (yy - cy) / cy
    r = np.sqrt(rx * rx + ry * ry)
    weight = np.clip(1.0 - (r / falloff), 0.0, 1.0) ** 2
    bgr = np.array(center_color[::-1], dtype=np.float32)  # accept RGB, store BGR
    return weight[..., None] * bgr


def build_grid(width: int, height: int, spacing: int) -> np.ndarray:
    """Hexagonal offset grid of (x, y) integer points."""
    points = []
    row_h = int(spacing * 0.866)  # sqrt(3)/2 for hex packing
    y = 0
    row = 0
    while y < height:
        x_offset = (spacing // 2) if (row % 2) else 0
        x = x_offset
        while x < width:
            points.append((x, y))
            x += spacing
        y += row_h
        row += 1
    return np.array(points, dtype=np.int32)


def crop_to_dancer(silhouette: np.ndarray, foreground: np.ndarray, target_size: int, pad_ratio: float = 1.6):
    """Crop both images to a square centered on the dancer.

    The bounding box of the silhouette is expanded by pad_ratio (so the dancer
    occupies ~60% of the frame, leaving breathing room), then padded to square
    and resized to target_size. This normalizes the wildly-varying source
    framing so the dancer stays at a consistent on-screen size.
    """
    h, w = silhouette.shape[:2]
    ys, xs = np.where(silhouette > 127)
    if len(xs) == 0:
        # No dancer detected — return a black target-sized canvas.
        return np.zeros((target_size, target_size), np.uint8), np.zeros((target_size, target_size, 3), np.uint8)

    cx = (xs.min() + xs.max()) // 2
    cy = (ys.min() + ys.max()) // 2
    bw = xs.max() - xs.min()
    bh = ys.max() - ys.min()
    side = int(max(bw, bh) * pad_ratio)
    side = max(side, target_size // 2)  # don't crop tighter than a sensible floor

    x0 = cx - side // 2
    y0 = cy - side // 2
    x1 = x0 + side
    y1 = y0 + side

    # Pad source with black where the crop window falls outside the frame.
    pad_l = max(0, -x0); pad_t = max(0, -y0)
    pad_r = max(0, x1 - w); pad_b = max(0, y1 - h)
    sil_p = cv2.copyMakeBorder(silhouette, pad_t, pad_b, pad_l, pad_r, cv2.BORDER_CONSTANT, value=0)
    fg_p = cv2.copyMakeBorder(foreground, pad_t, pad_b, pad_l, pad_r, cv2.BORDER_CONSTANT, value=0)
    sil_c = sil_p[y0 + pad_t:y1 + pad_t, x0 + pad_l:x1 + pad_l]
    fg_c = fg_p[y0 + pad_t:y1 + pad_t, x0 + pad_l:x1 + pad_l]

    sil_out = cv2.resize(sil_c, (target_size, target_size), interpolation=cv2.INTER_NEAREST)
    fg_out = cv2.resize(fg_c, (target_size, target_size), interpolation=cv2.INTER_LINEAR)
    return sil_out, fg_out


def hue_to_bgr(hue: float, saturation: float = 0.85, value: float = 1.0) -> tuple[int, int, int]:
    """HSV → BGR triplet for one color (hue in [0, 1])."""
    hsv = np.array([[[int(hue * 179) % 180, int(saturation * 255), int(value * 255)]]], dtype=np.uint8)
    b, g, r = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)[0, 0]
    return int(b), int(g), int(r)


def render_frame(
    grid: np.ndarray,
    silhouette: np.ndarray,
    foreground: np.ndarray,
    canvas_w: int,
    canvas_h: int,
    min_radius: float,
    max_radius: float,
    edge_softness: int,
    frame_index: int = 0,
    psychedelic: bool = True,
    hue_cycle_period: int = 96,
    hue_override: float | None = None,
    saturation: float = 0.78,
) -> np.ndarray:
    """Render one halftone frame on a black canvas.

    Returns an HxWx3 uint8 image.
    """
    # Brightness map = luminance of the original (foreground) frame.
    gray = cv2.cvtColor(foreground, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (9, 9), 0)
    # Resize source-luma to canvas size (if upscaling render).
    src_h, src_w = gray.shape
    if (src_w, src_h) != (canvas_w, canvas_h):
        gray = cv2.resize(gray, (canvas_w, canvas_h), interpolation=cv2.INTER_LINEAR)
        silhouette = cv2.resize(silhouette, (canvas_w, canvas_h), interpolation=cv2.INTER_NEAREST)

    # Distance transform: how far inside the silhouette each pixel is.
    # Used to soften the edge — dots near the boundary get smaller.
    sil_bin = (silhouette > 127).astype(np.uint8)
    dist = cv2.distanceTransform(sil_bin, cv2.DIST_L2, 3)
    edge_weight = np.clip(dist / max(1, edge_softness), 0.0, 1.0)

    canvas = np.zeros((canvas_h, canvas_w, 3), dtype=np.uint8)

    # Filter grid to silhouette interior.
    xs, ys = grid[:, 0], grid[:, 1]
    in_bounds = (xs < canvas_w) & (ys < canvas_h)
    xs, ys = xs[in_bounds], ys[in_bounds]
    inside = sil_bin[ys, xs] > 0
    xs, ys = xs[inside], ys[inside]
    if len(xs) == 0:
        return canvas

    # Per-dot brightness and edge weight.
    bright = gray[ys, xs].astype(np.float32) / 255.0
    edge = edge_weight[ys, xs]

    # Brightness-driven radius, softened near the edge.
    radii = min_radius + (max_radius - min_radius) * (bright * edge)
    # Skip dots that would be invisibly small.
    keep = radii >= 0.4
    xs, ys, radii = xs[keep], ys[keep], radii[keep]

    if psychedelic:
        # Oxblood palette with a very slow, narrow drift through warm reds.
        # Hue stays in the deep crimson band; saturation and value carry the
        # variation so it reads as one disciplined color, not a rainbow.
        drift = np.sin(frame_index / hue_cycle_period * 2 * np.pi) * 0.012  # ±4° hue
        norm_y = ys.astype(np.float32) / canvas_h
        base_hue = hue_override if hue_override is not None else 0.99
        # Slight vertical hue offset for natural variance within the body.
        per_dot_hue = (base_hue + drift + norm_y * 0.015) % 1.0
        for x, y, r, h_, v_ in zip(xs.tolist(), ys.tolist(), radii.tolist(), per_dot_hue.tolist(), bright.tolist()):
            color = hue_to_bgr(h_, saturation=saturation, value=0.45 + 0.55 * v_)
            cv2.circle(canvas, (int(x), int(y)), max(1, int(round(r))), color, -1, lineType=cv2.LINE_AA)
    else:
        for x, y, r in zip(xs.tolist(), ys.tolist(), radii.tolist()):
            cv2.circle(canvas, (int(x), int(y)), max(1, int(round(r))), (255, 255, 255), -1, lineType=cv2.LINE_AA)

    return canvas


def render_sequence(
    silhouette_dir: Path,
    foreground_dir: Path,
    out_dir: Path,
    cfg: dict,
    sample_indices: list[int] | None = None,
):
    out_dir.mkdir(parents=True, exist_ok=True)

    sil_files = sorted(silhouette_dir.glob("*.png"))
    fg_files = sorted(foreground_dir.glob("*.png"))
    assert len(sil_files) == len(fg_files), "silhouette and foreground frame counts must match"

    canvas_w = cfg["width"]
    canvas_h = cfg["height"]
    h_cfg = cfg["halftone"]
    grid = build_grid(canvas_w, canvas_h, h_cfg["grid_spacing"])
    psychedelic = h_cfg.get("psychedelic", True)
    hue_period = h_cfg.get("hue_cycle_period", 96)

    # Persistent decay buffer for motion trails (float32 RGB).
    decay = np.zeros((canvas_h, canvas_w, 3), dtype=np.float32)
    trail_decay = h_cfg.get("trail_decay", 0.55)

    # Atmospheric background gradient (precomputed once).
    bg_center = tuple(h_cfg.get("background_center_rgb", [22, 6, 10]))
    bg_falloff = h_cfg.get("background_falloff", 1.15)
    atmosphere = build_atmospheric_gradient(canvas_w, canvas_h, bg_center, bg_falloff)

    indices = sample_indices if sample_indices is not None else list(range(len(sil_files)))

    # Layered echo configuration. Each entry: (hue, saturation, dx, dy, opacity).
    # First layer is the main oxblood figure with no shift. Additional layers
    # are second-color "echoes" spatially offset for a chromatic-separation look.
    layers = h_cfg.get("layers", [
        {"hue": 0.99, "saturation": 0.78, "dx": 0,   "dy": 0, "opacity": 1.0},  # oxblood, primary
        {"hue": 0.50, "saturation": 0.70, "dx": 45,  "dy": 10, "opacity": 0.7}, # cyan, shifted right+down
    ])
    # Note: saturation=0 in a layer renders that layer as white (no hue).

    for i in tqdm(indices):
        sil = cv2.imread(str(sil_files[i]), cv2.IMREAD_GRAYSCALE)
        fg = cv2.imread(str(fg_files[i]))
        # Crop & resize so the dancer stays consistently sized in frame.
        sil, fg = crop_to_dancer(sil, fg, target_size=canvas_w, pad_ratio=2.2)

        composed = np.zeros((canvas_h, canvas_w, 3), dtype=np.float32)
        for layer in layers:
            layer_frame = render_frame(
                grid=grid,
                silhouette=sil,
                foreground=fg,
                canvas_w=canvas_w,
                canvas_h=canvas_h,
                min_radius=h_cfg["min_radius"],
                max_radius=h_cfg["max_radius"],
                edge_softness=h_cfg.get("grid_spacing", 8) * 2,
                frame_index=i,
                psychedelic=psychedelic,
                hue_cycle_period=hue_period,
                hue_override=layer["hue"],
                saturation=layer["saturation"],
            ).astype(np.float32)
            # Apply spatial offset.
            dx, dy = int(layer["dx"]), int(layer["dy"])
            if dx or dy:
                M = np.float32([[1, 0, dx], [0, 1, dy]])
                layer_frame = cv2.warpAffine(layer_frame, M, (canvas_w, canvas_h), flags=cv2.INTER_LINEAR, borderValue=0)
            composed = composed + layer_frame * layer["opacity"]
        composed = np.clip(composed, 0, 255).astype(np.uint8)
        frame = composed

        # Motion trail in color: previous decay buffer fades, current frame on top.
        cur = frame.astype(np.float32) / 255.0
        decay = np.maximum(decay * trail_decay, cur)
        out_float = decay * 255.0

        # Atmospheric background gradient — added beneath dots & trails so
        # the room has a felt presence, not a flat black void.
        out_float = out_float + atmosphere

        # Film grain: low-amplitude monochrome noise added uniformly so the
        # background has tooth instead of flat digital black.
        grain_sigma = h_cfg.get("grain_sigma", 6.0)
        if grain_sigma > 0:
            noise = np.random.normal(0, grain_sigma, (canvas_h, canvas_w)).astype(np.float32)
            noise_rgb = np.stack([noise, noise, noise], axis=-1)
            out_float = out_float + noise_rgb

        out_rgb = np.clip(out_float, 0, 255).astype(np.uint8)

        out_path = out_dir / f"render_{i:05d}.png"
        cv2.imwrite(str(out_path), out_rgb)


def make_preview_strip(render_dir: Path, output_path: Path, count: int = 12):
    files = sorted(render_dir.glob("*.png"))
    if not files:
        return
    indices = np.linspace(0, len(files) - 1, count).astype(int)
    sample_dir = render_dir / "_preview_samples"
    sample_dir.mkdir(exist_ok=True)
    for slot, i in enumerate(indices):
        cv2.imwrite(str(sample_dir / f"s_{slot:02d}.png"), cv2.imread(str(files[i])))
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-pattern_type", "glob",
            "-i", str(sample_dir / "s_*.png"),
            "-vf", "scale=480:-1,tile=4x3",
            "-frames:v", "1",
            str(output_path),
        ],
        check=True,
        capture_output=True,
    )


def main():
    config = load_config()
    render_cfg = config["render"]
    project_root = Path(__file__).parent.parent

    sil_dir = project_root / "segmentation" / "output" / "silhouette"
    fg_dir = project_root / "segmentation" / "output" / "foreground"

    import sys
    preview_only = "--preview" in sys.argv

    if preview_only:
        out_dir = project_root / render_cfg["output_dir"] / "preview"
        # Consecutive frames so motion trails look representative.
        # Pick a chunk centered on a high-motion section.
        sample = list(range(200, 260))
        print(f"Preview render: {len(sample)} consecutive frames (200-259)")
        render_sequence(sil_dir, fg_dir, out_dir, render_cfg, sample_indices=sample)
        preview = project_root / render_cfg["output_dir"] / "preview_contact_sheet.png"
        make_preview_strip(out_dir, preview)
        print(f"\n✓ Preview render complete")
        print(f"  Frames: {out_dir}")
        print(f"  Contact sheet: {preview}")
    else:
        out_dir = project_root / render_cfg["output_dir"] / "frames"
        print(f"Full render: {len(list(sil_dir.glob('*.png')))} frames")
        render_sequence(sil_dir, fg_dir, out_dir, render_cfg)
        print(f"\n✓ Stage 5 complete")
        print(f"  Frames: {out_dir}")


if __name__ == "__main__":
    main()
