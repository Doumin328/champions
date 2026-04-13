const fs = require('fs');
const path = require('path');
const dataDir = path.join(__dirname, '../src/renderer/data');

const additions = {
  'pokemon_kanto.json': [
    { id: '0026A', name: 'アローラライチュウ', types: ['でんき', 'エスパー'], baseStats: { hp: 60, attack: 85, defense: 50, spAttack: 95, spDefense: 85, speed: 110 }, learnset: [], isFinalEvolution: true },
    { id: '0038A', name: 'アローラキュウコン', types: ['こおり', 'フェアリー'], baseStats: { hp: 73, attack: 67, defense: 75, spAttack: 81, spDefense: 100, speed: 109 }, learnset: [], isFinalEvolution: true },
    { id: '0059A', name: 'ヒスイウインディ', types: ['ほのお', 'いわ'], baseStats: { hp: 90, attack: 115, defense: 80, spAttack: 95, spDefense: 80, speed: 90 }, learnset: [], isFinalEvolution: true },
    { id: '0071Mega', name: 'メガウツボット', types: ['くさ', 'どく'], baseStats: { hp: 80, attack: 125, defense: 85, spAttack: 135, spDefense: 95, speed: 70 }, learnset: [], isFinalEvolution: true },
    { id: '0080A', name: 'ガラルヤドラン', types: ['みず', 'どく'], baseStats: { hp: 95, attack: 100, defense: 95, spAttack: 100, spDefense: 70, speed: 30 }, learnset: [], isFinalEvolution: true },
    { id: '0121Mega', name: 'メガスターミー', types: ['みず', 'エスパー'], baseStats: { hp: 60, attack: 100, defense: 105, spAttack: 130, spDefense: 105, speed: 120 }, learnset: [], isFinalEvolution: true },
    { id: '0128A', name: 'パルデアケンタロス', types: ['かくとう'], baseStats: { hp: 95, attack: 110, defense: 105, spAttack: 30, spDefense: 70, speed: 100 }, learnset: [], isFinalEvolution: true },
    { id: '0128Fire', name: 'パルデアケンタロス（ほのお）', types: ['かくとう', 'ほのお'], baseStats: { hp: 95, attack: 110, defense: 105, spAttack: 30, spDefense: 70, speed: 100 }, learnset: [], isFinalEvolution: true },
    { id: '0128Water', name: 'パルデアケンタロス（みず）', types: ['かくとう', 'みず'], baseStats: { hp: 95, attack: 110, defense: 105, spAttack: 30, spDefense: 70, speed: 100 }, learnset: [], isFinalEvolution: true },
    { id: '0149Mega', name: 'メガカイリュー', types: ['ドラゴン', 'ひこう'], baseStats: { hp: 91, attack: 124, defense: 115, spAttack: 145, spDefense: 125, speed: 100 }, learnset: [], isFinalEvolution: true },
  ],
  'pokemon_johto.json': [
    { id: '0157A', name: 'ヒスイバクフーン', types: ['ほのお', 'ゴースト'], baseStats: { hp: 95, attack: 73, defense: 67, spAttack: 119, spDefense: 105, speed: 100 }, learnset: [], isFinalEvolution: true },
    { id: '0199A', name: 'ガラルヤドキング', types: ['どく', 'エスパー'], baseStats: { hp: 95, attack: 65, defense: 80, spAttack: 110, spDefense: 110, speed: 30 }, learnset: [], isFinalEvolution: true },
    { id: '0227Mega', name: 'メガエアームド', types: ['はがね', 'ひこう'], baseStats: { hp: 65, attack: 140, defense: 110, spAttack: 40, spDefense: 100, speed: 110 }, learnset: [], isFinalEvolution: true },
  ],
  'pokemon_hoenn.json': [
    { id: '0358Mega', name: 'メガチリーン', types: ['はがね', 'エスパー'], baseStats: { hp: 75, attack: 50, defense: 110, spAttack: 135, spDefense: 120, speed: 65 }, learnset: [], isFinalEvolution: true },
  ],
  'pokemon_sinnoh.json': [
    { id: '0478Mega', name: 'メガユキメノコ', types: ['こおり', 'ゴースト'], baseStats: { hp: 70, attack: 80, defense: 70, spAttack: 140, spDefense: 100, speed: 120 }, learnset: [], isFinalEvolution: true },
  ],
  'pokemon_unova.json': [
    { id: '0500Mega', name: 'メガエンブオー', types: ['ほのお', 'かくとう'], baseStats: { hp: 110, attack: 148, defense: 75, spAttack: 110, spDefense: 110, speed: 75 }, learnset: [], isFinalEvolution: true },
    { id: '0503A', name: 'ヒスイダイケンキ', types: ['みず', 'あく'], baseStats: { hp: 90, attack: 108, defense: 80, spAttack: 100, spDefense: 65, speed: 85 }, learnset: [], isFinalEvolution: true },
    { id: '0530Mega', name: 'メガドリュウズ', types: ['じめん', 'はがね'], baseStats: { hp: 110, attack: 165, defense: 100, spAttack: 65, spDefense: 65, speed: 103 }, learnset: [], isFinalEvolution: true },
    { id: '0571A', name: 'ヒスイゾロアーク', types: ['ノーマル', 'ゴースト'], baseStats: { hp: 55, attack: 100, defense: 60, spAttack: 125, spDefense: 60, speed: 110 }, learnset: [], isFinalEvolution: true },
    { id: '0609Mega', name: 'メガシャンデラ', types: ['ゴースト', 'ほのお'], baseStats: { hp: 60, attack: 75, defense: 110, spAttack: 175, spDefense: 110, speed: 90 }, learnset: [], isFinalEvolution: true },
    { id: '0623Mega', name: 'メガゴルーグ', types: ['じめん', 'ゴースト'], baseStats: { hp: 89, attack: 159, defense: 105, spAttack: 70, spDefense: 105, speed: 55 }, learnset: [], isFinalEvolution: true },
  ],
  'pokemon_kalos.json': [
    { id: '0652Mega', name: 'メガブリガロン', types: ['くさ', 'かくとう'], baseStats: { hp: 88, attack: 137, defense: 172, spAttack: 74, spDefense: 115, speed: 44 }, learnset: [], isFinalEvolution: true },
    { id: '0655Mega', name: 'メガマフォクシー', types: ['ほのお', 'エスパー'], baseStats: { hp: 75, attack: 69, defense: 72, spAttack: 159, spDefense: 125, speed: 134 }, learnset: [], isFinalEvolution: true },
    { id: '0658Mega', name: 'メガゲッコウガ', types: ['みず', 'あく'], baseStats: { hp: 72, attack: 125, defense: 77, spAttack: 133, spDefense: 81, speed: 142 }, learnset: [], isFinalEvolution: true },
    { id: '0670A', name: 'エターナルフラエッテ', types: ['フェアリー'], baseStats: { hp: 74, attack: 65, defense: 67, spAttack: 125, spDefense: 128, speed: 92 }, learnset: [], isFinalEvolution: true },
    { id: '0670AMega', name: 'メガフラエッテ', types: ['フェアリー'], baseStats: { hp: 74, attack: 85, defense: 87, spAttack: 155, spDefense: 148, speed: 102 }, learnset: [], isFinalEvolution: true },
    { id: '0678M', name: 'ニャオニクス♂', types: ['エスパー'], baseStats: { hp: 74, attack: 48, defense: 76, spAttack: 83, spDefense: 81, speed: 104 }, learnset: [], isFinalEvolution: true },
    { id: '0678F', name: 'ニャオニクス♀', types: ['エスパー'], baseStats: { hp: 74, attack: 49, defense: 55, spAttack: 76, spDefense: 110, speed: 104 }, learnset: [], isFinalEvolution: true },
    { id: '0678Mega', name: 'メガニャオニクス', types: ['エスパー'], baseStats: { hp: 74, attack: 48, defense: 76, spAttack: 143, spDefense: 101, speed: 124 }, learnset: [], isFinalEvolution: true },
    { id: '0701Mega', name: 'メガルチャブル', types: ['かくとう', 'ひこう'], baseStats: { hp: 78, attack: 137, defense: 100, spAttack: 74, spDefense: 93, speed: 118 }, learnset: [], isFinalEvolution: true },
    { id: '0706A', name: 'ヒスイヌメルゴン', types: ['ドラゴン', 'はがね'], baseStats: { hp: 100, attack: 100, defense: 100, spAttack: 110, spDefense: 110, speed: 80 }, learnset: [], isFinalEvolution: true },
    { id: '0713A', name: 'ヒスイクレベース', types: ['こおり', 'いわ'], baseStats: { hp: 95, attack: 127, defense: 184, spAttack: 34, spDefense: 36, speed: 28 }, learnset: [], isFinalEvolution: true },
  ],
  'pokemon_alola.json': [
    { id: '0724A', name: 'ヒスイジュナイパー', types: ['くさ', 'かくとう'], baseStats: { hp: 88, attack: 112, defense: 82, spAttack: 95, spDefense: 82, speed: 60 }, learnset: [], isFinalEvolution: true },
    { id: '0740Mega', name: 'メガケケンカニ', types: ['かくとう', 'こおり'], baseStats: { hp: 97, attack: 157, defense: 122, spAttack: 62, spDefense: 107, speed: 33 }, learnset: [], isFinalEvolution: true },
    { id: '0780Mega', name: 'メガジジーロン', types: ['ノーマル', 'ドラゴン'], baseStats: { hp: 78, attack: 85, defense: 110, spAttack: 160, spDefense: 116, speed: 36 }, learnset: [], isFinalEvolution: true },
  ],
  'pokemon_paldea.json': [
    { id: '0952Mega', name: 'メガスコヴィラン', types: ['くさ', 'ほのお'], baseStats: { hp: 65, attack: 138, defense: 85, spAttack: 138, spDefense: 85, speed: 75 }, learnset: [], isFinalEvolution: true },
    { id: '0970Mega', name: 'メガキラフロル', types: ['いわ', 'どく'], baseStats: { hp: 83, attack: 90, defense: 105, spAttack: 150, spDefense: 96, speed: 101 }, learnset: [], isFinalEvolution: true },
  ],
};

let totalAdded = 0;

for (const [filename, entries] of Object.entries(additions)) {
  const filepath = path.join(dataDir, filename);
  const pokemon = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  const existingIds = new Set(pokemon.map(p => p.id));

  for (const entry of entries) {
    if (existingIds.has(entry.id)) {
      console.log('SKIP (already exists): ' + entry.id);
      continue;
    }

    const prefix = entry.id.substring(0, 4);

    // 同じ4桁プレフィックスを持つ最後のエントリの後に挿入
    let insertAfter = -1;
    for (let i = 0; i < pokemon.length; i++) {
      if (pokemon[i].id.startsWith(prefix)) {
        insertAfter = i;
      }
    }

    // 見つからない場合は数値順で挿入
    if (insertAfter === -1) {
      for (let i = 0; i < pokemon.length; i++) {
        if (pokemon[i].id.substring(0, 4) <= prefix) {
          insertAfter = i;
        }
      }
    }

    pokemon.splice(insertAfter + 1, 0, entry);
    existingIds.add(entry.id);
    totalAdded++;
    console.log('ADD [' + filename + '] ' + entry.id + ' ' + entry.name);
  }

  fs.writeFileSync(filepath, JSON.stringify(pokemon, null, 2), 'utf8');
}

console.log('\n合計 ' + totalAdded + ' 件追加完了');
