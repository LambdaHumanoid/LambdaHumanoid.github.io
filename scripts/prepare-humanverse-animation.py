"""Package the original Figma SVG for lazy, layer-level browser animation.

Source: AvbPqyrt6WDjBsrSW6NLuW / Dataset / 558:2. Export a temporary clone
with SVG IDs named hv_<original node ID>, outlined fonts, and transparent large
backgrounds. Only embedded image encoding changes here; chart paths, labels,
scales, colors and positions are kept exactly as exported.
"""
import base64
import hashlib
import io
from pathlib import Path
import xml.etree.ElementTree as ET

from PIL import Image

root = Path(__file__).resolve().parent.parent
source = root / "work/humanverse-layers.svg"
destination = root / "public/figures/humanverse"
destination.mkdir(exist_ok=True)
svg_ns = "http://www.w3.org/2000/svg"
xlink_ns = "http://www.w3.org/1999/xlink"
ET.register_namespace("", svg_ns)
ET.register_namespace("xlink", xlink_ns)
svg = ET.parse(source).getroot()
assert svg.get("viewBox") == "0 0 1704 659"
assert not list(svg.iter(f"{{{svg_ns}}}script"))
images = []
for image in svg.iter(f"{{{svg_ns}}}image"):
    attr = f"{{{xlink_ns}}}href" if image.get(f"{{{xlink_ns}}}href") else "href"
    data = image.get(attr)
    assert data and data.startswith("data:image/")
    raw = base64.b64decode(data.split(",", 1)[1])
    filename = hashlib.sha256(raw).hexdigest()[:16] + ".webp"
    bitmap = Image.open(io.BytesIO(raw)).convert("RGBA")
    bitmap.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
    bitmap.save(destination / filename, "WEBP", quality=90, method=6)
    image.set(attr, f"/figures/humanverse/{filename}")
    images.append(filename)
ids = {element.get("id"): element for element in svg.iter()}
for i in range(19):
    ids[f"hv_524_{24 + i * 3}"].set("data-animation-role", "skill-bar")
ids["hv_524_104"].set("data-animation-role", "distribution-rings")
svg.set("role", "img")
svg.set("aria-labelledby", "humanverse-title humanverse-description")
title = ET.Element(f"{{{svg_ns}}}title", id="humanverse-title")
title.text = "HumanVerse-500: capture, activity distribution and synchronized observations"
description = ET.Element(f"{{{svg_ns}}}desc", id="humanverse-description")
description.text = ("500 hours; 32,993 episodes; 87.0 million pose frames; 827 task types; "
                    "18+ skills. Original logarithmic skill-frequency bars and independent "
                    "rings for tasks, scenes, objects, object scale and body posture. "
                    "Source: Figma Dataset figure 558:2. All chart geometry and labels preserved.")
svg.insert(0, title)
svg.insert(1, description)
output = root / "public/figures/humanverse-animated.svg"
ET.ElementTree(svg).write(output, encoding="utf-8", xml_declaration=False)
print(f"{len(images)} images; SVG {output.stat().st_size / 1e6:.2f} MB; "
      f"image assets {sum((destination / n).stat().st_size for n in set(images)) / 1e6:.2f} MB")
