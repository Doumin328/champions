/**
 * タイプアイコンのサンプルを3ソースからダウンロードして比較用に保存
 *
 * 保存先: img/test/types/
 * 実行: node scripts/dl-type-samples.js
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const OUT_DIR = path.join(__dirname, "../img/test/types");
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const SWSH_BASE =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home";
const TYPE_SWSH_BASE =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/types/generation-viii/sword-shield";
const TYPE_SV_BASE =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/types/generation-ix/scarlet-violet";
const SHOWDOWN_BASE =
  "https://play.pokemonshowdown.com/sprites/types";

// サンプル: ほのお(10)・みず(11)・くさ(12)・でんき(13)・こおり(15)
const SAMPLES = [
  // [PokeAPI type ID, Showdown type name, 日本語名]
  [10, "Fire",     "ほのお"],
  [11, "Water",    "みず"],
  [12, "Grass",    "くさ"],
  [13, "Electric", "でんき"],
  [15, "Ice",      "こおり"],
];

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlink(dest, () => {});
        return downloadFile(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => {});
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", (err) => {
      file.close();
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  for (const [id, enName, jaName] of SAMPLES) {
    const targets = [
      { url: `${TYPE_SWSH_BASE}/${id}.png`, dest: `swsh_${enName.toLowerCase()}.png`, label: `SWSH(${jaName})` },
      { url: `${TYPE_SV_BASE}/${id}.png`,   dest: `sv_${enName.toLowerCase()}.png`,   label: `SV(${jaName})` },
      { url: `${SHOWDOWN_BASE}/${enName}.png`, dest: `showdown_${enName.toLowerCase()}.png`, label: `Showdown(${jaName})` },
    ];

    for (const { url, dest, label } of targets) {
      const filePath = path.join(OUT_DIR, dest);
      process.stdout.write(`  ${label}...`);
      try {
        await downloadFile(url, filePath);
        const size = fs.statSync(filePath).size;
        console.log(` OK (${size} bytes)`);
      } catch (e) {
        console.log(` NG: ${e.message}`);
      }
    }
  }

  console.log(`\n保存先: img/test/types/`);
  console.log("ファイル一覧:");
  fs.readdirSync(OUT_DIR).forEach((f) => console.log(`  ${f}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
