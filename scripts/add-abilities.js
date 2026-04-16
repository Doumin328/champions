/**
 * 各地方の pokemon_*.json に特性（abilities）を PokeAPI から追加するスクリプト
 *
 * Usage:
 *   node scripts/add-abilities.js --preview   # 一覧表示のみ（JSONは変更しない）
 *   node scripts/add-abilities.js --apply     # JSONを実際に更新
 */

const fs = require("fs");
const path = require("path");

const REGION_FILES = [
  "pokemon_kanto",
  "pokemon_johto",
  "pokemon_hoenn",
  "pokemon_sinnoh",
  "pokemon_unova",
  "pokemon_kalos",
  "pokemon_alola",
  "pokemon_galar",
  "pokemon_paldea",
];
const DATA_DIR = path.join(__dirname, "..", "src", "renderer", "data");
const CONCURRENCY = 5;
const DELAY_MS = 120;

// ---- キャッシュ ----
const abilityJaCache = {}; // "overgrow" -> "しんりょく"
const speciesEnNameCache = {}; // 数値ID -> "bulbasaur"

// ---- フォームサフィックス マッピング ----

/** ID の数値部分と文字サフィックスに分解 */
function parseId(id) {
  const num = parseInt(id.replace(/[^0-9]/g, ""), 10);
  const suffix = id.replace(/^\d+/, "");
  return { num, suffix };
}

/**
 * A サフィックス: ポケモンごとに異なる意味を持つ
 */
const A_FORM_SLUGS = {
  26: "raichu-alola",
  38: "ninetales-alola",
  59: "arcanine-hisui",
  80: "slowbro-galar",
  128: "tauros-paldea-combat-breed",
  157: "typhlosion-hisui",
  199: "slowking-galar",
  386: "deoxys-attack",
  483: "dialga-origin",
  484: "palkia-origin",
  503: "samurott-hisui",
  571: "zoroark-hisui",
  618: "stunfisk-galar",
  641: "tornadus-therian",
  642: "thundurus-therian",
  645: "landorus-therian",
  647: "keldeo-resolute",
  706: "goodra-hisui",
  713: "avalugg-hisui",
  720: "hoopa-unbound",
  724: "decidueye-hisui",
  745: "lycanroc-midnight",
  800: "necrozma-dusk",
  801: "magearna-original",
  876: "indeedee-female",
  888: "zacian-crowned",
  889: "zamazenta-crowned",
  901: "ursaluna-bloodmoon",
  902: "basculegion-female",
  905: "enamorus-therian",
  964: "palafin-hero",
  1024: "terapagos-terastal",
};

const B_FORM_SLUGS = {
  648: "kyurem-black",
  745: "lycanroc-dusk",
  800: "necrozma-dawn",
  898: "calyrex-shadow",
  1024: "terapagos-stellar",
};

const W_FORM_SLUGS = {
  648: "kyurem-white",
  898: "calyrex-ice",
};

const G_FORM_SLUGS = {
  382: "kyogre-primal",
  383: "groudon-primal",
  413: "wormadam-trash",
};

const S_FORM_SLUGS = {
  386: "deoxys-speed",
  413: "wormadam-sandy",
  492: "shaymin-sky",
  710: "pumpkaboo-small",
  711: "gourgeist-small",
};

const D_FORM_SLUGS = {
  386: "deoxys-defense",
};

const P_FORM_SLUGS = {
  718: "zygarde-complete",
  741: "oricorio-pom-pom",
};

const F_FORM_SLUGS = {
  678: "meowstic-female",
  741: "oricorio-pau",
};

const M_FORM_SLUGS = {
  678: "meowstic-male",
  741: "oricorio-sensu",
};

/**
 * ID からPokeAPIのスラグを解決する
 * 解決できない場合は null を返す（ベース形式にフォールバック）
 */
async function resolveSlug(id) {
  const { num, suffix } = parseId(id);

  if (!suffix) {
    return String(num);
  }

  // 種族英語名が必要なケースのために事前取得
  async function getSpeciesName() {
    if (!speciesEnNameCache[num]) {
      try {
        const res = await fetch(
          `https://pokeapi.co/api/v2/pokemon-species/${num}`
        );
        if (res.ok) {
          const data = await res.json();
          speciesEnNameCache[num] = data.name;
        }
      } catch {}
    }
    return speciesEnNameCache[num] || null;
  }

  // 固定マッピング（単純なもの）
  const fixedMap = {
    Mega: async () => `${await getSpeciesName()}-mega`,
    MegaX: async () => `${await getSpeciesName()}-mega-x`,
    MegaY: async () => `${await getSpeciesName()}-mega-y`,
    Alola: async () => `${await getSpeciesName()}-alola`,
    galar: async () =>
      num === 555 ? "darmanitan-galar-standard" : `${await getSpeciesName()}-galar`,
    hisui: async () => `${await getSpeciesName()}-hisui`,
    husui: async () => `${await getSpeciesName()}-hisui`,
    paldea: async () =>
      num === 128 ? "tauros-paldea-combat-breed" : `${await getSpeciesName()}-paldea`,
    paldeaFire: async () => "tauros-paldea-blaze-breed",
    paldeaWater: async () => "tauros-paldea-aqua-breed",
    Fire: async () => "tauros-paldea-blaze-breed",
    Water: async () => "tauros-paldea-aqua-breed",
    Blue: async () => `${await getSpeciesName()}-blue-striped`,
    white: async () => `${await getSpeciesName()}-white-striped`,
    Dar: async () => `${await getSpeciesName()}-zen`,
    galarDar: async () => `${await getSpeciesName()}-galar-zen`,
    Ultra: async () => "necrozma-ultra",
    Satoshi: async () => "greninja-ash",
    fire: async () =>
      num === 479 ? "rotom-heat" : num === 1017 ? "ogerpon-hearthflame-mask" : null,
    frost: async () => "rotom-frost",
    wash: async () => "rotom-wash",
    spin: async () => "rotom-fan",
    glass: async () => "rotom-mow",
    sun: async () => "castform-sunny",
    rain: async () => "castform-rainy",
    snow: async () => "castform-snowy",
    rock: async () => "ogerpon-cornerstone-mask",
    water: async () => (num === 1017 ? "ogerpon-wellspring-mask" : null),
    step: async () => "meloetta-pirouette",
    L: async () => `${await getSpeciesName()}-large`,
    XL: async () => `${await getSpeciesName()}-super`,
    _10: async () => "zygarde-10",
    _50: async () => "zygarde-50",
    core: async () => "minior-red-meteor",
    AMega: async () => null,
    MegaZ: async () => null,
  };

  // 複数ポケモンで意味が異なるサフィックス
  const perPokemonMap = {
    A: A_FORM_SLUGS,
    B: B_FORM_SLUGS,
    W: W_FORM_SLUGS,
    G: G_FORM_SLUGS,
    S: S_FORM_SLUGS,
    D: D_FORM_SLUGS,
    P: P_FORM_SLUGS,
    F: F_FORM_SLUGS,
    M: M_FORM_SLUGS,
  };

  if (perPokemonMap[suffix]) {
    return perPokemonMap[suffix][num] || null;
  }

  if (fixedMap[suffix]) {
    return fixedMap[suffix]();
  }

  return null;
}

// ---- API ヘルパー ----

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) {
        if (i < retries) await sleep(500);
        continue;
      }
      return res.json();
    } catch (e) {
      if (i < retries) await sleep(500);
    }
  }
  return null;
}

async function getAbilityJaName(abilityEnName) {
  if (abilityJaCache[abilityEnName] !== undefined) {
    return abilityJaCache[abilityEnName];
  }
  const data = await fetchWithRetry(
    `https://pokeapi.co/api/v2/ability/${abilityEnName}`
  );
  if (!data) {
    abilityJaCache[abilityEnName] = null;
    return null;
  }
  // 日本語名が見つからない場合（独自特性等）は null を返す
  const jaName =
    data.names?.find((n) => n.language?.name === "ja")?.name ||
    data.names?.find((n) => n.language?.name === "ja-Hrkt")?.name ||
    null;
  abilityJaCache[abilityEnName] = jaName;
  return jaName;
}

/** 1件のポケモンエントリに対して abilities 配列を取得 */
async function fetchAbilities(entry) {
  const slug = await resolveSlug(entry.id);

  if (!slug) {
    return { status: "skip", reason: "フォームマッピングなし" };
  }

  const data = await fetchWithRetry(
    `https://pokeapi.co/api/v2/pokemon/${slug}`
  );

  if (!data) {
    // フォームが見つからなければベースID（数値）でフォールバック
    const { num, suffix } = parseId(entry.id);
    if (suffix) {
      const fallbackData = await fetchWithRetry(
        `https://pokeapi.co/api/v2/pokemon/${num}`
      );
      if (fallbackData) {
        const abilities = await resolveAbilities(fallbackData);
        return { status: "fallback", abilities, slug };
      }
    }
    return { status: "skip", reason: "PokeAPI に未登録" };
  }

  const abilities = await resolveAbilities(data);
  return { status: "ok", abilities, slug };
}

async function resolveAbilities(pokemonData) {
  const sorted = (pokemonData.abilities || []).sort((a, b) => a.slot - b.slot);
  const result = [];
  for (const ab of sorted) {
    const jaName = await getAbilityJaName(ab.ability.name);
    if (jaName) result.push(jaName);
  }
  return result;
}

// ---- 並列実行ヘルパー ----

async function runBatch(entries, fn, concurrency, onProgress) {
  const results = [];
  let idx = 0;

  async function worker() {
    while (idx < entries.length) {
      const i = idx++;
      results[i] = await fn(entries[i], i);
      await sleep(DELAY_MS);
      if (onProgress) onProgress(i + 1, entries.length);
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return results;
}

// ---- メイン ----

async function processRegion(regionName) {
  const filePath = path.join(DATA_DIR, `${regionName}.json`);
  const entries = JSON.parse(fs.readFileSync(filePath, "utf8"));

  process.stderr.write(
    `\n[${regionName}] ${entries.length} 件を処理中...\n`
  );

  let done = 0;
  const results = await runBatch(
    entries,
    async (entry) => {
      const result = await fetchAbilities(entry);
      return { entry, result };
    },
    CONCURRENCY,
    (n, total) => {
      done = n;
      if (n % 20 === 0 || n === total) {
        process.stderr.write(`  ${n}/${total}\r`);
      }
    }
  );

  return results;
}

async function main() {
  const isApply = process.argv.includes("--apply");
  const isPreview = process.argv.includes("--preview") || !isApply;

  console.log(
    isApply
      ? "=== 特性追加 --apply モード ==="
      : "=== 特性プレビュー --preview モード（JSONは変更しません）==="
  );
  console.log();

  for (const regionName of REGION_FILES) {
    const results = await processRegion(regionName);
    const filePath = path.join(DATA_DIR, `${regionName}.json`);
    const entries = JSON.parse(fs.readFileSync(filePath, "utf8"));

    const regionLabel = {
      pokemon_kanto: "カントー",
      pokemon_johto: "ジョウト",
      pokemon_hoenn: "ホウエン",
      pokemon_sinnoh: "シンオウ",
      pokemon_unova: "イッシュ",
      pokemon_kalos: "カロス",
      pokemon_alola: "アローラ",
      pokemon_galar: "ガラル",
      pokemon_paldea: "パルデア",
    }[regionName];

    console.log(`\n${"=".repeat(60)}`);
    console.log(`【${regionLabel}】${regionName}`);
    console.log(`${"=".repeat(60)}`);

    let skipped = 0;
    for (const { entry, result } of results) {
      if (result.status === "skip") {
        skipped++;
        console.log(
          `  ${entry.id.padEnd(12)} ${entry.name.padEnd(20)} → スキップ（${result.reason}）`
        );
      } else {
        const mark = result.status === "fallback" ? "[FB] " : "";
        console.log(
          `  ${entry.id.padEnd(12)} ${entry.name.padEnd(20)} → ${mark}${JSON.stringify(result.abilities)}`
        );
      }
    }

    if (isApply) {
      const updated = entries.map((entry, i) => {
        const { result } = results[i];
        if (result.status !== "skip" && result.abilities) {
          return { ...entry, abilities: result.abilities };
        }
        return entry;
      });
      fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), "utf8");
      console.log(`\n  → ${filePath} を更新しました（スキップ: ${skipped} 件）`);
    }
  }

  console.log("\n完了。");
  if (!isApply) {
    console.log(
      "\n内容を確認して問題なければ --apply フラグで実際に更新してください:"
    );
    console.log("  node scripts/add-abilities.js --apply");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
