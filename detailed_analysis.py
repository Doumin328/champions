#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Detailed analysis of name and item positions
"""

import os
from PIL import Image
import numpy as np
import json

project_root = r"C:\Users\yamas\Documents\workspace\champions"
config_path = os.path.join(project_root, "src", "renderer", "data", "broadcast_recognition_config.json")
debug_image_path = os.path.join(project_root, "debug_screens", "IMG_7290.jpg")
output_dir = os.path.join(project_root, "outputImg", "debug_slots")

# Load config
with open(config_path, 'r') as f:
    config = json.load(f)

player_slot_rects = config["playerSlotRects"]
pokemon_name_rect = config["playerPokemonNameRect"]
item_name_rect = config["playerItemNameRect"]

img = Image.open(debug_image_path)
img_width, img_height = img.size

print("=" * 80)
print("DETAILED TEXT POSITION ANALYSIS")
print("=" * 80)
print()

# Analyze slot 0 in detail
slot_idx = 0
slot_rect = player_slot_rects[slot_idx]

slot_x = int(slot_rect["x"] * img_width)
slot_y = int(slot_rect["y"] * img_height)
slot_w = int(slot_rect["width"] * img_width)
slot_h = int(slot_rect["height"] * img_height)

print(f"SLOT {slot_idx} - Full analysis")
print(f"Full slot pixels: x={slot_x}, y={slot_y}, w={slot_w}, h={slot_h}")
print()

# Extract and analyze the full slot image
slot_crop = img.crop((slot_x, slot_y, slot_x + slot_w, slot_y + slot_h))
slot_arr = np.array(slot_crop)

# Convert to grayscale
if len(slot_arr.shape) == 3:
    gray = np.mean(slot_arr[:,:,:3], axis=2)
else:
    gray = slot_arr

print("Analyzing by vertical bands in the slot:")
print(f"Slot height: {slot_h} pixels")
print()

# Check 10% bands
for band_pct in [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]:
    row_start = int(band_pct / 100.0 * gray.shape[0])
    row_end = int((band_pct + 10) / 100.0 * gray.shape[0])
    row_slice = gray[row_start:row_end, :]
    mean_val = np.mean(row_slice)
    
    content = "DARK (has text)" if mean_val < 180 else "LIGHT (empty)"
    print(f"{band_pct:3d}%-{band_pct+10:3d}%: mean={mean_val:6.1f}  {content}")

print()
print("CURRENT CONFIG VALUES:")
print(f"playerPokemonNameRect y={pokemon_name_rect['y']} (6% from top)")
print(f"  -> pixel row range: 0 to {int(pokemon_name_rect['height'] * slot_h)}")
print(f"playerItemNameRect y={item_name_rect['y']} (39% from top)")
print(f"  -> pixel row range: {int(item_name_rect['y'] * slot_h)} to {int((item_name_rect['y'] + item_name_rect['height']) * slot_h)}")
print()

# Visual inspection from the saved crops
print("=" * 80)
print("OBSERVATIONS FROM SAVED CROPS:")
print("=" * 80)
print()
print("Slot 0:")
print("  - Full slot: Shows 'メガニウム' (name) at top, 'メガニウムナイト' (item) at bottom")
print("  - Name crop (current y=0.06): Shows only partial top of Pokemon name + gender symbol")
print("  - Item crop (current y=0.39): Shows partial Pokemon name, not the full item name")
print()
print("The issue: Both name and item text are in the first half of the slot,")
print("but they're positioned at specific rows:")
print()

# Measure exact positions by analyzing the full slot more carefully
print("Measuring exact text positions in slot...")
print()

# Find the top row with significant text
row_means = np.mean(gray, axis=1)
for row in range(gray.shape[0]):
    if row_means[row] < 180:
        print(f"Text starts at row {row} ({row/slot_h*100:.1f}% down)")
        break

# Find where name ends and item begins by looking for a gap
# (there should be a vertical space between them)
THRESHOLD = 200
text_rows = []
for row in range(gray.shape[0]):
    if row_means[row] < THRESHOLD:
        text_rows.append(row)

if text_rows:
    # Find gaps in text
    gaps = []
    for i in range(1, len(text_rows)):
        if text_rows[i] - text_rows[i-1] > 1:
            gaps.append((text_rows[i-1], text_rows[i]))
    
    if gaps:
        print(f"\nGaps found between text regions:")
        for gap_start, gap_end in gaps[:2]:  # Show first 2 gaps
            gap_center = (gap_start + gap_end) / 2
            print(f"  Gap at rows {gap_start}-{gap_end} (center: {gap_center}, {gap_center/slot_h*100:.1f}%)")

