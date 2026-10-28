"""Builds the UPNEXT Careers SVG brand assets into apps/web/public/brand/.

The monogram is a faithful vector trace of the owner-approved artwork (docs/design/brand/UPNEXT_LOGO_SHEET.png);
it is stored in monogram.json and is never redrawn. The wordmark is typeset (the supplied wordmark is raster only):
UPNEXT in Inter ExtraBold with CAREERS beneath in Inter Medium, letter-spaced to the exact width of UPNEXT,
converted to outlines so no font is needed at display time. Replace the typeset wordmark with the supplied
vector if one is delivered. Needs: pip install fonttools; fonts-inter (SIL Open Font License).

    python tools/brand/build_assets.py
"""

from __future__ import annotations

import json
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps/web/public/brand"
FONTS = Path("/usr/share/fonts/opentype/inter")
MONO = json.loads((Path(__file__).parent / "monogram.json").read_text())
MW, MH = MONO["viewBox"]
BLACK, WHITE = "#000000", "#FFFFFF"


def outline(
    font_file: str, text: str, size: float, tracking: float = 0.0
) -> tuple[str, float, float]:
    """(path d, advance width, cap height) of `text` at `size` px, baseline at y=0, y down."""
    font = TTFont(FONTS / font_file)
    glyphs, cmap, upm = font.getGlyphSet(), font.getBestCmap(), font["head"].unitsPerEm
    scale = size / upm
    x, parts = 0.0, []
    for ch in text:
        name = cmap[ord(ch)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, 0)))
        parts.append(pen.getCommands())
        x += glyphs[name].width * scale + tracking
    return "".join(parts), x - tracking, font["OS/2"].sCapHeight * scale


def wordmark_group(
    fill: str, height_of_upnext: float = 100.0
) -> tuple[str, float, float]:
    """UPNEXT with CAREERS beneath, CAREERS exactly as wide as UPNEXT. Returns (svg group, width, height)."""
    size = height_of_upnext / 0.7275  # cap height of Inter is 0.7275 em
    up_d, up_w, up_cap = outline(
        "Inter-ExtraBold.otf", "UPNEXT", size, tracking=-size * 0.02
    )
    c_size = up_cap * 0.36 / 0.7275
    _, plain, c_cap = outline("Inter-Medium.otf", "CAREERS", c_size, 0)
    tracking = (up_w - plain) / 6  # six gaps between seven letters
    c_d, c_w, c_cap = outline("Inter-Medium.otf", "CAREERS", c_size, tracking)
    gap = up_cap * 0.30
    height = up_cap + gap + c_cap
    group = (
        f'<path fill="{fill}" transform="translate(0 {up_cap:.2f})" d="{up_d}"/>'
        f'<path fill="{fill}" transform="translate(0 {up_cap + gap + c_cap:.2f})" d="{c_d}"/>'
    )
    return group, up_w, height


def mono(fill: str, x: float = 0, y: float = 0, height: float | None = None) -> str:
    s = (height or MH) / MH
    return f'<path fill="{fill}" transform="translate({x:.2f} {y:.2f}) scale({s:.5f})" d="{MONO["d"]}"/>'


def svg(w: float, h: float, body: str, title: str, pad: float = 0.0) -> str:
    """`pad` adds clear room on every side (anti-aliasing at the glyph edges); icons use 0."""
    inner = f'<g transform="translate({pad:.2f} {pad:.2f})">{body}</g>' if pad else body
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w + 2 * pad:.2f} {h + 2 * pad:.2f}" '
        f'role="img" aria-label="{title}"><title>{title}</title>{inner}</svg>\n'
    )


def tile(size: float, fg: str, bg: str, radius: float, scale: float = 0.56) -> str:
    """App-icon tile: monogram centred on a square (radius 0 for full-bleed maskable icons)."""
    mw = size * scale
    h = mw * MH / MW
    body = f'<rect width="{size}" height="{size}" rx="{radius}" fill="{bg}"/>' + mono(
        fg, (size - mw) / 2, (size - h) / 2, h
    )
    return body


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    files: dict[str, str] = {}
    for tone, fg, bg in (("", BLACK, WHITE), ("-white", WHITE, BLACK)):
        label = "UPNEXT Careers" + (" (white)" if tone else "")
        files[f"upnext-monogram{tone}.svg"] = svg(
            MW, MH, mono(fg), f"UPNEXT monogram{' (white)' if tone else ''}", pad=2
        )
        group, ww, wh = wordmark_group(fg)
        files[f"upnext-wordmark{tone}.svg"] = svg(ww, wh, group, label, pad=2)
        # horizontal lockup: monogram as tall as the wordmark's two lines, 0.45 of its height as the gap
        mono_h = wh * 1.0
        mono_w = mono_h * MW / MH
        gap = wh * 0.42
        g2, ww2, wh2 = group, ww, wh
        body = (
            mono(fg, 0, 0, mono_h)
            + f'<g transform="translate({mono_w + gap:.2f} 0)">{g2}</g>'
        )
        files[f"upnext-lockup{tone}.svg"] = svg(
            mono_w + gap + ww2, wh2, body, label, pad=2
        )
        # compact navigation logo: monogram + UPNEXT only (CAREERS is dropped below 28px height)
        up_d, up_w, up_cap = outline(
            "Inter-ExtraBold.otf", "UPNEXT", 100 / 0.7275, tracking=-100 / 0.7275 * 0.02
        )
        nav_h = up_cap * 1.0
        nav_mw = nav_h * 1.18 * MW / MH
        nav_body = mono(fg, 0, 0, nav_h * 1.18) + (
            f'<path fill="{fg}" transform="translate({nav_mw + nav_h * 0.28:.2f} {nav_h * 1.18 / 2 + up_cap / 2:.2f})" d="{up_d}"/>'
        )
        files[f"upnext-nav{tone}.svg"] = svg(
            nav_mw + nav_h * 0.28 + up_w,
            nav_h * 1.18,
            nav_body,
            "UPNEXT Careers",
            pad=2,
        )
    # icons (SVG masters; PNGs are rendered from these by apps/web/scripts/render-brand-pngs.mjs)
    files["icon-black.svg"] = svg(
        512, 512, tile(512, WHITE, BLACK, 0, 0.58), "UPNEXT Careers icon"
    )
    files["icon-black-rounded.svg"] = svg(
        512, 512, tile(512, WHITE, BLACK, 112, 0.56), "UPNEXT Careers app icon"
    )
    files["icon-white-rounded.svg"] = svg(
        512, 512, tile(512, BLACK, WHITE, 112, 0.56), "UPNEXT Careers app icon (white)"
    )
    circle = f'<circle cx="256" cy="256" r="256" fill="{BLACK}"/>' + mono(
        WHITE, 256 - 150, 256 - 150 * MH / MW, 300 * MH / MW
    )
    files["icon-circle-dark.svg"] = svg(512, 512, circle, "UPNEXT Careers profile icon")
    for name, content in files.items():
        (OUT / name).write_text(content)
        print("wrote", name, len(content))


if __name__ == "__main__":
    main()
