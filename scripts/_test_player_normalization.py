import sys

sys.path.insert(0, "scripts")

from player_selection_recognition import normalize_text, score_candidate


def main() -> None:
    cases = [
        ("ピカチュウ", "ピカチュウ"),
        ("ニドラン♂", "ニドラン♂"),
        ("ニドラン♀", "ニドラン♀"),
        ("きあいのタスキ", "きあいのタスキ"),
        ("こだわりスカーフ", "こだわりスカーフ"),
    ]

    for raw, expected in cases:
        normalized = normalize_text(raw)
        print(f"{raw} -> {normalized}")
        assert normalized == expected, f"normalize_text({raw!r}) returned {normalized!r}"
        assert score_candidate(raw, expected) == 1.0, f"score_candidate({raw!r}, {expected!r}) should be 1.0"

    male = normalize_text("ニドラン♂")
    female = normalize_text("ニドラン♀")
    assert male != female, "ニドラン♂ と ニドラン♀ should remain distinct"
    assert score_candidate("ニドラン♂", "ニドラン♀") < 1.0, "ニドラン♂ and ニドラン♀ should not be treated as identical"

    print("Normalization checks passed.")


if __name__ == "__main__":
    main()
