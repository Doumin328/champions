#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Analyze player slot rectangles to determine correct y-coordinates for name/item crops.
"""

import json
import os
import sys

try:
    from PIL import Image
    import numpy as np
except ImportError:
    print("Error: PIL and numpy required. Install with: pip install pillow numpy")
    sys.exit(1)

# Use direct Windows path
project_root = r"C:\Users\yamas\Documents\workspace\champions"
config_path = os.path.join(project_root, "src", "renderer", "data", "broadcast_recognition_config.json")
debug_image_path = os.path.join(project_root, "debug_screens", "IMG_7290.jpg")
output_dir = os.path.join(project_root, "outputImg", "debug_slots")

# Create output directory
os.makedirs(output_dir, exist_ok=True)

# Load configuration
print("Loading config from:", config_path)
with open(config_path, 'r') as f:
    config = json.load(f)

player_slot_rects = config["playerSlotRects"]
pokemon_name_rect = config["playerPokemonNameRect"]
item_name_rect = config["playerItemNameRect"]

print("Loaded", len(player_slot_rects), "player slot rectangles")
print("Pokemon name rect:", pokemon_name_rect)
print("Item name rect:", item_name_rect)
print()

# Load image
print("Loading image from:", debug_image_path)
img = Image.open(debug_image_path)
img_width, img_height = img.size
print("Image size:", img_width, "x", img_height)
print()

# Process each slot
print("=" * 80)
print("ANALYZING PLAYER SLOTS")
print("=" * 80)

for slot_idx, slot_rect in enumerate(player_slot_rects):
    print("\n--- SLOT", slot_idx, "---")
    
    # Calculate pixel coordinates for full slot
    slot_x = int(slot_rect["x"] * img_width)
    slot_y = int(slot_rect["y"] * img_height)
    slot_w = int(slot_rect["width"] * img_width)
    slot_h = int(slot_rect["height"] * img_height)
    
    print("Full slot rect (pixels): x=%d, y=%d, w=%d, h=%d" % (slot_x, slot_y, slot_w, slot_h))
    
    # Extract full slot image
    slot_crop = img.crop((slot_x, slot_y, slot_x + slot_w, slot_y + slot_h))
    full_slot_path = os.path.join(output_dir, "slot%d_full.png" % slot_idx)
    slot_crop.save(full_slot_path)
    print("Saved full slot:", full_slot_path)
    
    # Extract pokemon name crop (relative to slot)
    name_x = int(pokemon_name_rect["x"] * slot_w)
    name_y = int(pokemon_name_rect["y"] * slot_h)
    name_w = int(pokemon_name_rect["width"] * slot_w)
    name_h = int(pokemon_name_rect["height"] * slot_h)
    
    print("Pokemon name (relative to slot): x=%d, y=%d, w=%d, h=%d" % (name_x, name_y, name_w, name_h))
    
    name_crop = slot_crop.crop((name_x, name_y, name_x + name_w, name_y + name_h))
    name_crop_path = os.path.join(output_dir, "slot%d_name.png" % slot_idx)
    name_crop.save(name_crop_path)
    print("Saved name crop:", name_crop_path)
    
    # Extract item crop (relative to slot)
    item_x = int(item_name_rect["x"] * slot_w)
    item_y = int(item_name_rect["y"] * slot_h)
    item_w = int(item_name_rect["width"] * slot_w)
    item_h = int(item_name_rect["height"] * slot_h)
    
    print("Item crop (relative to slot): x=%d, y=%d, w=%d, h=%d" % (item_x, item_y, item_w, item_h))
    
    item_crop = slot_crop.crop((item_x, item_y, item_x + item_w, item_y + item_h))
    item_crop_path = os.path.join(output_dir, "slot%d_item.png" % slot_idx)
    item_crop.save(item_crop_path)
    print("Saved item crop:", item_crop_path)

print("\n" + "=" * 80)
print("ALL CROPS SAVED TO:", output_dir)
print("=" * 80)
print()

# Now read and analyze the crops
print("=" * 80)
print("READING AND ANALYZING SAVED CROPS")
print("=" * 80)
print()

for slot_idx in range(len(player_slot_rects)):
    print("\n--- SLOT", slot_idx, "---")
    
    full_img = Image.open(os.path.join(output_dir, "slot%d_full.png" % slot_idx))
    name_img = Image.open(os.path.join(output_dir, "slot%d_name.png" % slot_idx))
    item_img = Image.open(os.path.join(output_dir, "slot%d_item.png" % slot_idx))
    
    print("Full slot size:", full_img.size)
    print("Name crop size:", name_img.size)
    print("Item crop size:", item_img.size)
    
    # Convert to numpy to analyze content
    full_arr = np.array(full_img)
    name_arr = np.array(name_img)
    item_arr = np.array(item_img)
    
    # Check if crops contain meaningful content (not just white/transparent)
    full_mean = np.mean(full_arr)
    name_mean = np.mean(name_arr)
    item_mean = np.mean(item_arr)
    
    print("Full slot mean pixel value: %.1f" % full_mean)
    print("Name crop mean pixel value: %.1f" % name_mean)
    print("Item crop mean pixel value: %.1f" % item_mean)
    print("  (closer to 255 = mostly white/empty, closer to 0 = dark/content)")

print("\n" + "=" * 80)
print("ANALYSIS COMPLETE")
print("=" * 80)
print()
print("Next steps:")
print("1. Open the debug images in outputImg/debug_slots/")
print("2. Check if name and item crops contain the expected text")
print("3. If not, adjust y-values in playerPokemonNameRect and playerItemNameRect")
print()

