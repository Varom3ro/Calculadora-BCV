import os
from PIL import Image, ImageDraw, ImageFont

SIZES = [192, 512]
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'icons')
os.makedirs(OUTPUT_DIR, exist_ok=True)

BG = (52, 152, 219, 255)  # #3498db
FG = (255, 255, 255, 255)  # white
TEXT = 'BVC'

# Try to use Arial from Windows. Fallback to default if unavailable
def get_font(size):
    try:
        font_path = r"C:\\Windows\\Fonts\\arial.ttf"
        return ImageFont.truetype(font_path, size)
    except Exception:
        return ImageFont.load_default()

for size in SIZES:
    img = Image.new('RGBA', (size, size), BG)
    draw = ImageDraw.Draw(img)

    # Choose font size to keep text safely within central area (maskable safe zone)
    font_size = int(size * 0.45) if size <= 192 else int(size * 0.43)
    font = get_font(font_size)

    # Measure text and center it
    try:
        bbox = draw.textbbox((0,0), TEXT, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    except Exception:
        tw, th = draw.textsize(TEXT, font=font)

    x = (size - tw) / 2
    y = (size - th) / 2 - (size * 0.05)  # slight vertical tweak

    draw.text((x, y), TEXT, font=font, fill=FG)

    out_path = os.path.join(OUTPUT_DIR, f"icon-{size}-maskable.png")
    img.save(out_path, format='PNG')
    print(f"Saved {out_path}")

print("Done generating icons.")