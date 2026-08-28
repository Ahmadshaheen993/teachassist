#!/usr/bin/env python3
"""
Build the Q-Genius Instagram artboards.

Reads the templates in src/, embeds a subset of Alexandria as a woff2 data URI
in place of __FONT_B64__, and writes the *.dc.html the design canvas is seeded
from. The font has to ride inside the file because PNG/PDF export cannot pull
webfonts — without it, exported posts fall back to a system Arabic face.

Requires: fonttools, brotli. Source font: Alexandria (SIL OFL 1.1), Google Fonts.
Run from this directory:  python3 build.py
"""
import base64
import io
import os
import re
import sys
import urllib.request

from fontTools import subset

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(HERE, "src")
FONT_TTF = os.path.join(HERE, "src", "Alexandria.ttf")
FONT_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/alexandria/Alexandria%5Bwght%5D.ttf"
ARTBOARDS = ["Main.dc.html", "Story.dc.html", "AltFeed.dc.html"]

# Ranges kept beyond the glyphs actually used, so copy edited later inside the
# canvas editor still renders in the embedded face rather than falling back.
KEEP_RANGES = [
    (0x0600, 0x06FF),  # Arabic
    (0x0750, 0x077F),  # Arabic Supplement
    (0xFB50, 0xFDFF),  # Arabic Presentation Forms-A
    (0xFE70, 0xFEFF),  # Arabic Presentation Forms-B
    (0x0020, 0x007E),  # Basic Latin
    (0x00A0, 0x00BF),
    (0x2010, 0x2027),  # dashes, quotes, ellipsis
    (0x2030, 0x205E),
]


def ensure_font():
    if os.path.exists(FONT_TTF):
        return
    print("downloading Alexandria...")
    urllib.request.urlretrieve(FONT_URL, FONT_TTF)


def build_font_b64():
    chars = set()
    for name in ARTBOARDS:
        src = open(os.path.join(SRC_DIR, name), encoding="utf-8").read()
        chars.update(re.sub(r"<[^>]*>", "", src.split("<x-dc>", 1)[1]))
    for lo, hi in KEEP_RANGES:
        chars.update(chr(c) for c in range(lo, hi + 1))
    chars = {c for c in chars if c.isprintable() or c == " "}

    opts = subset.Options()
    opts.layout_features = ["*"]  # Arabic shaping: init/medi/fina/liga/mark/...
    opts.flavor = "woff2"
    opts.notdef_outline = True
    opts.drop_tables = []
    opts.name_IDs = ["*"]
    opts.name_legacy = True
    opts.glyph_names = False

    font = subset.load_font(FONT_TTF, opts)
    s = subset.Subsetter(options=opts)
    s.populate(unicodes=[ord(c) for c in chars])
    s.subset(font)
    buf = io.BytesIO()
    subset.save_font(font, buf, opts)
    data = buf.getvalue()
    print("font: %d codepoints -> woff2 %.1f KB" % (len(chars), len(data) / 1024))
    return base64.b64encode(data).decode()


def main():
    ensure_font()
    b64 = build_font_b64()
    for name in ARTBOARDS:
        src = open(os.path.join(SRC_DIR, name), encoding="utf-8").read()
        if "__FONT_B64__" not in src:
            sys.exit("missing __FONT_B64__ marker in src/%s" % name)
        out = os.path.join(HERE, name)
        open(out, "w", encoding="utf-8").write(src.replace("__FONT_B64__", b64))
        print("built %-18s %.0f KB" % (name, os.path.getsize(out) / 1024))


if __name__ == "__main__":
    main()
