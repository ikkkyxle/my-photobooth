#!/usr/bin/env python3
"""
Reverse-engineer the photo slots of each frame PNG from its alpha channel.

Every frame in src/ is a printable overlay with fully transparent rectangles
where the photos are supposed to show through. Instead of guessing pixel
offsets by hand (which is why the photos never lined up), we detect those
transparent regions directly and emit them as percentages of the frame.

Percentages are resolution independent, so the same numbers work for the
on-screen 400x600 preview and for the high resolution print export.

Usage:
    python3 scripts/extract-frame-slots.py            # write src/frameSlots.js
    python3 scripts/extract-frame-slots.py --print    # only report to stdout
"""

from __future__ import annotations

import argparse
import collections
import json
import pathlib
import sys

try:
    import numpy as np
    from PIL import Image
except ImportError as exc:  # pragma: no cover
    sys.exit(f"missing dependency: {exc}. install with: pip install pillow numpy")


REPO = pathlib.Path(__file__).resolve().parent.parent
SRC = REPO / "src"
OUT = SRC / "frameSlots.js"

FRAMES = ["frame1.png", "frame2.png", "frame3.png", "frame4.png"]

# A hole must be at least this fraction of the frame to count as a photo slot.
MIN_AREA_RATIO = 0.005
# Alpha at or below this value is treated as "see through".
ALPHA_THRESHOLD = 16
# Long edge used for the analysis raster. Big frames get downsampled first so
# the flood fill stays fast; the results are percentages so nothing is lost.
ANALYSIS_LONG_EDGE = 900


def load_alpha_mask(path: pathlib.Path) -> tuple[np.ndarray, int, int]:
    """Return (transparent_mask, original_width, original_height)."""
    image = Image.open(path).convert("RGBA")
    orig_w, orig_h = image.size

    scale = min(1.0, ANALYSIS_LONG_EDGE / max(orig_w, orig_h))
    if scale < 1.0:
        image = image.resize(
            (max(1, round(orig_w * scale)), max(1, round(orig_h * scale))),
            Image.NEAREST,
        )

    alpha = np.array(image)[:, :, 3]
    return alpha <= ALPHA_THRESHOLD, orig_w, orig_h


def find_holes(mask: np.ndarray) -> list[dict]:
    """4-connected flood fill over the transparent mask, returning bounding boxes."""
    height, width = mask.shape
    seen = np.zeros(mask.shape, dtype=bool)
    min_area = width * height * MIN_AREA_RATIO
    holes: list[dict] = []

    for start_y in range(height):
        for start_x in range(width):
            if not mask[start_y, start_x] or seen[start_y, start_x]:
                continue

            seen[start_y, start_x] = True
            queue = collections.deque([(start_y, start_x)])
            y0 = y1 = start_y
            x0 = x1 = start_x
            area = 0

            while queue:
                cy, cx = queue.popleft()
                area += 1
                if cy < y0:
                    y0 = cy
                elif cy > y1:
                    y1 = cy
                if cx < x0:
                    x0 = cx
                elif cx > x1:
                    x1 = cx

                for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                    if 0 <= ny < height and 0 <= nx < width:
                        if mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            queue.append((ny, nx))

            if area < min_area:
                continue

            box_w = x1 - x0 + 1
            box_h = y1 - y0 + 1
            holes.append(
                {
                    "x": x0,
                    "y": y0,
                    "w": box_w,
                    "h": box_h,
                    "area": area,
                    "fill": area / (box_w * box_h),
                }
            )

    return holes


def to_reading_order(holes: list[dict], width: int) -> list[dict]:
    """Sort holes top-to-bottom then left-to-right, tolerating small row jitter."""
    if not holes:
        return []

    row_tolerance = max(h["h"] for h in holes) * 0.5
    by_top = sorted(holes, key=lambda h: h["y"])

    rows: list[list[dict]] = []
    for hole in by_top:
        for row in rows:
            if abs(hole["y"] - row[0]["y"]) <= row_tolerance:
                row.append(hole)
                break
        else:
            rows.append([hole])

    ordered: list[dict] = []
    for row in rows:
        ordered.extend(sorted(row, key=lambda h: h["x"]))
    return ordered


def percentify(holes: list[dict], width: int, height: int) -> list[dict]:
    def r(value: float) -> float:
        return round(value, 3)

    return [
        {
            "left": r(100 * h["x"] / width),
            "top": r(100 * h["y"] / height),
            "width": r(100 * h["w"] / width),
            "height": r(100 * h["h"] / height),
        }
        for h in holes
    ]


def analyse(path: pathlib.Path) -> dict:
    mask, orig_w, orig_h = load_alpha_mask(path)
    height, width = mask.shape

    holes = to_reading_order(find_holes(mask), width)
    slots = percentify(holes, width, height)

    return {
        "file": path.name,
        "naturalWidth": orig_w,
        "naturalHeight": orig_h,
        "aspectRatio": round(orig_w / orig_h, 6),
        "slots": slots,
        "_debug": holes,
    }


def render_module(reports: list[dict]) -> str:
    lines = [
        "// AUTO-GENERATED by scripts/extract-frame-slots.py -- do not edit by hand.",
        "//",
        "// Each frame PNG is an overlay with fully transparent rectangles where the",
        "// photos belong. The slot boxes below were measured from those transparent",
        "// regions, expressed as percentages of the frame so they scale from the",
        "// on-screen preview all the way up to the print-resolution export.",
        "//",
        "// Regenerate after changing any frame art:",
        "//     python3 scripts/extract-frame-slots.py",
        "",
        "import frame1 from './frame1.png';",
        "import frame2 from './frame2.png';",
        "import frame3 from './frame3.png';",
        "import frame4 from './frame4.png';",
        "",
        "const SOURCES = { 'frame1.png': frame1, 'frame2.png': frame2, "
        "'frame3.png': frame3, 'frame4.png': frame4 };",
        "",
        "export const FRAMES = [",
    ]

    for index, report in enumerate(reports, start=1):
        lines.append("  {")
        lines.append(f"    id: 'frame{index}',")
        lines.append(f"    name: 'Frame {index}',")
        lines.append(f"    src: SOURCES['{report['file']}'],")
        lines.append(f"    naturalWidth: {report['naturalWidth']},")
        lines.append(f"    naturalHeight: {report['naturalHeight']},")
        lines.append(f"    aspectRatio: {report['aspectRatio']},")
        lines.append("    // percentages of the frame box")
        lines.append("    slots: [")
        for slot in report["slots"]:
            lines.append(
                "      {{ left: {left}, top: {top}, width: {width}, height: {height} }},".format(
                    **slot
                )
            )
        lines.append("    ],")
        lines.append("  },")

    lines += [
        "];",
        "",
        "export const PLAIN_FRAME = {",
        "  id: 'plain',",
        "  name: 'Polos Putih',",
        "  src: null,",
        "  background: '#ffffff',",
        f"  aspectRatio: {reports[0]['aspectRatio']},",
        "  slots: FRAMES[0].slots,",
        "};",
        "",
        "export const TOTAL_PHOTOS = FRAMES[0].slots.length;",
        "",
        "export function slotAspectRatio(frame) {",
        "  const slot = frame.slots[0];",
        "  if (!slot) return 1.5;",
        "  const w = (slot.width / 100) * frame.naturalWidth;",
        "  const h = (slot.height / 100) * frame.naturalHeight;",
        "  return w / h;",
        "}",
        "",
    ]

    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--print", action="store_true", dest="print_only")
    args = parser.parse_args()

    reports = []
    for name in FRAMES:
        path = SRC / name
        if not path.exists():
            print(f"!! missing {path}", file=sys.stderr)
            return 1
        reports.append(analyse(path))

    for report in reports:
        print(
            f"{report['file']}  {report['naturalWidth']}x{report['naturalHeight']} "
            f"aspect={report['aspectRatio']}  slots={len(report['slots'])}"
        )
        for index, (slot, raw) in enumerate(zip(report["slots"], report["_debug"])):
            aspect = (
                (slot["width"] / 100 * report["naturalWidth"])
                / (slot["height"] / 100 * report["naturalHeight"])
            )
            print(
                f"    [{index}] left={slot['left']:6.2f}% top={slot['top']:6.2f}% "
                f"w={slot['width']:6.2f}% h={slot['height']:6.2f}% "
                f"slotAspect={aspect:.3f} fill={raw['fill']:.2f}"
            )

    counts = {len(r["slots"]) for r in reports}
    if len(counts) != 1:
        print(f"!! frames disagree on slot count: {counts}", file=sys.stderr)
        return 1

    if args.print_only:
        return 0

    for report in reports:
        report.pop("_debug", None)

    OUT.write_text(render_module(reports), encoding="utf-8")
    print(f"\nwrote {OUT.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
