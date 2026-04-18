/**
 * moves_info.txt を `・id` ごとの表形式に整形する。
 *
 * 実行: node scripts/format-moves-info.js
 */

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '../src/renderer/data/moves_info.txt');
const HEADER_OLD = '\u30bf\u30a4\u30d7\t\u5206\u985e\t\u5a01\u529b\t\u547d\u4e2d\tPP\t\u63a5\u89e6\t\u8aac\u660e';
const HEADER_NEW = '\u6280\u540d\t\u30bf\u30a4\u30d7\t\u5206\u985e\t\u5a01\u529b\t\u547d\u4e2d\tPP\t\u63a5\u89e6\t\u8aac\u660e';
const VERSION_MARKERS = new Set([
  'SV',
  'SM',
  'BDSP',
  'ZA',
  '\u5263\u76fe',
  '\u30a2\u30eb\u30bb\u30a6\u30b9',
]);

function normalize(value) {
  return String(value || '').normalize('NFKC').replace(/\u3000/g, ' ').trim();
}

function cleanMoveName(name) {
  return normalize(name).replace(/(?:New|\u4eba\u6c17)+$/u, '').trim();
}

function parseTitle(line) {
  const match = normalize(line).match(/^\u25c6\s*(.+?\u304c\u899a\u3048\u308b\u6280)$/u);
  return match ? `\u25c6 ${match[1]}` : null;
}

function isFormattedRow(line) {
  return normalize(line).split('\t').length >= 8;
}

function main() {
  const raw = fs.readFileSync(FILE_PATH, 'utf8');
  const lines = raw.split(/\r?\n/).map(normalize);
  const sections = [];

  let i = 0;
  while (i < lines.length) {
    while (i < lines.length && !lines[i]) i += 1;
    if (i >= lines.length) break;

    if (!lines[i].startsWith('\u30fb')) {
      i += 1;
      continue;
    }

    const id = `\u30fb${lines[i].slice(1).trim()}`;
    i += 1;

    let title = null;
    while (i < lines.length) {
      const line = lines[i];
      if (!line) {
        i += 1;
        continue;
      }
      const parsedTitle = parseTitle(line);
      if (parsedTitle) {
        title = parsedTitle;
        i += 1;
        break;
      }
      i += 1;
    }

    if (!title) {
      throw new Error(`Title not found for ${id}`);
    }

    while (i < lines.length && (lines[i] === '' || lines[i] === HEADER_OLD || lines[i] === HEADER_NEW)) {
      i += 1;
    }

    const rows = [];
    while (i < lines.length) {
      while (i < lines.length && !lines[i]) i += 1;
      if (i >= lines.length || lines[i].startsWith('\u30fb')) break;

      const maybeTitle = parseTitle(lines[i]);
      if (maybeTitle) break;

      const line = lines[i];
      if (line === HEADER_OLD || line === HEADER_NEW || VERSION_MARKERS.has(line)) {
        i += 1;
        continue;
      }

      if (isFormattedRow(line)) {
        const parts = line.split('\t').map((part) => part.trim());
        rows.push([cleanMoveName(parts[0]), ...parts.slice(1, 8)].join('\t'));
        i += 1;
        continue;
      }

      const moveName = cleanMoveName(line);
      i += 1;

      while (i < lines.length && !lines[i]) i += 1;
      while (i < lines.length && (VERSION_MARKERS.has(lines[i]) || lines[i] === 'New')) i += 1;
      while (i < lines.length && !lines[i]) i += 1;

      if (i >= lines.length) {
        throw new Error(`Missing detail row for ${id} / ${moveName}`);
      }

      const detail = lines[i];
      const parts = detail.split('\t').map((part) => part.trim());
      if (parts.length < 7) {
        throw new Error(`Invalid detail row for ${id} / ${moveName}: ${detail}`);
      }

      rows.push([moveName, ...parts.slice(0, 7)].join('\t'));
      i += 1;
    }

    sections.push([id, title, rows]);
  }

  const output = sections
    .map(([id, title, rows]) => [id, '', title, HEADER_NEW, ...rows].join('\r\n'))
    .join('\r\n\r\n');

  fs.writeFileSync(FILE_PATH, `${output}\r\n`, 'utf8');
  console.log(
    `formatted sections=${sections.length} rows=${sections.reduce((sum, [, , rows]) => sum + rows.length, 0)}`
  );
}

main();
