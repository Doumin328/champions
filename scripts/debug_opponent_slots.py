import argparse
import json
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from opponent_recognition_core import (
    MAX_TOP_CANDIDATES,
    build_templates,
    debug_slot_image,
)


ROOT_DIR = Path(__file__).resolve().parents[1]
POKEMON_DATA_DIR = ROOT_DIR / "src" / "renderer" / "data"
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
SHEET_PANEL_WIDTH = 220
SHEET_PANEL_HEIGHT = 220
SHEET_TEXT_COLOR = (245, 245, 245)
SHEET_MUTED_TEXT_COLOR = (190, 190, 190)
SHEET_BG_COLOR = (28, 24, 36)
SHEET_PANEL_BG = (52, 46, 70)
SHEET_BORDER_COLOR = (96, 88, 128)


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


def crop_slot(image: Any, slot_rect: dict[str, float], sprite_subrect: dict[str, float]) -> Any:
    height, width = image.shape[:2]
    sprite_rect = {
        "x": slot_rect["x"] + slot_rect["width"] * sprite_subrect["x"],
        "y": slot_rect["y"] + slot_rect["height"] * sprite_subrect["y"],
        "width": slot_rect["width"] * sprite_subrect["width"],
        "height": slot_rect["height"] * sprite_subrect["height"],
    }
    sx = int(sprite_rect["x"] * width)
    sy = int(sprite_rect["y"] * height)
    sw = max(1, int(sprite_rect["width"] * width))
    sh = max(1, int(sprite_rect["height"] * height))
    return image[sy: sy + sh, sx: sx + sw]


def mask_to_bgr(mask: np.ndarray | None) -> np.ndarray:
    if mask is None:
        return np.zeros((SHEET_PANEL_HEIGHT, SHEET_PANEL_WIDTH, 3), dtype=np.uint8)
    return cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR)


def fit_image_to_panel(image: np.ndarray | None, width: int = SHEET_PANEL_WIDTH, height: int = SHEET_PANEL_HEIGHT) -> np.ndarray:
    canvas = np.full((height, width, 3), SHEET_PANEL_BG, dtype=np.uint8)
    if image is None or image.size == 0:
        return canvas

    if image.ndim == 2:
        source = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    else:
        source = image

    src_h, src_w = source.shape[:2]
    scale = min((width - 12) / max(1, src_w), (height - 12) / max(1, src_h))
    resized_w = max(1, int(src_w * scale))
    resized_h = max(1, int(src_h * scale))
    resized = cv2.resize(source, (resized_w, resized_h), interpolation=cv2.INTER_AREA)
    offset_x = (width - resized_w) // 2
    offset_y = (height - resized_h) // 2
    canvas[offset_y: offset_y + resized_h, offset_x: offset_x + resized_w] = resized
    cv2.rectangle(canvas, (0, 0), (width - 1, height - 1), SHEET_BORDER_COLOR, 1)
    return canvas


def draw_text_block(
    image: np.ndarray,
    lines: list[str],
    x: int,
    y: int,
    color: tuple[int, int, int] = SHEET_TEXT_COLOR,
    scale: float = 0.5,
    line_height: int = 20,
) -> None:
    for index, line in enumerate(lines):
        cv2.putText(
            image,
            line,
            (x, y + index * line_height),
            cv2.FONT_HERSHEY_SIMPLEX,
            scale,
            color,
            1,
            cv2.LINE_AA,
        )


def build_candidate_panel(candidate: dict[str, Any] | None, templates_by_path: dict[str, dict[str, Any]]) -> np.ndarray:
    panel_height = SHEET_PANEL_HEIGHT + 90
    panel = np.full((panel_height, SHEET_PANEL_WIDTH, 3), SHEET_PANEL_BG, dtype=np.uint8)
    cv2.rectangle(panel, (0, 0), (SHEET_PANEL_WIDTH - 1, panel_height - 1), SHEET_BORDER_COLOR, 1)

    if not candidate:
        draw_text_block(panel, ["no candidate"], 12, SHEET_PANEL_HEIGHT // 2, color=SHEET_MUTED_TEXT_COLOR)
        return panel

    template = templates_by_path.get(candidate.get("templatePath", ""))
    template_image = template["normalized"] if template else None
    panel[:SHEET_PANEL_HEIGHT, :] = fit_image_to_panel(template_image)
    draw_text_block(
        panel,
        [
            f"{candidate['pokemonName']} ({candidate['pokemonId']})",
            f"score={candidate['score']:.4f}",
            f"source={candidate['templateSource']}",
            f"orb={candidate['orbScore']:.4f} gray={candidate['grayScore']:.4f}",
            f"edge={candidate['edgeScore']:.4f}",
        ],
        10,
        SHEET_PANEL_HEIGHT + 18,
        scale=0.42,
        line_height=16,
    )
    return panel


def build_comparison_sheet(
    slot_image: np.ndarray,
    observed: dict[str, Any] | None,
    top_candidates: list[dict[str, Any]],
    templates_by_path: dict[str, dict[str, Any]],
    slot_index: int,
) -> np.ndarray:
    columns: list[np.ndarray] = []

    original_panel = fit_image_to_panel(slot_image)
    bg_removed_panel = fit_image_to_panel(observed.get("backgroundRemovedPreview") if observed else None)
    mask_panel = fit_image_to_panel(mask_to_bgr(observed.get("foregroundMask")) if observed else None)

    def with_header(panel_image: np.ndarray, title: str, subtitle: str | None = None) -> np.ndarray:
        header_height = 54
        full = np.full((panel_image.shape[0] + header_height, panel_image.shape[1], 3), SHEET_PANEL_BG, dtype=np.uint8)
        full[header_height:, :] = panel_image
        draw_text_block(full, [title], 10, 24, scale=0.56)
        if subtitle:
            draw_text_block(full, [subtitle], 10, 44, color=SHEET_MUTED_TEXT_COLOR, scale=0.42, line_height=16)
        return full

    columns.append(with_header(original_panel, "Original Slot"))
    columns.append(with_header(bg_removed_panel, "Background Removed", "comparison input"))
    columns.append(with_header(mask_panel, "Foreground Mask"))

    for rank in range(MAX_TOP_CANDIDATES):
        candidate = top_candidates[rank] if rank < len(top_candidates) else None
        candidate_panel = build_candidate_panel(candidate, templates_by_path)
        title = f"Top {rank + 1}" if candidate else f"Top {rank + 1}"
        subtitle = candidate["templateSource"] if candidate else "no candidates"
        columns.append(with_header(candidate_panel, title, subtitle))

    spacing = 16
    sheet_height = max(column.shape[0] for column in columns) + 52
    sheet_width = sum(column.shape[1] for column in columns) + spacing * (len(columns) + 1)
    sheet = np.full((sheet_height, sheet_width, 3), SHEET_BG_COLOR, dtype=np.uint8)
    draw_text_block(sheet, [f"Slot {slot_index} Comparison"], 18, 30, scale=0.78)

    cursor_x = spacing
    for column in columns:
        y = 44
        sheet[y: y + column.shape[0], cursor_x: cursor_x + column.shape[1]] = column
        cursor_x += column.shape[1] + spacing
    return sheet


def analyze_image(
    image_path: Path,
    templates: list[dict[str, Any]],
    slot_rects: list[dict[str, float]],
    sprite_subrect: dict[str, float],
    save_crops: bool,
    save_comparison_sheets: bool,
) -> dict[str, Any]:
    image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
    if image is None:
        return {"image": str(image_path), "error": "Failed to read image"}

    crop_dir = image_path.with_suffix("")
    if save_crops or save_comparison_sheets:
        crop_dir.mkdir(parents=True, exist_ok=True)

    templates_by_path = {
        template.get("templatePath", ""): template
        for template in templates
        if template.get("templatePath")
    }

    slots: list[dict[str, Any]] = []
    for index, slot_rect in enumerate(slot_rects, start=1):
        slot_image = crop_slot(image, slot_rect, sprite_subrect)
        if save_crops:
            cv2.imwrite(str(crop_dir / f"slot_{index}.png"), slot_image)
        debug_result = debug_slot_image(slot_image, templates, max_candidates=MAX_TOP_CANDIDATES)
        observed = debug_result["observed"]
        top_candidates = debug_result["topCandidates"]

        if save_crops and observed:
            foreground_mask = observed.get("foregroundMask")
            bg_removed_preview = observed.get("backgroundRemovedPreview")
            if foreground_mask is not None:
                cv2.imwrite(str(crop_dir / f"slot_{index}_mask.png"), foreground_mask)
            if bg_removed_preview is not None:
                cv2.imwrite(str(crop_dir / f"slot_{index}_bg_removed.png"), bg_removed_preview)

        if save_comparison_sheets:
            sheet = build_comparison_sheet(slot_image, observed, top_candidates, templates_by_path, index)
            cv2.imwrite(str(crop_dir / f"slot_{index}_sheet.png"), sheet)

        slots.append(
            {
                "slot": index,
                "top3": top_candidates,
            }
        )

    return {"image": str(image_path), "slots": slots}


def main() -> None:
    parser = argparse.ArgumentParser(description="Debug top3 candidates for opponent slots from static screenshots.")
    parser.add_argument("images", nargs="+", help="Paths to screenshot images")
    parser.add_argument("--json", action="store_true", help="Output JSON only")
    parser.add_argument("--save-crops", action="store_true", help="Save cropped slot images beside the input screenshot")
    parser.add_argument("--save-comparison-sheets", action="store_true", help="Save side-by-side comparison sheets beside the input screenshot")
    args = parser.parse_args()

    templates = build_templates()
    slot_rects, sprite_subrect = load_broadcast_config()
    results = [
        analyze_image(Path(image), templates, slot_rects, sprite_subrect, args.save_crops, args.save_comparison_sheets)
        for image in args.images
    ]

    if args.json:
        print(json.dumps({"templateCount": len(templates), "results": results}, ensure_ascii=False, indent=2))
        return

    print(f"Loaded templates: {len(templates)}")
    for result in results:
        print(f"\n=== {result['image']} ===")
        if "error" in result:
            print(f"ERROR: {result['error']}")
            continue
        for slot in result["slots"]:
            print(f"slot {slot['slot']}:")
            top3 = slot["top3"]
            if not top3:
                print("  no candidates")
                continue
            for rank, candidate in enumerate(top3, start=1):
                print(
                    f"  {rank}. {candidate['pokemonName']} ({candidate['pokemonId']}) "
                    f"score={candidate['score']:.4f} "
                    f"source={candidate['templateSource']} "
                    f"[orb={candidate['orbScore']:.4f} gray={candidate['grayScore']:.4f} edge={candidate['edgeScore']:.4f}]"
                )


if __name__ == "__main__":
    main()
