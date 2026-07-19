"""Regenerate the complete Ninka FoodLab branding asset set."""

from pathlib import Path

from export_icons import export_all
from logo_geometry import write_symbol_assets
from wordmark import write_lockup_assets


def generate_all(root: Path) -> None:
    """Generate canonical SVGs, then platform exports and preview assets."""
    write_symbol_assets(root)
    write_lockup_assets(root)
    export_all(root)


if __name__ == "__main__":
    generate_all(Path(__file__).resolve().parents[2])
