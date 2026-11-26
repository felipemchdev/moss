"""
Generate custom 24-bit uncompressed bitmaps for NSIS installer:
- header.bmp (150x57 px): Dark moss #0F1411, sage green #7da27e logo + 'moss'
- sidebar.bmp (164x314 px): Dark moss #0F1411 subtle gradient, sage green #7da27e leaf icon, 'moss' title, 'navegação minimalista e serena' subtitle
"""

import math
from PIL import Image, ImageDraw, ImageFont

SCALE = 4  # 4x supersampling for ultra-crisp antialiasing

DARK_MOSS = (15, 20, 17)        # #0F1411
SAGE_GREEN = (125, 162, 126)    # #7da27e
LIGHT_TEXT = (220, 226, 222)    # #DCE2DE
MUTED_SAGE = (140, 170, 142)    # Soft sage for subtitle
DIVIDER_COLOR = (42, 58, 46)    # Subtle serene divider
ACCENT_DOT = (125, 162, 126)


def cubic_bezier(p0, p1, p2, p3, n=30):
    pts = []
    for i in range(n + 1):
        s = i / n
        oms = 1 - s
        x = oms**3 * p0[0] + 3*oms**2 * s * p1[0] + 3*oms * s**2 * p2[0] + s**3 * p3[0]
        y = oms**3 * p0[1] + 3*oms**2 * s * p1[1] + 3*oms * s**2 * p2[1] + s**3 * p3[1]
        pts.append((x, y))
    return pts


def render_leaf(draw, cx, cy, size, fill_color, stroke_color, stroke_width_scale=1.5):
    """Render the serene leaf icon centered at (cx, cy) with diameter size."""
    scale = size / 24.0

    def t(pt):
        return (cx + (pt[0] - 11.5) * scale, cy + (pt[1] - 11.5) * scale)

    arc_p = cubic_bezier((11.0, 20.0), (5.0, 17.0), (4.0, 9.0), (9.8, 6.1), 30)
    top_tip = cubic_bezier((9.8, 6.1), (15.5, 5.0), (17.0, 4.48), (19.0, 2.0), 30)
    right_edge = cubic_bezier((19.0, 2.0), (20.0, 4.0), (21.0, 6.18), (21.0, 10.0), 30)
    bottom_edge = cubic_bezier((21.0, 10.0), (21.0, 15.5), (16.22, 20.0), (11.0, 20.0), 30)

    raw_body = arc_p + top_tip[1:] + right_edge[1:] + bottom_edge[1:]
    body_pts = [t(p) for p in raw_body]

    draw.polygon(body_pts, fill=fill_color)

    stem1 = cubic_bezier((2.0, 21.0), (2.0, 18.0), (3.85, 15.64), (7.08, 15.0), 30)
    stem2 = cubic_bezier((7.08, 15.0), (9.5, 14.52), (12.0, 13.0), (13.0, 12.0), 30)
    raw_stem = stem1 + stem2[1:]
    stem_pts = [t(p) for p in raw_stem]

    stem_width = max(1, int(round(scale * stroke_width_scale)))
    draw.line(stem_pts, fill=stroke_color, width=stem_width)


def make_header():
    w, h = 150, 57
    img4 = Image.new('RGB', (w * SCALE, h * SCALE), DARK_MOSS)
    draw = ImageDraw.Draw(img4)

    # Fonts
    font_bold = ImageFont.truetype(r'C:\Windows\Fonts\segoeuib.ttf', int(20 * SCALE))

    # Calculate layout: Leaf (24px) + gap (8px) + text "moss"
    leaf_size = 24 * SCALE
    gap = 8 * SCALE

    bbox_text = draw.textbbox((0, 0), "moss", font=font_bold)
    text_w = bbox_text[2] - bbox_text[0]
    text_h = bbox_text[3] - bbox_text[1]

    total_w = leaf_size + gap + text_w
    start_x = (w * SCALE - total_w) / 2
    center_y = (h * SCALE) / 2

    leaf_cx = start_x + leaf_size / 2
    render_leaf(draw, leaf_cx, center_y, leaf_size, SAGE_GREEN, DARK_MOSS, stroke_width_scale=1.4)

    text_x = start_x + leaf_size + gap
    # Align text vertically with center_y
    text_y = center_y - (text_h / 2) - bbox_text[1]
    draw.text((text_x, text_y), "moss", fill=LIGHT_TEXT, font=font_bold)

    # Accent dot in sage green
    dot_r = 1.8 * SCALE
    dot_x = text_x + text_w + 5 * SCALE
    dot_y = center_y + (text_h / 4)
    draw.ellipse((dot_x - dot_r, dot_y - dot_r, dot_x + dot_r, dot_y + dot_r), fill=SAGE_GREEN)

    # Downsample with Lanczos
    header = img4.resize((w, h), Image.Resampling.LANCZOS)
    header.save("header.bmp", format="BMP")
    print("header.bmp saved successfully (150x57).")


def make_sidebar():
    w, h = 164, 314
    W4, H4 = w * SCALE, h * SCALE

    # Create subtle gradient background:
    # Top: #17241c -> Middle: #0F1411 -> Bottom: #090d0b
    grad = Image.new('RGB', (W4, H4))
    pixels = grad.load()

    top_color = (23, 36, 28)        # #17241C
    mid_color = (15, 20, 17)        # #0F1411
    bottom_color = (9, 13, 11)      # #090D0B

    for y in range(H4):
        t = y / (H4 - 1)
        if t < 0.5:
            # Interpolate top to mid
            factor = t * 2.0
            r = int(top_color[0] + factor * (mid_color[0] - top_color[0]))
            g = int(top_color[1] + factor * (mid_color[1] - top_color[1]))
            b = int(top_color[2] + factor * (mid_color[2] - top_color[2]))
        else:
            # Interpolate mid to bottom
            factor = (t - 0.5) * 2.0
            r = int(mid_color[0] + factor * (bottom_color[0] - mid_color[0]))
            g = int(mid_color[1] + factor * (bottom_color[1] - mid_color[1]))
            b = int(mid_color[2] + factor * (bottom_color[2] - mid_color[2]))

        for x in range(W4):
            pixels[x, y] = (r, g, b)

    # Add subtle soft radial glow behind the leaf icon
    glow_cx, glow_cy = (w / 2.0) * SCALE, 85 * SCALE
    glow_r = 55 * SCALE
    glow_color = (32, 50, 38)  # #203226 soft moss tint

    glow_layer = Image.new('RGBA', (W4, H4), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_layer)

    # Draw soft concentric circles
    num_steps = 40
    for i in range(num_steps, 0, -1):
        radius = (glow_r * i) / num_steps
        alpha = int(45 * (1.0 - (i / num_steps) ** 1.5))
        glow_draw.ellipse(
            (glow_cx - radius, glow_cy - radius, glow_cx + radius, glow_cy + radius),
            fill=(glow_color[0], glow_color[1], glow_color[2], alpha)
        )

    grad.paste(glow_layer, (0, 0), glow_layer)
    draw = ImageDraw.Draw(grad)

    # Render leaf icon
    leaf_size = 52 * SCALE
    render_leaf(draw, glow_cx, glow_cy, leaf_size, SAGE_GREEN, DARK_MOSS, stroke_width_scale=1.5)

    # Title "moss"
    font_title = ImageFont.truetype(r'C:\Windows\Fonts\segoeuib.ttf', int(28 * SCALE))
    bbox_title = draw.textbbox((0, 0), "moss", font=font_title)
    tw = bbox_title[2] - bbox_title[0]
    th = bbox_title[3] - bbox_title[1]
    title_x = (W4 - tw) / 2
    title_y = 136 * SCALE
    draw.text((title_x, title_y), "moss", fill=LIGHT_TEXT, font=font_title)

    # Subtitle "navegação minimalista e serena"
    font_sub = ImageFont.truetype(r'C:\Windows\Fonts\segoeui.ttf', int(9.5 * SCALE))
    sub_text = "navegação minimalista e serena"
    bbox_sub = draw.textbbox((0, 0), sub_text, font=font_sub)
    sw = bbox_sub[2] - bbox_sub[0]
    sub_x = (W4 - sw) / 2
    sub_y = 176 * SCALE
    draw.text((sub_x, sub_y), sub_text, fill=MUTED_SAGE, font=font_sub)

    # Subtle divider
    div_w = 32 * SCALE
    div_y = 206 * SCALE
    div_x1 = (W4 - div_w) / 2
    div_x2 = div_x1 + div_w
    draw.line((div_x1, div_y, div_x2, div_y), fill=DIVIDER_COLOR, width=max(1, int(1 * SCALE)))

    # Serene decorative dots near bottom
    dot_y = 278 * SCALE
    dot_cx = (w / 2.0) * SCALE
    spacing = 8 * SCALE
    r_small = 1.2 * SCALE
    r_center = 1.8 * SCALE

    draw.ellipse((dot_cx - spacing - r_small, dot_y - r_small, dot_cx - spacing + r_small, dot_y + r_small), fill=(50, 75, 58))
    draw.ellipse((dot_cx - r_center, dot_y - r_center, dot_cx + r_center, dot_y + r_center), fill=SAGE_GREEN)
    draw.ellipse((dot_cx + spacing - r_small, dot_y - r_small, dot_cx + spacing + r_small, dot_y + r_small), fill=(50, 75, 58))

    # Version / brand line
    font_brand = ImageFont.truetype(r'C:\Windows\Fonts\segoeuil.ttf', int(8 * SCALE))
    brand_text = "moss"
    bbox_brand = draw.textbbox((0, 0), brand_text, font=font_brand)
    bw = bbox_brand[2] - bbox_brand[0]
    brand_x = (W4 - bw) / 2
    draw.text((brand_x, 290 * SCALE), brand_text, fill=(75, 105, 85), font=font_brand)

    # Downsample
    sidebar = grad.resize((w, h), Image.Resampling.LANCZOS)
    sidebar.save("sidebar.bmp", format="BMP")
    print("sidebar.bmp saved successfully (164x314).")


if __name__ == '__main__':
    make_header()
    make_sidebar()
