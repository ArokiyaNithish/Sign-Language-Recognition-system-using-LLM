"""
Pure-Python PNG icon generator for SignBridge Chrome Extension.
No external libraries required — generates icons using only stdlib.
Creates: icon16.png, icon32.png, icon48.png, icon128.png
"""
import os
import struct
import zlib

ICON_DIR = os.path.join(os.path.dirname(__file__), "extension", "assets", "icons")
os.makedirs(ICON_DIR, exist_ok=True)


# ── PNG low-level writer ──────────────────────────────────────────────────────
def _chunk(name: bytes, data: bytes) -> bytes:
    c = name + data
    return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

def write_png(path: str, pixels):
    """
    pixels: list of rows, each row is a list of (R, G, B, A) tuples.
    """
    height = len(pixels)
    width  = len(pixels[0])

    # IHDR
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)  # 8-bit RGB
    # Actually use RGBA (colortype=6)
    ihdr_data = struct.pack(">II", width, height) + bytes([8, 6, 0, 0, 0])

    # Raw image data
    raw_rows = []
    for row in pixels:
        raw = bytearray([0])  # filter byte
        for r, g, b, a in row:
            raw += bytearray([r, g, b, a])
        raw_rows.append(bytes(raw))

    compressed = zlib.compress(b"".join(raw_rows), 9)

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")            # PNG signature
        f.write(_chunk(b"IHDR", ihdr_data))
        f.write(_chunk(b"IDAT", compressed))
        f.write(_chunk(b"IEND", b""))

    print(f"  Created: {os.path.basename(path)} ({width}x{height})")


# ── Icon drawing utilities ────────────────────────────────────────────────────
def _circle(cx, cy, r, size):
    """Return set of (x,y) coords inside a circle."""
    pts = set()
    for y in range(size):
        for x in range(size):
            if (x - cx)**2 + (y - cy)**2 <= r**2:
                pts.add((x, y))
    return pts

def _ring(cx, cy, r_outer, r_inner, size):
    outer = _circle(cx, cy, r_outer, size)
    inner = _circle(cx, cy, r_inner, size)
    return outer - inner

def _rect(x1, y1, x2, y2, size):
    pts = set()
    for y in range(max(0, y1), min(size, y2+1)):
        for x in range(max(0, x1), min(size, x2+1)):
            pts.add((x, y))
    return pts


# ── Build one icon at given size ──────────────────────────────────────────────
def make_icon(size: int):
    """
    Design: navy circle bg + teal ring border + 4 rounded fingers + thumb
    """
    NAVY   = (10, 14, 26, 255)
    TEAL   = (0, 212, 255, 255)
    TRANS  = (0, 0, 0, 0)

    # Start transparent
    pixels = [[list(TRANS) for _ in range(size)] for _ in range(size)]

    cx, cy = size // 2, size // 2
    radius = size // 2 - size // 12

    # 1. Navy filled circle (background)
    bg_pts = _circle(cx, cy, radius, size)
    for (x, y) in bg_pts:
        pixels[y][x] = list(NAVY)

    # 2. Teal ring border
    ring_width = max(1, size // 14)
    ring_pts = _ring(cx, cy, radius, radius - ring_width, size)
    for (x, y) in ring_pts:
        pixels[y][x] = list(TEAL)

    # 3. Hand (fingers + palm) — scale with size
    if size >= 32:
        fw = max(1, size // 18)    # finger width
        fh = size // 3             # finger height
        palm_h = size // 6
        inner_r = radius - ring_width - 1

        # Center of palm
        palm_base_y = cy + palm_h
        palm_top_y  = cy - fw

        # 4 fingers
        gap = fw + max(1, size // 22)
        finger_xs = [cx - gap*2, cx - gap, cx + gap//2, cx + gap + gap]
        for fx in finger_xs:
            top = palm_top_y - fh
            bot = palm_top_y
            f_pts = _rect(fx - fw, top, fx + fw, bot, size)
            # Clip to circle
            for (x, y) in f_pts:
                if (x - cx)**2 + (y - cy)**2 <= inner_r**2:
                    pixels[y][x] = list(TEAL)

        # Palm rectangle
        palm_pts = _rect(cx - gap*2 - fw, palm_top_y, cx + gap + gap + fw, palm_base_y, size)
        for (x, y) in palm_pts:
            if (x - cx)**2 + (y - cy)**2 <= inner_r**2:
                pixels[y][x] = list(TEAL)

        # Thumb
        thumb_x = cx - gap*2 - fw*2 - fw
        thumb_pts = _rect(thumb_x - fw, palm_top_y - fw*2, thumb_x + fw, palm_top_y + palm_h//2, size)
        for (x, y) in thumb_pts:
            if (x - cx)**2 + (y - cy)**2 <= inner_r**2:
                pixels[y][x] = list(TEAL)

    else:
        # 16px: just a bright teal dot
        dot_r = max(1, size // 5)
        for (x, y) in _circle(cx, cy, dot_r, size):
            pixels[y][x] = list(TEAL)

    return [[tuple(pixels[y][x]) for x in range(size)] for y in range(size)]


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print(f"\nSignBridge Icon Generator")
    print(f"Output: {ICON_DIR}\n")
    for size in [16, 32, 48, 128]:
        icon_pixels = make_icon(size)
        path = os.path.join(ICON_DIR, f"icon{size}.png")
        write_png(path, icon_pixels)
    print(f"\nDone! All 4 PNG icons created. Reload extension in Chrome.")

if __name__ == "__main__":
    main()
