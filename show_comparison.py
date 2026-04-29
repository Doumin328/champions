#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Show comparison between original and corrected crops
"""

import os
from PIL import Image, ImageDraw, ImageFont

output_dir = r"C:\Users\yamas\Documents\workspace\champions\outputImg\debug_slots"

print("=" * 80)
print("BEFORE/AFTER COMPARISON")
print("=" * 80)
print()

print("POKEMON NAME RECTANGLE:")
print("-" * 80)
print()
print("BEFORE (y=0.06, height=0.28):")
print("  Captures: Top of name + gender symbol + padding")
print("  Result:   Missing most of the Pokemon name text")
print()
print("AFTER (y=0.00, height=0.40):")
print("  Captures: Full Pokemon name line")
print("  Result:   Complete Pokemon name text available for OCR")
print()

print("ITEM NAME RECTANGLE:")
print("-" * 80)
print()
print("BEFORE (y=0.39, height=0.28):")
print("  Captures: Overlapping region between name and item")
print("  Result:   Neither name nor item fully visible")
print()
print("AFTER (y=0.50, height=0.40):")
print("  Captures: Full item name line")
print("  Result:   Complete item name text available for OCR")
print()

# List files for user reference
print("=" * 80)
print("FILES FOR VISUAL INSPECTION")
print("=" * 80)
print()

files_to_check = [
    ("slot0_full.png", "Full slot (reference)"),
    ("slot0_name.png", "Original name crop (INCORRECT)"),
    ("slot0_name_CORRECTED.png", "Corrected name crop (CORRECT)"),
    ("slot0_item.png", "Original item crop (INCORRECT)"),
    ("slot0_item_CORRECTED.png", "Corrected item crop (CORRECT)"),
]

for filename, description in files_to_check:
    filepath = os.path.join(output_dir, filename)
    if os.path.exists(filepath):
        img = Image.open(filepath)
        print(f"{filename:30s} {img.size[0]:4d}x{img.size[1]:3d}  - {description}")
    else:
        print(f"{filename:30s} NOT FOUND")

print()
print("=" * 80)
print()

