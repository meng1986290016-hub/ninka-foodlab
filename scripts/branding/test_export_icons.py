from collections import deque
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image
from export_icons import (
    APPROVED_PNG_SIZES,
    ICNS_SIZES,
    ICNS_REPRESENTATIONS,
    ICO_SIZES,
    PREVIEW_SHEET_SIZE,
    export_all,
    read_icns_representations,
    render_icon,
    write_icns,
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
                if min(
                    color_distance(color, target) for target in foreground
                ) < color_distance(color, forest):
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

    def test_non_darwin_replaces_stale_icns_with_complete_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            platform_dir = Path(directory)
            target = platform_dir / "ninka-foodlab.icns"
            target.write_bytes(b"stale")

            with patch("export_icons.platform.system", return_value="Linux"), patch(
                "export_icons.subprocess.run"
            ) as iconutil:
                write_icns(platform_dir)

            iconutil.assert_not_called()
            representations = read_icns_representations(target)
            self.assertEqual(
                set(representations),
                {representation.chunk_type for representation in ICNS_REPRESENTATIONS},
            )
            for representation in ICNS_REPRESENTATIONS:
                self.assertEqual(
                    representations[representation.chunk_type].tobytes(),
                    render_icon(
                        representation.pixel_size,
                        simplified=representation.pixel_size < 32,
                    ).tobytes(),
                )

    def test_iconutil_failure_forces_complete_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            platform_dir = Path(directory)
            with patch("export_icons.platform.system", return_value="Darwin"), patch(
                "export_icons.subprocess.run",
                side_effect=subprocess.CalledProcessError(1, ["iconutil"]),
            ):
                write_icns(platform_dir)

            representations = read_icns_representations(
                platform_dir / "ninka-foodlab.icns"
            )
            self.assertEqual(len(representations), len(ICNS_REPRESENTATIONS))

    def test_invalid_fallback_is_removed_but_diagnostic_iconset_is_retained(self):
        with tempfile.TemporaryDirectory() as directory:
            platform_dir = Path(directory)
            target = platform_dir / "ninka-foodlab.icns"

            def write_invalid_icns(iconset, output):
                output.write_bytes(b"icns\x00\x00\x00\x08")

            with patch("export_icons.platform.system", return_value="Linux"), patch(
                "export_icons.write_fallback_icns", side_effect=write_invalid_icns
            ):
                with self.assertRaisesRegex(RuntimeError, "retained diagnostic iconset"):
                    write_icns(platform_dir)

            self.assertFalse(target.exists())
            self.assertEqual(len(list(platform_dir.glob(".*.iconset"))), 1)


if __name__ == "__main__":
    unittest.main()
