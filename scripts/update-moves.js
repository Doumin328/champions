/**
 * PokeAPI のデータを取得し、moves.json に第9世代までの全技を追加するスクリプト
 * 既存の moves.json は保持し、不足している技を追加する
 *
 * 実行: node scripts/update-moves.js
 */

const fs = require('fs');
const path = require('path');

const BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
const MOVES_JSON_PATH = path.join(__dirname, '../src/renderer/data/moves.json');

// damage_class: status->変化, physical->物理, special->特殊
const DAMAGE_CLASS_JA = {
  1: '変化',
  2: '物理',
  3: '特殊',
};

async function fetchCsv(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
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

async function main() {
  console.log('PokeAPI からデータを取得中...');

  const [movesCsv, namesCsv, typesCsv, typeNamesCsv] = await Promise.all([
    fetchCsv(`${BASE}/moves.csv`),
    fetchCsv(`${BASE}/move_names.csv`),
    fetchCsv(`${BASE}/types.csv`),
    fetchCsv(`${BASE}/type_names.csv`),
  ]);

  const moves = parseCsv(movesCsv);
  const names = parseCsv(namesCsv);
  const types = parseCsv(typesCsv);
  const typeNames = parseCsv(typeNamesCsv);

  // 日本語のタイプ名マップ (local_language_id 11 = 日本語)
  const typeNameMap = {};
  typeNames
    .filter((r) => r.local_language_id === '11')
    .forEach((r) => (typeNameMap[r.type_id] = r.name));

  // 日本語の技名マップ (local_language_id 11 = 日本語)
  const moveNameMap = {};
  names
    .filter((r) => r.local_language_id === '11')
    .forEach((r) => (moveNameMap[r.move_id] = r.name));

  // 第9世代まで (generation_id 1-9)、かつ通常の技（Zワザ・ダイマックス技などを除外）
  const excludePatterns = [
    /--physical$/,
    /--special$/,
    /^breakneck-blitz/,
    /^all-out-pummeling/,
    /^supersonic-skystrike/,
    /^acid-downpour/,
    /^tectonic-rage/,
    /^continental-crush/,
    /^savage-spin-out/,
    /^never-ending-nightmare/,
    /^corkscrew-crash/,
    /^inferno-overdrive/,
    /^hydro-vortex/,
    /^bloom-doom/,
    /^gigavolt-havoc/,
    /^shattered-psyche/,
    /^subzero-slammer/,
    /^devastating-drake/,
    /^black-hole-eclipse/,
    /^twinkle-tackle/,
    /^max-/,
    /^g-max-/,
  ];

  const pokeApiMoves = moves.filter((m) => {
    const gen = parseInt(m.generation_id, 10);
    if (gen < 1 || gen > 9) return false;
    return !excludePatterns.some((p) => p.test(m.identifier));
  });

  console.log(`PokeAPI: ${pokeApiMoves.length} 件の技（Gen1-9）`);

  // 既存の moves.json を読み込み
  const existingMoves = JSON.parse(
    fs.readFileSync(MOVES_JSON_PATH, 'utf-8')
  );
  const existingNames = new Set(existingMoves.map((m) => m.name));
  let nextId = Math.max(...existingMoves.map((m) => m.id), 0) + 1;

  console.log(`既存: ${existingMoves.length} 件、最大ID: ${nextId - 1}`);

  const toAdd = [];
  for (const m of pokeApiMoves) {
    const jaName = moveNameMap[m.id];
    if (!jaName) continue;
    if (existingNames.has(jaName)) continue;

    const typeId = m.type_id || '1';
    const typeName = typeNameMap[typeId] || 'ノーマル';
    const damageClassId = m.damage_class_id || '1';
    const category = DAMAGE_CLASS_JA[damageClassId] || '変化';

    const power = m.power === '' || m.power === null ? null : parseInt(m.power, 10);
    const accuracy = m.accuracy === '' || m.accuracy === null ? null : parseInt(m.accuracy, 10);
    const pp = parseInt(m.pp, 10) || 10;

    toAdd.push({
      id: nextId++,
      name: jaName,
      type: typeName,
      category,
      power,
      accuracy,
      pp,
    });
    existingNames.add(jaName);
  }

  console.log(`追加: ${toAdd.length} 件`);

  const result = [...existingMoves, ...toAdd].sort((a, b) => a.id - b.id);

  fs.writeFileSync(MOVES_JSON_PATH, JSON.stringify(result, null, 2) + '\n', 'utf-8');
  console.log(`完了: ${MOVES_JSON_PATH} に ${result.length} 件を保存しました`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
