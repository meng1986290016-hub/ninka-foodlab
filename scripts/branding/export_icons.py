"""Render and export Ninka FoodLab platform icons."""

from dataclasses import dataclass
from io import BytesIO
from math import cos, pi, sin, sqrt
from pathlib import Path
import platform
import shutil
import struct
import subprocess
import tempfile

from PIL import Image, ImageColor, ImageDraw, ImageFont

from logo_geometry import COLORS, MODULES, VARIANTS, _module_fill


APPROVED_PNG_SIZES = (16, 24, 32, 48, 64, 128, 256, 512, 1024)
ICO_SIZES = (16, 24, 32, 48, 64, 128, 256)
PREVIEW_SHEET_SIZE = (1600, 1200)


@dataclass(frozen=True)
class IcnsRepresentation:
    chunk_type: bytes
    filename: str
    point_size: int
    scale: int

    @property
    def pixel_size(self) -> int:
        return self.point_size * self.scale


ICNS_REPRESENTATIONS = (
    IcnsRepresentation(b"icp4", "icon_16x16.png", 16, 1),
    IcnsRepresentation(b"ic11", "icon_16x16@2x.png", 16, 2),
    IcnsRepresentation(b"icp5", "icon_32x32.png", 32, 1),
    IcnsRepresentation(b"ic12", "icon_32x32@2x.png", 32, 2),
    IcnsRepresentation(b"ic07", "icon_128x128.png", 128, 1),
    IcnsRepresentation(b"ic13", "icon_128x128@2x.png", 128, 2),
    IcnsRepresentation(b"ic08", "icon_256x256.png", 256, 1),
    IcnsRepresentation(b"ic14", "icon_256x256@2x.png", 256, 2),
    IcnsRepresentation(b"ic09", "icon_512x512.png", 512, 1),
    IcnsRepresentation(b"ic10", "icon_512x512@2x.png", 512, 2),
)
ICNS_SIZES = tuple(
    sorted({representation.pixel_size for representation in ICNS_REPRESENTATIONS})
)

_RENDER_SCALE = 4
_VISUAL_EXTENT_RATIO = 0.57
_STANDARD_GAP_RATIO = 0.22
_SIMPLIFIED_GAP_RATIO = 0.30
_SEED_CORNER_RADIUS_RATIO = 0.16
_SIMPLIFIED_SEED_CORNER_RADIUS_RATIO = 0.30
_BACKGROUND_RADIUS_RATIO = 220 / 1024


def _rounded_rect_points(
    x: float,
    y: float,
    side: float,
    radii: tuple[float, float, float, float],
) -> list[tuple[float, float]]:
    """Approximate a per-corner rounded rectangle for Pillow."""
    points: list[tuple[float, float]] = []
    corners = (
        (x + radii[0], y + radii[0], pi, 1.5 * pi, radii[0]),
        (x + side - radii[1], y + radii[1], 1.5 * pi, 2 * pi, radii[1]),
        (x + side - radii[2], y + side - radii[2], 0, 0.5 * pi, radii[2]),
        (x + radii[3], y + side - radii[3], 0.5 * pi, pi, radii[3]),
    )
    for center_x, center_y, start, end, radius in corners:
        for step in range(9):
            angle = start + (end - start) * step / 8
            points.append(
                (center_x + radius * cos(angle), center_y + radius * sin(angle))
            )
    return points


def _render_symbol(
    size: int, variant: str, simplified: bool, include_container: bool = True
) -> Image.Image:
    """Render one approved symbol variant with the raster backend."""
    if size <= 0:
        raise ValueError("size must be positive")
    if variant not in VARIANTS:
        raise ValueError(f"unknown variant: {variant}")

    canvas_size = size * _RENDER_SCALE
    background, _ = VARIANTS[variant]
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    if background and include_container:
        canvas = Image.new("RGBA", (canvas_size, canvas_size), COLORS[background])
        background_mask = Image.new("L", (canvas_size, canvas_size), 0)
        ImageDraw.Draw(background_mask).rounded_rectangle(
            (0, 0, canvas_size - 1, canvas_size - 1),
            radius=canvas_size * _BACKGROUND_RADIUS_RATIO,
            fill=255,
        )
        canvas.putalpha(background_mask)

    symbol_layer = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(symbol_layer)
    gap_ratio = _SIMPLIFIED_GAP_RATIO if simplified else _STANDARD_GAP_RATIO
    outer_radius_ratio = (
        _SIMPLIFIED_SEED_CORNER_RADIUS_RATIO
        if simplified
        else _SEED_CORNER_RADIUS_RATIO
    )
    module_side = canvas_size * _VISUAL_EXTENT_RATIO * sqrt(2) / (
        6 + 4 * gap_ratio - 2 * outer_radius_ratio
    )
    gap = module_side * gap_ratio
    grid_side = module_side * 3 + gap * 2
    origin = (canvas_size - grid_side) / 2

    for module in MODULES:
        x = origin + module.column * (module_side + gap)
        y = origin + module.row * (module_side + gap)
        fill = _module_fill(module, variant)
        if module.kind == "circle":
            draw.ellipse((x, y, x + module_side, y + module_side), fill=fill)
            continue
        radii_by_corner = {
            "top-left": (outer_radius_ratio, 0.5, 0.5, 0.5),
            "top-right": (0.5, outer_radius_ratio, 0.5, 0.5),
            "bottom-right": (0.5, 0.5, outer_radius_ratio, 0.5),
            "bottom-left": (0.5, 0.5, 0.5, outer_radius_ratio),
        }
        radii = tuple(
            module_side * ratio for ratio in radii_by_corner[module.seed_corner]
        )
        draw.polygon(_rounded_rect_points(x, y, module_side, radii), fill=fill)

    symbol_layer = symbol_layer.rotate(
        -45, resample=Image.Resampling.NEAREST, center=(canvas_size / 2,) * 2
    )
    canvas.alpha_composite(symbol_layer)
    icon = (
        canvas.convert("RGBa")
        .resize((size, size), Image.Resampling.LANCZOS)
        .convert("RGBA")
    )

    # Pixel-hint the module centers at toolbar sizes. Two-pixel modules can
    # otherwise be entirely blended by the final downsample.
    if size <= 32:
        angle = pi / 4
        center = size / 2
        scale = size / canvas_size
        module_centers = []
        for module in MODULES:
            module_x = (
                origin + (module.column + 0.5) * module_side + module.column * gap
            ) * scale
            module_y = (
                origin + (module.row + 0.5) * module_side + module.row * gap
            ) * scale
            delta_x = module_x - center
            delta_y = module_y - center
            rotated_x = center + delta_x * cos(angle) - delta_y * sin(angle)
            rotated_y = center + delta_x * sin(angle) + delta_y * cos(angle)
            module_centers.append((rotated_x, rotated_y))
            icon.putpixel(
                (min(size - 1, round(rotated_x)), min(size - 1, round(rotated_y))),
                (*ImageColor.getrgb(_module_fill(module, variant)), 255),
            )

        # At 16 px, LANCZOS can fill the subpixel gaps between adjacent
        # modules. Restore those Voronoi boundaries to Forest so all nine
        # components remain optically separate without changing the 30% gap.
        if size == 16 and variant == "color-dark":
            forest = ImageColor.getrgb(COLORS["forest"])
            foreground = tuple(
                ImageColor.getrgb(COLORS[name])
                for name in ("grain", "tomato", "cream")
            )

            def color_distance(left, right):
                return sum((a - b) ** 2 for a, b in zip(left, right))

            for y in range(size):
                for x in range(size):
                    color = icon.getpixel((x, y))[:3]
                    is_foreground = min(
                        color_distance(color, target) for target in foreground
                    ) < color_distance(color, forest)
                    distances = sorted(
                        (x - module_x) ** 2 + (y - module_y) ** 2
                        for module_x, module_y in module_centers
                    )
                    if is_foreground and distances[1] - distances[0] < 1:
                        icon.putpixel((x, y), (*forest, 255))
    return icon


def render_icon(size: int, simplified: bool) -> Image.Image:
    """Render an antialiased RGBA Forest app icon at the requested size."""
    return _render_symbol(size, "color-dark", simplified)


def _font(font_path: Path, size: int, weight: int) -> ImageFont.FreeTypeFont:
    font = ImageFont.truetype(str(font_path), size)
    try:
        font.set_variation_by_axes([float(weight)])
    except (AttributeError, OSError):
        pass
    return font


def _draw_wordmark(
    image: Image.Image,
    position: tuple[int, int],
    font_path: Path,
    size: int,
    color: str,
) -> None:
    draw = ImageDraw.Draw(image)
    bold = _font(font_path, size, 700)
    regular = _font(font_path, size, 400)
    x, y = position
    draw.text((x, y), "Ninka", font=bold, fill=color)
    ninka_box = draw.textbbox((x, y), "Ninka", font=bold)
    capital_box = draw.textbbox((0, 0), "N", font=bold)
    gap = (capital_box[2] - capital_box[0]) // 2
    draw.text((ninka_box[2] + gap, y), "FoodLab", font=regular, fill=color)


def render_preview_sheet(root: Path) -> Image.Image:
    """Compose the reproducible contact sheet for visual QA."""
    sheet = Image.new("RGBA", PREVIEW_SHEET_SIZE, COLORS["cream"])
    draw = ImageDraw.Draw(sheet)
    font_path = (
        root
        / "assets"
        / "branding"
        / "fonts"
        / "Manrope-VariableFont_wght.ttf"
    )
    heading = _font(font_path, 42, 700)
    label = _font(font_path, 22, 400)
    draw.text(
        (48, 34),
        "Ninka FoodLab brand asset sheet",
        font=heading,
        fill=COLORS["forest"],
    )

    icon_sizes = (16, 24, 32, 64, 128, 256)
    centers = (125, 365, 605, 845, 1085, 1390)
    icon_center_y = 278
    for size, center_x in zip(icon_sizes, centers):
        icon = render_icon(size, simplified=size < 32)
        sheet.alpha_composite(icon, (center_x - size // 2, icon_center_y - size // 2))
        text = f"{size} px"
        box = draw.textbbox((0, 0), text, font=label)
        draw.text(
            (center_x - (box[2] - box[0]) // 2, 430),
            text,
            font=label,
            fill=COLORS["forest"],
        )

    draw.text((48, 494), "Horizontal lockups", font=label, fill=COLORS["forest"])
    for theme, x in (("dark", 48), ("light", 812)):
        background = COLORS["forest"] if theme == "dark" else COLORS["cream"]
        foreground = COLORS["cream"] if theme == "dark" else COLORS["forest"]
        card = Image.new("RGBA", (740, 210), (0, 0, 0, 0))
        ImageDraw.Draw(card).rounded_rectangle(
            (0, 0, 739, 209), radius=18, fill=background
        )
        symbol = _render_symbol(
            130, f"color-{theme}", simplified=False, include_container=False
        )
        card.alpha_composite(symbol, (34, 40))
        _draw_wordmark(card, (196, 69), font_path, 58, foreground)
        sheet.alpha_composite(card, (x, 530))
        draw.rounded_rectangle(
            (x, 530, x + 740, 740),
            radius=18,
            outline=COLORS["grain"],
            width=3,
        )

    draw.text((48, 776), "Single-color marks", font=label, fill=COLORS["forest"])
    mark_cards = (
        (COLORS["cream"], "forest", 48),
        (COLORS["forest"], "cream", 330),
    )
    for background, variant, x in mark_cards:
        card = Image.new("RGBA", (250, 190), (0, 0, 0, 0))
        ImageDraw.Draw(card).rounded_rectangle(
            (0, 0, 249, 189), radius=18, fill=background
        )
        mark = _render_symbol(150, variant, simplified=False)
        card.alpha_composite(mark, (50, 20))
        sheet.alpha_composite(card, (x, 810))
        draw.rounded_rectangle(
            (x, 810, x + 250, 1000),
            radius=18,
            outline=COLORS["grain"],
            width=3,
        )

    draw.text((650, 776), "Approved palette", font=label, fill=COLORS["forest"])
    for index, (name, color) in enumerate(COLORS.items()):
        x = 650 + index * 225
        draw.rounded_rectangle(
            (x, 820, x + 190, 930),
            radius=14,
            fill=color,
            outline=COLORS["grain"],
            width=2,
        )
        text_color = (
            COLORS["cream"]
            if name in {"forest", "tomato"}
            else COLORS["forest"]
        )
        draw.text((x + 14, 838), name.title(), font=label, fill=text_color)
        draw.text((x + 14, 878), color.upper(), font=label, fill=text_color)
    return sheet


def write_fallback_icns(iconset: Path, target: Path) -> None:
    """Write a PNG-backed ICNS from the canonical iconset representations."""
    chunks = []
    for representation in ICNS_REPRESENTATIONS:
        payload = (iconset / representation.filename).read_bytes()
        chunks.append(
            representation.chunk_type
            + struct.pack(">I", len(payload) + 8)
            + payload
        )
    body = b"".join(chunks)
    target.write_bytes(b"icns" + struct.pack(">I", len(body) + 8) + body)


def read_icns_representations(path: Path) -> dict[bytes, Image.Image]:
    """Decode every required PNG representation from an ICNS container."""
    data = path.read_bytes()
    if len(data) < 8 or data[:4] != b"icns":
        raise ValueError("invalid ICNS signature")
    declared_length = struct.unpack(">I", data[4:8])[0]
    if declared_length != len(data):
        raise ValueError("invalid ICNS declared length")

    expected = {
        representation.chunk_type: representation
        for representation in ICNS_REPRESENTATIONS
    }
    decoded: dict[bytes, Image.Image] = {}
    offset = 8
    while offset < len(data):
        if offset + 8 > len(data):
            raise ValueError("truncated ICNS chunk header")
        chunk_type = data[offset : offset + 4]
        chunk_length = struct.unpack(">I", data[offset + 4 : offset + 8])[0]
        if chunk_length < 8 or offset + chunk_length > len(data):
            raise ValueError("invalid ICNS chunk length")
        payload = data[offset + 8 : offset + chunk_length]
        offset += chunk_length

        if payload.startswith(b"\x89PNG") and chunk_type not in expected:
            raise ValueError(
                f"unexpected ICNS PNG representation {chunk_type!r}"
            )
        if chunk_type not in expected:
            continue
        if chunk_type in decoded:
            raise ValueError(f"duplicate ICNS representation {chunk_type!r}")
        representation = expected[chunk_type]
        try:
            with Image.open(BytesIO(payload)) as image:
                image.load()
                if image.format != "PNG":
                    raise ValueError(
                        f"ICNS representation {chunk_type!r} is not PNG"
                    )
                if image.size != (representation.pixel_size,) * 2:
                    raise ValueError(
                        f"invalid ICNS representation size for {chunk_type!r}"
                    )
                decoded[chunk_type] = image.convert("RGBA").copy()
        except OSError as error:
            raise ValueError(
                f"invalid ICNS PNG representation {chunk_type!r}"
            ) from error

    missing = set(expected) - set(decoded)
    if missing:
        raise ValueError(f"missing ICNS representations: {sorted(missing)!r}")
    return decoded


def validate_icns(path: Path) -> None:
    """Validate every ICNS representation against deterministic rendering."""
    decoded = read_icns_representations(path)
    for representation in ICNS_REPRESENTATIONS:
        expected = render_icon(
            representation.pixel_size,
            simplified=representation.pixel_size < 32,
        )
        actual = decoded[representation.chunk_type]
        if actual.tobytes() != expected.tobytes():
            raise ValueError(
                f"ICNS content mismatch: {representation.filename}"
            )


def write_icns(platform_dir: Path) -> None:
    """Write and validate ICNS output, using iconutil when available on macOS."""
    iconset = Path(
        tempfile.mkdtemp(prefix=".ninka-foodlab-", suffix=".iconset", dir=platform_dir)
    )
    target = platform_dir / "ninka-foodlab.icns"
    target.unlink(missing_ok=True)
    for representation in ICNS_REPRESENTATIONS:
        render_icon(
            representation.pixel_size,
            simplified=representation.pixel_size < 32,
        ).save(iconset / representation.filename)

    used_iconutil = False
    if platform.system() == "Darwin":
        try:
            subprocess.run(
                ["iconutil", "-c", "icns", str(iconset), "-o", str(target)],
                check=True,
                capture_output=True,
                text=True,
            )
            used_iconutil = True
        except subprocess.CalledProcessError:
            write_fallback_icns(iconset, target)
    else:
        write_fallback_icns(iconset, target)

    try:
        validate_icns(target)
    except (OSError, ValueError) as error:
        if used_iconutil:
            target.unlink(missing_ok=True)
            write_fallback_icns(iconset, target)
            try:
                validate_icns(target)
            except (OSError, ValueError) as fallback_error:
                target.unlink(missing_ok=True)
                raise RuntimeError(
                    f"invalid ICNS output; retained diagnostic iconset at {iconset}"
                ) from fallback_error
        else:
            target.unlink(missing_ok=True)
            raise RuntimeError(
                f"invalid ICNS output; retained diagnostic iconset at {iconset}"
            ) from error
    shutil.rmtree(iconset)


def export_all(root: Path) -> None:
    """Write approved PNGs, platform containers, and the preview sheet."""
    png_dir = root / "assets" / "branding" / "png"
    platform_dir = root / "assets" / "branding" / "platform"
    preview_dir = root / "assets" / "branding" / "preview"
    png_dir.mkdir(parents=True, exist_ok=True)
    platform_dir.mkdir(parents=True, exist_ok=True)
    preview_dir.mkdir(parents=True, exist_ok=True)

    for size in APPROVED_PNG_SIZES:
        render_icon(size, simplified=size < 32).save(
            png_dir / f"ninka-icon-{size}.png"
        )
    ico_frames = {
        size: render_icon(size, simplified=size < 32) for size in ICO_SIZES
    }
    ico_frames[max(ICO_SIZES)].save(
        platform_dir / "ninka-foodlab.ico",
        format="ICO",
        sizes=[(size, size) for size in ICO_SIZES],
        append_images=[
            ico_frames[size] for size in ICO_SIZES if size != max(ICO_SIZES)
        ],
    )
    write_icns(platform_dir)
    render_preview_sheet(root).save(preview_dir / "ninka-brand-sheet.png")
