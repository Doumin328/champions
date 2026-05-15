/**
 * Official Artwork スプライトを pokemon3/ に保存する
 *
 * - 標準形態 (1-1025): official-artwork を使用
 * - 姿違い (10001+): official-artwork を試みてなければ HOME にフォールバック
 *
 * 実行: node scripts/gen-pokemon3.js
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const IMG_DIR = path.join(__dirname, "../img/pokemon3");
const DATA_DIR = path.join(__dirname, "../src/renderer/data");
const FORMS_FILE = path.join(DATA_DIR, "pokemon_forms.json");

const OFFICIAL_BASE =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork";
const HOME_BASE =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
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
      })
      .on("error", (err) => {
        file.close();
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

async function downloadWithFallback(id, dest) {
  const officialUrl = `${OFFICIAL_BASE}/${id}.png`;
  try {
    await downloadFile(officialUrl, dest);
    return "official";
  } catch (e) {
    if (e.message.startsWith("HTTP")) {
      // official-artwork になければ HOME にフォールバック
      const homeUrl = `${HOME_BASE}/${id}.png`;
      await downloadFile(homeUrl, dest);
      return "home";
    }
    throw e;
  }
}

async function main() {
  if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });

  // 標準形態 1-1025
  const standardIds = Array.from({ length: 1025 }, (_, i) => i + 1);

  // 姿違いフォーム
  let formIds = [];
  if (fs.existsSync(FORMS_FILE)) {
    const forms = JSON.parse(fs.readFileSync(FORMS_FILE, "utf-8"));
    formIds = forms.map((f) => parseInt(f.id, 10)).filter((n) => !isNaN(n));
  }

  const allIds = [...standardIds, ...formIds];
  console.log(
    `合計 ${allIds.length} 件（標準: ${standardIds.length}, 姿違い: ${formIds.length}）`
  );

  let okOfficial = 0;
  let okHome = 0;
  let skip = 0;
  let fail = 0;

  for (let i = 0; i < allIds.length; i++) {
    const id = allIds[i];
    const dest = path.join(IMG_DIR, `${id}.png`);

    if (fs.existsSync(dest)) {
      process.stdout.write(`  [${i + 1}/${allIds.length}] ${id}: スキップ\n`);
      skip++;
      continue;
    }

    process.stdout.write(`  [${i + 1}/${allIds.length}] ${id}...`);
    try {
      const src = await downloadWithFallback(id, dest);
      process.stdout.write(` OK (${src})\n`);
      if (src === "official") okOfficial++;
      else okHome++;
    } catch (e) {
      process.stdout.write(` NG: ${e.message}\n`);
      fail++;
    }

    await sleep(100);
  }

  console.log(`\n完了!`);
  console.log(`  official-artwork: ${okOfficial}`);
  console.log(`  HOME fallback: ${okHome}`);
  console.log(`  スキップ: ${skip}`);
  console.log(`  失敗: ${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
