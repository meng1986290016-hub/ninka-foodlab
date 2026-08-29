#!/usr/bin/env python3
"""Build contact sheets and candidate scene cuts from extracted video frames."""

from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--analysis-frames", type=Path, required=True)
    parser.add_argument("--sample-frames", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--fps", type=float, required=True)
    parser.add_argument("--sample-fps", type=float, default=2.0)
    parser.add_argument("--duration", type=float, required=True)
    parser.add_argument("--max-candidates", type=int, default=30)
    return parser.parse_args()


def frame_paths(directory: Path) -> list[Path]:
    return sorted(directory.glob("frame-*.jpg"))


def load_rgb(path: Path) -> np.ndarray:
    with Image.open(path) as image:
        return np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0


def format_time(seconds: float) -> str:
    milliseconds = int(round(seconds * 1000))
    minutes, remainder = divmod(milliseconds, 60_000)
    whole_seconds, millis = divmod(remainder, 1_000)
    return f"{minutes:02d}:{whole_seconds:02d}.{millis:03d}"


def get_font(size: int) -> ImageFont.ImageFont:
    candidates = [
        Path("/System/Library/Fonts/SFNSMono.ttf"),
        Path("/System/Library/Fonts/Menlo.ttc"),
        Path("/Library/Fonts/Arial Unicode.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            try:
                return ImageFont.truetype(str(candidate), size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def compute_scores(paths: list[Path]) -> list[dict[str, float | int]]:
    if len(paths) < 2:
        return []

    previous = load_rgb(paths[0])
    rows: list[dict[str, float | int]] = []
    bins = np.linspace(0.0, 1.0, 33)

    for index, path in enumerate(paths[1:], start=1):
        current = load_rgb(path)
        absolute = np.abs(current - previous)
        mean_absolute = float(absolute.mean())
        changed_pixels = float((absolute.max(axis=2) > 0.18).mean())

        prev_luma = (
            previous[..., 0] * 0.2126
            + previous[..., 1] * 0.7152
            + previous[..., 2] * 0.0722
        )
        current_luma = (
            current[..., 0] * 0.2126
            + current[..., 1] * 0.7152
            + current[..., 2] * 0.0722
        )
        prev_hist, _ = np.histogram(prev_luma, bins=bins, density=True)
        current_hist, _ = np.histogram(current_luma, bins=bins, density=True)
        hist_distance = float(np.abs(prev_hist - current_hist).sum() / 64.0)

        score = mean_absolute * 0.55 + changed_pixels * 0.30 + hist_distance * 0.15
        rows.append(
            {
                "frame": index,
                "time_seconds": index / 24.0,
                "mean_absolute": mean_absolute,
                "changed_pixels": changed_pixels,
                "hist_distance": hist_distance,
                "score": score,
            }
        )
        previous = current

    return rows


def select_candidates(
    rows: list[dict[str, float | int]],
    fps: float,
    maximum: int,
) -> list[dict[str, float | int | str]]:
    if not rows:
        return []

    scores = np.asarray([float(row["score"]) for row in rows])
    threshold = max(float(np.quantile(scores, 0.94)), float(np.median(scores) + 8 * np.median(np.abs(scores - np.median(scores)))))
    radius = max(2, int(round(fps * 0.20)))
    min_gap = max(5, int(round(fps * 0.38)))

    peaks: list[int] = []
    for index, score in enumerate(scores):
        left = max(0, index - radius)
        right = min(len(scores), index + radius + 1)
        if score >= threshold and score >= scores[left:right].max():
            peaks.append(index)

    ranked = sorted(peaks, key=lambda index: scores[index], reverse=True)
    selected: list[int] = []
    for candidate in ranked:
        if all(abs(candidate - existing) >= min_gap for existing in selected):
            selected.append(candidate)
        if len(selected) >= maximum:
            break
    selected.sort()

    hard_threshold = float(np.quantile(scores, 0.985))
    candidates: list[dict[str, float | int | str]] = []
    for candidate in selected:
        row = dict(rows[candidate])
        row["candidate_type"] = "strong" if float(row["score"]) >= hard_threshold else "review"
        candidates.append(row)
    return candidates


def write_scores(rows: list[dict[str, float | int]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "frame",
        "time_seconds",
        "mean_absolute",
        "changed_pixels",
        "hist_distance",
        "score",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def annotate_candidate(
    frames: list[Path],
    frame_index: int,
    fps: float,
    destination: Path,
) -> None:
    width, height = 640, 360
    label_height = 42
    canvas = Image.new("RGB", (width * 3, height + label_height), "#111111")
    draw = ImageDraw.Draw(canvas)
    font = get_font(24)
    indices = [max(0, frame_index - 2), frame_index, min(len(frames) - 1, frame_index + 2)]
    labels = ["BEFORE", "CUT", "AFTER"]

    for column, (index, label) in enumerate(zip(indices, labels, strict=True)):
        with Image.open(frames[index]) as source:
            image = source.convert("RGB").resize((width, height), Image.Resampling.LANCZOS)
        canvas.paste(image, (column * width, 0))
        timestamp = format_time(index / fps)
        draw.text((column * width + 16, height + 8), f"{label}  {timestamp}", font=font, fill="white")

    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination, quality=92, subsampling=0)


def build_contact_sheets(
    sample_paths: list[Path],
    output_directory: Path,
    sample_fps: float,
    duration: float,
) -> list[dict[str, object]]:
    columns, rows = 4, 4
    cell_width, image_height, label_height = 480, 270, 38
    cell_height = image_height + label_height
    font = get_font(23)
    eligible = [
        (index, path)
        for index, path in enumerate(sample_paths)
        if index / sample_fps <= duration + 1e-6
    ]
    output_directory.mkdir(parents=True, exist_ok=True)

    manifest: list[dict[str, object]] = []
    per_sheet = columns * rows
    for sheet_index in range(math.ceil(len(eligible) / per_sheet)):
        canvas = Image.new("RGB", (columns * cell_width, rows * cell_height), "#0b0f0e")
        draw = ImageDraw.Draw(canvas)
        items: list[dict[str, object]] = []
        batch = eligible[sheet_index * per_sheet : (sheet_index + 1) * per_sheet]

        for slot, (sample_index, path) in enumerate(batch):
            column = slot % columns
            row = slot // columns
            x = column * cell_width
            y = row * cell_height
            with Image.open(path) as source:
                image = source.convert("RGB").resize((cell_width, image_height), Image.Resampling.LANCZOS)
            canvas.paste(image, (x, y))
            timestamp_seconds = sample_index / sample_fps
            draw.rectangle((x, y + image_height, x + cell_width, y + cell_height), fill="#111816")
            draw.text((x + 12, y + image_height + 6), format_time(timestamp_seconds), font=font, fill="#fff7e7")
            items.append(
                {
                    "frame_file": path.name,
                    "time_seconds": timestamp_seconds,
                    "timecode": format_time(timestamp_seconds),
                }
            )

        sheet_name = f"contact-sheet-{sheet_index + 1:02d}.jpg"
        canvas.save(output_directory / sheet_name, quality=92, subsampling=0)
        manifest.append({"file": sheet_name, "items": items})
    return manifest


def main() -> None:
    args = parse_args()
    analysis_frames = frame_paths(args.analysis_frames)
    sample_frames = frame_paths(args.sample_frames)
    args.output.mkdir(parents=True, exist_ok=True)

    score_rows = compute_scores(analysis_frames)
    for row in score_rows:
        row["time_seconds"] = int(row["frame"]) / args.fps
    candidates = select_candidates(score_rows, args.fps, args.max_candidates)
    write_scores(score_rows, args.output / "scene-scores.csv")

    scene_directory = args.output / "scene-cuts"
    for index, candidate in enumerate(candidates, start=1):
        frame_index = int(candidate["frame"])
        timecode = format_time(frame_index / args.fps).replace(":", "-").replace(".", "-")
        annotate_candidate(
            analysis_frames,
            frame_index,
            args.fps,
            scene_directory / f"candidate-{index:02d}-{timecode}.jpg",
        )

    sheets = build_contact_sheets(
        sample_frames,
        args.output / "contact-sheets",
        args.sample_fps,
        args.duration,
    )

    manifest = {
        "analysis_frame_count": len(analysis_frames),
        "sample_frame_count": len(sample_frames),
        "fps": args.fps,
        "sample_fps": args.sample_fps,
        "duration_seconds": args.duration,
        "scene_candidates": candidates,
        "contact_sheets": sheets,
    }
    (args.output / "analysis-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "analysis_frames": len(analysis_frames),
                "sample_frames": len(sample_frames),
                "scene_candidates": len(candidates),
                "contact_sheets": len(sheets),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
