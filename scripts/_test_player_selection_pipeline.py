import base64
import io
import json
import sys
from pathlib import Path

import cv2

sys.path.insert(0, "scripts")

from player_selection_recognition import (  # noqa: E402
    load_player_item_names,
    load_player_pokemon_names,
    recognize_player_selection_slots,
)


def build_player_slots(image_path: Path, config_path: Path) -> tuple[list[dict[str, object]], dict[str, dict[str, float]]]:
    image = cv2.imread(str(image_path))
    if image is None:
        raise SystemExit(f"Failed to load image: {image_path}")
    height, width = image.shape[:2]

    config = json.loads(config_path.read_text(encoding="utf-8"))
    slot_rects = config["playerSlotRects"]
    rects = {
        "selectionBadgeRect": config["playerSelectionBadgeRect"],
        "pokemonNameRect": config["playerPokemonNameRect"],
        "itemNameRect": config["playerItemNameRect"],
    }

    slots: list[dict[str, object]] = []
    for index, rect in enumerate(slot_rects):
        x = max(0, int(rect["x"] * width))
        y = max(0, int(rect["y"] * height))
        slot_width = max(1, int(rect["width"] * width))
        slot_height = max(1, int(rect["height"] * height))
        crop = image[y:y + slot_height, x:x + slot_width]
        ok, encoded = cv2.imencode(".png", crop)
        if not ok:
            continue
        slots.append({
            "slotIndex": index,
            "imageBase64": base64.b64encode(encoded).decode("ascii"),
        })

    return slots, rects


def apply_player_selection_results(
    results: list[dict[str, object]],
) -> list[dict[str, object] | None]:
    next_selection: list[dict[str, object] | None] = [None, None, None]

    for result in results:
        selection_order = result.get("selectionOrder")
        if not isinstance(selection_order, int) or selection_order < 1 or selection_order > 3:
            continue
        next_selection[selection_order - 1] = {
            "slotIndex": result.get("slotIndex"),
            "selectionOrder": selection_order,
            "pokemonName": result.get("pokemonName"),
            "itemName": result.get("itemName"),
            "score": result.get("score"),
        }

    unordered = [
        result for result in results
        if result.get("pokemonName")
        and not (
            isinstance(result.get("selectionOrder"), int)
            and 1 <= int(result["selectionOrder"]) <= 3
        )
    ]
    unordered.sort(key=lambda result: int(result.get("slotIndex", 999)))

    fill_index = 0
    for display_index in range(3):
        if next_selection[display_index] is not None or fill_index >= len(unordered):
            continue
        result = unordered[fill_index]
        fill_index += 1
        next_selection[display_index] = {
            "slotIndex": result.get("slotIndex"),
            "selectionOrder": display_index + 1,
            "pokemonName": result.get("pokemonName"),
            "itemName": result.get("itemName"),
            "score": result.get("score"),
        }

    return next_selection


def print_worker_results(results: list[dict[str, object]]) -> None:
    print("=== Worker Results ===")
    for result in results:
        print(
            f"slot{result['slotIndex']}: "
            f"order={result['selectionOrder']} "
            f"pokemon={result['pokemonName']} "
            f"item={result['itemName']} "
            f"score={result['score']}"
        )


def print_display_results(display_slots: list[dict[str, object] | None]) -> None:
    print("\n=== Display Slots ===")
    for index, entry in enumerate(display_slots, start=1):
        if not entry:
            print(f"display{index}: entry=None -> title=Unknown item=Unknown")
            continue
        print(
            f"display{index}: "
            f"from slot{entry['slotIndex']} "
            f"order={entry['selectionOrder']} "
            f"title={entry['pokemonName'] or 'Unknown'} "
            f"item={entry['itemName'] or 'Unknown'} "
            f"score={entry['score']}"
        )


def print_loss_analysis(results: list[dict[str, object]], display_slots: list[dict[str, object] | None]) -> None:
    print("\n=== Loss Analysis ===")
    worker_named = [result for result in results if result.get("pokemonName")]
    display_named = [entry for entry in display_slots if entry and entry.get("pokemonName")]

    print(f"worker_named_slots={len(worker_named)}")
    print(f"display_named_slots={len(display_named)}")

    if not worker_named:
        print("Recognition stage did not produce any pokemonName. Unknown is caused before renderer handoff.")
        return

    if len(display_named) < len(worker_named[:3]):
        print("Some recognized names were not preserved into display slots. Check ordering / slot fill logic.")
        return

    print("Recognized names survived into display slots. If UI still shows Unknown, inspect runtime state/reset timing.")


def main() -> None:
    image_path = Path("debug_screens/IMG_7290.jpg")
    config_path = Path("src/renderer/data/broadcast_recognition_config.json")

    slots, rects = build_player_slots(image_path, config_path)
    pokemon_names = load_player_pokemon_names()
    item_names = load_player_item_names()
    results = recognize_player_selection_slots(slots, rects, pokemon_names, item_names)
    display_slots = apply_player_selection_results(results)

    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    print_worker_results(results)
    print_display_results(display_slots)
    print_loss_analysis(results, display_slots)


if __name__ == "__main__":
    main()
