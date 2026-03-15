# Champions - プロジェクト概要

## 概要

ポケモン対戦向けのElectronデスクトップアプリ。ダメージ計算・チーム管理・BOX管理・配信機能を備える。UIは日本語。

## テックスタック

- **Electron** 28 + **TypeScript** 5.3（strict mode）
- **ターゲット**: ES2020 / CommonJS
- **ビルド**: `tsc` → `dist/`、画像/HTML/CSSも `copyfiles` でコピー
- **依存**: `ffmpeg-static`（配信用）

## ディレクトリ構成

```
src/
├── main/main.ts          # Electronメインプロセス（ウィンドウ生成・FFmpeg起動・IPC）
├── preload/preload.ts    # コンテキストブリッジ（renderer ↔ main）
└── renderer/
    ├── index.html        # UIレイアウト全体
    ├── renderer.ts       # UIロジック・状態管理（約3200行）
    ├── style.css         # スタイル全体
    └── data/             # JSONデータ
        ├── pokemon_*.json   # 地方別ポケモンデータ（カントー〜パルデア、9ファイル）
        └── moves.json       # 技データ（1000+件）
```

## スクリプト

```bash
npm run build   # tsc + copyfiles（dist/ に成果物を出力）
npm run dev     # build → electron 起動
```

## アーキテクチャ

### メインプロセス (`main/main.ts`)
- 1920×1080 フルスクリーンウィンドウ生成
- IPC ハンドラ: `stream:start` / `stream:stop` / `stream:chunk`
- FFmpegを子プロセスとして起動、RTMPストリーミング

### レンダラー (`renderer/renderer.ts`)
- 単一ファイルで全UIロジックを管理
- 状態はモジュールレベル変数で管理（React等のフレームワークなし）
- データ永続化: `localStorage`（チーム・BOX）

## 主な機能（タブ構成）

### タブ① ダメージ計算
- 攻撃側・防御側のポケモン選択（全ポケモン or BOX）
- 努力値・性格・能力ランク・持ち物・天気・フィールドを設定
- 技選択後にリアルタイムでダメージ計算（最小/最大/割合表示）
- 攻撃側・防御側の入れ替えボタンあり

### タブ② チーム管理
- 最大6匹のチームを複数管理
- `localStorage` に保存（キー: `champions_team`）

### タブ③ BOX
- カスタムポケモン（努力値・性格・技・持ち物）を管理
- カード一覧に種族値/努力値/実数値テーブルを表示
- 性格補正は上昇赤・下降青でハイライト
- `localStorage` に保存（キー: `champions_box`）

### 配信タブ（左パネル）
- 映像・音声デバイス選択
- 音量ミキサー
- FFmpeg経由でRTMP配信
- サイドバーに「配信」「録画」「設定」ボタン

## データ型

```typescript
interface Pokemon {
  id: string;          // "0025"（4桁）、フォルム形式は "0019A"
  name: string;
  types: string[];
  baseStats?: { hp, attack, defense, spAttack, spDefense, speed };
  learnset?: number[]; // moves.json の id 参照
}

interface BoxEntry {
  pokemon: Pokemon;
  ev: { hp, atk, def, spAtk, spDef, spd };
  natureName: string;
  heldItem: string;    // COMPETITIVE_ITEMS の id
  moves: number[];     // 最大4つ、moves.json の id
}
```

## ステータス計算（Lv50、IV=0前提）

```typescript
// HP以外
calcStatWithEV(base, ev, nature) = floor((floor((2*base + floor(ev/4)) * 50 / 100) + 5) * nature)
// HP
floor((2*base + floor(ev/4)) * 50 / 100) + 60
```

## ポケモン画像パス

- 通常: `img/pokemon3/{id}.png`（例: `img/pokemon3/0025.png`）
- フォールバック: `img/ball_monster.png`

## 注意事項

- TypeScriptは strict モード。型エラーがあるとビルド失敗。
- ビルド後の成果物は `dist/renderer/` に置かれる。編集は必ず `src/` 側で行う。
- 技・ポケモンデータは `data/*.json` を直接編集せず、`scripts/` のユーティリティを使う。
- スタイルは `style.css` 1ファイルに集約。セクションコメントで分割管理されている。
