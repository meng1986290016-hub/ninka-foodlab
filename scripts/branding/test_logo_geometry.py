import math
import re
import tempfile
import unittest
from pathlib import Path

from logo_geometry import COLORS, MODULES, symbol_svg, write_symbol_assets


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
            cx, cy, radius = map(float, circle.groups())
            self.assertAlmostEqual(cx, center, places=3)
            self.assertAlmostEqual(cy, center, places=3)

            visual_extent = 2 * radius * (6 + 4 * .22 - 2 * .16) / math.sqrt(2)
            self.assertAlmostEqual(visual_extent, size * .57, delta=.01)
            self.assertGreaterEqual(center - visual_extent / 2, 0)
            self.assertLessEqual(center + visual_extent / 2, size)

            corner_radius = re.search(r'<rect [^>]* rx="([^"]+)"', svg)
            self.assertIsNotNone(corner_radius)
            self.assertAlmostEqual(float(corner_radius.group(1)), size * 220 / 1024, places=3)

    def test_default_symbol_has_57_percent_visual_extent_and_18_percent_safety_area(self):
        svg = symbol_svg("color-dark")
        radius = float(re.search(r'data-module="1-1" fill="[^"]+" cx="[^"]+" cy="[^"]+" r="([^"]+)"', svg).group(1))
        visual_extent = 2 * radius * (6 + 4 * .22 - 2 * .16) / math.sqrt(2)
        safety = (1024 - visual_extent) / 2

        self.assertAlmostEqual(visual_extent, 1024 * .57, delta=.01)
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
