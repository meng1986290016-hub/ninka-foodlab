from collections import deque
import shutil
import tempfile
import unittest
from pathlib import Path

from PIL import Image
from export_icons import (
    APPROVED_PNG_SIZES,
    ICNS_SIZES,
    ICO_SIZES,
    PREVIEW_SHEET_SIZE,
    export_all,
    render_icon,
)


ROOT = Path(__file__).resolve().parents[2]


class ExportIconTests(unittest.TestCase):
    @staticmethod
    def _foreground_component_count(image: Image.Image) -> int:
        forest = (21, 61, 54)
        foreground = ((239, 189, 80), (223, 107, 69), (255, 247, 231))

        def color_distance(left, right):
            return sum((a - b) ** 2 for a, b in zip(left, right))

        active = set()
        for y in range(image.height):
            for x in range(image.width):
                color = image.getpixel((x, y))[:3]
                if min(color_distance(color, target) for target in foreground) < color_distance(
                    color, forest
                ):
                    active.add((x, y))

        component_count = 0
        while active:
            component_count += 1
            queue = deque([active.pop()])
            while queue:
                x, y = queue.popleft()
                for neighbor in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if neighbor in active:
                        active.remove(neighbor)
                        queue.append(neighbor)
        return component_count

    def test_png_sizes_and_color_mode(self):
        for size in APPROVED_PNG_SIZES:
            image = render_icon(size, simplified=size < 32)
            self.assertEqual(image.size, (size, size))
            self.assertEqual(image.mode, "RGBA")

    def test_small_icons_keep_separate_foreground_components(self):
        for size in (16, 24, 32):
            image = render_icon(size, simplified=size < 32)
            colors = {
                pixel[:3] for pixel in image.get_flattened_data() if pixel[3] > 0
            }
            self.assertIn((21, 61, 54), colors)
            self.assertTrue(
                any(color in colors for color in ((239, 189, 80), (255, 247, 231)))
            )
            self.assertEqual(self._foreground_component_count(image), 9)

    def test_png_roundtrip(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "icon.png"
            render_icon(64, simplified=False).save(path)
            with Image.open(path) as image:
                self.assertEqual(image.size, (64, 64))

    def test_export_all_writes_platform_assets_and_preview(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            font_dir = root / "assets" / "branding" / "fonts"
            font_dir.mkdir(parents=True)
            shutil.copy2(
                ROOT / "assets" / "branding" / "fonts" / "Manrope-VariableFont_wght.ttf",
                font_dir,
            )

            export_all(root)

            for size in APPROVED_PNG_SIZES:
                with Image.open(
                    root / "assets" / "branding" / "png" / f"ninka-icon-{size}.png"
                ) as image:
                    self.assertEqual(image.size, (size, size))
                    self.assertEqual(image.mode, "RGBA")
            with Image.open(
                root / "assets" / "branding" / "platform" / "ninka-foodlab.ico"
            ) as image:
                self.assertEqual(image.ico.sizes(), {(size, size) for size in ICO_SIZES})
            icns = root / "assets" / "branding" / "platform" / "ninka-foodlab.icns"
            self.assertEqual(icns.read_bytes()[:4], b"icns")
            self.assertGreater(icns.stat().st_size, 1024)
            with Image.open(icns) as image:
                physical_sizes = {
                    (width * scale, height * scale)
                    for width, height, scale in image.info["sizes"]
                }
                self.assertTrue(
                    {(size, size) for size in ICNS_SIZES}.issubset(physical_sizes)
                )
            with Image.open(
                root / "assets" / "branding" / "preview" / "ninka-brand-sheet.png"
            ) as image:
                self.assertEqual(image.size, PREVIEW_SHEET_SIZE)
                self.assertEqual(image.mode, "RGBA")
                cream = (255, 247, 231)
                self.assertEqual(image.getpixel((48, 530))[:3], cream)
                self.assertEqual(image.getpixel((330, 810))[:3], cream)
                light_symbol_corner = image.crop((846, 570, 880, 600))
                self.assertEqual(
                    {pixel[:3] for pixel in light_symbol_corner.get_flattened_data()},
                    {cream},
                )


if __name__ == "__main__":
    unittest.main()
