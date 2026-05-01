/**
 * PokeAPI の weight (hectograms) を kg に変換し、地方別ポケモン JSON に weightKg を追加する。
 *
 * 実行:
 *   node scripts/update-pokemon-weights.js
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
  "pokemon_forms.json",
];

const MAX_NATIONAL_DEX = 1025;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPokemonWeightKg(id) {
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
  if (!res.ok) throw new Error(`PokeAPI ${id}: HTTP ${res.status}`);
  const data = await res.json();
  if (typeof data.weight !== "number") throw new Error(`PokeAPI ${id}: missing weight`);
  return data.weight / 10;
}

function getBaseDexNumber(entryId) {
  const match = String(entryId).match(/^(\d{4})/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isInteger(n) && n >= 1 && n <= MAX_NATIONAL_DEX ? n : null;
}

async function main() {
  const weightByDex = new Map();

  for (let id = 1; id <= MAX_NATIONAL_DEX; id++) {
    const weightKg = await fetchPokemonWeightKg(id);
    weightByDex.set(id, weightKg);
    if (id % 25 === 0 || id === MAX_NATIONAL_DEX) {
      console.log(`fetched ${id}/${MAX_NATIONAL_DEX}`);
    }
    await sleep(20);
  }

  let updated = 0;
  let skipped = 0;

  for (const filename of REGION_FILES) {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) continue;

    const entries = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (!Array.isArray(entries)) continue;

    for (const entry of entries) {
      const dexNo = getBaseDexNumber(entry.id);
      const weightKg = dexNo == null ? null : weightByDex.get(dexNo);
      if (weightKg == null) {
        skipped++;
        continue;
      }
      entry.weightKg = weightKg;
      updated++;
    }

    fs.writeFileSync(filePath, JSON.stringify(entries, null, 2) + "\n", "utf-8");
    console.log(`${filename}: ${entries.length} entries`);
  }

  console.log(`done: updated=${updated}, skipped=${skipped}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
