import contextlib
from contextlib import contextmanager
import io
import shutil
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from export_icons import (
    ICNS_REPRESENTATIONS,
    export_all,
    render_icon,
    write_fallback_icns,
)
from logo_geometry import write_symbol_assets
from verify_assets import verify_assets, verify_svg
from wordmark import write_lockup_assets


ROOT = Path(__file__).resolve().parents[2]


class VerifyAssetsTests(unittest.TestCase):
    @contextmanager
    def _generated_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            font_dir = root / "assets" / "branding" / "fonts"
            font_dir.mkdir(parents=True)
            shutil.copy2(
                ROOT / "assets" / "branding" / "fonts" / "Manrope-VariableFont_wght.ttf",
                font_dir,
            )
            write_symbol_assets(root)
            write_lockup_assets(root)
            export_all(root)
            yield root

    def _write_svg(self, markup: str) -> Path:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / "asset.svg"
        path.write_text(markup, encoding="utf-8")
        return path

    def test_valid_palette_only_svg_passes(self):
        path = self._write_svg(
            '<svg xmlns="http://www.w3.org/2000/svg">'
            '<rect fill="#153D36"/><circle fill="#EFBD50"/></svg>'
        )
        verify_svg(path)

    def test_svg_rejects_forbidden_features(self):
        forbidden = {
            "text": '<text fill="#153D36">Ninka</text>',
            "gradient": '<linearGradient id="g"/>',
            "filter": '<filter id="f"/>',
            "style": "<style>path { fill: red; }</style>",
            "script": "<script>alert(1)</script>",
            "external URL": '<image href="https://example.com/logo.png"/>',
        }
        for name, content in forbidden.items():
            with self.subTest(name=name):
                path = self._write_svg(
                    f'<svg xmlns="http://www.w3.org/2000/svg">{content}</svg>'
                )
                with self.assertRaisesRegex(ValueError, "forbidden"):
                    verify_svg(path)

    def test_svg_rejects_unapproved_colors(self):
        for color in ("#000000", "red"):
            with self.subTest(color=color):
                path = self._write_svg(
                    '<svg xmlns="http://www.w3.org/2000/svg">'
                    f'<rect fill="{color}"/></svg>'
                )
                with self.assertRaisesRegex(ValueError, "unapproved color"):
                    verify_svg(path)

    def test_svg_rejects_external_xml_declarations(self):
        declarations = (
            '<!DOCTYPE svg SYSTEM "https://example.com/logo.dtd">',
            '<?xml-stylesheet href="https://example.com/theme.css"?>',
        )
        for declaration in declarations:
            with self.subTest(declaration=declaration):
                path = self._write_svg(
                    f'{declaration}<svg xmlns="http://www.w3.org/2000/svg">'
                    '<rect fill="#153D36"/></svg>'
                )
                with self.assertRaisesRegex(ValueError, "forbidden external declaration"):
                    verify_svg(path)

    def test_svg_requires_svg_root_and_allowlisted_elements(self):
        for markup in (
            '<html><rect fill="#153D36"/></html>',
            '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>',
            '<svg xmlns="https://example.com/not-svg"><path fill="#153D36"/></svg>',
            '<svg xmlns="http://www.w3.org/2000/svg" xmlns:x="https://example.com">'
            '<x:path fill="#153D36"/></svg>',
        ):
            with self.subTest(markup=markup):
                with self.assertRaisesRegex(ValueError, "SVG root|forbidden SVG element"):
                    verify_svg(self._write_svg(markup))

    def test_svg_rejects_style_stroke_and_font_attributes(self):
        attributes = (
            'style="fill: #153D36"',
            'stroke="#153D36"',
            'font-family="Manrope"',
        )
        for attribute in attributes:
            with self.subTest(attribute=attribute):
                path = self._write_svg(
                    '<svg xmlns="http://www.w3.org/2000/svg">'
                    f"<path {attribute}/></svg>"
                )
                with self.assertRaisesRegex(ValueError, "forbidden SVG attribute"):
                    verify_svg(path)

    def test_svg_rejects_unsafe_text_and_tail_content(self):
        contents = (
            "red",
            "#000000",
            "url(https://example.com/a.svg)",
            '@import "theme.css"',
            "font-family: Manrope",
            "stroke: #153D36",
        )
        for content in contents:
            for placement in ("text", "tail"):
                with self.subTest(content=content, placement=placement):
                    body = f"<g>{content}</g>" if placement == "text" else f"<g/>{content}"
                    path = self._write_svg(
                        f'<svg xmlns="http://www.w3.org/2000/svg">{body}</svg>'
                    )
                    with self.assertRaisesRegex(ValueError, "forbidden SVG character data"):
                        verify_svg(path)

    def test_complete_generated_asset_set_passes(self):
        with self._generated_assets() as root:
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                verify_assets(root)

            lines = output.getvalue().splitlines()
            self.assertEqual(len(lines), 6)
            self.assertEqual(lines[-1], "Ninka FoodLab branding assets verified")

    def test_corrupted_png_pixel_is_rejected(self):
        with self._generated_assets() as root:
            path = root / "assets" / "branding" / "png" / "ninka-icon-64.png"
            with Image.open(path) as image:
                corrupted = image.copy()
            corrupted.putpixel((32, 32), (1, 2, 3, 255))
            corrupted.save(path)

            with self.assertRaisesRegex(ValueError, "PNG content mismatch"):
                verify_assets(root)

    def test_corrupted_ico_frame_is_rejected(self):
        with self._generated_assets() as root:
            path = root / "assets" / "branding" / "platform" / "ninka-foodlab.ico"
            with Image.open(path) as image:
                frames = {
                    size: image.ico.getimage((size, size)).convert("RGBA")
                    for size in (16, 24, 32, 48, 64, 128, 256)
                }
            frames[64].putpixel((32, 32), (1, 2, 3, 255))
            frames[256].save(
                path,
                format="ICO",
                sizes=[(size, size) for size in frames],
                append_images=[frames[size] for size in frames if size != 256],
            )

            with self.assertRaisesRegex(ValueError, "ICO content mismatch"):
                verify_assets(root)

    def test_corrupted_preview_pixel_is_rejected(self):
        with self._generated_assets() as root:
            path = (
                root
                / "assets"
                / "branding"
                / "preview"
                / "ninka-brand-sheet.png"
            )
            with Image.open(path) as image:
                corrupted = image.copy()
            corrupted.putpixel((0, 0), (1, 2, 3, 255))
            corrupted.save(path)

            with self.assertRaisesRegex(ValueError, "Preview content mismatch"):
                verify_assets(root)

    def test_corrupted_icns_representation_is_rejected(self):
        with self._generated_assets() as root:
            platform_dir = root / "assets" / "branding" / "platform"
            iconset = platform_dir / "corrupted.iconset"
            iconset.mkdir()
            for representation in ICNS_REPRESENTATIONS:
                render_icon(
                    representation.pixel_size,
                    simplified=representation.pixel_size < 32,
                ).save(iconset / representation.filename)
            corrupted_path = iconset / "icon_128x128.png"
            with Image.open(corrupted_path) as image:
                corrupted = image.copy()
            corrupted.putpixel((64, 64), (1, 2, 3, 255))
            corrupted.save(corrupted_path)
            write_fallback_icns(
                iconset,
                platform_dir / "ninka-foodlab.icns",
            )

            with self.assertRaisesRegex(ValueError, "ICNS content mismatch"):
                verify_assets(root)


if __name__ == "__main__":
    unittest.main()
