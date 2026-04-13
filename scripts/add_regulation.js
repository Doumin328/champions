const fs = require('fs');
const path = require('path');
const dataDir = path.join(__dirname, '../src/renderer/data');

// pokemon_csフォルダのIDセット
const csIds = new Set(
  fs.readdirSync(path.join(__dirname, '../src/img/pokemon_cs'))
    .filter(f => f.endsWith('.png'))
    .map(f => f.slice(0, -4))
);

const jsonFiles = fs.readdirSync(dataDir)
  .filter(f => f.startsWith('pokemon_') && f.endsWith('.json'))
  .sort();

let totalMA = 0;
let totalEmpty = 0;

for (const filename of jsonFiles) {
  const filepath = path.join(dataDir, filename);
  const pokemon = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  if (!Array.isArray(pokemon)) continue;

  for (const p of pokemon) {
    p.regulation = csIds.has(p.id) ? 'M-A' : '';
    if (p.regulation === 'M-A') totalMA++;
    else totalEmpty++;
  }

  fs.writeFileSync(filepath, JSON.stringify(pokemon, null, 2), 'utf8');
  const ma = pokemon.filter(p => p.regulation === 'M-A').length;
  console.log(`[${filename}] M-A: ${ma}件 / 合計: ${pokemon.length}件`);
}

console.log(`\nM-A合計: ${totalMA}件, それ以外: ${totalEmpty}件`);
