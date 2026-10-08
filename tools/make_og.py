"""Génère og.png (aperçu de lien par défaut, 1200x630)."""
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
img = Image.new("RGB", (W, H), "#fafaf7")
d = ImageDraw.Draw(img)
def font(size):
    for p in ["/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/Library/Fonts/Arial Bold.ttf", "DejaVuSans-Bold.ttf"]:
        try: return ImageFont.truetype(p, size)
        except OSError: pass
    return ImageFont.load_default()
d.text((60, 120), "Baissez les dépenses", font=font(84), fill="#1a1a1a")
d.text((60, 250), "Faites votre budget. Chaque mesure est", font=font(40), fill="#444")
d.text((60, 305), "chiffrée, sourcée, avec ses obstacles juridiques.", font=font(40), fill="#444")
for i, (c, w) in enumerate([("#1b8a4a", 620), ("#d08a00", 420), ("#c0392b", 260)]):
    d.rectangle((60, 410 + i * 50, 60 + w, 440 + i * 50), fill=c)
d.text((60, 570), "Faisable · Risqué · Bloqué", font=font(28), fill="#1f4fd1")
img.save("og.png")
