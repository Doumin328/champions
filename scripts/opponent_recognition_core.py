import base64
import json
from pathlib import Path
from typing import Any

import cv2
import numpy as np


ROOT_DIR = Path(__file__).resolve().parents[1]
RECOGNIZE_DIR = ROOT_DIR / "recognize"
POKEMON_CS_DIR = ROOT_DIR / "src" / "img" / "pokemon_cs"
POKEMON_BROADCAST_TEMPLATES_DIR = ROOT_DIR / "src" / "img" / "pokemon_broadcast_templates"
POKEMON_DATA_DIR = ROOT_DIR / "src" / "renderer" / "data"

TEMPLATE_SIZE = 112
MIN_GOOD_MATCHES = 5
MAX_TOP_CANDIDATES = 3
MIN_SCORE = 0.34
MIN_SCORE_GAP = 0.04

ORB_WEIGHT = 0.45
GRAY_WEIGHT = 0.30
EDGE_WEIGHT = 0.25
BROADCAST_TEMPLATE_BONUS = 0.08

POKEMON_REGION_FILES = [
    "pokemon_kanto.json",
    "pokemon_johto.json",
    "pokemon_hoenn.json",
    "pokemon_sinnoh.json",
    "pokemon_unova.json",
    "pokemon_kalos.json",
    "pokemon_alola.json",
    "pokemon_galar.json",
    "pokemon_paldea.json",
    "pokemon_forms.json",
]

orb = cv2.ORB_create(nfeatures=256, scaleFactor=1.2, nlevels=8)
matcher = cv2.BFMatcher(cv2.NORM_HAMMING)


def load_pokemon_names() -> dict[str, str]:
    names: dict[str, str] = {}
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
            if isinstance(pokemon_id, str) and isinstance(pokemon_name, str) and pokemon_id not in names:
                names[pokemon_id] = pokemon_name
    return names


def crop_foreground(image: np.ndarray) -> np.ndarray:
    if image.ndim == 3 and image.shape[2] == 4:
        alpha = image[:, :, 3]
        ys, xs = np.where(alpha > 16)
        if len(xs) > 0 and len(ys) > 0:
            return image[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1]
    return image


def alpha_mask_from_image(image: np.ndarray) -> np.ndarray | None:
    if image.ndim == 3 and image.shape[2] == 4:
        return (image[:, :, 3] > 16).astype(np.uint8) * 255
    return None


def crop_to_mask(image: np.ndarray, mask: np.ndarray | None, padding: int = 4) -> tuple[np.ndarray, np.ndarray | None]:
    if mask is None or mask.size == 0:
        return image, mask

    ys, xs = np.where(mask > 0)
    if len(xs) == 0 or len(ys) == 0:
        return image, mask

    x1 = max(0, int(xs.min()) - padding)
    y1 = max(0, int(ys.min()) - padding)
    x2 = min(image.shape[1], int(xs.max()) + padding + 1)
    y2 = min(image.shape[0], int(ys.max()) + padding + 1)
    return image[y1:y2, x1:x2], mask[y1:y2, x1:x2]


def resize_mask(mask: np.ndarray | None) -> np.ndarray | None:
    if mask is None:
        return None
    return cv2.resize(mask, (TEMPLATE_SIZE, TEMPLATE_SIZE), interpolation=cv2.INTER_NEAREST)


def apply_mask_to_bgr(image: np.ndarray, mask: np.ndarray | None) -> np.ndarray:
    if mask is None:
        return image
    masked = image.copy()
    masked[mask == 0] = (0, 0, 0)
    return masked


def largest_component_mask(mask: np.ndarray) -> np.ndarray:
    component_count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if component_count <= 1:
        return mask

    best_index = 1
    best_area = 0
    for index in range(1, component_count):
        area = int(stats[index, cv2.CC_STAT_AREA])
        if area > best_area:
            best_area = area
            best_index = index

    largest = np.zeros_like(mask)
    largest[labels == best_index] = 255
    return largest


def normalize_observed_bgr(image: np.ndarray) -> np.ndarray:
    resized = cv2.resize(image, (TEMPLATE_SIZE, TEMPLATE_SIZE), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)

    # Reduce the bright magenta/red card background so the sprite silhouette dominates.
    background_mask = cv2.inRange(hsv, np.array([150, 40, 40]), np.array([179, 255, 255]))
    neutralized = resized.copy()
    neutralized[background_mask > 0] = (18, 18, 18)
    return neutralized


def preprocess_raw_array(image: np.ndarray) -> dict[str, Any] | None:
    if image is None or image.size == 0:
        return None
    resized = cv2.resize(image, (TEMPLATE_SIZE, TEMPLATE_SIZE), interpolation=cv2.INTER_AREA)
    processed = build_processed_image(resized, None)
    processed["normalizedBeforeMask"] = resized
    processed["foregroundMask"] = None
    processed["backgroundRemovedPreview"] = resized
    processed["normalized"] = resized
    return processed


def build_observed_foreground_mask(bgr: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)

    red_mask_1 = cv2.inRange(hsv, np.array([0, 80, 40]), np.array([16, 255, 255]))
    red_mask_2 = cv2.inRange(hsv, np.array([150, 60, 40]), np.array([179, 255, 255]))
    dark_mask = cv2.inRange(hsv, np.array([0, 0, 0]), np.array([179, 255, 48]))
    background_mask = cv2.bitwise_or(red_mask_1, red_mask_2)
    background_mask = cv2.bitwise_or(background_mask, dark_mask)

    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    bright_foreground = cv2.threshold(gray, 70, 255, cv2.THRESH_BINARY)[1]
    edge_foreground = cv2.Canny(gray, 50, 140)

    foreground = cv2.bitwise_or(bright_foreground, edge_foreground)
    foreground = cv2.bitwise_and(foreground, cv2.bitwise_not(background_mask))

    kernel = np.ones((3, 3), np.uint8)
    foreground = cv2.morphologyEx(foreground, cv2.MORPH_OPEN, kernel, iterations=1)
    foreground = cv2.morphologyEx(foreground, cv2.MORPH_CLOSE, kernel, iterations=2)
    foreground = largest_component_mask(foreground)
    return foreground


def build_processed_image(bgr: np.ndarray, mask: np.ndarray | None = None) -> dict[str, Any]:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    equalized = cv2.equalizeHist(blurred)
    if mask is not None:
        equalized = cv2.bitwise_and(equalized, equalized, mask=mask)
    edges = cv2.Canny(equalized, 60, 140)
    if mask is not None:
        edges = cv2.bitwise_and(edges, edges, mask=mask)
    keypoints, descriptors = orb.detectAndCompute(equalized, None)
    return {
        "gray": equalized,
        "edges": edges,
        "mask": mask,
        "keypoints": keypoints,
        "descriptors": descriptors,
    }


def preprocess_template(path: Path, source: str = "pokemon_cs") -> dict[str, Any] | None:
    image = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if image is None:
        return None
    if source == "recognize":
        if image.ndim == 3 and image.shape[2] == 4:
            bgr = cv2.cvtColor(image, cv2.COLOR_BGRA2BGR)
        else:
            bgr = image
        return preprocess_raw_array(bgr)
    alpha_mask = alpha_mask_from_image(image)
    if alpha_mask is not None:
        image, alpha_mask = crop_to_mask(image, alpha_mask, padding=0)
    else:
        image = crop_foreground(image)
    if image.size == 0:
        return None
    if image.ndim == 3 and image.shape[2] == 4:
        bgr = cv2.cvtColor(image, cv2.COLOR_BGRA2BGR)
    else:
        bgr = image
    normalized = cv2.resize(bgr, (TEMPLATE_SIZE, TEMPLATE_SIZE), interpolation=cv2.INTER_AREA)
    normalized_mask = resize_mask(alpha_mask)
    normalized = apply_mask_to_bgr(normalized, normalized_mask)
    processed = build_processed_image(normalized, normalized_mask)
    processed["normalized"] = normalized
    return processed


def preprocess_observed_array(image: np.ndarray) -> dict[str, Any] | None:
    if image is None or image.size == 0:
        return None
    normalized = normalize_observed_bgr(image)
    foreground_mask = build_observed_foreground_mask(normalized)
    cropped, cropped_mask = crop_to_mask(normalized, foreground_mask, padding=6)
    resized = cv2.resize(cropped, (TEMPLATE_SIZE, TEMPLATE_SIZE), interpolation=cv2.INTER_AREA)
    resized_mask = resize_mask(cropped_mask)
    resized = apply_mask_to_bgr(resized, resized_mask)
    processed = build_processed_image(resized, resized_mask)
    processed["normalizedBeforeMask"] = normalized
    processed["foregroundMask"] = resized_mask
    processed["backgroundRemovedPreview"] = resized
    processed["normalized"] = resized
    return processed


def preprocess_observed_bytes(image_bytes: bytes, mode: str = "masked") -> dict[str, Any] | None:
    encoded = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    if image is None:
        return None
    if mode == "raw":
        return preprocess_raw_array(image)
    return preprocess_observed_array(image)


def score_orb(observed: dict[str, Any], template: dict[str, Any]) -> float:
    observed_descriptors = observed["descriptors"]
    template_descriptors = template["descriptors"]
    observed_keypoints = observed["keypoints"]
    template_keypoints = template["keypoints"]

    if observed_descriptors is None or template_descriptors is None:
        return 0.0
    if len(observed_keypoints) < 4 or len(template_keypoints) < 4:
        return 0.0

    raw_matches = matcher.knnMatch(observed_descriptors, template_descriptors, k=2)
    good_matches = []
    for pair in raw_matches:
        if len(pair) != 2:
            continue
        first, second = pair
        if first.distance < 0.78 * second.distance:
            good_matches.append(first)

    if len(good_matches) < MIN_GOOD_MATCHES:
        return 0.0

    distances = [match.distance for match in good_matches]
    avg_distance = sum(distances) / len(distances)
    quality = 1.0 - min(1.0, avg_distance / 64.0)
    coverage = min(1.0, len(good_matches) / max(1, min(len(observed_keypoints), len(template_keypoints), 28)))
    return quality * 0.65 + coverage * 0.35


def score_gray_similarity(observed: dict[str, Any], template: dict[str, Any]) -> float:
    diff = cv2.absdiff(observed["gray"], template["gray"])
    mean_diff = float(np.mean(diff)) / 255.0
    return max(0.0, 1.0 - mean_diff)


def score_edge_similarity(observed: dict[str, Any], template: dict[str, Any]) -> float:
    observed_edges = observed["edges"] > 0
    template_edges = template["edges"] > 0
    union = int(np.count_nonzero(observed_edges | template_edges))
    if union == 0:
        return 0.0
    intersection = int(np.count_nonzero(observed_edges & template_edges))
    return intersection / union


def score_template_match(observed: dict[str, Any], template: dict[str, Any]) -> dict[str, float]:
    orb_score = score_orb(observed, template)
    gray_score = score_gray_similarity(observed, template)
    edge_score = score_edge_similarity(observed, template)
    total = orb_score * ORB_WEIGHT + gray_score * GRAY_WEIGHT + edge_score * EDGE_WEIGHT
    return {
        "orbScore": round(float(orb_score), 4),
        "grayScore": round(float(gray_score), 4),
        "edgeScore": round(float(edge_score), 4),
        "score": round(float(total), 4),
    }


def parse_template_pokemon_id(image_path: Path, source: str) -> str:
    stem = image_path.stem
    if source == "recognize":
        return stem.split("_", 1)[0]
    return stem.split("__", 1)[0]


def build_templates() -> list[dict[str, Any]]:
    pokemon_names = load_pokemon_names()
    templates: list[dict[str, Any]] = []

    template_sources = [
        (RECOGNIZE_DIR, "recognize"),
        (POKEMON_BROADCAST_TEMPLATES_DIR, "broadcast"),
        (POKEMON_CS_DIR, "pokemon_cs"),
    ]

    for template_dir, source in template_sources:
        if not template_dir.exists():
            continue
        for image_path in sorted(template_dir.glob("*.png")):
            pokemon_id = parse_template_pokemon_id(image_path, source)
            pokemon_name = pokemon_names.get(pokemon_id)
            if not pokemon_name:
                continue
            processed = preprocess_template(image_path, source=source)
            if not processed:
                continue
            templates.append(
                {
                    "pokemon_id": pokemon_id,
                    "pokemon_name": pokemon_name,
                    "templateSource": source,
                    "templatePath": str(image_path),
                    **processed,
                }
            )
    return templates


def aggregate_candidates_by_pokemon(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    best_by_pokemon: dict[str, dict[str, Any]] = {}
    for candidate in candidates:
        pokemon_id = candidate["pokemonId"]
        current = best_by_pokemon.get(pokemon_id)
        if current is None or candidate["score"] > current["score"]:
            best_by_pokemon[pokemon_id] = candidate

    aggregated = list(best_by_pokemon.values())
    aggregated.sort(key=lambda item: item["score"], reverse=True)
    return aggregated


def score_against_templates(
    observed: dict[str, Any] | None,
    templates: list[dict[str, Any]],
    score_bonus_sources: set[str] | None = None,
) -> list[dict[str, Any]]:
    if not observed:
        return []

    all_candidates: list[dict[str, Any]] = []
    for template in templates:
        scored = score_template_match(observed, template)
        if scored["score"] <= 0:
            continue
        total_score = scored["score"]
        if score_bonus_sources and template.get("templateSource") in score_bonus_sources:
            total_score = min(1.0, total_score + BROADCAST_TEMPLATE_BONUS)
        all_candidates.append(
            {
                "pokemonId": template["pokemon_id"],
                "pokemonName": template["pokemon_name"],
                "templateSource": template.get("templateSource", "unknown"),
                "templatePath": template.get("templatePath"),
                "orbScore": scored["orbScore"],
                "grayScore": scored["grayScore"],
                "edgeScore": scored["edgeScore"],
                "score": round(float(total_score), 4),
            }
        )

    return aggregate_candidates_by_pokemon(all_candidates)


def recognize_processed_slot(
    observed_masked: dict[str, Any] | None,
    observed_raw: dict[str, Any] | None,
    templates: list[dict[str, Any]],
    max_candidates: int = MAX_TOP_CANDIDATES,
) -> list[dict[str, Any]]:
    recognize_templates = [template for template in templates if template.get("templateSource") == "recognize"]
    broadcast_templates = [template for template in templates if template.get("templateSource") == "broadcast"]
    pokemon_cs_templates = [template for template in templates if template.get("templateSource") == "pokemon_cs"]

    if recognize_templates:
        candidates = score_against_templates(observed_raw, recognize_templates, score_bonus_sources={"recognize"})
    elif broadcast_templates:
        candidates = score_against_templates(observed_masked, broadcast_templates, score_bonus_sources={"broadcast"})
    else:
        candidates = score_against_templates(observed_masked, pokemon_cs_templates)

    return candidates[:max_candidates]


def recognize_slot_image(
    image: np.ndarray,
    templates: list[dict[str, Any]],
    max_candidates: int = MAX_TOP_CANDIDATES,
) -> list[dict[str, Any]]:
    observed_masked = preprocess_observed_array(image)
    observed_raw = preprocess_raw_array(image)
    return recognize_processed_slot(observed_masked, observed_raw, templates, max_candidates=max_candidates)


def debug_slot_image(
    image: np.ndarray,
    templates: list[dict[str, Any]],
    max_candidates: int = MAX_TOP_CANDIDATES,
) -> dict[str, Any]:
    observed_masked = preprocess_observed_array(image)
    observed_raw = preprocess_raw_array(image)
    top_candidates = recognize_processed_slot(observed_masked, observed_raw, templates, max_candidates=max_candidates)
    return {
        "observed": observed_raw if any(template.get("templateSource") == "recognize" for template in templates) else observed_masked,
        "observedMasked": observed_masked,
        "observedRaw": observed_raw,
        "topCandidates": top_candidates,
    }


def recognize_slot_bytes(
    image_bytes: bytes,
    templates: list[dict[str, Any]],
    max_candidates: int = MAX_TOP_CANDIDATES,
) -> list[dict[str, Any]]:
    observed_masked = preprocess_observed_bytes(image_bytes, mode="masked")
    observed_raw = preprocess_observed_bytes(image_bytes, mode="raw")
    return recognize_processed_slot(observed_masked, observed_raw, templates, max_candidates=max_candidates)


def decode_png_base64(image_base64: str) -> bytes:
    return base64.b64decode(image_base64)
