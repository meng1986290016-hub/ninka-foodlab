#!/usr/bin/env python3
"""Create reproducible waveform, spectrogram and onset data for a reference film."""

from __future__ import annotations

import argparse
import json
import math
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--cuts", type=str, default="")
    return parser.parse_args()


def font(size: int) -> ImageFont.ImageFont:
    for candidate in [
        Path("/System/Library/Fonts/SFNSMono.ttf"),
        Path("/System/Library/Fonts/Menlo.ttc"),
    ]:
        if candidate.exists():
            try:
                return ImageFont.truetype(str(candidate), size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def read_wave(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path), "rb") as handle:
        sample_rate = handle.getframerate()
        channels = handle.getnchannels()
        width = handle.getsampwidth()
        frames = handle.readframes(handle.getnframes())
    if width != 2:
        raise ValueError(f"Expected 16-bit PCM, got {width * 8}-bit")
    samples = np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0
    if channels > 1:
        samples = samples.reshape(-1, channels).mean(axis=1)
    return samples, sample_rate


def stft(samples: np.ndarray, size: int = 2048, hop: int = 512) -> np.ndarray:
    if len(samples) < size:
        samples = np.pad(samples, (0, size - len(samples)))
    frame_count = 1 + (len(samples) - size) // hop
    shape = (frame_count, size)
    strides = (samples.strides[0] * hop, samples.strides[0])
    frames = np.lib.stride_tricks.as_strided(samples, shape=shape, strides=strides).copy()
    frames *= np.hanning(size).astype(np.float32)
    return np.abs(np.fft.rfft(frames, axis=1)).astype(np.float32)


def onset_envelope(magnitude: np.ndarray) -> np.ndarray:
    log_magnitude = np.log1p(magnitude)
    flux = np.maximum(log_magnitude[1:] - log_magnitude[:-1], 0).mean(axis=1)
    flux = np.pad(flux, (1, 0))
    kernel = np.ones(5, dtype=np.float32) / 5
    return np.convolve(flux, kernel, mode="same")


def find_onsets(envelope: np.ndarray, hop: int, sample_rate: int) -> list[dict[str, float]]:
    threshold = float(np.quantile(envelope, 0.86))
    local_radius = 4
    min_gap = max(1, int(round(0.14 * sample_rate / hop)))
    peaks: list[int] = []
    for index in range(local_radius, len(envelope) - local_radius):
        if envelope[index] < threshold:
            continue
        if envelope[index] >= envelope[index - local_radius : index + local_radius + 1].max():
            if not peaks or index - peaks[-1] >= min_gap:
                peaks.append(index)
            elif envelope[index] > envelope[peaks[-1]]:
                peaks[-1] = index
    strengths = envelope[peaks] if peaks else np.asarray([], dtype=np.float32)
    maximum = float(strengths.max()) if len(strengths) else 1.0
    return [
        {
            "time_seconds": float(index * hop / sample_rate),
            "strength": float(envelope[index] / maximum),
        }
        for index in peaks
    ]


def estimate_tempo(envelope: np.ndarray, hop: int, sample_rate: int) -> list[dict[str, float]]:
    centered = envelope - np.mean(envelope)
    correlation = np.correlate(centered, centered, mode="full")[len(centered) - 1 :]
    candidates: list[tuple[float, float]] = []
    for bpm in np.linspace(60, 180, 721):
        lag = int(round(60.0 * sample_rate / (bpm * hop)))
        if 1 <= lag < len(correlation):
            candidates.append((float(correlation[lag]), float(bpm)))
    candidates.sort(reverse=True)
    selected: list[dict[str, float]] = []
    for score, bpm in candidates:
        if all(abs(bpm - item["bpm"]) > 2.5 for item in selected):
            selected.append({"bpm": round(bpm, 2), "relative_score": score})
        if len(selected) == 5:
            break
    maximum = max((item["relative_score"] for item in selected), default=1.0)
    for item in selected:
        item["relative_score"] = round(float(item["relative_score"] / maximum), 4)
    return selected


def dbfs(samples: np.ndarray) -> float:
    rms = float(np.sqrt(np.mean(np.square(samples)))) if len(samples) else 0.0
    return -120.0 if rms <= 1e-8 else 20 * math.log10(rms)


def draw_waveform(
    samples: np.ndarray,
    sample_rate: int,
    duration: float,
    cuts: list[float],
    onsets: list[dict[str, float]],
    destination: Path,
) -> None:
    width, height = 1920, 720
    margin_x, margin_y = 80, 78
    plot_width, plot_height = width - margin_x * 2, height - margin_y * 2
    canvas = Image.new("RGB", (width, height), "#0b1110")
    draw = ImageDraw.Draw(canvas)
    title_font = font(34)
    label_font = font(20)
    draw.text((margin_x, 22), "Reference A — waveform, onsets and scene boundaries", font=title_font, fill="#fff7e7")

    bucket = max(1, len(samples) // plot_width)
    trimmed = samples[: bucket * plot_width].reshape(plot_width, bucket)
    minimum = trimmed.min(axis=1)
    maximum = trimmed.max(axis=1)
    center = margin_y + plot_height // 2
    for x in range(plot_width):
        top = center - int(maximum[x] * plot_height * 0.46)
        bottom = center - int(minimum[x] * plot_height * 0.46)
        draw.line((margin_x + x, top, margin_x + x, bottom), fill="#76c7b7", width=1)

    for second in range(0, int(math.ceil(duration)) + 1, 5):
        x = margin_x + int(second / duration * plot_width)
        draw.line((x, margin_y, x, margin_y + plot_height), fill="#263733", width=1)
        draw.text((x + 4, margin_y + plot_height + 12), f"{second}s", font=label_font, fill="#9db0ab")

    for cut in cuts:
        x = margin_x + int(cut / duration * plot_width)
        draw.line((x, margin_y, x, margin_y + plot_height), fill="#efbd50", width=3)

    for onset in onsets:
        if onset["strength"] < 0.55:
            continue
        x = margin_x + int(onset["time_seconds"] / duration * plot_width)
        y = margin_y + int((1.0 - onset["strength"]) * 90)
        draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill="#df6b45")

    draw.text((margin_x, height - 34), "Gold: reviewed scene boundary   Orange: strong audio onset", font=label_font, fill="#c9d6d2")
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination)


def draw_spectrogram(
    magnitude: np.ndarray,
    sample_rate: int,
    duration: float,
    cuts: list[float],
    destination: Path,
) -> None:
    max_frequency = 12_000
    frequency_bins = int(max_frequency / (sample_rate / 2) * (magnitude.shape[1] - 1))
    data = magnitude[:, : max(2, frequency_bins)]
    decibels = 20 * np.log10(data + 1e-7)
    floor = np.quantile(decibels, 0.06)
    ceiling = np.quantile(decibels, 0.995)
    normalized = np.clip((decibels - floor) / max(1e-6, ceiling - floor), 0, 1)
    normalized = np.flipud(normalized.T)
    red = np.clip(1.65 * normalized - 0.25, 0, 1)
    green = np.clip(1.45 * normalized**0.8 - 0.12, 0, 1)
    blue = np.clip(0.35 + 1.05 * normalized, 0, 1)
    rgb = (np.stack([red, green, blue], axis=2) * 255).astype(np.uint8)
    image = Image.fromarray(rgb, mode="RGB").resize((1760, 560), Image.Resampling.BILINEAR)
    canvas = Image.new("RGB", (1920, 720), "#0b1110")
    canvas.paste(image, (80, 78))
    draw = ImageDraw.Draw(canvas)
    draw.text((80, 22), "Reference A — spectrogram (0–12 kHz)", font=font(34), fill="#fff7e7")
    for cut in cuts:
        x = 80 + int(cut / duration * 1760)
        draw.line((x, 78, x, 638), fill="#efbd50", width=2)
    for frequency in [0, 3_000, 6_000, 9_000, 12_000]:
        y = 638 - int(frequency / 12_000 * 560)
        draw.text((12, y - 10), f"{frequency // 1000}k", font=font(18), fill="#c9d6d2")
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination)


def main() -> None:
    args = parse_args()
    samples, sample_rate = read_wave(args.input)
    duration = len(samples) / sample_rate
    cuts = [float(value) for value in args.cuts.split(",") if value.strip()]
    magnitude = stft(samples)
    hop = 512
    envelope = onset_envelope(magnitude)
    onsets = find_onsets(envelope, hop, sample_rate)
    tempo_candidates = estimate_tempo(envelope, hop, sample_rate)

    segment_boundaries = [0.0, *cuts, duration]
    segments = []
    for start, end in zip(segment_boundaries, segment_boundaries[1:]):
        start_index = int(round(start * sample_rate))
        end_index = int(round(end * sample_rate))
        segments.append({"start": start, "end": end, "rms_dbfs": round(dbfs(samples[start_index:end_index]), 2)})

    args.output.mkdir(parents=True, exist_ok=True)
    draw_waveform(samples, sample_rate, duration, cuts, onsets, args.output / "waveform.png")
    draw_spectrogram(magnitude, sample_rate, duration, cuts, args.output / "spectrogram.png")
    result = {
        "sample_rate": sample_rate,
        "channels": 1,
        "duration_seconds": duration,
        "overall_rms_dbfs": round(dbfs(samples), 2),
        "peak_dbfs": round(20 * math.log10(max(float(np.max(np.abs(samples))), 1e-8)), 2),
        "tempo_candidates": tempo_candidates,
        "strong_onsets": sorted(onsets, key=lambda item: item["strength"], reverse=True)[:48],
        "segments": segments,
    }
    (args.output / "audio-analysis.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"onsets": len(onsets), "tempo_candidates": tempo_candidates}, ensure_ascii=False))


if __name__ == "__main__":
    main()
