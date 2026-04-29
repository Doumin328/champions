#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Analyze where text actually appears in the slot crops
"""

import os
from PIL import Image
import numpy as np

output_dir = r"C:\Users\yamas\Documents\workspace\champions\outputImg\debug_slots"

print("=" * 80)
print("TEXT POSITION ANALYSIS")
print("=" * 80)
print()

# For each slot, analyze where dark pixels (text) appear
for slot_idx in range(6):
    print(f"SLOT {slot_idx}")
    print("-" * 80)
    
    full_path = os.path.join(output_dir, f"slot{slot_idx}_full.png")
    full_img = Image.open(full_path)
    full_arr = np.array(full_img)
    
    # Get image dimensions
    height, width = full_arr.shape[:2]
    print(f"Slot dimensions: {width}x{height}")
    
    # Convert to grayscale if RGB
    if len(full_arr.shape) == 3:
        gray = np.mean(full_arr[:,:,:3], axis=2)
    else:
        gray = full_arr
    
    # Find rows with text (darker pixels, mean < 200)
    row_means = np.mean(gray, axis=1)
    text_rows = np.where(row_means < 200)[0]
    
    if len(text_rows) > 0:
        text_top = text_rows[0]
        text_bottom = text_rows[-1]
        text_height = text_bottom - text_top + 1
        text_center = text_top + text_height / 2
        
        print(f"Dark pixels found from row {text_top} to {text_bottom} (height: {text_height})")
        print(f"Center of text: row {text_center:.1f}")
        print(f"As fraction of slot height: {text_center/height:.3f}")
    else:
        print("No dark pixels found (slot might be empty)")
    
    # Analyze the name crop
    name_path = os.path.join(output_dir, f"slot{slot_idx}_name.png")
    name_img = Image.open(name_path)
    name_arr = np.array(name_img)
    
    if len(name_arr.shape) == 3:
        name_gray = np.mean(name_arr[:,:,:3], axis=2)
    else:
        name_gray = name_arr
    
    name_row_means = np.mean(name_gray, axis=1)
    name_text_rows = np.where(name_row_means < 200)[0]
    
    if len(name_text_rows) > 0:
        print(f"Name crop has text in rows {name_text_rows[0]} to {name_text_rows[-1]}")
    else:
        print("Name crop: NO TEXT DETECTED")
    
    # Analyze the item crop
    item_path = os.path.join(output_dir, f"slot{slot_idx}_item.png")
    item_img = Image.open(item_path)
    item_arr = np.array(item_img)
    
    if len(item_arr.shape) == 3:
        item_gray = np.mean(item_arr[:,:,:3], axis=2)
    else:
        item_gray = item_arr
    
    item_row_means = np.mean(item_gray, axis=1)
    item_text_rows = np.where(item_row_means < 200)[0]
    
    if len(item_text_rows) > 0:
        print(f"Item crop has text in rows {item_text_rows[0]} to {item_text_rows[-1]}")
    else:
        print("Item crop: NO TEXT DETECTED")
    
    print()

