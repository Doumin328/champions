/**
 * 図鑑152-1025のポケモンデータを PokeAPI から取得し、地方ごとの JSON に分割
 * node scripts/gen-regions.js で実行（Node 18+ の fetch を使用）
 */

const fs = require("fs");
const path = require("path");

const TYPE_EN_TO_JA = {
  normal: "ノーマル",
  fire: "ほのお",
  water: "みず",
  electric: "でんき",
  grass: "くさ",
  ice: "こおり",
  fighting: "かくとう",
  poison: "どく",
  ground: "じめん",
  flying: "ひこう",
  psychic: "エスパー",
  bug: "むし",
  rock: "いわ",
  ghost: "ゴースト",
  dragon: "ドラゴン",
  dark: "あく",
  steel: "はがね",
  fairy: "フェアリー",
};

const REGIONS = [
  { name: "johto", start: 152, end: 251 },
  { name: "hoenn", start: 252, end: 386 },
  { name: "sinnoh", start: 387, end: 493 },
  { name: "unova", start: 494, end: 649 },
  { name: "kalos", start: 650, end: 721 },
  { name: "alola", start: 722, end: 809 },
  { name: "galar", start: 810, end: 905 },
  { name: "paldea", start: 906, end: 1025 },
];

const pad = (n) => String(n).padStart(4, "0");
const dataDir = path.join(__dirname, "..", "src", "renderer", "data");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchOne(id) {
  const [speciesRes, pokemonRes] = await Promise.all([
    fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`),
    fetch(`https://pokeapi.co/api/v2/pokemon/${id}`),
  ]);
  if (!speciesRes.ok || !pokemonRes.ok) return null;
  const species = await speciesRes.json();
  const pokemon = await pokemonRes.json();
  const jaName =
    species.names?.find((n) => n.language?.name === "ja")?.name ||
    species.name ||
    `No.${id}`;
  const types = (pokemon.types || [])
    .map((t) => TYPE_EN_TO_JA[t.type?.name] || t.type?.name)
    .filter(Boolean);
  return {
    id: species.name || String(id),
    number: pad(id),
    name: jaName,
    types,
  };
}

async function main() {
  const byRegion = REGIONS.map((r) => ({ ...r, list: [] }));

  for (const region of REGIONS) {
    console.log(`Fetching ${region.name} (${region.start}-${region.end})...`);
    const list = [];
    for (let id = region.start; id <= region.end; id++) {
      try {
        const entry = await fetchOne(id);
        if (entry) list.push(entry);
        await sleep(80);
      } catch (e) {
        console.warn(`  Skip ${id}:`, e.message);
      }
    }
    const outPath = path.join(dataDir, `pokemon_${region.name}.json`);
    fs.writeFileSync(outPath, JSON.stringify(list, null, 2), "utf8");
    console.log(`  Wrote ${outPath} (${list.length} entries)`);
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
