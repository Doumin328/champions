#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test what the corrected coordinates would produce
"""

import os
from PIL import Image
import json

project_root = r"C:\Users\yamas\Documents\workspace\champions"
config_path = os.path.join(project_root, "src", "renderer", "data", "broadcast_recognition_config.json")
debug_image_path = os.path.join(project_root, "debug_screens", "IMG_7290.jpg")
output_dir = os.path.join(project_root, "outputImg", "debug_slots")

# Load current config
with open(config_path, 'r') as f:
    config = json.load(f)

player_slot_rects = config["playerSlotRects"]
img = Image.open(debug_image_path)
img_width, img_height = img.size

# Define corrected values
CORRECTED_POKEMON_NAME = {"x": 0.10, "y": 0.00, "width": 0.65, "height": 0.40}
CORRECTED_ITEM_NAME = {"x": 0.10, "y": 0.50, "width": 0.57, "height": 0.40}

print("=" * 80)
print("TESTING CORRECTED COORDINATES")
print("=" * 80)
print()

# Test on slot 0
slot_idx = 0
slot_rect = player_slot_rects[slot_idx]

slot_x = int(slot_rect["x"] * img_width)
slot_y = int(slot_rect["y"] * img_height)
slot_w = int(slot_rect["width"] * img_width)
slot_h = int(slot_rect["height"] * img_height)

slot_crop = img.crop((slot_x, slot_y, slot_x + slot_w, slot_y + slot_h))

# Apply CORRECTED coordinates
name_x = int(CORRECTED_POKEMON_NAME["x"] * slot_w)
name_y = int(CORRECTED_POKEMON_NAME["y"] * slot_h)
name_w = int(CORRECTED_POKEMON_NAME["width"] * slot_w)
name_h = int(CORRECTED_POKEMON_NAME["height"] * slot_h)

corrected_name_crop = slot_crop.crop((name_x, name_y, name_x + name_w, name_y + name_h))
corrected_name_path = os.path.join(output_dir, "slot0_name_CORRECTED.png")
corrected_name_crop.save(corrected_name_path)

# Apply CORRECTED coordinates for item
item_x = int(CORRECTED_ITEM_NAME["x"] * slot_w)
item_y = int(CORRECTED_ITEM_NAME["y"] * slot_h)
item_w = int(CORRECTED_ITEM_NAME["width"] * slot_w)
item_h = int(CORRECTED_ITEM_NAME["height"] * slot_h)

corrected_item_crop = slot_crop.crop((item_x, item_y, item_x + item_w, item_y + item_h))
corrected_item_path = os.path.join(output_dir, "slot0_item_CORRECTED.png")
corrected_item_crop.save(corrected_item_path)

print(f"Slot 0 with CORRECTED coordinates:")
print(f"  Pokemon name: x={name_x}, y={name_y}, w={name_w}, h={name_h}")
print(f"  Item name: x={item_x}, y={item_y}, w={item_w}, h={item_h}")
print()
print(f"Saved corrected crops:")
print(f"  {corrected_name_path}")
print(f"  {corrected_item_path}")
print()

