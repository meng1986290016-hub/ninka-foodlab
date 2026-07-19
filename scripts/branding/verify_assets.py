"""Verify the complete generated Ninka FoodLab branding asset set."""

from pathlib import Path
import re
import xml.etree.ElementTree as ET

from PIL import Image

from export_icons import (
    APPROVED_PNG_SIZES,
    ICNS_REPRESENTATIONS,
    ICNS_SIZES,
    ICO_SIZES,
    PREVIEW_SHEET_SIZE,
    render_icon,
    render_preview_sheet,
    validate_icns,
)
from logo_geometry import COLORS


_APPROVED_COLORS = {value.upper() for value in COLORS.values()}
_HEX_COLOR = re.compile(r"#[0-9a-fA-F]{3,8}\b")
_EXTERNAL_REFERENCE = re.compile(
    r"(?:https?|file|data|javascript):|//|url\s*\(|@import\b", re.IGNORECASE
)
_FORBIDDEN_XML_DECLARATION = re.compile(
    r"<!DOCTYPE\b|<!ENTITY\b|<\?xml-stylesheet\b", re.IGNORECASE
)
_SVG_NAMESPACE = "http://www.w3.org/2000/svg"
_ALLOWED_TAGS = {"svg", "rect", "g", "path", "circle"}
_COLOR_ATTRIBUTES = {"fill", "stroke", "color", "stop-color", "flood-color"}
_EXPECTED_SVGS = {
    "ninka-symbol-color-dark.svg",
    "ninka-symbol-color-light.svg",
    "ninka-symbol-forest.svg",
    "ninka-symbol-cream.svg",
    "ninka-lockup-horizontal-dark.svg",
    "ninka-lockup-horizontal-light.svg",
    "ninka-lockup-stacked-dark.svg",
    "ninka-lockup-stacked-light.svg",
}


def _local_name(name: str) -> str:
    return name.rsplit("}", 1)[-1].lower()


def _require_matching_pixels(
    actual: Image.Image, expected: Image.Image, description: str
) -> None:
    actual_rgba = actual.convert("RGBA")
    expected_rgba = expected.convert("RGBA")
    if (
        actual_rgba.size != expected_rgba.size
        or actual_rgba.tobytes() != expected_rgba.tobytes()
    ):
        raise ValueError(description)


def verify_svg(path: Path) -> None:
    """Parse and reject unsafe or non-palette SVG content."""
    markup = path.read_text(encoding="utf-8")
    if _FORBIDDEN_XML_DECLARATION.search(markup):
        raise ValueError(f"forbidden external declaration in {path}")
    try:
        root = ET.fromstring(markup)
    except ET.ParseError as error:
        raise ValueError(f"invalid SVG XML: {path}") from error

    if root.tag != f"{{{_SVG_NAMESPACE}}}svg":
        raise ValueError(f"SVG root element required: {path}")

    for element in root.iter():
        if not element.tag.startswith(f"{{{_SVG_NAMESPACE}}}"):
            raise ValueError(f"forbidden SVG element namespace in {path}")
        tag = _local_name(element.tag)
        if tag not in _ALLOWED_TAGS:
            raise ValueError(f"forbidden SVG element <{tag}> in {path}")
        for content in (element.text, element.tail):
            if content and content.strip():
                raise ValueError(f"forbidden SVG character data in {path}")
        for attribute, value in element.attrib.items():
            local_attribute = _local_name(attribute)
            if (
                local_attribute == "style"
                or local_attribute.startswith("on")
                or local_attribute.startswith("stroke")
                or local_attribute.startswith("font")
                or local_attribute.startswith("filter")
            ):
                raise ValueError(
                    f"forbidden SVG attribute {local_attribute} in {path}"
                )
            if _EXTERNAL_REFERENCE.search(value):
                raise ValueError(f"forbidden external URL in {path}")
            for color in _HEX_COLOR.findall(value):
                if color.upper() not in _APPROVED_COLORS:
                    raise ValueError(f"unapproved color {color} in {path}")
            if local_attribute in _COLOR_ATTRIBUTES:
                normalized = value.strip().upper()
                if normalized != "NONE" and normalized not in _APPROVED_COLORS:
                    raise ValueError(f"unapproved color {value} in {path}")


def verify_assets(root: Path) -> None:
    """Validate and report every generated branding asset group."""
    branding = root / "assets" / "branding"
    source_dir = branding / "source"
    svg_paths = sorted(source_dir.glob("*.svg"))
    svg_names = {path.name for path in svg_paths}
    if svg_names != _EXPECTED_SVGS:
        missing = sorted(_EXPECTED_SVGS - svg_names)
        extra = sorted(svg_names - _EXPECTED_SVGS)
        raise ValueError(f"SVG asset set mismatch; missing={missing}, extra={extra}")
    for path in svg_paths:
        verify_svg(path)
        if "lockup" in path.name:
            document = ET.parse(path).getroot()
            if document.attrib.get("data-brand-name") != "Ninka FoodLab":
                raise ValueError(f"incorrect formal brand name metadata in {path}")
    print(f"SVG assets: {len(svg_paths)} verified")

    png_dir = branding / "png"
    expected_png_names = {
        f"ninka-icon-{size}.png" for size in APPROVED_PNG_SIZES
    }
    png_paths = sorted(png_dir.glob("*.png"))
    if {path.name for path in png_paths} != expected_png_names:
        raise ValueError("PNG asset set does not match approved sizes")
    for size in APPROVED_PNG_SIZES:
        path = png_dir / f"ninka-icon-{size}.png"
        with Image.open(path) as image:
            if image.size != (size, size) or image.mode != "RGBA":
                raise ValueError(f"invalid PNG dimensions or mode: {path}")
            image.load()
            _require_matching_pixels(
                image,
                render_icon(size, simplified=size < 32),
                f"PNG content mismatch: {path.name}",
            )
    print(f"PNG assets: {len(png_paths)} verified")

    ico_path = branding / "platform" / "ninka-foodlab.ico"
    with Image.open(ico_path) as image:
        ico_sizes = image.ico.sizes()
    expected_ico_sizes = {(size, size) for size in ICO_SIZES}
    if ico_sizes != expected_ico_sizes:
        raise ValueError(
            f"ICO frame mismatch; expected={expected_ico_sizes}, actual={ico_sizes}"
        )
    with Image.open(ico_path) as image:
        for size in ICO_SIZES:
            _require_matching_pixels(
                image.ico.getimage((size, size)),
                render_icon(size, simplified=size < 32),
                f"ICO content mismatch: {size}px frame",
            )
    print(f"ICO asset: {len(ico_sizes)} frames verified")

    icns_path = branding / "platform" / "ninka-foodlab.icns"
    if icns_path.read_bytes()[:4] != b"icns" or icns_path.stat().st_size <= 1024:
        raise ValueError("invalid ICNS signature or file size")
    validate_icns(icns_path)
    print(
        f"ICNS asset: {len(ICNS_REPRESENTATIONS)} representations / "
        f"{len(ICNS_SIZES)} physical sizes verified"
    )

    preview_path = branding / "preview" / "ninka-brand-sheet.png"
    with Image.open(preview_path) as image:
        if image.size != PREVIEW_SHEET_SIZE or image.mode != "RGBA":
            raise ValueError("invalid preview sheet dimensions or mode")
        image.load()
        _require_matching_pixels(
            image,
            render_preview_sheet(root),
            "Preview content mismatch",
        )
    print("Preview sheet: dimensions and RGBA mode verified")
    print("Ninka FoodLab branding assets verified")


if __name__ == "__main__":
    verify_assets(Path(__file__).resolve().parents[2])
