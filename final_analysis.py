#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Final analysis showing the exact y-coordinate adjustments needed
"""

import os
from PIL import Image
import numpy as np
import json

project_root = r"C:\Users\yamas\Documents\workspace\champions"
config_path = os.path.join(project_root, "src", "renderer", "data", "broadcast_recognition_config.json")
output_dir = os.path.join(project_root, "outputImg", "debug_slots")

# Load config
with open(config_path, 'r') as f:
    config = json.load(f)

pokemon_name_rect = config["playerPokemonNameRect"]
item_name_rect = config["playerItemNameRect"]

print("=" * 80)
print("FINAL ANALYSIS: Y-COORDINATE CORRECTIONS")
print("=" * 80)
print()

print("VISUAL INSPECTION RESULTS:")
print("-" * 80)
print()

print("Slot 0 Full:  'メガニウム' (name) on TOP line")
print("              'メガニウムナイト' (item) on BOTTOM line")
print()

print("Slot 0 Name crop (y=0.06): Partially visible name + gender/type symbol")
print("  Issue: Captures too much of the gender symbol row, not the full name")
print()

print("Slot 0 Item crop (y=0.39): Partially visible - overlaps with name area")
print("  Issue: Positioned too high, captures middle area not the item text")
print()

print("=" * 80)
print("CORRECTED Y-COORDINATES")
print("=" * 80)
print()

print("Current configuration:")
print(f"  playerPokemonNameRect: y={pokemon_name_rect['y']}")
print(f"  playerItemNameRect:   y={item_name_rect['y']}")
print()

print("Based on visual analysis of the slot images:")
print()

print("FOR POKEMON NAME:")
print("  Current: y=0.06 (captures starting from 6% down)")
print("  Problem: The Pokemon name line is at the very top (0%)")
print("  Solution: Move y closer to 0")
print("  RECOMMENDED: y=0.00 or y=0.02 (start from very top of slot)")
print()

print("FOR ITEM NAME:")
print("  Current: y=0.39 (captures starting from 39% down)")
print("  Looking at the slot: the item text appears around the middle-to-bottom")
print("  In a 109px slot, item text appears at roughly rows 55-75")
print("  As fraction: 55/109 = 0.50, 75/109 = 0.69")
print("  RECOMMENDED: y=0.50 (start from 50% down - middle of slot)")
print()

print("=" * 80)
print("MEASUREMENTS FROM VISUAL CROPS:")
print("=" * 80)
print()

# Measure each slot's name position
print("Slot-by-slot verification:")
print()

for idx in range(6):
    full_path = os.path.join(output_dir, f"slot{idx}_full.png")
    full_img = Image.open(full_path)
    name_path = os.path.join(output_dir, f"slot{idx}_name.png")
    name_img = Image.open(name_path)
    item_path = os.path.join(output_dir, f"slot{idx}_item.png")
    item_img = Image.open(item_path)
    
    full_arr = np.array(full_img)
    name_arr = np.array(name_img)
    item_arr = np.array(item_img)
    
    # Convert to grayscale and check for text
    full_gray = np.mean(full_arr[:,:,:3], axis=2) if len(full_arr.shape) == 3 else full_arr
    name_gray = np.mean(name_arr[:,:,:3], axis=2) if len(name_arr.shape) == 3 else name_arr
    item_gray = np.mean(item_arr[:,:,:3], axis=2) if len(item_arr.shape) == 3 else item_arr
    
    # Find text regions (rows with mean < 200)
    full_rows = np.where(np.mean(full_gray, axis=1) < 200)[0]
    name_rows = np.where(np.mean(name_gray, axis=1) < 200)[0]
    item_rows = np.where(np.mean(item_gray, axis=1) < 200)[0]
    
    slot_h = full_gray.shape[0]
    
    name_has_text = len(name_rows) > 0
    item_has_text = len(item_rows) > 0
    
    print(f"Slot {idx}: Name={'OK' if name_has_text else 'EMPTY':5s}  Item={'OK' if item_has_text else 'EMPTY':5s}")

print()
print("=" * 80)
print("RECOMMENDATION:")
print("=" * 80)
print()
print("Change playerPokemonNameRect and playerItemNameRect to:")
print()
print('"playerPokemonNameRect": { "x": 0.10, "y": 0.00, "width": 0.65, "height": 0.40 }')
print('"playerItemNameRect": { "x": 0.10, "y": 0.50, "width": 0.57, "height": 0.40 }')
print()
print("These values:")
print("  - Start the Pokemon name from the very top (y=0.00)")
print("  - Make it taller (height=0.40 instead of 0.28) to capture full name")
print("  - Start the item from the middle (y=0.50)")
print("  - Make it taller (height=0.40 instead of 0.28) to capture full item text")
print()

