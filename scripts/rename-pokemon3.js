/**
 * src/img/pokemon3/ 内のファイル名を4桁ゼロ埋めに統一
 *
 * 対象: 純粋な数字1〜3桁 + .png（例: 1.png → 0001.png, 173.png → 0173.png）
 * 対象外: 4桁以上の数字名（1000.png, 10001.png 等）、サフィックス付き（0003Mega.png 等）
 *
 * 実行: node scripts/rename-pokemon3.js
 */

const fs = require("fs");
const path = require("path");

const IMG_DIR = path.join(__dirname, "../src/img/pokemon3");

const files = fs.readdirSync(IMG_DIR);
let renamed = 0;

for (const file of files) {
  const match = file.match(/^(\d{1,3})\.png$/);
  if (!match) continue;

  const newName = match[1].padStart(4, "0") + ".png";
  if (newName === file) continue;

  fs.renameSync(path.join(IMG_DIR, file), path.join(IMG_DIR, newName));
  console.log(`  ${file} → ${newName}`);
  renamed++;
}

console.log(`\n完了: ${renamed} 件リネームしました`);
