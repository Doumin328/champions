/**
 * 姿違いエントリの learnset を基本形態からコピーする
 *
 * - learnset が [] のエントリを対象に
 * - 同ファイル内で id が頭4桁と一致する基本形態エントリの learnset をコピー
 * - マッチしない場合はスキップ（そのまま []）
 *
 * 実行: node scripts/copy-learnsets-to-forms.js
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../src/renderer/data");

const REGION_FILES = [
  "pokemon_kanto.json",
  "pokemon_johto.json",
  "pokemon_hoenn.json",
  "pokemon_sinnoh.json",
  "pokemon_unova.json",
  "pokemon_kalos.json",
  "pokemon_alola.json",
  "pokemon_galar.json",
  "pokemon_paldea.json",
];

for (const filename of REGION_FILES) {
  const filepath = path.join(DATA_DIR, filename);
  const entries = JSON.parse(fs.readFileSync(filepath, "utf-8"));

  // 基本形態（id が正確に4桁数字）の learnset マップを構築
  const baseLearnsets = {};
  for (const e of entries) {
    if (/^\d{4}$/.test(e.id) && e.learnset.length > 0) {
      baseLearnsets[e.id] = e.learnset;
    }
  }

  // learnset が空のエントリにコピー
  let copied = 0;
  let skipped = 0;
  for (const e of entries) {
    if (e.learnset.length === 0) {
      const baseId = e.id.slice(0, 4);
      if (baseLearnsets[baseId]) {
        e.learnset = baseLearnsets[baseId];
        copied++;
      } else {
        skipped++;
      }
    }
  }

  fs.writeFileSync(filepath, JSON.stringify(entries, null, 2), "utf-8");
  console.log(`${filename}: コピー ${copied} 件, スキップ ${skipped} 件`);
}

console.log("\n完了!");
