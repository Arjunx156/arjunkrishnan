"""Cut each Noto script font down to the glyphs of two words: "Arjun" and "hello".

Usage: uv run --with fonttools --with brotli python tools/name_fonts.py <dir with @fontsource/noto-sans-*>
Each output is a few KB and keeps the shaping tables, so conjuncts still render.
"""

import sys
from pathlib import Path

from fontTools import subset

WORDS = {
    "malayalam": "അർജുൻ നമസ്കാരം",
    "devanagari": "अर्जुन नमस्ते",
    "tamil": "அர்ஜுன் வணக்கம்",
    "telugu": "అర్జున్ నమస్కారం",
    "kannada": "ಅರ್ಜುನ್ ನಮಸ್ಕಾರ",
    "bengali": "অর্জুন নমস্কার",
    "gujarati": "અર્જુન નમસ્તે",
    "gurmukhi": "ਅਰਜੁਨ ਸਤ ਸ੍ਰੀ ਅਕਾਲ",
}


def main(root: Path) -> None:
    out = Path("public/fonts/name")
    out.mkdir(parents=True, exist_ok=True)
    for script, word in WORDS.items():
        src = root / f"node_modules/@fontsource/noto-sans-{script}/files/noto-sans-{script}-{script}-700-normal.woff2"
        opts = subset.Options()
        opts.flavor = "woff2"
        opts.layout_features = ["*"]
        opts.name_IDs = ["*"]
        opts.notdef_outline = True
        font = subset.load_font(str(src), opts)
        sub = subset.Subsetter(opts)
        sub.populate(text=word + "‌‍")
        sub.subset(font)
        dest = out / f"{script}.woff2"
        subset.save_font(font, str(dest), opts)
        print(f"{dest} {dest.stat().st_size} B")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
