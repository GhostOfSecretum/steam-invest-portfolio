#!/usr/bin/env python3
"""Extract a coarse AK silhouette outline from a chroma-keyed reference PNG.

Produces geo-outline.json for ExtrudeGeometry + planar UV projection
(img2threejs-style silhouette trace, simplified for stdlib-only Python).
"""
from __future__ import annotations

import argparse
import json
import struct
import zlib
from pathlib import Path


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def read_png(path: Path):
    data = path.read_bytes()
    assert data.startswith(PNG_SIGNATURE)
    cursor = len(PNG_SIGNATURE)
    width = height = bit_depth = color_type = None
    idat = bytearray()
    while cursor + 8 <= len(data):
        length = struct.unpack(">I", data[cursor : cursor + 4])[0]
        chunk_type = data[cursor + 4 : cursor + 8]
        chunk_data = data[cursor + 8 : cursor + 8 + length]
        cursor += 12 + length
        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type, *_ = struct.unpack(">IIBBBBB", chunk_data)
        elif chunk_type == b"IDAT":
            idat.extend(chunk_data)
        elif chunk_type == b"IEND":
            break
    raw = zlib.decompress(bytes(idat))
    channels = {2: 3, 6: 4, 0: 1, 4: 2}[color_type]
    stride = width * channels
    rows = []
    i = 0
    prev = bytearray(stride)
    for _y in range(height):
        filter_type = raw[i]
        i += 1
        row = bytearray(raw[i : i + stride])
        i += stride
        if filter_type == 1:  # Sub
            for x in range(channels, stride):
                row[x] = (row[x] + row[x - channels]) & 255
        elif filter_type == 2:  # Up
            for x in range(stride):
                row[x] = (row[x] + prev[x]) & 255
        elif filter_type == 3:  # Average
            for x in range(stride):
                left = row[x - channels] if x >= channels else 0
                row[x] = (row[x] + ((left + prev[x]) // 2)) & 255
        elif filter_type == 4:  # Paeth
            for x in range(stride):
                a = row[x - channels] if x >= channels else 0
                b = prev[x]
                c = prev[x - channels] if x >= channels else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if pa <= pb and pa <= pc else b if pb <= pc else c
                row[x] = (row[x] + pr) & 255
        rows.append(row)
        prev = row
    return width, height, channels, rows


def luma(r, g, b):
    return 0.299 * r + 0.587 * g + 0.114 * b


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--out", required=True)
    ap.add_argument("--threshold", type=float, default=28.0)
    ap.add_argument("--cols", type=int, default=180)
    args = ap.parse_args()

    width, height, channels, rows = read_png(Path(args.image))
    # Downsample grid: for each column, find top/bottom mask extents
    cols = args.cols
    outline = []  # [nx, yTop, yBot] in 0..1 image space (y down)
    for ci in range(cols):
        x0 = int(ci * width / cols)
        x1 = int((ci + 1) * width / cols)
        top = None
        bot = None
        for y in range(height):
            hit = False
            for x in range(x0, x1):
                off = x * channels
                r, g, b = rows[y][off], rows[y][off + 1], rows[y][off + 2]
                if luma(r, g, b) > args.threshold:
                    hit = True
                    break
            if hit:
                if top is None:
                    top = y
                bot = y
        if top is not None and bot is not None and (bot - top) > height * 0.02:
            nx = (ci + 0.5) / cols
            outline.append([nx, top / height, bot / height])

    # Smooth lightly
    if len(outline) > 4:
        smooth = [outline[0]]
        for i in range(1, len(outline) - 1):
            a, b, c = outline[i - 1], outline[i], outline[i + 1]
            smooth.append([b[0], (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3])
        smooth.append(outline[-1])
        outline = smooth

    # Trim empty margins conceptually already handled; record crop of used columns
    meta = {
        "source": str(Path(args.image).resolve()),
        "width": width,
        "height": height,
        "cols": cols,
        "threshold": args.threshold,
        "frame": "+X tip/muzzle (image right), +Y up (image up = 1-y), Z thickness",
        "outline": outline,  # nx in [0,1] left→right, yTop/yBot in [0,1] top→bottom image
        "note": "img2threejs-style column silhouette trace for extrusion + planar UV projection",
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(json.dumps({"points": len(outline), "out": str(out)}, indent=2))


if __name__ == "__main__":
    main()
