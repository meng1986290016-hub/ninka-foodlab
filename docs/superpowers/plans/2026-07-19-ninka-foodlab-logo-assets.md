# Ninka FoodLab Logo Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate production-ready Ninka FoodLab SVG, PNG, ICO, and ICNS brand assets from one deterministic geometry definition.

**Architecture:** A small Python branding pipeline owns the symbol geometry, approved colors, Manrope wordmark outlines, and platform exports. Vector SVG files and raster/platform icons are generated artifacts committed under `assets/branding`; a separate verifier checks names, colors, dimensions, file signatures, and small-size visibility without coupling branding code to the application calculation package.

**Tech Stack:** Python 3.12+, Pillow 12.2, fontTools 4.60, SVG 1.1, macOS `iconutil`, `unittest`.

## Global Constraints

- The formal name is exactly `Ninka FoodLab`.
- The symbol uses nine modules in a three-by-three grid rotated 45 degrees.
- The four corner modules are outward-facing rounded seed shapes; the other five modules are circles.
- Approved colors are Forest `#153D36`, Grain `#EFBD50`, Tomato `#DF6B45`, and Cream `#FFF7E7`.
- `Ninka` uses Manrope weight 700 and `FoodLab` uses Manrope weight 400; final SVG lockups contain outlined glyph paths, not `<text>` or external font references.
- The app icon contains no words, initials, tagline, gradient, shadow, stroke, or gloss.
- Raster exports include `16, 24, 32, 48, 64, 128, 256, 512, 1024 px`; ICO includes `16, 24, 32, 48, 64, 128, 256 px`; ICNS is generated on macOS.
- Existing calculation packages and their runtime dependencies remain unchanged.

---

### Task 1: Define deterministic symbol geometry and vector variants

**Files:**
- Modify: `.gitignore`
- Create: `scripts/branding/requirements.txt`
- Create: `scripts/branding/logo_geometry.py`
- Create: `scripts/branding/test_logo_geometry.py`
- Create: `assets/branding/source/ninka-symbol-color-dark.svg`
- Create: `assets/branding/source/ninka-symbol-color-light.svg`
- Create: `assets/branding/source/ninka-symbol-forest.svg`
- Create: `assets/branding/source/ninka-symbol-cream.svg`

**Interfaces:**
- Consumes: approved values from `docs/superpowers/specs/2026-07-19-ninka-foodlab-logo-design.md`.
- Produces: `COLORS`, `MODULES`, `symbol_svg(variant: str, size: int = 1024) -> str`, and four standalone SVG symbol assets used by later tasks.

- [ ] **Step 1: Add pinned branding dependencies**

Create `scripts/branding/requirements.txt`:

```text
fonttools==4.60.1
Pillow==12.2.0
```

- [ ] **Step 2: Create an isolated branding environment**

Add `.venv-branding/` to `.gitignore`, then run:

```bash
python3 -m venv .venv-branding
.venv-branding/bin/python -m pip install -r scripts/branding/requirements.txt
```

Expected: `.venv-branding/bin/python` imports both `fontTools` and `PIL` without errors.

- [ ] **Step 3: Write geometry tests that initially fail**

Create `scripts/branding/test_logo_geometry.py`:

```python
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
```

- [ ] **Step 4: Run the test to verify it fails**

Run:

```bash
PYTHONPATH=scripts/branding .venv-branding/bin/python -m unittest scripts/branding/test_logo_geometry.py -v
```

Expected: `ModuleNotFoundError: No module named 'logo_geometry'`.

- [ ] **Step 5: Implement the geometry generator**

Create `scripts/branding/logo_geometry.py` with immutable module data and these public functions:

```python
from dataclasses import dataclass
from html import escape

COLORS = {
    "forest": "#153D36",
    "grain": "#EFBD50",
    "tomato": "#DF6B45",
    "cream": "#FFF7E7",
}


@dataclass(frozen=True)
class Module:
    row: int
    column: int
    kind: str
    color: str
    seed_corner: str | None = None


MODULES = (
    Module(0, 0, "seed", "grain", "top-left"),
    Module(0, 1, "circle", "cream"),
    Module(0, 2, "seed", "tomato", "top-right"),
    Module(1, 0, "circle", "cream"),
    Module(1, 1, "circle", "grain"),
    Module(1, 2, "circle", "cream"),
    Module(2, 0, "seed", "tomato", "bottom-left"),
    Module(2, 1, "circle", "cream"),
    Module(2, 2, "seed", "grain", "bottom-right"),
)

VARIANTS = {
    "color-dark": ("forest", None),
    "color-light": ("cream", None),
    "forest": (None, "forest"),
    "cream": (None, "cream"),
}


def _module_fill(module: Module, variant: str) -> str:
    background, foreground = VARIANTS[variant]
    if foreground:
        return COLORS[foreground]
    if variant == "color-light" and module.color == "cream":
        return COLORS["forest"]
    return COLORS[module.color]


def _rounded_rect_path(x: float, y: float, side: float, radii: tuple[float, float, float, float]) -> str:
    top_left, top_right, bottom_right, bottom_left = radii
    return (
        f"M {x + top_left:.3f} {y:.3f} "
        f"H {x + side - top_right:.3f} Q {x + side:.3f} {y:.3f} {x + side:.3f} {y + top_right:.3f} "
        f"V {y + side - bottom_right:.3f} Q {x + side:.3f} {y + side:.3f} {x + side - bottom_right:.3f} {y + side:.3f} "
        f"H {x + bottom_left:.3f} Q {x:.3f} {y + side:.3f} {x:.3f} {y + side - bottom_left:.3f} "
        f"V {y + top_left:.3f} Q {x:.3f} {y:.3f} {x + top_left:.3f} {y:.3f} Z"
    )


def _shape(module: Module, x: float, y: float, side: float, variant: str) -> str:
    fill = _module_fill(module, variant)
    common = f'data-module="{module.row}-{module.column}" fill="{escape(fill)}"'
    if module.kind == "circle":
        radius = side / 2
        return f'<circle {common} cx="{x + radius:.3f}" cy="{y + radius:.3f}" r="{radius:.3f}"/>'
    radii = {
        "top-left": (side * .16, side / 2, side / 2, side / 2),
        "top-right": (side / 2, side * .16, side / 2, side / 2),
        "bottom-left": (side / 2, side / 2, side / 2, side * .16),
        "bottom-right": (side / 2, side / 2, side * .16, side / 2),
    }
    path = _rounded_rect_path(x, y, side, radii[module.seed_corner])
    return f'<path {common} data-seed-corner="{module.seed_corner}" d="{path}"/>'


def symbol_svg(variant: str, size: int = 1024) -> str:
    if variant not in VARIANTS:
        raise ValueError(f"unknown variant: {variant}")
    module_side = 142.0
    gap = module_side * .22
    grid_side = module_side * 3 + gap * 2
    origin = (size - grid_side) / 2
    background, _ = VARIANTS[variant]
    backdrop = ""
    if background:
        backdrop = f'<rect width="{size}" height="{size}" rx="220" fill="{COLORS[background]}"/>'
    shapes = []
    for module in MODULES:
        x = origin + module.column * (module_side + gap)
        y = origin + module.row * (module_side + gap)
        shapes.append(_shape(module, x, y, module_side, variant))
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" '
        f'width="{size}" height="{size}">{backdrop}'
        f'<g transform="rotate(45 512 512)">{"".join(shapes)}</g></svg>\n'
    )
```

- [ ] **Step 6: Add a vector asset writer and generate four SVGs**

Append to `scripts/branding/logo_geometry.py`:

```python
from pathlib import Path


def write_symbol_assets(root: Path) -> None:
    output = root / "assets" / "branding" / "source"
    output.mkdir(parents=True, exist_ok=True)
    names = {
        "color-dark": "ninka-symbol-color-dark.svg",
        "color-light": "ninka-symbol-color-light.svg",
        "forest": "ninka-symbol-forest.svg",
        "cream": "ninka-symbol-cream.svg",
    }
    for variant, name in names.items():
        (output / name).write_text(symbol_svg(variant), encoding="utf-8")


if __name__ == "__main__":
    write_symbol_assets(Path(__file__).resolve().parents[2])
```

Run:

```bash
PYTHONPATH=scripts/branding .venv-branding/bin/python scripts/branding/logo_geometry.py
PYTHONPATH=scripts/branding .venv-branding/bin/python -m unittest discover -s scripts/branding -p 'test_*.py' -v
```

Expected: four SVG files are created and all geometry tests pass.

- [ ] **Step 7: Commit the vector symbol milestone**

```bash
git add scripts/branding assets/branding/source
git commit -m "feat(brand): add Ninka symbol geometry"
```

---

### Task 2: Generate outlined wordmarks and lockups

**Files:**
- Create: `assets/branding/fonts/Manrope-VariableFont_wght.ttf`
- Create: `assets/branding/fonts/OFL.txt`
- Create: `scripts/branding/wordmark.py`
- Create: `scripts/branding/test_wordmark.py`
- Create: `assets/branding/source/ninka-lockup-horizontal-dark.svg`
- Create: `assets/branding/source/ninka-lockup-horizontal-light.svg`
- Create: `assets/branding/source/ninka-lockup-stacked-dark.svg`
- Create: `assets/branding/source/ninka-lockup-stacked-light.svg`

**Interfaces:**
- Consumes: `COLORS` and symbol path fragments from `logo_geometry.py`; Manrope variable font licensed under SIL OFL 1.1.
- Produces: `outlined_word(text: str, weight: int) -> tuple[str, float, float]`, `lockup_svg(layout: str, theme: str) -> str`, and four font-independent lockup SVGs.

- [ ] **Step 1: Vendor the approved open-source typeface and license**

Download the font and license from the Google Fonts repository:

```bash
mkdir -p assets/branding/fonts
curl -L 'https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/Manrope%5Bwght%5D.ttf' -o assets/branding/fonts/Manrope-VariableFont_wght.ttf
curl -L 'https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/OFL.txt' -o assets/branding/fonts/OFL.txt
```

Verify both files are non-empty and `OFL.txt` contains `SIL OPEN FONT LICENSE Version 1.1`.

- [ ] **Step 2: Write failing outline and naming tests**

Create `scripts/branding/test_wordmark.py`:

```python
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
            self.assertIn("data-brand-name=\"Ninka FoodLab\"", svg)
            self.assertNotIn("<text", svg)
            self.assertNotIn("font-family", svg)
            self.assertNotIn("NInka", svg)

    def test_font_and_license_are_vendored(self):
        root = Path(__file__).resolve().parents[2]
        self.assertTrue((root / "assets/branding/fonts/Manrope-VariableFont_wght.ttf").stat().st_size > 100_000)
        self.assertIn("SIL OPEN FONT LICENSE", (root / "assets/branding/fonts/OFL.txt").read_text())


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run tests and verify outline generation is missing**

Run:

```bash
PYTHONPATH=scripts/branding .venv-branding/bin/python -m unittest scripts/branding/test_wordmark.py -v
```

Expected: `ModuleNotFoundError: No module named 'wordmark'`.

- [ ] **Step 4: Implement glyph outlining and lockup composition**

Create `scripts/branding/wordmark.py`. Use `fontTools.ttLib.TTFont`, `fontTools.varLib.instancer.instantiateVariableFont`, and `fontTools.pens.svgPathPen.SVGPathPen` to instantiate weights 700 and 400, map Unicode characters to glyph names, apply each glyph advance and kerning, flip the font coordinate system into SVG coordinates, and return path-only markup. Expose these exact functions:

```python
def outlined_word(text: str, weight: int) -> tuple[str, float, float]:
    """Return SVG path markup, total advance width, and cap-height-based height."""


def lockup_svg(layout: str, theme: str) -> str:
    """Return horizontal or stacked lockup using dark or light approved colors."""


def write_lockup_assets(root: Path) -> None:
    """Write the four approved lockup SVG variants under assets/branding/source."""
```

The horizontal lockup must place the symbol left of the wordmark, make the symbol `1.8 ×` the wordmark cap height, and use a gap equal to `32%` of symbol width. The stacked lockup centers the wordmark below the symbol. Both must set `data-brand-name="Ninka FoodLab"` on the root SVG and must not contain `<text>`, `font-family`, or an external file URL.

- [ ] **Step 5: Generate and verify the lockup assets**

Run:

```bash
PYTHONPATH=scripts/branding .venv-branding/bin/python scripts/branding/wordmark.py
PYTHONPATH=scripts/branding .venv-branding/bin/python -m unittest discover -s scripts/branding -p 'test_*.py' -v
```

Expected: four lockup SVG files are generated and all tests pass.

- [ ] **Step 6: Commit the wordmark milestone**

```bash
git add assets/branding/fonts assets/branding/source scripts/branding
git commit -m "feat(brand): add outlined Ninka wordmarks"
```

---

### Task 3: Export platform icons and verify deliverables

**Files:**
- Create: `scripts/branding/export_icons.py`
- Create: `scripts/branding/generate_all.py`
- Create: `scripts/branding/verify_assets.py`
- Create: `scripts/branding/test_export_icons.py`
- Create: `assets/branding/png/ninka-icon-{size}.png` for each approved size
- Create: `assets/branding/platform/ninka-foodlab.ico`
- Create: `assets/branding/platform/ninka-foodlab.icns`
- Create: `assets/branding/README.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: module definitions from `logo_geometry.py` and approved SVG source assets.
- Produces: `render_icon(size: int, simplified: bool) -> PIL.Image.Image`, `export_all(root: Path) -> None`, a cross-platform ICO, a macOS ICNS, PNG size set, verification command, and documented integration paths.

- [ ] **Step 1: Write failing raster export tests**

Create `scripts/branding/test_export_icons.py`:

```python
import tempfile
import unittest
from pathlib import Path

from PIL import Image
from export_icons import APPROVED_PNG_SIZES, render_icon


class ExportIconTests(unittest.TestCase):
    def test_png_sizes_and_color_mode(self):
        for size in APPROVED_PNG_SIZES:
            image = render_icon(size, simplified=size < 32)
            self.assertEqual(image.size, (size, size))
            self.assertEqual(image.mode, "RGBA")

    def test_small_icons_keep_separate_foreground_components(self):
        for size in (16, 24, 32):
            image = render_icon(size, simplified=size < 32)
            colors = {pixel[:3] for pixel in image.getdata() if pixel[3] > 0}
            self.assertIn((21, 61, 54), colors)
            self.assertTrue(any(color in colors for color in ((239, 189, 80), (255, 247, 231))))

    def test_png_roundtrip(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "icon.png"
            render_icon(64, simplified=False).save(path)
            with Image.open(path) as image:
                self.assertEqual(image.size, (64, 64))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests and verify the exporter is missing**

Run:

```bash
PYTHONPATH=scripts/branding .venv-branding/bin/python -m unittest scripts/branding/test_export_icons.py -v
```

Expected: `ModuleNotFoundError: No module named 'export_icons'`.

- [ ] **Step 3: Implement antialiased PNG and ICO exports**

Create `scripts/branding/export_icons.py` with these constants and functions:

```python
APPROVED_PNG_SIZES = (16, 24, 32, 48, 64, 128, 256, 512, 1024)
ICO_SIZES = (16, 24, 32, 48, 64, 128, 256)


def render_icon(size: int, simplified: bool) -> Image.Image:
    """Render at 4× resolution with Pillow, then downsample using LANCZOS."""


def export_all(root: Path) -> None:
    """Write PNGs, multi-resolution ICO, iconset PNGs, and ICNS on macOS."""
```

`render_icon` must use the same module table, color table, rotation, `57%` symbol-to-container ratio, and Forest background as the SVG generator. For `16` and `24 px`, use `30%` module gaps and round all outer seed corners enough to prevent merging. Save ICO with Pillow's `sizes=[(size, size) for size in ICO_SIZES]`. On macOS, create a temporary `.iconset` with the filenames required by `iconutil`, run `iconutil -c icns`, and remove only the validated temporary iconset after the ICNS exists.

- [ ] **Step 4: Add full-deliverable verification**

Create `scripts/branding/verify_assets.py` so it:

1. Parses every SVG as XML.
2. Rejects `<text>`, gradients, filters, external URLs, or colors outside the approved palette.
3. Checks each PNG's exact dimensions and RGBA mode.
4. Opens the ICO and confirms all approved frames.
5. Checks that the ICNS file begins with the `icns` signature and is larger than 1 KB.
6. Prints one line per asset group followed by `Ninka FoodLab branding assets verified`.

- [ ] **Step 5: Add reproducible commands and usage documentation**

Modify the root `package.json` scripts:

```json
{
  "brand:generate": "PYTHONPATH=scripts/branding .venv-branding/bin/python scripts/branding/generate_all.py",
  "brand:verify": "PYTHONPATH=scripts/branding .venv-branding/bin/python scripts/branding/verify_assets.py"
}
```

Create `scripts/branding/generate_all.py` to call `write_symbol_assets`, `write_lockup_assets`, and `export_all` in that order. Create `assets/branding/README.md` documenting the concept, exact palette, asset index, minimum sizes, forbidden uses, font license location, and future Tauri integration targets.

- [ ] **Step 6: Generate assets and run all verification**

Run:

```bash
PYTHONPATH=scripts/branding .venv-branding/bin/python scripts/branding/generate_all.py
PYTHONPATH=scripts/branding .venv-branding/bin/python -m unittest discover -s scripts/branding -p 'test_*.py' -v
PYTHONPATH=scripts/branding .venv-branding/bin/python scripts/branding/verify_assets.py
pnpm typecheck
pnpm test
pnpm build
```

Expected:

- Branding unit tests: all pass.
- Verifier final line: `Ninka FoodLab branding assets verified`.
- Existing TypeScript typecheck, tests, and build: all pass without changes to `packages/core`.

- [ ] **Step 7: Visually inspect the generated contact sheet**

Generate `assets/branding/preview/ninka-brand-sheet.png` containing the app icon at `16, 24, 32, 64, 128, 256 px`, both horizontal lockups, both single-color marks, and the four color swatches. Inspect it at original resolution and confirm no clipped geometry, merged modules, fuzzy edges, incorrect names, or unintended colors.

- [ ] **Step 8: Commit the complete asset set**

```bash
git add package.json scripts/branding assets/branding
git commit -m "feat(brand): generate Ninka FoodLab logo assets"
```
