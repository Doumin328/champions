/**
 * moves.json に技フラグ（contact / pulse / bite / punch / slicing）を
 * Pokemon Showdown のデータから追加するスクリプト
 *
 * Showdown の num = PokeAPI の move ID なので、
 *   Showdown num → PokeAPI（日本語名取得）→ moves.json の name でマッチ
 *
 * Usage:
 *   node scripts/add-move-flags.js --preview   # 一覧表示のみ（JSONは変更しない）
 *   node scripts/add-move-flags.js --apply     # JSONを実際に更新
 */

const fs = require("fs");
const path = require("path");

const FLAGS_TO_TRACK = ["contact", "pulse", "bite", "punch", "slicing"];
const SHOWDOWN_MOVES_URL =
  "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/moves.ts";
const MOVES_FILE = path.join(
  __dirname,
  "..",
  "src",
  "renderer",
  "data",
  "moves.json"
);
const CONCURRENCY = 8;
const DELAY_MS = 80;

// ---- Showdown データパース（ブレース深度追跡） ----

function parseShowdownFlags(text) {
  const numToFlags = {}; // { num: { contact?: true, ... } }

  let depth = 0;
  let entryStart = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      depth++;
      if (depth === 2) entryStart = i;
    } else if (ch === "}") {
      if (depth === 2 && entryStart !== -1) {
        const block = text.substring(entryStart, i + 1);
        const numMatch = block.match(/\bnum\s*:\s*(-?\d+)/);
        if (numMatch) {
          const num = parseInt(numMatch[1], 10);
          if (num > 0) {
            const flagsMatch = block.match(/\bflags\s*:\s*\{([^}]*)\}/);
            if (flagsMatch) {
              const flagsStr = flagsMatch[1];
              const flags = {};
              for (const flag of FLAGS_TO_TRACK) {
                if (new RegExp(`\\b${flag}\\b`).test(flagsStr)) {
                  flags[flag] = true;
                }
              }
              if (!numToFlags[num]) {
                numToFlags[num] = flags;
              } else {
                for (const [k, v] of Object.entries(flags)) {
                  if (v) numToFlags[num][k] = true;
                }
              }
            }
          }
        }
        entryStart = -1;
      }
      depth--;
    }
  }
  return numToFlags;
}

// ---- PokeAPI ヘルパー ----

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) {
        if (i < retries) await sleep(500);
        continue;
      }
      return res.json();
    } catch {
      if (i < retries) await sleep(500);
    }
  }
  return null;
}

/** PokeAPI からその技の日本語名を取得（ja-Hrkt → ja の順で試行） */
async function getJapaneseName(pokeapiId) {
  const data = await fetchWithRetry(
    `https://pokeapi.co/api/v2/move/${pokeapiId}`
  );
  if (!data) return null;
  return (
    data.names?.find((n) => n.language?.name === "ja-Hrkt")?.name ||
    data.names?.find((n) => n.language?.name === "ja")?.name ||
    null
  );
}

async function runBatch(entries, fn, concurrency) {
  const results = new Array(entries.length);
  let idx = 0;
  async function worker() {
    while (idx < entries.length) {
      const i = idx++;
      results[i] = await fn(entries[i], i);
      await sleep(DELAY_MS);
      if ((i + 1) % 50 === 0 || i + 1 === entries.length) {
        process.stderr.write(`  ${i + 1}/${entries.length}\r`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

// ---- メイン ----

async function main() {
  const isApply = process.argv.includes("--apply");

  console.log(
    isApply
      ? "=== 技フラグ追加 --apply モード ==="
      : "=== 技フラグ プレビュー --preview モード（JSONは変更しません）==="
  );

  // 1. Showdown データ取得・パース
  process.stdout.write("\nShowdown データを取得中...");
  const res = await fetch(SHOWDOWN_MOVES_URL);
  if (!res.ok) throw new Error(`Showdown fetch failed: ${res.status}`);
  const text = await res.text();
  const numToFlags = parseShowdownFlags(text);
  console.log(` ${Object.keys(numToFlags).length} 件パース`);

  // 2. フラグを持つ num の一覧を収集
  const numsWithFlags = Object.entries(numToFlags)
    .filter(([, flags]) => Object.keys(flags).length > 0)
    .map(([num]) => parseInt(num, 10));
  console.log(`  うちフラグあり: ${numsWithFlags.length} 件`);

  // 3. PokeAPI で日本語名を取得
  console.log("\nPokeAPI から日本語名を取得中...");
  const numToJaName = {};
  const jaResults = await runBatch(
    numsWithFlags,
    async (num) => {
      const ja = await getJapaneseName(num);
      return { num, ja };
    },
    CONCURRENCY
  );
  for (const { num, ja } of jaResults) {
    if (ja) numToJaName[num] = ja;
  }
  console.log(`  → ${Object.keys(numToJaName).length} 件取得`);

  // 4. 日本語名 → フラグ のマップを構築
  const jaNameToFlags = {};
  for (const [num, ja] of Object.entries(numToJaName)) {
    jaNameToFlags[ja] = numToFlags[num] || {};
  }

  // 5. moves.json に照合して適用
  const moves = JSON.parse(fs.readFileSync(MOVES_FILE, "utf8"));
  console.log(`\nmoves.json: ${moves.length} 件`);

  // フラグ別プレビュー
  for (const flag of FLAGS_TO_TRACK) {
    const flagged = moves.filter((m) => jaNameToFlags[m.name]?.[flag]);
    console.log(`\n[${flag}] ${flagged.length} 件`);
    for (const m of flagged) {
      console.log(`  ${String(m.id).padStart(4)} ${m.name}`);
    }
  }

  // マッチしなかった技（デバッグ用）
  const unmatched = numsWithFlags.filter(
    (num) => numToJaName[num] && !moves.find((m) => m.name === numToJaName[num])
  );
  if (unmatched.length > 0) {
    console.log(`\n--- moves.json に存在しない技 (${unmatched.length} 件) ---`);
    for (const num of unmatched.slice(0, 20)) {
      console.log(`  num=${num} ${numToJaName[num]}`);
    }
  }

  if (isApply) {
    const updated = moves.map((move) => {
      const flags = jaNameToFlags[move.name] || {};
      const { contact, pulse, bite, punch, slicing, ...rest } = move;
      return Object.keys(flags).length > 0 ? { ...rest, ...flags } : rest;
    });
    fs.writeFileSync(MOVES_FILE, JSON.stringify(updated, null, 2), "utf8");
    console.log(`\n  → ${MOVES_FILE} を更新しました`);
    console.log("  フラグ件数:");
    for (const flag of FLAGS_TO_TRACK) {
      console.log(`    ${flag}: ${updated.filter((m) => m[flag]).length} 件`);
    }
  } else {
    console.log(
      "\n内容を確認して問題なければ --apply フラグで実際に更新してください:"
    );
    console.log("  node scripts/add-move-flags.js --apply");
  }

  console.log("\n完了。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
