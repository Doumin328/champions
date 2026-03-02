/**
 * pokemon_forms.json のエントリを地方別JSONファイルに統合する
 *
 * ①  id に地方キーワードが含まれる場合、name 末尾にサフィックスを付与
 *     alola → (アローラ), galar → (ガラル), hisui → (ヒスイ), paldea → (パルデア)
 *
 * ②  id の頭4桁の数値で対象地方JSONを決定し、idが昇順になるよう挿入
 *     完了後 pokemon_forms.json を [] に空化
 *
 * 実行: node scripts/migrate-forms-to-regions.js
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../src/renderer/data");

// ① 地方サフィックスマッピング
const REGION_SUFFIX = [
  { keyword: /alola/i, suffix: "(アローラ)" },
  { keyword: /galar/i, suffix: "(ガラル)" },
  { keyword: /hisui/i, suffix: "(ヒスイ)" },
  { keyword: /paldea/i, suffix: "(パルデア)" },
];

// ② id頭4桁の数値範囲 → ファイル名
const RANGES = [
  { min: 1,   max: 151,  file: "pokemon_kanto.json" },
  { min: 152, max: 251,  file: "pokemon_johto.json" },
  { min: 252, max: 386,  file: "pokemon_hoenn.json" },
  { min: 387, max: 493,  file: "pokemon_sinnoh.json" },
  { min: 494, max: 649,  file: "pokemon_unova.json" },
  { min: 650, max: 721,  file: "pokemon_kalos.json" },
  { min: 722, max: 809,  file: "pokemon_alola.json" },
  { min: 810, max: 905,  file: "pokemon_galar.json" },
  { min: 906, max: 1025, file: "pokemon_paldea.json" },
];

function sortById(a, b) {
  const na = parseInt(a.id.slice(0, 4), 10);
  const nb = parseInt(b.id.slice(0, 4), 10);
  if (na !== nb) return na - nb;
  return a.id.localeCompare(b.id);
}

function getTargetFile(id) {
  const num = parseInt(id.slice(0, 4), 10);
  const range = RANGES.find((r) => num >= r.min && num <= r.max);
  return range ? range.file : null;
}

function addRegionSuffix(entry) {
  for (const { keyword, suffix } of REGION_SUFFIX) {
    if (keyword.test(entry.id)) {
      return { ...entry, name: entry.name + suffix };
    }
  }
  return entry;
}

function main() {
  const formsPath = path.join(DATA_DIR, "pokemon_forms.json");
  const forms = JSON.parse(fs.readFileSync(formsPath, "utf-8"));

  console.log(`pokemon_forms.json: ${forms.length} 件読み込み`);

  // ファイルごとのエントリをグループ化
  const byFile = {};
  let skipped = 0;

  for (const raw of forms) {
    // ①サフィックス付与
    const entry = addRegionSuffix(raw);

    // ②対象ファイル決定
    const target = getTargetFile(entry.id);
    if (!target) {
      console.warn(`  ⚠ id="${entry.id}" は範囲外のためスキップ`);
      skipped++;
      continue;
    }

    if (!byFile[target]) byFile[target] = [];
    byFile[target].push(entry);
  }

  // 各地方JSONにマージして書き出し
  for (const [filename, newEntries] of Object.entries(byFile)) {
    const filepath = path.join(DATA_DIR, filename);
    const existing = JSON.parse(fs.readFileSync(filepath, "utf-8"));

    const merged = [...existing, ...newEntries].sort(sortById);

    fs.writeFileSync(filepath, JSON.stringify(merged, null, 2), "utf-8");
    console.log(`  ${filename}: ${existing.length} + ${newEntries.length} → ${merged.length} 件`);
  }

  // pokemon_forms.json を空化
  fs.writeFileSync(formsPath, "[]", "utf-8");
  console.log(`\npokemon_forms.json → [] に空化`);
  if (skipped > 0) console.log(`スキップ: ${skipped} 件`);
  console.log("完了!");
}

main();
