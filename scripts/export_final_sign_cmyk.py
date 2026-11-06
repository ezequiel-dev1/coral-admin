from pathlib import Path

from PIL import Image, ImageCms


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "deliverables" / "coral-reef-beef-led-sign" / "coral-reef-beef-led-sign-final.png"
OUTPUT = ROOT / "deliverables" / "coral-reef-beef-led-sign" / "coral-reef-beef-led-sign-final-cmyk.tif"
RGB_PROFILE = Path("/System/Library/ColorSync/Profiles/Generic RGB Profile.icc")
CMYK_PROFILE = Path("/System/Library/ColorSync/Profiles/Generic CMYK Profile.icc")


def main():
    image = Image.open(SOURCE).convert("RGB")
    transform = ImageCms.buildTransform(
        ImageCms.getOpenProfile(str(RGB_PROFILE)),
        ImageCms.getOpenProfile(str(CMYK_PROFILE)),
        "RGB",
        "CMYK",
    )
    ImageCms.applyTransform(image, transform).save(
        OUTPUT,
        "TIFF",
        compression="tiff_lzw",
        dpi=(300, 300),
        icc_profile=CMYK_PROFILE.read_bytes(),
    )


if __name__ == "__main__":
    main()
