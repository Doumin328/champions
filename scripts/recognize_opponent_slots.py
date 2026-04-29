import json
import sys
from typing import Any

from opponent_recognition_core import (
    MAX_TOP_CANDIDATES,
    MIN_SCORE,
    MIN_SCORE_GAP,
    build_templates,
    decode_png_base64,
    recognize_slot_bytes,
)
from player_selection_recognition import (
    load_player_item_names,
    load_player_pokemon_names,
    recognize_player_selection_slots,
)


if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def emit(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


templates = build_templates()
player_pokemon_names = load_player_pokemon_names()
player_item_names = load_player_item_names()
emit({"type": "ready", "templateCount": len(templates)})


for raw_line in sys.stdin:
    line = raw_line.strip()
    if not line:
        continue

    try:
        message = json.loads(line)
    except Exception as error:
        emit({"type": "error", "message": f"Invalid JSON: {error}"})
        continue

    request_id = str(message.get("requestId", ""))
    message_type = message.get("type")
    slots = message.get("slots", [])
    if not isinstance(slots, list):
        result_type = "player-result" if message_type == "recognize-player-selection" else "result"
        emit({"type": result_type, "requestId": request_id, "results": []})
        continue

    if message_type == "recognize":
        results: list[dict[str, Any]] = []
        for slot in slots:
            slot_index = int(slot.get("slotIndex", -1))
            image_base64 = slot.get("imageBase64", "")
            if slot_index < 0 or not isinstance(image_base64, str):
                continue

            try:
                image_bytes = decode_png_base64(image_base64)
            except Exception:
                results.append(
                    {
                        "slotIndex": slot_index,
                        "pokemonId": None,
                        "pokemonName": None,
                        "score": 0.0,
                        "topCandidates": [],
                    }
                )
                continue

            candidates = recognize_slot_bytes(image_bytes, templates, max_candidates=MAX_TOP_CANDIDATES)
            best = candidates[0] if candidates else None
            second_score = candidates[1]["score"] if len(candidates) > 1 else 0.0

            if not best or best["score"] < MIN_SCORE or best["score"] - second_score < MIN_SCORE_GAP:
                results.append(
                    {
                        "slotIndex": slot_index,
                        "pokemonId": None,
                        "pokemonName": None,
                        "score": 0.0,
                        "topCandidates": candidates,
                    }
                )
                continue

            results.append(
                {
                    "slotIndex": slot_index,
                    "pokemonId": best["pokemonId"],
                    "pokemonName": best["pokemonName"],
                    "score": best["score"],
                    "topCandidates": candidates,
                }
            )

        emit({"type": "result", "requestId": request_id, "results": results})
        continue

    if message_type == "recognize-player-selection":
        rects = message.get("rects", {})
        if not isinstance(rects, dict):
            emit({"type": "player-result", "requestId": request_id, "results": []})
            continue
        results = recognize_player_selection_slots(
            slots,
            rects,
            player_pokemon_names,
            player_item_names,
        )
        emit({"type": "player-result", "requestId": request_id, "results": results})
        continue

    emit({"type": "error", "message": f"Unsupported message type: {message_type}"})
