#!/usr/bin/env python3
# Fun-travel app icon for R'Bot — a friendly rounded paper plane with a dotted
# "journey" trail on a bright purple gradient. Replaces the old jet silhouette.
# Generates the 1024 master + every iOS size (opaque, no alpha).

import os
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__),
                   'RoyceTravelTemplate', 'Images.xcassets', 'AppIcon.appiconset')
SS = 2            # supersample factor for anti-aliasing
N = 1024 * SS

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def build():
    img = Image.new('RGB', (N, N))
    px = img.load()
    # Diagonal gradient: bright violet (top-left) → deep brand purple (bottom-right).
    top = (0x9a, 0x6c, 0xf6)
    bot = (0x3d, 0x2b, 0x8c)
    for y in range(N):
        for x in range(N):
            t = (x + y) / (2 * N)
            px[x, y] = lerp(top, bot, t)

    # Soft radial glow, upper-centre, for depth/fun.
    glow = Image.new('L', (N, N), 0)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([N*0.16, N*0.04, N*0.84, N*0.72], fill=120)
    glow = glow.filter(ImageFilter.GaussianBlur(N*0.12))
    white = Image.new('RGB', (N, N), (255, 255, 255))
    img = Image.composite(white, img, glow.point(lambda v: int(v*0.55)))

    draw = ImageDraw.Draw(img, 'RGBA')

    def S(pts):
        return [(int(x*SS), int(y*SS)) for (x, y) in pts]

    # Paper-plane geometry (1024 space), nose up-right.
    nose = (792, 300)
    leftTip = (232, 556)
    notch = (505, 596)
    bottomTip = (470, 792)
    topWing = [nose, leftTip, notch]
    botWing = [nose, notch, bottomTip]

    # Drop shadow (offset, blurred) on its own layer.
    shadow = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    off = (26, 34)
    sh = (0x20, 0x12, 0x52, 150)
    sd.polygon(S([(x+off[0], y+off[1]) for x, y in topWing]), fill=sh)
    sd.polygon(S([(x+off[0], y+off[1]) for x, y in botWing]), fill=sh)
    shadow = shadow.filter(ImageFilter.GaussianBlur(N*0.018))
    img = Image.alpha_composite(img.convert('RGBA'), shadow).convert('RGB')
    draw = ImageDraw.Draw(img, 'RGBA')

    # Dotted "journey" trail curving up to the plane's tail (decreasing dots).
    import math
    p0, p1, p2 = (250, 838), (150, 612), (372, 556)  # quadratic bezier control pts
    steps = 9
    for i in range(steps):
        t = i / (steps - 1)
        bx = (1-t)**2*p0[0] + 2*(1-t)*t*p1[0] + t*t*p2[0]
        by = (1-t)**2*p0[1] + 2*(1-t)*t*p1[1] + t*t*p2[1]
        r = (7 + 15*t) * SS
        a = int(70 + 150*t)
        draw.ellipse([bx*SS-r, by*SS-r, bx*SS+r, by*SS+r], fill=(255, 255, 255, a))

    # Plane: bright white top wing, soft lilac under-fold for dimension.
    draw.polygon(S(botWing), fill=(214, 200, 250, 255))
    draw.polygon(S(topWing), fill=(255, 255, 255, 255))
    # Fold line nose→notch.
    draw.line(S([nose, notch]), fill=(180, 160, 230, 200), width=int(5*SS))

    # Playful little sparkles.
    def sparkle(cx, cy, s, alpha=235):
        pts = [(cx, cy-s), (cx+s*0.3, cy-s*0.3), (cx+s, cy), (cx+s*0.3, cy+s*0.3),
               (cx, cy+s), (cx-s*0.3, cy+s*0.3), (cx-s, cy), (cx-s*0.3, cy-s*0.3)]
        draw.polygon(S(pts), fill=(255, 255, 255, alpha))
    sparkle(706, 210, 34)
    sparkle(326, 372, 22, 200)
    sparkle(792, 540, 18, 180)

    return img.resize((1024, 1024), Image.LANCZOS)

SIZES = {
    'AppIcon-1024.png': 1024,
    'AppIcon-20@2x.png': 40, 'AppIcon-20@3x.png': 60,
    'AppIcon-29@2x.png': 58, 'AppIcon-29@3x.png': 87,
    'AppIcon-40@2x.png': 80, 'AppIcon-40@3x.png': 120,
    'AppIcon-60@2x.png': 120, 'AppIcon-60@3x.png': 180,
}

def main():
    master = build()
    for name, px in SIZES.items():
        master.resize((px, px), Image.LANCZOS).convert('RGB').save(os.path.join(OUT, name))
    print(f'wrote {len(SIZES)} icons to {os.path.relpath(OUT)}')

if __name__ == '__main__':
    main()
