import sys, json, base64, cv2, numpy as np
sys.path.insert(0, "scripts")

from player_selection_recognition import (
    recognize_player_selection_slots,
    load_player_pokemon_names,
    load_player_item_names,
)

img = cv2.imread("debug_screens/IMG_7290.jpg")
h, w = img.shape[:2]
print(f"Image: {w}x{h}")

config = json.loads(open("src/renderer/data/broadcast_recognition_config.json", encoding="utf-8").read())
slot_rects = config["playerSlotRects"]
rects = {
    "selectionBadgeRect": config["playerSelectionBadgeRect"],
    "pokemonNameRect":    config["playerPokemonNameRect"],
    "itemNameRect":       config["playerItemNameRect"],
}

slots = []
for i, r in enumerate(slot_rects):
    x = max(0, int(r["x"] * w)); y = max(0, int(r["y"] * h))
    sw = max(1, int(r["width"] * w)); sh = max(1, int(r["height"] * h))
    crop = img[y:y+sh, x:x+sw]
    _, buf = cv2.imencode(".png", crop)
    slots.append({"slotIndex": i, "imageBase64": base64.b64encode(buf).decode()})

pokemon_names = load_player_pokemon_names()
item_names    = load_player_item_names()
print(f"Dicts: {len(pokemon_names)} pokemon, {len(item_names)} items")

results = recognize_player_selection_slots(slots, rects, pokemon_names, item_names)
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# OCR raw texts をデバッグ出力するため、認識処理を部分的に再現
from player_selection_recognition import (
    crop_normalized_rect, prepare_ocr_variants, make_image_id,
    run_windows_ocr_batch, normalize_text
)
import hashlib

CROP_KINDS = [("name","image"),("name","name_crop"),("item","item_crop"),("badge","badge_crop")]

slot_imgs = []
for s in slots:
    import base64 as _b64
    img_dec = cv2.imdecode(np.frombuffer(_b64.b64decode(s["imageBase64"]), dtype=np.uint8), cv2.IMREAD_COLOR)
    slot_imgs.append({
        "idx": s["slotIndex"],
        "image": img_dec,
        "badge_crop": crop_normalized_rect(img_dec, rects["selectionBadgeRect"]),
        "name_crop":  crop_normalized_rect(img_dec, rects["pokemonNameRect"]),
        "item_crop":  crop_normalized_rect(img_dec, rects["itemNameRect"]),
        "ids": {},
    })

all_batch = []
for sd in slot_imgs:
    for kind, key in CROP_KINDS:
        for idx, variant in enumerate(prepare_ocr_variants(sd[key], kind)):
            image_id = make_image_id(variant, kind, idx)
            sd["ids"][f"{key}_{idx}"] = image_id
            all_batch.append((image_id, variant))
ocr_raw = run_windows_ocr_batch(all_batch)

print("\n=== OCR raw texts per slot ===")
for sd in slot_imgs:
    ids = sd["ids"]
    def get_texts(key):
        return [ocr_raw.get(ids.get(f"{key}_{i}",""),"").strip() for i in range(4) if ocr_raw.get(ids.get(f"{key}_{i}",""),"").strip()]
    print(f"\nslot{sd['idx']}:")
    print(f"  full:  {get_texts('image')}")
    print(f"  name:  {get_texts('name_crop')}")
    print(f"  item:  {get_texts('item_crop')}")
    print(f"  badge: {get_texts('badge_crop')}")

print("\n=== Recognition results ===")
for r in results:
    print(f"slot{r['slotIndex']}: order={r['selectionOrder']}  pokemon={r['pokemonName']}  item={r['itemName']}  score={r['score']}")
