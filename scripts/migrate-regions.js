/**
 * ジョウト〜パルデアのポケモンJSONを pokemon_kanto.json 形式に統一するマイグレーション
 *
 * 変換内容:
 *   - id: 英語種族名 → number フィールドの4桁数字に変更
 *   - number フィールドを削除
 *   - baseStats を PokeAPI から取得して追加
 *   - learnset はそのまま保持
 *
 * 実行: node scripts/migrate-regions.js
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../src/renderer/data");

const FILES = [
  "pokemon_johto.json",
  "pokemon_hoenn.json",
  "pokemon_sinnoh.json",
  "pokemon_unova.json",
  "pokemon_kalos.json",
  "pokemon_alola.json",
  "pokemon_galar.json",
  "pokemon_paldea.json",
];

const STAT_MAP = {
  hp: "hp",
  attack: "attack",
  defense: "defense",
  "special-attack": "spAttack",
  "special-defense": "spDefense",
  speed: "speed",
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchBaseStats(dexNum) {
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${dexNum}`);
  if (!res.ok) return null;
  const data = await res.json();
  const baseStats = {};
  for (const s of data.stats || []) {
    const key = STAT_MAP[s.stat?.name];
    if (key) baseStats[key] = s.base_stat;
  }
  // 6項目すべて揃っているか確認
  const required = ["hp", "attack", "defense", "spAttack", "spDefense", "speed"];
  if (required.every((k) => baseStats[k] !== undefined)) return baseStats;
  return null;
}

async function main() {
  for (const file of FILES) {
    const filePath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.log(`スキップ（存在しない）: ${file}`);
      continue;
    }

    const pokemons = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    console.log(`\n処理中: ${file} (${pokemons.length} 匹)`);

    const updated = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < pokemons.length; i++) {
      const p = pokemons[i];

      // すでに変換済み（number フィールドなし、id が4桁数字）はスキップ
      if (!p.number && /^\d{4}$/.test(p.id) && p.baseStats) {
        updated.push(p);
        successCount++;
        continue;
      }

      const numStr = p.number || p.id;
      const dexNum = parseInt(numStr, 10);

      process.stdout.write(
        `  [${i + 1}/${pokemons.length}] No.${numStr} ${p.name}...`
      );

      const baseStats = await fetchBaseStats(dexNum);
      if (!baseStats) {
        process.stdout.write(` 取得失敗（元データを保持）\n`);
        // 変換できなくても id/number は整理する
        const { number, ...rest } = p;
        updated.push({
          id: numStr.padStart(4, "0"),
          name: p.name,
          types: p.types,
          learnset: p.learnset || [],
        });
        failCount++;
        continue;
      }

      updated.push({
        id: numStr.padStart(4, "0"),
        name: p.name,
        types: p.types,
        baseStats,
        learnset: p.learnset || [],
      });

      process.stdout.write(` OK\n`);
      successCount++;
      await sleep(100);
    }

    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2) + "\n", "utf-8");
    console.log(
      `→ ${file} を更新完了（成功: ${successCount}, 失敗: ${failCount}）`
    );
  }

  console.log("\n全ファイルの変換が完了しました。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
