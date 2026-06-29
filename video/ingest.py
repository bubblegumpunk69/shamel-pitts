"""Stage 1 — Download source video and trim to choreography section."""

import subprocess
import sys
from pathlib import Path

import yaml


def load_config():
    config_path = Path(__file__).parent.parent / "config" / "pipeline.yaml"
    with open(config_path) as f:
        return yaml.safe_load(f)


def download(url: str, output_path: Path) -> Path:
    """Download video from YouTube at best quality."""
    output_file = output_path / "source.mp4"
    if output_file.exists():
        print(f"Source already downloaded: {output_file}")
        return output_file

    print(f"Downloading: {url}")
    subprocess.run(
        [
            "yt-dlp",
            "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "--merge-output-format", "mp4",
            "-o", str(output_file),
            url,
        ],
        check=True,
    )
    print(f"Downloaded: {output_file}")
    return output_file


def get_fps(video_path: Path) -> float:
    """Extract frame rate from video file."""
    result = subprocess.run(
        [
            "ffprobe",
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=r_frame_rate",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(video_path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    num, den = result.stdout.strip().split("/")
    return float(num) / float(den)


def trim(source: Path, output_path: Path, start: str, end: str, preserve_fps: bool) -> Path:
    """Trim video to exact time range without re-encoding when possible."""
    trimmed = output_path / "trimmed.mp4"

    if trimmed.exists():
        print(f"Trimmed clip already exists: {trimmed}")
        return trimmed

    fps = get_fps(source)
    print(f"Source FPS: {fps}")

    cmd = [
        "ffmpeg",
        "-ss", start,
        "-to", end,
        "-i", str(source),
        "-c:v", "libx264",
        "-crf", "18",
        "-preset", "slow",
        "-an",
        "-y",
    ]

    if preserve_fps:
        cmd.extend(["-r", str(fps)])

    cmd.append(str(trimmed))

    print(f"Trimming {start} → {end}")
    subprocess.run(cmd, check=True)
    print(f"Trimmed: {trimmed}")
    return trimmed


def extract_frames(video_path: Path, output_path: Path) -> Path:
    """Extract all frames as PNG for downstream processing."""
    frames_dir = output_path / "frames"
    frames_dir.mkdir(exist_ok=True)

    existing = list(frames_dir.glob("*.png"))
    if existing:
        print(f"Frames already extracted: {len(existing)} frames")
        return frames_dir

    print("Extracting frames...")
    subprocess.run(
        [
            "ffmpeg",
            "-i", str(video_path),
            "-q:v", "1",
            str(frames_dir / "frame_%05d.png"),
        ],
        check=True,
    )
    count = len(list(frames_dir.glob("*.png")))
    print(f"Extracted {count} frames")
    return frames_dir


def generate_preview(video_path: Path, output_path: Path) -> Path:
    """Generate a contact sheet preview of the trimmed clip."""
    preview = output_path / "preview_contact_sheet.png"
    duration_result = subprocess.run(
        [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(video_path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    duration = float(duration_result.stdout.strip())
    interval = duration / 12

    subprocess.run(
        [
            "ffmpeg",
            "-i", str(video_path),
            "-vf", f"fps=1/{interval},scale=320:-1,tile=4x3",
            "-frames:v", "1",
            "-y",
            str(preview),
        ],
        check=True,
    )
    print(f"Preview: {preview}")
    return preview


def main():
    config = load_config()
    source_cfg = config["source"]
    video_cfg = config["video"]

    output_path = Path(__file__).parent.parent / video_cfg["output_dir"]
    output_path.mkdir(parents=True, exist_ok=True)

    source = download(source_cfg["url"], output_path)
    trimmed = trim(source, output_path, source_cfg["start"], source_cfg["end"], video_cfg["preserve_fps"])
    frames_dir = extract_frames(trimmed, output_path)
    generate_preview(trimmed, output_path)

    print("\n✓ Stage 1 complete")
    print(f"  Trimmed clip: {trimmed}")
    print(f"  Frames: {frames_dir}")


if __name__ == "__main__":
    main()
