import shutil
import tempfile
import unittest
from pathlib import Path

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


if __name__ == "__main__":
    unittest.main()
