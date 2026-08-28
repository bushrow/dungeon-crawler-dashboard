"""Build the site icons from the Princess Donut source image.

Run with: uv run --with pillow python scripts/make-icons.py

Two deliberate changes from the source. The wide empty margin is trimmed, so
the cat is large enough to read at 32 pixels, while keeping the whole subject
inside the frame. And the flat background is lightened from the source's
near-black purple: the artwork is a dark brown cat with a near-black outline,
which disappears against it at tab size. The lighter purple keeps the source's
colour identity while giving the outline something to sit against.
"""

from pathlib import Path

from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "donut-icon-source.jpeg"
OUT = ROOT / "public"

#: Lighter than the source's (59, 39, 76), which the outline vanished into.
BACKGROUND = (183, 148, 214)
#: 180 is the apple-touch size; 32 is the tab icon. Add 512 here if a web
#: manifest ever needs one.
SIZES = (180, 32)
#: Breathing room around the measured subject, in source pixels. Must stay
#: positive: a negative value crops inside the bounding box and clips the
#: ears and the outer fur.
MARGIN = 24
TOLERANCE = 30  # colour distance that still counts as background


def subject_bounds(image: Image.Image, base: tuple[int, int, int]) -> tuple[int, int, int, int]:
    """Measure the artwork rather than hard-coding a crop."""
    px = image.load()
    width, height = image.size
    xs, ys = [], []
    for y in range(0, height, 4):
        for x in range(0, width, 4):
            r, g, b = px[x, y]
            if abs(r - base[0]) + abs(g - base[1]) + abs(b - base[2]) > 40:
                xs.append(x)
                ys.append(y)
    return min(xs), min(ys), max(xs), max(ys)


def main() -> None:
    source = Image.open(SOURCE).convert("RGB")
    base = source.getpixel((5, 5))
    left, top, right, bottom = subject_bounds(source, base)

    centre_x, centre_y = (left + right) // 2, (top + bottom) // 2
    half = max(right - left, bottom - top) // 2 + MARGIN
    icon = source.crop((centre_x - half, centre_y - half, centre_x + half, centre_y + half))

    px = icon.load()
    width, height = icon.size
    for y in range(height):
        for x in range(width):
            r, g, b = px[x, y]
            if abs(r - base[0]) + abs(g - base[1]) + abs(b - base[2]) < TOLERANCE:
                px[x, y] = BACKGROUND

    icon = ImageEnhance.Brightness(icon).enhance(1.15)
    icon = ImageEnhance.Contrast(icon).enhance(1.12)

    OUT.mkdir(exist_ok=True)
    for size in SIZES:
        path = OUT / f"icon-{size}.png"
        resized = icon.resize((size, size), Image.LANCZOS)
        # Flat-colour artwork, so a palette costs nothing visually and takes the
        # 512 from a quarter of a megabyte to a few kilobytes.
        resized.quantize(colors=64, method=Image.MEDIANCUT, dither=Image.NONE).save(
            path, optimize=True
        )
        print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
