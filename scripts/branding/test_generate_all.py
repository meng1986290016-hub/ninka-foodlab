import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from generate_all import generate_all


ROOT = Path(__file__).resolve().parents[2]


class GenerateAllTests(unittest.TestCase):
    def test_generate_all_writes_source_platform_and_preview_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            font_dir = root / "assets" / "branding" / "fonts"
            font_dir.mkdir(parents=True)
            shutil.copy2(
                ROOT / "assets" / "branding" / "fonts" / "Manrope-VariableFont_wght.ttf",
                font_dir,
            )

            generate_all(root)

            expected = (
                "assets/branding/source/ninka-symbol-color-dark.svg",
                "assets/branding/source/ninka-lockup-horizontal-light.svg",
                "assets/branding/png/ninka-icon-1024.png",
                "assets/branding/platform/ninka-foodlab.ico",
                "assets/branding/platform/ninka-foodlab.icns",
                "assets/branding/preview/ninka-brand-sheet.png",
            )
            for relative_path in expected:
                self.assertTrue((root / relative_path).is_file(), relative_path)

    def test_regeneration_restores_identical_cross_platform_outputs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            font_dir = root / "assets" / "branding" / "fonts"
            font_dir.mkdir(parents=True)
            shutil.copy2(
                ROOT / "assets" / "branding" / "fonts" / "Manrope-VariableFont_wght.ttf",
                font_dir,
            )
            outputs = (
                "assets/branding/source/ninka-symbol-color-dark.svg",
                "assets/branding/source/ninka-lockup-horizontal-light.svg",
                "assets/branding/png/ninka-icon-64.png",
                "assets/branding/platform/ninka-foodlab.ico",
                "assets/branding/platform/ninka-foodlab.icns",
                "assets/branding/preview/ninka-brand-sheet.png",
            )

            with patch("export_icons.platform.system", return_value="Linux"):
                generate_all(root)
                first = {path: (root / path).read_bytes() for path in outputs}
                for path in outputs:
                    (root / path).write_bytes(b"stale or corrupted")
                generate_all(root)
                second = {path: (root / path).read_bytes() for path in outputs}

            self.assertEqual(second, first)


if __name__ == "__main__":
    unittest.main()
