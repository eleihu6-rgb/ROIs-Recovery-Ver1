#!/usr/bin/env python3
"""Compare date-matched Finalist and Crew App iPhone calendar captures."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageStat


def content_canvas(image: Image.Image) -> Image.Image:
    """Normalize the phone viewport while excluding status and bottom tab chrome."""
    width, height = image.size
    top = round(height * (100 / 912))
    bottom = round(height * (829 / 912))
    return image.convert("L").crop((0, top, width, bottom)).resize((420, 729))


def compare(reference: Path, candidate: Path) -> dict[str, float | str]:
    ref = content_canvas(Image.open(reference))
    got = content_canvas(Image.open(candidate))
    pixel_mae = ImageStat.Stat(ImageChops.difference(ref, got)).mean[0] / 255

    ref_edges = ref.filter(ImageFilter.FIND_EDGES).point(lambda value: 255 if value >= 32 else 0)
    got_edges = got.filter(ImageFilter.FIND_EDGES).point(lambda value: 255 if value >= 32 else 0)
    edge_diff = ImageStat.Stat(ImageChops.difference(ref_edges, got_edges)).mean[0] / 255
    return {
        "reference": str(reference),
        "candidate": str(candidate),
        "pixel_mae": round(pixel_mae, 4),
        "edge_diff_ratio": round(edge_diff, 4),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference-dir", type=Path, required=True)
    parser.add_argument("--candidate-dir", type=Path, required=True)
    parser.add_argument("--candidate-version", required=True)
    parser.add_argument("--max-pixel-mae", type=float, default=0.18)
    parser.add_argument("--max-edge-diff", type=float, default=0.25)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    results = []
    for day in range(17, 24):
        reference = args.reference_dir / f"finalist-oct{day}-Ver1.jpg"
        candidate = args.candidate_dir / f"crew-finalist-oct{day}-air-Ver{args.candidate_version}.png"
        result = compare(reference, candidate)
        result["day"] = day
        result["pass"] = (
            result["pixel_mae"] <= args.max_pixel_mae
            and result["edge_diff_ratio"] <= args.max_edge_diff
        )
        results.append(result)

    report = {
        "thresholds": {
            "pixel_mae": args.max_pixel_mae,
            "edge_diff_ratio": args.max_edge_diff,
        },
        "results": results,
        "pass": all(result["pass"] for result in results),
    }
    encoded = json.dumps(report, indent=2) + "\n"
    if args.output:
        args.output.write_text(encoded, encoding="utf-8")
    print(encoded, end="")
    return 0 if report["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
