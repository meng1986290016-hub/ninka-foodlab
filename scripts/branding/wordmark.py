"""Generate font-independent Ninka FoodLab wordmark lockups."""

from functools import lru_cache
from html import escape
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

from logo_geometry import COLORS, symbol_svg


_ROOT = Path(__file__).resolve().parents[2]
_FONT_PATH = _ROOT / "assets" / "branding" / "fonts" / "Manrope-VariableFont_wght.ttf"
_SYMBOL_TO_CAP_HEIGHT = 1.8
_SYMBOL_GAP_RATIO = 0.32


def _kerning_value(font: TTFont, left: str, right: str) -> int:
    """Return the GPOS kerning adjustment for a pair of glyphs."""
    gpos = font["GPOS"].table
    feature_records = gpos.FeatureList.FeatureRecord
    lookup_indexes = {
        index
        for record in feature_records
        if record.FeatureTag == "kern"
        for index in record.Feature.LookupListIndex
    }
    for index in lookup_indexes:
        lookup = gpos.LookupList.Lookup[index]
        if lookup.LookupType != 2:
            continue
        for subtable in lookup.SubTable:
            if left not in subtable.Coverage.glyphs:
                continue
            if subtable.Format == 1:
                pair_set = subtable.PairSet[subtable.Coverage.glyphs.index(left)]
                for pair in pair_set.PairValueRecord:
                    if pair.SecondGlyph == right:
                        return getattr(pair.Value1, "XAdvance", 0) or 0
            elif subtable.Format == 2:
                class_1 = subtable.ClassDef1.classDefs.get(left, 0)
                class_2 = subtable.ClassDef2.classDefs.get(right, 0)
                value = subtable.Class1Record[class_1].Class2Record[class_2].Value1
                return getattr(value, "XAdvance", 0) or 0
    return 0


@lru_cache(maxsize=16)
def _outlined_word(text: str, weight: int) -> tuple[str, float, float]:
    font = TTFont(_FONT_PATH)
    font = instantiateVariableFont(font, {"wght": weight}, inplace=True)
    cmap = font.getBestCmap()
    glyph_set = font.getGlyphSet()
    advances = font["hmtx"].metrics
    cap_height = float(font["OS/2"].sCapHeight)
    cursor = 0
    paths: list[str] = []
    glyph_names: list[str] = []

    for character in text:
        glyph_name = cmap.get(ord(character))
        if glyph_name is None:
            raise ValueError(f"Manrope has no glyph for {character!r}")
        glyph_names.append(glyph_name)

    for index, glyph_name in enumerate(glyph_names):
        pen = SVGPathPen(glyph_set)
        glyph_set[glyph_name].draw(pen)
        commands = pen.getCommands()
        if commands:
            paths.append(
                f'<path d="{escape(commands, quote=True)}" '
                f'transform="translate({cursor:g} {cap_height:g}) scale(1 -1)"/>'
            )
        cursor += advances[glyph_name][0]
        if index + 1 < len(glyph_names):
            cursor += _kerning_value(font, glyph_name, glyph_names[index + 1])

    return "".join(paths), float(cursor), cap_height


def outlined_word(text: str, weight: int) -> tuple[str, float, float]:
    """Return SVG path markup, total advance width, and cap-height-based height."""
    if not text:
        raise ValueError("text must not be empty")
    if not 200 <= weight <= 800:
        raise ValueError("Manrope weight must be between 200 and 800")
    return _outlined_word(text, weight)


def _number(value: float) -> str:
    return f"{value:.3f}".rstrip("0").rstrip(".")


def _wordmark() -> tuple[str, float, float]:
    ninka_paths, ninka_width, cap_height = outlined_word("Ninka", 700)
    foodlab_paths, foodlab_width, _ = outlined_word("FoodLab", 400)
    _, capital_width, _ = outlined_word("N", 700)
    word_gap = capital_width / 2
    return (
        f'<g data-word="Ninka">{ninka_paths}</g>'
        f'<g data-word="FoodLab" transform="translate({_number(ninka_width + word_gap)} 0)">{foodlab_paths}</g>',
        ninka_width + word_gap + foodlab_width,
        cap_height,
    )


def _symbol_fragment(variant: str, size: float) -> str:
    symbol = symbol_svg(variant, size=int(round(size))).strip()
    return symbol[symbol.index(">") + 1 : symbol.rindex("</svg>")]


def lockup_svg(layout: str, theme: str) -> str:
    """Return horizontal or stacked lockup using dark or light approved colors."""
    if layout not in {"horizontal", "stacked"}:
        raise ValueError(f"unknown lockup layout: {layout}")
    if theme not in {"dark", "light"}:
        raise ValueError(f"unknown lockup theme: {theme}")

    background = COLORS["forest"] if theme == "dark" else COLORS["cream"]
    word_color = COLORS["cream"] if theme == "dark" else COLORS["forest"]
    symbol_variant = f"color-{theme}"
    wordmark, word_width, cap_height = _wordmark()
    symbol_size = cap_height * _SYMBOL_TO_CAP_HEIGHT
    symbol = _symbol_fragment(symbol_variant, symbol_size)
    gap = symbol_size * _SYMBOL_GAP_RATIO

    if layout == "horizontal":
        width = symbol_size + gap + word_width
        height = symbol_size
        word_x = symbol_size + gap
        word_y = (symbol_size - cap_height) / 2
        content = (
            f'<g data-symbol="Ninka" transform="translate(0 0)">{symbol}</g>'
            f'<g data-wordmark="Ninka FoodLab" fill="{word_color}" '
            f'transform="translate({_number(word_x)} {_number(word_y)})">{wordmark}</g>'
        )
    else:
        width = max(symbol_size, word_width)
        height = symbol_size + gap + cap_height
        symbol_x = (width - symbol_size) / 2
        word_x = (width - word_width) / 2
        word_y = symbol_size + gap
        content = (
            f'<g data-symbol="Ninka" transform="translate({_number(symbol_x)} 0)">{symbol}</g>'
            f'<g data-wordmark="Ninka FoodLab" fill="{word_color}" '
            f'transform="translate({_number(word_x)} {_number(word_y)})">{wordmark}</g>'
        )

    return (
        '<svg xmlns="http://www.w3.org/2000/svg" '
        f'data-brand-name="Ninka FoodLab" data-layout="{layout}" data-theme="{theme}" '
        f'viewBox="0 0 {_number(width)} {_number(height)}" '
        f'width="{_number(width)}" height="{_number(height)}">'
        f'<rect width="100%" height="100%" fill="{background}"/>{content}</svg>\n'
    )


def write_lockup_assets(root: Path) -> None:
    """Write the four approved lockup SVG variants under assets/branding/source."""
    output = root / "assets" / "branding" / "source"
    output.mkdir(parents=True, exist_ok=True)
    for layout in ("horizontal", "stacked"):
        for theme in ("dark", "light"):
            (output / f"ninka-lockup-{layout}-{theme}.svg").write_text(
                lockup_svg(layout, theme), encoding="utf-8"
            )


if __name__ == "__main__":
    write_lockup_assets(_ROOT)
