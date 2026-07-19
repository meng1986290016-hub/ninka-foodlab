import re
import unittest

from logo_geometry import COLORS, MODULES, symbol_svg


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
        self.assertNotIn(COLORS["grain"], symbol_svg("forest"))
        self.assertNotIn(COLORS["tomato"], symbol_svg("cream"))


if __name__ == "__main__":
    unittest.main()
