/**
 * 姿違いポケモン（PokeAPI ID 1026以上）の画像・データを取得して pokemon_forms.json を生成する
 *
 * 処理内容:
 *   1. GitHub API でHOMEスプライトフォルダのファイルリストを取得
 *   2. ID > 1025 のファイルを抽出（姿違い）
 *   3. 各IDについて:
 *      - HOMEスプライトを img/pokemon2/{id}.png にダウンロード
 *      - PokeAPI からタイプ・種族値・日本語名を取得
 *   4. src/renderer/data/pokemon_forms.json に保存
 *
 * 実行: node scripts/gen-forms.js
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const DATA_DIR = path.join(__dirname, "../src/renderer/data");
const IMG_DIR = path.join(__dirname, "../img/pokemon2");
const OUT_FILE = path.join(DATA_DIR, "pokemon_forms.json");

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

/** ファイルをダウンロードして保存 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          file.close();
          fs.unlink(dest, () => {});
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      })
      .on("error", (err) => {
        file.close();
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

async function getFormIds() {
  const res = await fetch(
    "https://api.github.com/repos/PokeAPI/sprites/contents/sprites/pokemon/other/home",
    { headers: { "User-Agent": "champions-app" } }
  );
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const items = await res.json();
  return items
    .filter((item) => item.name.endsWith(".png") && parseInt(item.name) > 1025)
    .map((item) => parseInt(item.name))
    .sort((a, b) => a - b);
}

async function fetchFormData(id) {
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
  if (!res.ok) return null;
  const pokemon = await res.json();

  // 種族値
  const baseStats = {};
  for (const s of pokemon.stats || []) {
    const key = STAT_MAP[s.stat?.name];
    if (key) baseStats[key] = s.base_stat;
  }

  // タイプ
  const types = (pokemon.types || [])
    .map((t) => TYPE_EN_TO_JA[t.type?.name] || t.type?.name)
    .filter(Boolean);

  // 日本語名（species から取得）
  let jaName = pokemon.name;
  const speciesUrl = pokemon.species?.url;
  if (speciesUrl) {
    const speciesRes = await fetch(speciesUrl);
    if (speciesRes.ok) {
      const species = await speciesRes.json();
      jaName =
        species.names?.find((n) => n.language?.name === "ja")?.name ||
        species.name ||
        pokemon.name;
    }
  }

  const required = ["hp", "attack", "defense", "spAttack", "spDefense", "speed"];
  if (!required.every((k) => baseStats[k] !== undefined)) return null;

  return {
    id: String(id),
    name: jaName,
    types,
    baseStats,
    learnset: [],
  };
}

async function main() {
  console.log("GitHubから姿違いスプライトIDを取得中...");
  const formIds = await getFormIds();
  console.log(`${formIds.length} 件の姿違いを処理します`);

  const forms = [];
  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (let i = 0; i < formIds.length; i++) {
    const id = formIds[i];
    const imgPath = path.join(IMG_DIR, `${id}.png`);
    const spriteUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${id}.png`;

    process.stdout.write(`  [${i + 1}/${formIds.length}] ID:${id}...`);

    // 画像ダウンロード（未存在の場合のみ）
    if (!fs.existsSync(imgPath)) {
      try {
        await downloadFile(spriteUrl, imgPath);
        process.stdout.write(" 画像OK");
      } catch (e) {
        process.stdout.write(` 画像NG(${e.message})`);
      }
    } else {
      process.stdout.write(" 画像スキップ");
      skipCount++;
    }

    // データ取得
    try {
      const data = await fetchFormData(id);
      if (data) {
        forms.push(data);
        process.stdout.write(` | ${data.name} OK\n`);
        successCount++;
      } else {
        process.stdout.write(` | データ取得失敗\n`);
        failCount++;
      }
    } catch (e) {
      process.stdout.write(` | エラー: ${e.message}\n`);
      failCount++;
    }

    await sleep(150);
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(forms, null, 2) + "\n", "utf-8");

  console.log(`\n完了!`);
  console.log(`  成功: ${successCount}, 失敗: ${failCount}, 画像スキップ: ${skipCount}`);
  console.log(`  出力: ${OUT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
