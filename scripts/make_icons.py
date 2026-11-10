#!/usr/bin/env python3
"""Draw the doll-and-steps icon and a fixture photo."""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "public" / "icons"
FIXTURE = ROOT / "tests" / "fixtures" / "doll.png"

CREAM = (251, 243, 228)
MAROON = (110, 30, 42)
MAROON_DEEP = (78, 18, 28)
TURMERIC = (225, 163, 37)
FACE = (243, 210, 176)
HAIR = (42, 20, 15)
INK = (42, 20, 15)
WHITE = (255, 251, 245)


def lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def draw_doll(draw: ImageDraw.ImageDraw, cx: int, foot: int, scale: float) -> None:
    head_r = int(70 * scale)
    head_y = foot - int(250 * scale)
    # hair bun
    draw.ellipse(
        [cx - int(46 * scale), head_y - head_r - int(36 * scale), cx + int(46 * scale), head_y - head_r + int(40 * scale)],
        fill=HAIR,
    )
    # saree
    draw.polygon(
        [
            (cx - int(78 * scale), foot),
            (cx + int(78 * scale), foot),
            (cx + int(46 * scale), head_y + int(20 * scale)),
            (cx - int(46 * scale), head_y + int(20 * scale)),
        ],
        fill=TURMERIC,
    )
    # blouse
    draw.rectangle(
        [cx - int(40 * scale), head_y + int(8 * scale), cx + int(40 * scale), head_y + int(70 * scale)],
        fill=MAROON,
    )
    # head
    draw.ellipse([cx - head_r, head_y - head_r, cx + head_r, head_y + head_r], fill=FACE)
    # hair cap
    draw.pieslice(
        [cx - head_r, head_y - head_r, cx + head_r, head_y + head_r],
        200,
        340,
        fill=HAIR,
    )
    # eyes
    eye_y = head_y + int(6 * scale)
    eye_dx = int(24 * scale)
    eye_r = max(2, int(5 * scale))
    draw.ellipse([cx - eye_dx - eye_r, eye_y - eye_r, cx - eye_dx + eye_r, eye_y + eye_r], fill=INK)
    draw.ellipse([cx + eye_dx - eye_r, eye_y - eye_r, cx + eye_dx + eye_r, eye_y + eye_r], fill=INK)
    # smile
    draw.arc(
        [cx - int(22 * scale), head_y + int(10 * scale), cx + int(22 * scale), head_y + int(42 * scale)],
        20,
        160,
        fill=MAROON,
        width=max(2, int(3 * scale)),
    )
    # necklace
    draw.arc(
        [cx - int(28 * scale), head_y + int(48 * scale), cx + int(28 * scale), head_y + int(90 * scale)],
        10,
        170,
        fill=TURMERIC,
        width=max(2, int(4 * scale)),
    )


def draw_steps(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], steps: int = 4) -> None:
    left, top, right, bottom = box
    width = right - left
    height = bottom - top
    for i in range(steps):
        inset = int((steps - 1 - i) * width * 0.08)
        y0 = top + int(height * i / steps)
        y1 = top + int(height * (i + 1) / steps)
        draw.rectangle([left + inset, y0, right - inset, y1], fill=MAROON)
        draw.rectangle([left + inset, y0, right - inset, y0 + max(4, height // 18)], fill=TURMERIC)


def render_icon(size: int, maskable: bool = False) -> Image.Image:
    bg = MAROON if maskable else CREAM
    img = Image.new("RGB", (size, size), bg)
    draw = ImageDraw.Draw(img)
    pad = int(size * (0.16 if maskable else 0.07))
    if not maskable:
        draw.rounded_rectangle([pad // 3, pad // 3, size - pad // 3, size - pad // 3], radius=size // 10, outline=MAROON, width=max(2, size // 48))
    step_top = int(size * 0.52)
    draw_steps(draw, (pad, step_top, size - pad, size - pad), 4)
    draw_doll(draw, size // 2, step_top + int(size * 0.02), size / 512)
    return img


def render_fixture() -> Image.Image:
    w, h = 2400, 1600
    img = Image.new("RGB", (w, h), CREAM)
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, w, 28], fill=MAROON)
    draw.rectangle([0, h - 28, w, h], fill=TURMERIC)
    draw_steps(draw, (480, 860, 1920, 1460), 5)
    draw_doll(draw, 1200, 900, 2.4)
    # small diya
    draw.ellipse([1760, 980, 1960, 1120], fill=MAROON_DEEP)
    draw.polygon([(1860, 980), (1810, 860), (1910, 860)], fill=TURMERIC)
    draw.ellipse([1836, 800, 1884, 860], fill=(255, 196, 70))
    return img


def main() -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    render_icon(192).save(ICON_DIR / "icon-192.png")
    render_icon(512).save(ICON_DIR / "icon-512.png")
    render_icon(512, maskable=True).save(ICON_DIR / "icon-512-maskable.png")
    render_icon(180).save(ICON_DIR / "apple-touch-icon.png")
    render_icon(32).save(ICON_DIR / "favicon-32.png")
    render_fixture().save(FIXTURE)
    print("wrote icons and fixture")


if __name__ == "__main__":
    main()
