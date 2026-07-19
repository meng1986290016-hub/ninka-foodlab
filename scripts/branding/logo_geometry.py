from dataclasses import dataclass
from html import escape
from pathlib import Path
from typing import Optional


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
    seed_corner: Optional[str] = None


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


def _rounded_rect_path(
    x: float, y: float, side: float, radii: tuple[float, float, float, float]
) -> str:
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
