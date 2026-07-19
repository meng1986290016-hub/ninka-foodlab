import unittest
from pathlib import Path

from wordmark import lockup_svg, outlined_word


class WordmarkTests(unittest.TestCase):
    def test_outlined_words_have_paths_and_positive_bounds(self):
        for text, weight in (("Ninka", 700), ("FoodLab", 400)):
            paths, width, height = outlined_word(text, weight)
            self.assertIn("<path", paths)
            self.assertGreater(width, 0)
            self.assertGreater(height, 0)

    def test_lockups_use_exact_name_without_text_or_font_dependencies(self):
        for layout in ("horizontal", "stacked"):
            svg = lockup_svg(layout, "dark")
            self.assertIn('data-brand-name="Ninka FoodLab"', svg)
            self.assertNotIn("<text", svg)
            self.assertNotIn("font-family", svg)
            self.assertNotIn("NInka", svg)

    def test_font_and_license_are_vendored(self):
        root = Path(__file__).resolve().parents[2]
        self.assertTrue(
            (root / "assets/branding/fonts/Manrope-VariableFont_wght.ttf").stat().st_size
            > 100_000
        )
        self.assertIn(
            "SIL OPEN FONT LICENSE",
            (root / "assets/branding/fonts/OFL.txt").read_text(),
        )


if __name__ == "__main__":
    unittest.main()
