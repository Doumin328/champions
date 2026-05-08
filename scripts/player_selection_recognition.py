import hashlib
import json
import re
import subprocess
import tempfile
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from opponent_recognition_core import POKEMON_DATA_DIR, POKEMON_REGION_FILES, ROOT_DIR


ITEM_DATA_FILE = POKEMON_DATA_DIR / "item.json"
BADGE_TEMPLATE_DIR = ROOT_DIR / "recognize" / "player_selection_badges"

NORMALIZED_TEXT_PATTERN = re.compile(r"[^0-9A-Za-zぁ-んァ-ヶ一-龯ー♂♀]+")
DIGIT_PATTERN = re.compile(r"[123]")
WINDOWS_OCR_TIMEOUT_SECONDS = 20

_badge_templates: dict[int, np.ndarray] | None = None


def load_player_pokemon_names() -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
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
            name = entry.get("name")
            if isinstance(name, str) and name and name not in seen:
                seen.add(name)
                names.append(name)
    return names


def load_player_item_names() -> list[str]:
    names: list[str] = []
    seen: set[str] = set()

    def add_name(value: Any) -> None:
        if isinstance(value, str) and value and value not in seen:
            seen.add(value)
            names.append(value)

    if ITEM_DATA_FILE.exists():
        try:
            data = json.loads(ITEM_DATA_FILE.read_text(encoding="utf-8"))
        except Exception:
            data = []
        if isinstance(data, list):
            for entry in data:
                if not isinstance(entry, dict):
                    continue
                name_ja = entry.get("nameJa")
                item_id = entry.get("id")
                add_name(name_ja)
                if item_id == name_ja:
                    add_name(item_id)
    return names


def normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value)
    normalized = normalized.replace("\u2122", "")
    normalized = normalized.replace(" ", "").replace("\n", "").replace("\r", "")
    return NORMALIZED_TEXT_PATTERN.sub("", normalized)


def strip_kana_diacritics(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value)
    stripped = "".join(ch for ch in decomposed if ch not in ("\u3099", "\u309a"))
    return unicodedata.normalize("NFC", stripped)


def crop_normalized_rect(image: np.ndarray, rect: dict[str, float]) -> np.ndarray:
    height, width = image.shape[:2]
    x = max(0, min(width - 1, int(rect["x"] * width)))
    y = max(0, min(height - 1, int(rect["y"] * height)))
    w = max(1, min(width - x, int(rect["width"] * width)))
    h = max(1, min(height - y, int(rect["height"] * height)))
    return image[y:y + h, x:x + w]


def prepare_badge_match_image(image: np.ndarray) -> np.ndarray:
    resized = cv2.resize(image, (96, 96), interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    _, thresh = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return thresh


def load_badge_templates() -> dict[int, np.ndarray]:
    global _badge_templates
    if _badge_templates is not None:
        return _badge_templates
    templates: dict[int, np.ndarray] = {}
    for digit in (1, 2, 3):
      template_path = BADGE_TEMPLATE_DIR / f"{digit}.png"
      if not template_path.exists():
          continue
      image = cv2.imread(str(template_path), cv2.IMREAD_COLOR)
      if image is None:
          continue
      templates[digit] = prepare_badge_match_image(image)
    _badge_templates = templates
    return templates


def prepare_ocr_variants(image: np.ndarray, kind: str) -> list[np.ndarray]:
    if image.size == 0:
        return []

    scale = 5 if kind == "badge" else 4
    resized = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    _, thresh = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    inv = cv2.bitwise_not(thresh)
    if kind == "badge":
        kernel = np.ones((2, 2), np.uint8)
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=1)
        inv = cv2.morphologyEx(inv, cv2.MORPH_CLOSE, kernel, iterations=1)

    return [
        resized,
        cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR),
        cv2.cvtColor(thresh, cv2.COLOR_GRAY2BGR),
        cv2.cvtColor(inv, cv2.COLOR_GRAY2BGR),
    ]


def run_windows_ocr_batch(images: list[tuple[str, np.ndarray]]) -> dict[str, str]:
    if not images:
        return {}

    ps_script = r"""
param([string]$ManifestPath)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
$null = [Windows.Storage.FileAccessMode, Windows.Storage, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType=WindowsRuntime]
function Await($WinRtTask, [Type]$ResultType) {
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 })[0]
  $netTask = $asTask.MakeGenericMethod($ResultType).Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
$items = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
$results = @()
foreach ($item in $items) {
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($item.path)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $ocr = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $results += [PSCustomObject]@{ id = $item.id; text = $ocr.Text }
}
$results | ConvertTo-Json -Compress
"""

    with tempfile.TemporaryDirectory(prefix="champions-player-ocr-") as tmp_root:
        tmp_dir = Path(tmp_root)
        manifest_path = tmp_dir / "manifest.json"
        script_path = tmp_dir / "windows_ocr.ps1"
        manifest: list[dict[str, str]] = []
        for image_id, image in images:
            image_path = tmp_dir / f"{image_id}.png"
            cv2.imwrite(str(image_path), image)
            manifest.append({"id": image_id, "path": str(image_path)})
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
        script_path.write_text(ps_script, encoding="utf-8")
        command = [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(script_path),
            "-ManifestPath",
            str(manifest_path),
        ]
        try:
            completed = subprocess.run(
                command,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=WINDOWS_OCR_TIMEOUT_SECONDS,
                check=False,
            )
        except subprocess.TimeoutExpired:
            return {}
    if completed.returncode != 0:
        return {}
    stdout = (completed.stdout or "").strip()
    if not stdout:
        return {}
    try:
        parsed = json.loads(stdout)
    except Exception:
        return {}
    if isinstance(parsed, dict):
        parsed = [parsed]
    results: dict[str, str] = {}
    if isinstance(parsed, list):
        for entry in parsed:
            if not isinstance(entry, dict):
                continue
            image_id = entry.get("id")
            text = entry.get("text")
            if isinstance(image_id, str) and isinstance(text, str):
                results[image_id] = text
    return results


def make_image_id(variant: np.ndarray, kind: str, index: int) -> str:
    key_seed = variant.tobytes()[:128] + bytes(f"{kind}-{index}", "utf-8")
    return hashlib.sha1(key_seed).hexdigest()


def extract_ocr_texts(image: np.ndarray, kind: str) -> list[str]:
    variants = prepare_ocr_variants(image, kind)
    batch_inputs: list[tuple[str, np.ndarray]] = []
    for index, variant in enumerate(variants):
        key_seed = variant.tobytes()[:128] + bytes(f"{kind}-{index}", "utf-8")
        image_id = hashlib.sha1(key_seed).hexdigest()
        batch_inputs.append((image_id, variant))
    results = run_windows_ocr_batch(batch_inputs)
    texts: list[str] = []
    for image_id, _variant in batch_inputs:
        text = results.get(image_id, "").strip()
        if text:
            texts.append(text)
    return texts


def pick_selection_order(texts: list[str]) -> int | None:
    for text in texts:
        normalized = normalize_text(text)
        match = DIGIT_PATTERN.search(normalized)
        if match:
            digit = int(match.group(0))
            # バッジ数字は行の左端に表示されるためOCRでは先頭に来ることが多い
            if match.start() <= 1 or match.start() >= max(0, len(normalized) - 2):
                return digit
    return None


def detect_selection_order_from_badge_image(image: np.ndarray) -> tuple[int | None, float]:
    templates = load_badge_templates()
    if not templates or image is None or image.size == 0:
        return None, 0.0

    prepared = prepare_badge_match_image(image)
    best_digit: int | None = None
    best_score = -1.0
    for digit, template in templates.items():
        result = cv2.matchTemplate(prepared, template, cv2.TM_CCOEFF_NORMED)
        score = float(result.max()) if result.size > 0 else -1.0
        if score > best_score:
            best_digit = digit
            best_score = score
    if best_score < 0.45:
        return None, max(0.0, best_score)
    return best_digit, best_score


def detect_selection_badge_presence(image: np.ndarray) -> tuple[bool, float, dict[str, float | int | None]]:
    if image is None or image.size == 0:
        return False, 0.0, {
            "templateOrder": None,
            "templateScore": 0.0,
            "mean": 0.0,
            "std": 0.0,
            "brightRatio": 0.0,
            "edgeRatio": 0.0,
        }

    selection_order, template_score = detect_selection_order_from_badge_image(image)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    mean_value = float(np.mean(gray))
    std_value = float(np.std(gray))
    bright_ratio = float(np.count_nonzero(gray > 185) / max(1, gray.size))
    edges = cv2.Canny(gray, 50, 140)
    edge_ratio = float(np.count_nonzero(edges) / max(1, edges.size))

    mean_score = max(0.0, min(1.0, (mean_value - 145.0) / 55.0))
    contrast_score = max(0.0, min(1.0, (std_value - 38.0) / 30.0))
    bright_score = max(0.0, min(1.0, (bright_ratio - 0.18) / 0.28))
    edge_score = max(0.0, min(1.0, (edge_ratio - 0.08) / 0.10))
    template_presence_score = max(0.0, min(1.0, template_score / 0.45))
    confidence = (
        mean_score * 0.28
        + contrast_score * 0.34
        + bright_score * 0.18
        + edge_score * 0.08
        + template_presence_score * 0.12
    )
    confidence = max(confidence, template_presence_score * 0.86)

    return confidence >= 0.48, round(float(confidence), 4), {
        "templateOrder": selection_order,
        "templateScore": round(float(template_score), 4),
        "mean": round(mean_value, 2),
        "std": round(std_value, 2),
        "brightRatio": round(bright_ratio, 4),
        "edgeRatio": round(edge_ratio, 4),
    }


def detect_player_selection_badges(
    slots: list[dict[str, Any]],
    selection_badge_rect: dict[str, float],
) -> list[dict[str, Any]]:
    import base64 as _base64

    results: list[dict[str, Any]] = []
    for slot in slots:
        slot_index = int(slot.get("slotIndex", -1))
        image_base64 = slot.get("imageBase64", "")
        if slot_index < 0 or not isinstance(image_base64, str):
            continue
        try:
            decoded = _base64.b64decode(image_base64)
            encoded = np.frombuffer(decoded, dtype=np.uint8)
            image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
        except Exception:
            image = None
        if image is None:
            results.append({
                "slotIndex": slot_index,
                "isSelected": False,
                "confidence": 0.0,
                "selectionOrder": None,
                "selectionOrderScore": 0.0,
                "debugFeatures": {},
            })
            continue

        badge_crop = crop_normalized_rect(image, selection_badge_rect)
        is_selected, confidence, features = detect_selection_badge_presence(badge_crop)
        results.append({
            "slotIndex": slot_index,
            "isSelected": is_selected,
            "confidence": confidence,
            "selectionOrder": features["templateOrder"],
            "selectionOrderScore": features["templateScore"],
            "debugFeatures": features,
        })
    return results


def score_candidate(ocr_text: str, candidate: str) -> float:
    normalized_ocr = normalize_text(ocr_text)
    normalized_candidate = normalize_text(candidate)
    if not normalized_ocr or not normalized_candidate:
        return 0.0
    if normalized_ocr == normalized_candidate:
        return 1.0
    if normalized_candidate in normalized_ocr:
        containment_score = len(normalized_candidate) / max(1, len(normalized_ocr))
        if len(normalized_candidate) <= 3:
            return min(0.72, containment_score)
        return max(0.95, containment_score)
    if normalized_ocr in normalized_candidate:
        containment_score = len(normalized_ocr) / max(1, len(normalized_candidate))
        if len(normalized_ocr) <= 3:
            return min(0.72, containment_score)
        return max(0.75, containment_score)
    ratio = SequenceMatcher(None, normalized_ocr, normalized_candidate).ratio()
    plain_ocr = strip_kana_diacritics(normalized_ocr)
    plain_candidate = strip_kana_diacritics(normalized_candidate)
    if plain_ocr and plain_candidate:
        if plain_ocr == plain_candidate:
            ratio = max(ratio, 0.97)
        elif plain_candidate in plain_ocr:
            if len(plain_candidate) <= 3:
                ratio = max(ratio, min(0.70, len(plain_candidate) / max(1, len(plain_ocr))))
            else:
                ratio = max(ratio, 0.93)
        elif plain_ocr in plain_candidate:
            if len(plain_ocr) <= 3:
                ratio = max(ratio, min(0.70, len(plain_ocr) / max(1, len(plain_candidate))))
            else:
                ratio = max(ratio, min(0.88, len(plain_ocr) / max(1, len(plain_candidate))))
        else:
            plain_ratio = SequenceMatcher(None, plain_ocr, plain_candidate).ratio()
            if plain_ratio >= 0.82:
                ratio = max(ratio, plain_ratio * 0.96)
    return ratio


def is_low_confidence_short_candidate(name: str | None, score: float) -> bool:
    if not name:
        return False
    normalized = normalize_text(name)
    return len(normalized) <= 3 and score < 0.86


def infer_mega_stone_name(pokemon_name: str | None, texts: list[str]) -> tuple[str | None, float]:
    if not pokemon_name:
        return None, 0.0
    normalized_text = normalize_text(" ".join(texts))
    if "ナイト" not in normalized_text:
        return None, 0.0

    normalized_pokemon = normalize_text(pokemon_name)
    if normalized_pokemon and normalized_pokemon in normalized_text:
        return f"{pokemon_name}ナイト", 0.98

    if pokemon_name.startswith("メガ") and len(pokemon_name) > len("メガ"):
        base_name = pokemon_name[len("メガ"):]
        normalized_base = normalize_text(base_name)
        if normalized_base and normalized_base in normalized_text:
            return f"{base_name}ナイト", 0.96

    return f"{pokemon_name}ナイト", 0.88


def best_dictionary_match(texts: list[str], dictionary: list[str]) -> tuple[str | None, float]:
    best_name: str | None = None
    best_score = 0.0
    for text in texts:
        for candidate in dictionary:
            score = score_candidate(text, candidate)
            if score > best_score:
                best_name = candidate
                best_score = score
    return best_name, best_score


def recognize_player_selection_slots(
    slots: list[dict[str, Any]],
    rects: dict[str, dict[str, float]],
    pokemon_names: list[str],
    item_names: list[str],
    tracked_orders: dict[int, int] | None = None,
) -> list[dict[str, Any]]:
    import base64 as _base64

    # Phase 1: 全スロットの画像デコード・クロップ
    slot_data: list[dict[str, Any]] = []
    for slot in slots:
        slot_index = int(slot.get("slotIndex", -1))
        image_base64 = slot.get("imageBase64", "")
        if slot_index < 0 or not isinstance(image_base64, str):
            continue
        try:
            decoded = _base64.b64decode(image_base64)
            encoded = np.frombuffer(decoded, dtype=np.uint8)
            image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
        except Exception:
            image = None
        if image is None:
            slot_data.append({"slot_index": slot_index, "image": None})
            continue
        slot_data.append({
            "slot_index": slot_index,
            "image": image,
            "badge_crop": crop_normalized_rect(image, rects["selectionBadgeRect"]),
            "name_crop": crop_normalized_rect(image, rects["pokemonNameRect"]),
            "item_crop": crop_normalized_rect(image, rects["itemNameRect"]),
            "ids": {},
        })

    # Phase 2: 全スロット・全クロップの OCR バリアントを1バッチに集約して PowerShell を1回だけ起動
    _CROP_KINDS: list[tuple[str, str]] = [
        ("name", "image"),
        ("name", "name_crop"),
        ("item", "item_crop"),
        ("badge", "badge_crop"),
    ]
    all_batch: list[tuple[str, np.ndarray]] = []
    for sd in slot_data:
        if sd["image"] is None:
            continue
        for kind, key in _CROP_KINDS:
            for idx, variant in enumerate(prepare_ocr_variants(sd[key], kind)):
                image_id = make_image_id(variant, kind, idx)
                sd["ids"][f"{key}_{idx}"] = image_id
                all_batch.append((image_id, variant))
    ocr_results = run_windows_ocr_batch(all_batch)

    # Phase 3: スロットごとに結果処理
    results: list[dict[str, Any]] = []
    for sd in slot_data:
        slot_index = sd["slot_index"]
        if sd["image"] is None:
            results.append({
                "slotIndex": slot_index,
                "selectionOrder": None,
                "pokemonName": None,
                "itemName": None,
                "score": 0.0,
                "debugOcrTexts": {
                    "slot": [],
                    "pokemonName": [],
                    "itemName": [],
                    "badge": [],
                    "selectedPokemonName": [],
                    "selectedItemName": [],
                },
            })
            continue

        ids = sd["ids"]

        def collect_texts(key: str, max_variants: int = 4) -> list[str]:
            out: list[str] = []
            for idx in range(min(4, max_variants)):
                text = ocr_results.get(ids.get(f"{key}_{idx}", ""), "").strip()
                if text:
                    out.append(text)
            return out

        full_texts = collect_texts("image")
        # binary/inverted variants (idx 2,3) pick up background noise → use only resized+grayscale for name
        full_texts_name = collect_texts("image", max_variants=2)
        name_crop_texts = collect_texts("name_crop", max_variants=2)
        item_crop_texts = collect_texts("item_crop", max_variants=2)
        badge_crop_texts = collect_texts("badge_crop")

        tracked_selection_order = tracked_orders.get(slot_index) if tracked_orders else None
        selection_order = tracked_selection_order if tracked_selection_order is not None else None
        if selection_order is None:
            selection_order = pick_selection_order(full_texts)
        badge_score = 0.72 if selection_order is not None else 0.0
        if selection_order is None:
            selection_order, badge_score = detect_selection_order_from_badge_image(sd["badge_crop"])
        if selection_order is None:
            selection_order = pick_selection_order(badge_crop_texts)
            badge_score = 0.4 if selection_order is not None else 0.0
        if tracked_selection_order is None and tracked_orders and selection_order in set(tracked_orders.values()):
            selection_order = None
            badge_score = 0.0

        slot_pokemon_name, slot_pokemon_score = best_dictionary_match(full_texts_name, pokemon_names)
        crop_pokemon_name, crop_pokemon_score = best_dictionary_match(name_crop_texts, pokemon_names)
        if slot_pokemon_score >= 0.5 or slot_pokemon_score >= crop_pokemon_score - 0.08:
            pokemon_name, pokemon_score = slot_pokemon_name, slot_pokemon_score
        else:
            pokemon_name, pokemon_score = crop_pokemon_name, crop_pokemon_score

        # Use only the OCR variants that read text reliably. Binary/inverted full-slot variants
        # often pick up neighboring slot noise and can overpower the actual item crop.
        item_texts = item_crop_texts + full_texts_name
        mega_stone_name, mega_stone_score = infer_mega_stone_name(pokemon_name, item_texts)
        if mega_stone_name:
            item_name, item_score = mega_stone_name, mega_stone_score
        else:
            item_name, item_score = best_dictionary_match(item_texts, item_names)
            if is_low_confidence_short_candidate(item_name, item_score):
                item_name, item_score = None, 0.0

        has_selection_order = selection_order is not None and 1 <= selection_order <= 3
        recognized_pokemon_name = pokemon_name if has_selection_order and pokemon_score >= 0.42 else None
        recognized_item_name = item_name if has_selection_order and item_score >= 0.34 else None
        overall_score = (badge_score + pokemon_score + item_score) / 3 if has_selection_order else 0.0
        results.append({
            "slotIndex": slot_index,
            "selectionOrder": selection_order,
            "pokemonName": recognized_pokemon_name,
            "itemName": recognized_item_name,
            "score": round(float(overall_score), 4),
            "debugOcrTexts": {
                "slot": full_texts,
                "pokemonName": name_crop_texts,
                "itemName": item_crop_texts,
                "badge": badge_crop_texts,
                "selectedPokemonName": name_crop_texts if selection_order is not None else [],
                "selectedItemName": item_crop_texts if selection_order is not None else [],
            },
        })

    return results
