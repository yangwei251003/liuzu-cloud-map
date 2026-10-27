from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter


SOURCE_DIR = Path(r"[local-project-path]")
SCENIC_DEST = Path("public/assets/scenic/user-v2")
MAP_DEST = Path("public/assets/map-skins/v5")
GENERATED_RETRO = Path(
    r"[local-project-path]"
    r"\exec-603a1885-108d-45c0-b36a-26a40622c1da.png"
)


def crop_16_by_9(image: Image.Image) -> Image.Image:
    width, height = image.size
    target_ratio = 16 / 9
    current_ratio = width / height
    if current_ratio > target_ratio:
        crop_width = round(height * target_ratio)
        left = (width - crop_width) // 2
        return image.crop((left, 0, left + crop_width, height))
    crop_height = round(width / target_ratio)
    top = (height - crop_height) // 2
    return image.crop((0, top, width, top + crop_height))


def prepare_scenic(source_name: str, output_name: str) -> None:
    image = Image.open(SOURCE_DIR / source_name).convert("RGB")
    image = crop_16_by_9(image).resize((1600, 900), Image.Resampling.LANCZOS)
    image = ImageEnhance.Contrast(image).enhance(1.04)
    image = ImageEnhance.Color(image).enhance(1.04)
    image = image.filter(ImageFilter.UnsharpMask(radius=1.2, percent=70, threshold=3))
    image.save(SCENIC_DEST / output_name, "WEBP", quality=91, method=6)


def prepare_retro_overlay() -> None:
    image = Image.open(GENERATED_RETRO).convert("RGBA")
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            pixels[x, y] = (0, 0, 0, 0) if alpha < 8 else (red, green, blue, alpha)
    image.save(MAP_DEST / "retro-guofeng-ornament-v2.png", optimize=True)


SCENIC_DEST.mkdir(parents=True, exist_ok=True)
MAP_DEST.mkdir(parents=True, exist_ok=True)
prepare_scenic("藏佛坑 (2).png", "zangfo-waterwheel.webp")
prepare_scenic("藏佛坑.png", "zangfo-pond.webp")
prepare_retro_overlay()
