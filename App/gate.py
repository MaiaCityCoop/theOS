"""The gate's comparison: two runs of `cargo run -- --gate <dir>` side by side, shot by shot, with their frame times.

    python3 -I gate.py <before dir> <after dir> <out.png>
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

before, after, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
times = lambda d: [l.split("\t") for l in (d / "times.txt").read_text().splitlines() if l.strip()]
tb, ta = times(before), times(after)
W, H = 960, 540
sheet = Image.new("RGB", (2 * W, len(ta) * (H + 28)), (20, 20, 20))
d = ImageDraw.Draw(sheet)
for i, row in enumerate(ta):
    y = i * (H + 28)
    for col, (folder, t) in enumerate([(before, tb[i] if i < len(tb) else ["", "", "", ""]), (after, row)]):
        f = folder / f"{i}.png"
        if f.exists():
            sheet.paste(Image.open(f).convert("RGB").resize((W, H)), (col * W, y + 28))
        d.text((col * W + 8, y + 7), f"{'before' if col == 0 else 'after'} - {row[1]} - {t[2]} {t[3]}", fill=(240, 240, 230))
sheet.save(out)
print(out)
