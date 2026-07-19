import math
import re
import tempfile
import unittest
from pathlib import Path

from logo_geometry import COLORS, MODULES, symbol_svg, write_symbol_assets


def _quadratic_extrema(start: float, control: float, end: float) -> list[float]:
    values = [start, end]
    denominator = start - 2 * control + end
    if denominator:
        t = (start - control) / denominator
        if 0 < t < 1:
            values.append(
                (1 - t) ** 2 * start
                + 2 * (1 - t) * t * control
                + t**2 * end
            )
    return values


def _rotated_symbol_bounds(
    svg: str, size: int
) -> tuple[float, float, float, float]:
    """Measure the exact post-rotation bounds of circles and quadratic paths."""
    center = size / 2
    sine = cosine = math.sqrt(.5)

    def rotate(point: tuple[float, float]) -> tuple[float, float]:
        x, y = point
        return (
            center + (x - center) * cosine - (y - center) * sine,
            center + (x - center) * sine + (y - center) * cosine,
        )

    bounds: list[tuple[float, float, float, float]] = []
    for path_data in re.findall(r'<path [^>]*d="([^"]+)"', svg):
        tokens = re.findall(r"[MHVQZ]|-?\d+(?:\.\d+)?", path_data)
        index = 0
        current = (0.0, 0.0)
        start = current
        xs: list[float] = []
        ys: list[float] = []
        while index < len(tokens):
            command = tokens[index]
            index += 1
            if command == "M":
                current = (float(tokens[index]), float(tokens[index + 1]))
                index += 2
                start = current
                rotated = rotate(current)
                xs.append(rotated[0])
                ys.append(rotated[1])
            elif command in {"H", "V"}:
                if command == "H":
                    end = (float(tokens[index]), current[1])
                else:
                    end = (current[0], float(tokens[index]))
                index += 1
                for point in (rotate(current), rotate(end)):
                    xs.append(point[0])
                    ys.append(point[1])
                current = end
            elif command == "Q":
                control = (float(tokens[index]), float(tokens[index + 1]))
                end = (float(tokens[index + 2]), float(tokens[index + 3]))
                index += 4
                rotated_start = rotate(current)
                rotated_control = rotate(control)
                rotated_end = rotate(end)
                xs.extend(
                    _quadratic_extrema(
                        rotated_start[0], rotated_control[0], rotated_end[0]
                    )
                )
                ys.extend(
                    _quadratic_extrema(
                        rotated_start[1], rotated_control[1], rotated_end[1]
                    )
                )
                current = end
            elif command == "Z":
                current = start
            else:  # pragma: no cover - generator paths use only this command subset
                raise AssertionError(f"unsupported path command: {command}")
        bounds.append((min(xs), min(ys), max(xs), max(ys)))

    circles = re.findall(
        r'<circle [^>]*cx="([^"]+)" cy="([^"]+)" r="([^"]+)"', svg
    )
    for cx, cy, radius in circles:
        rotated_center = rotate((float(cx), float(cy)))
        circle_radius = float(radius)
        bounds.append(
            (
                rotated_center[0] - circle_radius,
                rotated_center[1] - circle_radius,
                rotated_center[0] + circle_radius,
                rotated_center[1] + circle_radius,
            )
        )

    return (
        min(bound[0] for bound in bounds),
        min(bound[1] for bound in bounds),
        max(bound[2] for bound in bounds),
        max(bound[3] for bound in bounds),
    )


class LogoGeometryTests(unittest.TestCase):
    def test_approved_palette_and_nine_modules(self):
        self.assertEqual(COLORS, {
            "forest": "#153D36",
            "grain": "#EFBD50",
            "tomato": "#DF6B45",
            "cream": "#FFF7E7",
        })
        self.assertEqual(len(MODULES), 9)
        self.assertEqual(sum(module.kind == "seed" for module in MODULES), 4)
        self.assertEqual(sum(module.kind == "circle" for module in MODULES), 5)

    def test_dark_symbol_has_fixed_structure_and_no_forbidden_effects(self):
        svg = symbol_svg("color-dark")
        self.assertEqual(svg.count('data-module="'), 9)
        self.assertIn('transform="rotate(45 512 512)"', svg)
        self.assertNotRegex(svg, re.compile(r"<text|gradient|filter|stroke=", re.I))
        for color in COLORS.values():
            self.assertIn(color, svg)

    def test_single_color_variants_use_one_foreground_color(self):
        for variant, foreground in (("forest", "forest"), ("cream", "cream")):
            svg = symbol_svg(variant)
            fills = re.findall(r'data-module="[^"]+" fill="([^"]+)"', svg)
            self.assertEqual(fills, [COLORS[foreground]] * 9)
            self.assertNotIn("<rect", svg)

    def test_symbol_scales_and_remains_centered_and_in_bounds_at_small_sizes(self):
        for size in (32, 256):
            svg = symbol_svg("color-dark", size)
            center = size / 2
            self.assertIn(f'viewBox="0 0 {size} {size}"', svg)
            self.assertIn(f'transform="rotate(45 {center:g} {center:g})"', svg)

            circle = re.search(
                r'<circle data-module="1-1" fill="[^"]+" '
                r'cx="([^"]+)" cy="([^"]+)" r="([^"]+)"',
                svg,
            )
            self.assertIsNotNone(circle)
            cx, cy, _radius = map(float, circle.groups())
            self.assertAlmostEqual(cx, center, places=3)
            self.assertAlmostEqual(cy, center, places=3)

            left, top, right, bottom = _rotated_symbol_bounds(svg, size)
            self.assertAlmostEqual(right - left, size * .584, delta=size * .001)
            self.assertAlmostEqual(bottom - top, size * .584, delta=size * .001)
            self.assertGreaterEqual(
                min(left, top, size - right, size - bottom), size * .18
            )

            corner_radius = re.search(r'<rect [^>]* rx="([^"]+)"', svg)
            self.assertIsNotNone(corner_radius)
            self.assertAlmostEqual(float(corner_radius.group(1)), size * 220 / 1024, places=3)

    def test_default_symbol_has_58_4_percent_visual_extent_and_18_percent_safety_area(self):
        svg = symbol_svg("color-dark")
        left, top, right, bottom = _rotated_symbol_bounds(svg, 1024)
        visual_extent = max(right - left, bottom - top)
        safety = min(left, top, 1024 - right, 1024 - bottom)

        self.assertAlmostEqual(visual_extent, 1024 * .584, delta=.5)
        self.assertGreaterEqual(safety, 1024 * .18)

    def test_writer_outputs_each_complete_variant(self):
        names = {
            "color-dark": "ninka-symbol-color-dark.svg",
            "color-light": "ninka-symbol-color-light.svg",
            "forest": "ninka-symbol-forest.svg",
            "cream": "ninka-symbol-cream.svg",
        }
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            write_symbol_assets(root)
            output = root / "assets" / "branding" / "source"
            self.assertEqual({path.name for path in output.iterdir()}, set(names.values()))
            for variant, name in names.items():
                self.assertEqual((output / name).read_text(encoding="utf-8"), symbol_svg(variant))


if __name__ == "__main__":
    unittest.main()
