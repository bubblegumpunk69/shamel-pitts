# Shamel Pitts — Procedural Halftone Dance Animation

Transforms a section of a YouTube dance performance into a high-quality procedural halftone animation.

## Source

- Video: https://www.youtube.com/watch?v=FLKBo-Wr-A4
- Section: 00:28–00:52

## Pipeline

1. **Video ingestion** — download, trim, export
2. **Performer extraction** — foreground masks, alpha mattes, silhouettes
3. **Pose estimation** — RTMPose (preferred), modular backend
4. **Motion processing** — smoothing that preserves choreographic phrasing
5. **Halftone rendering** — procedural dot field driven by form + brightness
6. **Export** — MP4, PNG sequence, pose JSON, masks, config

## Setup

```bash
brew install python@3.12 ffmpeg yt-dlp
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Usage

```bash
# Stage 1: Download and trim
python -m video.ingest

# Stage 2: Extract dancer
python -m segmentation.extract

# Stage 3: Estimate pose
python -m pose.estimate

# Stage 4: Process motion
python -m motion.process

# Stage 5: Render halftone
python -m render.halftone

# Stage 6: Export
python -m export.package
```
