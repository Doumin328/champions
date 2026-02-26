/**
 * Pokemon Showdown の learnsets を取得し、各ポケモンの learnset に新規技IDを追加する
 *
 * 1. PokeAPI で技マッピング（Showdown move id -> 自前 moves.json の id）を構築
 * 2. PokeAPI でポケモンマッピング（全国図鑑番号 -> Showdown species id）を構築
 * 3. Showdown learnsets から各ポケモンが覚える技一覧を取得
 * 4. 既存 learnset にない技IDを追加
 *
 * 実行: node scripts/update-learnsets.js
 */

const fs = require('fs');
const path = require('path');

const BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
const SHOWDOWN_LEARNSETS =
  'https://play.pokemonshowdown.com/data/learnsets.json';
const DATA_DIR = path.join(__dirname, '../src/renderer/data');
const POKEMON_FILES = [
  'pokemon_kanto.json',
  'pokemon_johto.json',
  'pokemon_hoenn.json',
  'pokemon_sinnoh.json',
  'pokemon_unova.json',
  'pokemon_kalos.json',
  'pokemon_alola.json',
  'pokemon_galar.json',
  'pokemon_paldea.json',
];

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

async function fetchJson(url) {
  const text = await fetchText(url);
  return JSON.parse(text);
}

function parseCsv(text) {
  const lines = text.trim().split('\n');
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => (obj[h] = values[i]));
    return obj;
  });
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if ((c === ',' && !inQuotes) || c === '\n' || c === '\r') {
      result.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

/** Showdown move id (dragonclaw) -> 自前 move id (number) */
function buildMoveMapping(movesJson, moveNamesCsv, movesCsv) {
  const moveNames = parseCsv(moveNamesCsv);
  const moves = parseCsv(movesCsv);

  const japaneseByName = {};
  moveNames
    .filter((r) => r.local_language_id === '11')
    .forEach((r) => (japaneseByName[r.name] = r.move_id));

  const identifierByMoveId = {};
  moves.forEach((m) => (identifierByMoveId[m.id] = m.identifier));

  const showdownIdToOurId = {};
  for (const m of movesJson) {
    const pokeApiMoveId = japaneseByName[m.name];
    if (!pokeApiMoveId) continue;
    const identifier = identifierByMoveId[pokeApiMoveId];
    if (!identifier) continue;
    const showdownId = identifier.replace(/-/g, '').toLowerCase();
    showdownIdToOurId[showdownId] = m.id;
  }
  return showdownIdToOurId;
}

/** 全国図鑑番号 (number) -> Showdown species id */
function buildSpeciesMapping(speciesCsv) {
  const species = parseCsv(speciesCsv);
  const numToId = {};
  for (const s of species) {
    const num = parseInt(s.id, 10);
    if (isNaN(num)) continue;
    const identifier = (s.identifier || '').toLowerCase();
    if (!identifier) continue;
    numToId[num] = identifier;
  }
  return numToId;
}

/** 自前ポケモン id を Showdown species id に変換 */
function toShowdownSpeciesId(ourId, number, numToSpecies) {
  if (typeof ourId === 'number') ourId = String(ourId);
  const id = String(ourId || '').trim().toLowerCase();
  if (!id) return null;

  if (/^\d{4}$/.test(id)) {
    const num = parseInt(id, 10);
    return numToSpecies[num] || null;
  }

  if (/^[a-z0-9]+$/.test(id)) {
    return id;
  }

  const num = number ? parseInt(String(number).replace(/^0+/, '') || number, 10) : null;
  if (num != null && !isNaN(num)) return numToSpecies[num] || null;
  return null;
}

function main() {
  return (async () => {
    console.log('データ取得中...');

    const movesJson = JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, 'moves.json'), 'utf-8')
    );

    const [moveNamesCsv, movesCsv, speciesCsv, learnsetsRaw] = await Promise.all([
      fetchText(`${BASE}/move_names.csv`),
      fetchText(`${BASE}/moves.csv`),
      fetchText(`${BASE}/pokemon_species.csv`),
      fetchText(SHOWDOWN_LEARNSETS),
    ]);

    const showdownLearnsets = JSON.parse(learnsetsRaw);
    const moveMapping = buildMoveMapping(movesJson, moveNamesCsv, movesCsv);
    const numToSpecies = buildSpeciesMapping(speciesCsv);

    console.log(`技マッピング: ${Object.keys(moveMapping).length} 件`);
    console.log(`種族マッピング: ${Object.keys(numToSpecies).length} 件`);
    console.log(`Showdown learnsets: ${Object.keys(showdownLearnsets).length} 種`);

    let totalUpdated = 0;
    let totalAdded = 0;

    for (const file of POKEMON_FILES) {
      const filePath = path.join(DATA_DIR, file);
      if (!fs.existsSync(filePath)) {
        console.log(`スキップ（存在しない）: ${file}`);
        continue;
      }

      const pokemons = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      let fileUpdated = 0;
      let fileAdded = 0;

      for (const p of pokemons) {
        const showdownId = toShowdownSpeciesId(p.id, p.number, numToSpecies);
        if (!showdownId) continue;

        const ld = showdownLearnsets[showdownId];
        if (!ld || !ld.learnset) continue;

        const showdownMoveIds = Object.keys(ld.learnset);
        const ourMoveIds = new Set(
          Array.isArray(p.learnset) ? p.learnset.map((x) => (typeof x === 'number' ? x : parseInt(x, 10))) : []
        );

        let added = 0;
        for (const sid of showdownMoveIds) {
          const ourId = moveMapping[sid];
          if (ourId != null && !ourMoveIds.has(ourId)) {
            ourMoveIds.add(ourId);
            added++;
          }
        }

        if (added > 0) {
          p.learnset = Array.from(ourMoveIds).sort((a, b) => a - b);
          fileUpdated++;
          fileAdded += added;
        } else if (!p.learnset && ourMoveIds.size > 0) {
          p.learnset = Array.from(ourMoveIds).sort((a, b) => a - b);
          fileUpdated++;
          fileAdded += ourMoveIds.size;
        }
      }

      if (fileUpdated > 0) {
        fs.writeFileSync(
          filePath,
          JSON.stringify(pokemons, null, 2) + '\n',
          'utf-8'
        );
        console.log(`${file}: ${fileUpdated} 匹更新、${fileAdded} 技追加`);
        totalUpdated += fileUpdated;
        totalAdded += fileAdded;
      } else {
        console.log(`${file}: 変更なし`);
      }
    }

    console.log(`\n完了: 計 ${totalUpdated} 匹、${totalAdded} 技を追加しました`);
  })();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
