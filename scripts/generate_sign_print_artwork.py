from pathlib import Path
import math

from PIL import Image, ImageCms, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "deliverables" / "coral-reef-beef-led-sign"
SIZE = 9900  # 33 in at 300 DPI
CORAL = (244, 124, 89, 255)
BLUE = (55, 86, 170, 255)
WHITE = (255, 255, 255, 255)
FONT = ROOT / "branding" / "CORAL LOGO" / "fonts" / "mountiesregular-7b3ll.otf"
GENERIC_RGB_ICC = Path("/System/Library/ColorSync/Profiles/Generic RGB Profile.icc")
GENERIC_CMYK_ICC = Path("/System/Library/ColorSync/Profiles/Generic CMYK Profile.icc")


def tracked_text(draw, text, center_x, y, font, fill, tracking):
    widths = [draw.textlength(ch, font=font) for ch in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x = center_x - total / 2
    for ch, width in zip(text, widths):
        draw.text((round(x), y), ch, font=font, fill=fill)
        x += width + tracking


def wave_points(y, amplitude, phase, cycles):
    points = []
    left, right = 1900, 8000
    for x in range(left, right + 1, 20):
        t = (x - left) / (right - left)
        points.append((x, round(y + amplitude * math.sin(t * cycles * math.pi + phase))))
    return points


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    art = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(art)
    cx = cy = SIZE // 2
    outer = 4700
    # White matte sign face with a blue perimeter, matching the requested white-on-blue treatment.
    draw.ellipse((cx - outer, cy - outer, cx + outer, cy + outer), fill=WHITE, outline=BLUE, width=92)

    # Use the project's exact coral artwork, remove its white matte, then recolor to approved salmon.
    source = Image.open(ROOT / "public" / "coral-icon.png").convert("RGBA")
    px = source.load()
    for y in range(source.height):
        for x in range(source.width):
            r, g, b, a = px[x, y]
            if r > 245 and g > 245 and b > 245:
                px[x, y] = (255, 255, 255, 0)
            else:
                px[x, y] = CORAL
    bbox = source.getbbox()
    source = source.crop(bbox)
    source.thumbnail((4800, 3600), Image.Resampling.LANCZOS)
    art.alpha_composite(source, ((SIZE - source.width) // 2, 770))

    for y, amplitude, phase, cycles in [(4560, 230, -0.45, 1.25), (4860, 210, -0.10, 1.22), (5150, 190, 0.22, 1.18)]:
        draw.line(wave_points(y, amplitude, phase, cycles), fill=BLUE, width=82, joint="curve")

    # The specified brand font is used directly for the display wordmark.
    mounties = ImageFont.truetype(str(FONT), 1575)
    sans = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 430)
    title = "CORAL"
    title_box = draw.textbbox((0, 0), title, font=mounties)
    draw.text((cx - (title_box[2] - title_box[0]) / 2, 5650 - title_box[1]), title, font=mounties, fill=BLUE)
    tracked_text(draw, "REEF & BEEF", cx, 7480, sans, BLUE, 105)

    output = OUT / "coral-reef-beef-sign-artwork-33in-300dpi.png"
    art.save(output, "PNG", dpi=(300, 300), optimize=True)

    # A flat white surround is intentional here: TIFF CMYK has no transparent sign cut line.
    # The circular cut is defined by the accompanying supplier layout artwork.
    flattened = Image.new("RGBA", art.size, WHITE)
    flattened.alpha_composite(art)
    transform = ImageCms.buildTransform(
        ImageCms.getOpenProfile(str(GENERIC_RGB_ICC)),
        ImageCms.getOpenProfile(str(GENERIC_CMYK_ICC)),
        "RGBA",
        "CMYK",
    )
    cmyk = ImageCms.applyTransform(flattened, transform)
    cmyk.save(
        OUT / "coral-reef-beef-sign-artwork-33in-300dpi-cmyk.tif",
        "TIFF",
        compression="tiff_lzw",
        dpi=(300, 300),
        icc_profile=GENERIC_CMYK_ICC.read_bytes(),
    )


if __name__ == "__main__":
    main()
