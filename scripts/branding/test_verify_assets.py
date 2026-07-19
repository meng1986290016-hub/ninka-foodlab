import contextlib
import io
import shutil
import tempfile
import unittest
from pathlib import Path

from export_icons import export_all
from logo_geometry import write_symbol_assets
from verify_assets import verify_assets, verify_svg
from wordmark import write_lockup_assets


ROOT = Path(__file__).resolve().parents[2]


class VerifyAssetsTests(unittest.TestCase):
    def _write_svg(self, markup: str) -> Path:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / "asset.svg"
        path.write_text(markup, encoding="utf-8")
        return path

    def test_valid_palette_only_svg_passes(self):
        path = self._write_svg(
            '<svg xmlns="http://www.w3.org/2000/svg">'
            '<rect fill="#153D36" stroke="#EFBD50"/></svg>'
        )
        verify_svg(path)

    def test_svg_rejects_forbidden_features(self):
        forbidden = {
            "text": '<text fill="#153D36">Ninka</text>',
            "gradient": '<linearGradient id="g"/>',
            "filter": '<filter id="f"/>',
            "external URL": '<image href="https://example.com/logo.png"/>',
        }
        for name, content in forbidden.items():
            with self.subTest(name=name):
                path = self._write_svg(
                    f'<svg xmlns="http://www.w3.org/2000/svg">{content}</svg>'
                )
                with self.assertRaisesRegex(ValueError, "forbidden"):
                    verify_svg(path)

    def test_svg_rejects_unapproved_color(self):
        path = self._write_svg(
            '<svg xmlns="http://www.w3.org/2000/svg">'
            '<rect fill="#000000"/></svg>'
        )
        with self.assertRaisesRegex(ValueError, "unapproved color"):
            verify_svg(path)

    def test_complete_generated_asset_set_passes(self):
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

            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                verify_assets(root)

            lines = output.getvalue().splitlines()
            self.assertEqual(len(lines), 6)
            self.assertEqual(lines[-1], "Ninka FoodLab branding assets verified")


if __name__ == "__main__":
    unittest.main()
