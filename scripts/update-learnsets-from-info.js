/**
 * moves_info.txt の表を参照して、pokemon_*.json の learnset を更新する。
 *
 * - `・id` ごとのセクションを読む
 * - 表の `技名` を moves.json の `name` と突き合わせて技 id に変換
 * - 対応するポケモンの learnset を技 id 配列で完全置換
 * - moves.json に存在しない技名は最後に一覧表示
 *
 * 実行: node scripts/update-learnsets-from-info.js
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../src/renderer/data');
const MOVES_FILE = path.join(DATA_DIR, 'moves.json');
const MOVES_INFO_FILE = path.join(DATA_DIR, 'moves_info.txt');

function normalize(value) {
  return String(value || '').normalize('NFKC').replace(/\u3000/g, ' ').trim();
}

function uniqueSortedNumbers(values) {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function parseMovesInfo(text) {
  const sections = new Map();
  const lines = text.split(/\r?\n/).map(normalize);

  let currentId = null;
  let rows = [];

  function flush() {
    if (!currentId) return;
    sections.set(currentId, rows);
  }

  for (const line of lines) {
    if (!line) continue;

    if (line.startsWith('・')) {
      flush();
      currentId = line.slice(1).trim();
      rows = [];
      continue;
    }

    if (!currentId) continue;
    if (line.startsWith('◆ ')) continue;
    if (line === '技名\tタイプ\t分類\t威力\t命中\tPP\t接触\t説明') continue;

    const parts = line.split('\t').map((part) => part.trim());
    if (parts.length < 8) continue;

    rows.push({
      name: parts[0],
      type: parts[1],
      category: parts[2],
      power: parts[3],
      accuracy: parts[4],
      pp: parts[5],
      contact: parts[6],
      description: parts.slice(7).join('\t'),
    });
  }

  flush();
  return sections;
}

function main() {
  const moves = JSON.parse(fs.readFileSync(MOVES_FILE, 'utf8'));
  const movesInfoText = fs.readFileSync(MOVES_INFO_FILE, 'utf8');
  const sections = parseMovesInfo(movesInfoText);
  const moveNameToId = new Map(
    moves.map((move) => [normalize(move.name), move.id])
  );

  const unresolvedByPokemon = new Map();

  for (const [pokemonId, rows] of sections.entries()) {
    const unresolved = rows
      .map((row) => normalize(row.name))
      .filter((moveName) => !moveNameToId.has(moveName));

    if (unresolved.length > 0) {
      unresolvedByPokemon.set(pokemonId, Array.from(new Set(unresolved)));
    }
  }

  const pokemonFiles = fs
    .readdirSync(DATA_DIR)
    .filter((file) => /^pokemon_.*\.json$/.test(file));

  let updatedFiles = 0;
  let updatedEntries = 0;
  const updatedIds = new Set();

  for (const file of pokemonFiles) {
    const filePath = path.join(DATA_DIR, file);
    const pokemons = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let fileChanged = false;

    for (const pokemon of pokemons) {
      const pokemonId = normalize(pokemon.id);
      const rows = sections.get(pokemonId);
      if (!rows) continue;

      const moveIds = rows
        .map((row) => moveNameToId.get(normalize(row.name)))
        .filter((moveId) => typeof moveId === 'number');

      pokemon.learnset = uniqueSortedNumbers(moveIds);
      updatedIds.add(pokemonId);
      updatedEntries += 1;
      fileChanged = true;
    }

    if (!fileChanged) continue;

    fs.writeFileSync(filePath, `${JSON.stringify(pokemons, null, 2)}\n`, 'utf8');
    updatedFiles += 1;
    console.log(`${file}: updated`);
  }

  const missingPokemonIds = Array.from(sections.keys()).filter(
    (pokemonId) => !updatedIds.has(pokemonId)
  );

  console.log(`\nsections: ${sections.size}`);
  console.log(`updated entries: ${updatedEntries}`);
  console.log(`updated files: ${updatedFiles}`);
  console.log(
    `missing pokemon ids: ${missingPokemonIds.length > 0 ? missingPokemonIds.join(', ') : 'none'}`
  );

  console.log('\nmissing moves in moves.json:');
  if (unresolvedByPokemon.size === 0) {
    console.log('none');
  } else {
    for (const [pokemonId, moveNames] of unresolvedByPokemon.entries()) {
      console.log(`${pokemonId}: ${moveNames.join(', ')}`);
    }
  }
}

main();
