import argparse
import json
from pathlib import Path

import cv2

from opponent_recognition_core import (
    POKEMON_BROADCAST_TEMPLATES_DIR,
    POKEMON_DATA_DIR,
    POKEMON_REGION_FILES,
)


CONFIG_PATH = POKEMON_DATA_DIR / "broadcast_recognition_config.json"

DEFAULT_BROADCAST_OPPONENT_SLOT_RECTS = [
    {"x": 0.814, "y": 0.145, "width": 0.165, "height": 0.150},
    {"x": 0.814, "y": 0.248, "width": 0.165, "height": 0.150},
    {"x": 0.814, "y": 0.352, "width": 0.165, "height": 0.150},
    {"x": 0.814, "y": 0.456, "width": 0.165, "height": 0.150},
    {"x": 0.814, "y": 0.560, "width": 0.165, "height": 0.150},
    {"x": 0.814, "y": 0.664, "width": 0.165, "height": 0.150},
]
DEFAULT_BROADCAST_SPRITE_SUBRECT = {"x": 0.03, "y": 0.08, "width": 0.54, "height": 1.50}


def load_broadcast_config() -> tuple[list[dict[str, float]], dict[str, float]]:
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return DEFAULT_BROADCAST_OPPONENT_SLOT_RECTS, DEFAULT_BROADCAST_SPRITE_SUBRECT

    rects = data.get("opponentSlotRects")
    sprite_subrect = data.get("spriteSubrect")
    if not isinstance(rects, list) or len(rects) != 6 or not isinstance(sprite_subrect, dict):
        return DEFAULT_BROADCAST_OPPONENT_SLOT_RECTS, DEFAULT_BROADCAST_SPRITE_SUBRECT
    return rects, sprite_subrect


def load_pokemon_mappings() -> tuple[dict[str, str], dict[str, str]]:
    id_to_name: dict[str, str] = {}
    name_to_id: dict[str, str] = {}
    for filename in POKEMON_REGION_FILES:
        path = POKEMON_DATA_DIR / filename
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(data, list):
            continue
        for entry in data:
            if not isinstance(entry, dict):
                continue
            pokemon_id = entry.get("id")
            pokemon_name = entry.get("name")
            if isinstance(pokemon_id, str) and isinstance(pokemon_name, str):
                id_to_name[pokemon_id] = pokemon_name
                name_to_id.setdefault(pokemon_name, pokemon_id)
    return id_to_name, name_to_id


def should_apply_sprite_subrect(slot_rect: dict[str, float]) -> bool:
    return slot_rect.get("width", 0) > 0.12 or slot_rect.get("height", 0) > 0.13


def crop_slot(image, slot_rect: dict[str, float], sprite_subrect: dict[str, float]):
    height, width = image.shape[:2]
    if should_apply_sprite_subrect(slot_rect):
        sprite_rect = {
            "x": slot_rect["x"] + slot_rect["width"] * sprite_subrect["x"],
            "y": slot_rect["y"] + slot_rect["height"] * sprite_subrect["y"],
            "width": slot_rect["width"] * sprite_subrect["width"],
            "height": slot_rect["height"] * sprite_subrect["height"],
        }
    else:
        sprite_rect = slot_rect
    sx = int(sprite_rect["x"] * width)
    sy = int(sprite_rect["y"] * height)
    sw = max(1, int(sprite_rect["width"] * width))
    sh = max(1, int(sprite_rect["height"] * height))
    return image[sy: sy + sh, sx: sx + sw]


def normalize_label(label: str, name_to_id: dict[str, str]) -> str:
    cleaned = label.strip()
    if cleaned in name_to_id:
        return name_to_id[cleaned]
    return cleaned


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract labeled game-screen templates from opponent slots.")
    parser.add_argument("image", help="Path to screenshot image")
    parser.add_argument(
        "--labels",
        nargs=6,
        required=True,
        metavar=("SLOT1", "SLOT2", "SLOT3", "SLOT4", "SLOT5", "SLOT6"),
        help="Pokemon ids or exact Japanese names for slots 1-6",
    )
    args = parser.parse_args()

    image_path = Path(args.image)
    image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
    if image is None:
        raise SystemExit(f"Failed to read image: {image_path}")

    id_to_name, name_to_id = load_pokemon_mappings()
    slot_rects, sprite_subrect = load_broadcast_config()

    POKEMON_BROADCAST_TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)

    saved_paths: list[Path] = []
    for index, raw_label in enumerate(args.labels, start=1):
        pokemon_id = normalize_label(raw_label, name_to_id)
        if pokemon_id not in id_to_name:
            raise SystemExit(f"Unknown pokemon label for slot {index}: {raw_label}")

        crop = crop_slot(image, slot_rects[index - 1], sprite_subrect)
        filename = f"{pokemon_id}__{image_path.stem}_slot{index}.png"
        output_path = POKEMON_BROADCAST_TEMPLATES_DIR / filename
        cv2.imwrite(str(output_path), crop)
        saved_paths.append(output_path)

    print(f"Saved {len(saved_paths)} templates to {POKEMON_BROADCAST_TEMPLATES_DIR}")
    for path in saved_paths:
        print(path.relative_to(POKEMON_BROADCAST_TEMPLATES_DIR.parent.parent))


if __name__ == "__main__":
    main()
