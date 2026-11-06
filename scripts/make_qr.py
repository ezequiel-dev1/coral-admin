#!/usr/bin/env python3
"""Generate a branded Coral QR poster pointing to the menu."""
import qrcode
from qrcode.constants import ERROR_CORRECT_H
from PIL import Image, ImageDraw, ImageFont

URL = "https://coral.restaurant/menu"
SALMON = (243, 128, 92)          # Coral brand salmon (#F3805C)
GRAY = (90, 90, 90)
WHITE = (255, 255, 255)
LOGO = "branding/CORAL LOGO/Sin Fondo/CORAL-ICONO.png"
BRAND_FONT = "branding/CORAL LOGO/fonts/mountiesregular-7b3ll.otf"
# Avenir has full Spanish accent coverage, which the brand font lacks.
ACCENT_FONT = "/System/Library/Fonts/Avenir.ttc"
OUT = "branding/coral-menu-qr.png"

# --- QR code (high error correction so the center logo is tolerated) ---
qr = qrcode.QRCode(
    version=None,
    error_correction=ERROR_CORRECT_H,
    box_size=40,
    border=2,
)
qr.add_data(URL)
qr.make(fit=True)
qr_img = qr.make_image(fill_color=SALMON, back_color=WHITE).convert("RGBA")
qr_w, qr_h = qr_img.size

# --- Embed the Coral icon in the center ---
logo = Image.open(LOGO).convert("RGBA")
logo_target = int(qr_w * 0.20)
logo = logo.resize((logo_target, logo_target), Image.LANCZOS)

pad = int(logo_target * 1.22)
pad_img = Image.new("RGBA", (pad, pad), (0, 0, 0, 0))
pd = ImageDraw.Draw(pad_img)
pd.rounded_rectangle([0, 0, pad - 1, pad - 1], radius=int(pad * 0.22), fill=WHITE)
px = (qr_w - pad) // 2
py = (qr_h - pad) // 2
qr_img.alpha_composite(pad_img, (px, py))
lx = (qr_w - logo_target) // 2
ly = (qr_h - logo_target) // 2
qr_img.alpha_composite(logo, (lx, ly))

# --- Poster canvas ---
margin = int(qr_w * 0.14)
title_h = int(qr_w * 0.42)
bottom_h = int(qr_w * 0.30)
W = qr_w + margin * 2
H = title_h + qr_h + bottom_h

poster = Image.new("RGBA", (W, H), WHITE)
draw = ImageDraw.Draw(poster)

_font_cache = {}


def load_font(path, size):
    key = (path, size)
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(path, size)
    return _font_cache[key]


def assert_glyphs(path, size, text):
    """Fail loudly if the chosen font cannot render a character."""
    f = load_font(path, size)
    missing = []
    for ch in text:
        if ch == " ":
            continue
        try:
            if f.getmask(ch).getbbox() is None:
                missing.append(ch)
        except Exception:
            missing.append(ch)
    if missing:
        raise SystemExit(f"Font {path!r} missing glyphs for {missing!r} in {text!r}")


def center_text(y, text, path, size, color):
    assert_glyphs(path, size, text)
    f = load_font(path, size)
    bbox = draw.textbbox((0, 0), text, font=f)
    tw = bbox[2] - bbox[0]
    draw.text(((W - tw) / 2 - bbox[0], y - bbox[1]), text, font=f, fill=color)
    return bbox[3] - bbox[1]


# Headline in the brand font (accent-free wording so no glyphs drop).
y = int(margin * 0.55)
h1 = center_text(y, "Escanea nuestra carta", BRAND_FONT, int(qr_w * 0.090), SALMON)
y += h1 + int(qr_w * 0.045)
# Subtitle with accents in a fallback font.
center_text(y, "Apunta la cámara al código", ACCENT_FONT, int(qr_w * 0.040), GRAY)

# QR
poster.alpha_composite(qr_img, (margin, title_h))

# URL at the bottom (brand font).
yb = title_h + qr_h + int(bottom_h * 0.22)
center_text(yb, "coral.restaurant/menu", BRAND_FONT, int(qr_w * 0.052), SALMON)

poster.convert("RGB").save(OUT, "PNG")
print("Saved", OUT, poster.size)
