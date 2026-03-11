# CLAUDE.md

このファイルはAIアシスタントがこのリポジトリで作業する際のルールと、コードベースを理解するための情報をまとめたものです。

---

## AIアシスタントへのルール

### 必須ルール

1. **日本語で応答すること**
   コードの説明・提案・質問への回答はすべて日本語で行う。コード本体（変数名・関数名）は英語のままでよい。

2. **動作確認してからコードを変更する**
   変更前に対象ファイルを必ず読み、既存の実装を理解してから手を入れる。推測で変更しない。

3. **変更範囲を最小限に抑える**
   依頼されたこと以外は変更しない。リファクタリング・コメント追加・スタイル修正を勝手に行わない。

4. **破壊的な操作は必ず確認を取る**
   ファイル削除・ブランチ削除・`git reset --hard` などは実行前にユーザーへ確認する。

5. **TypeScript の型安全を守る**
   `any` の使用は禁止。型が不明な場合はユーザーに確認するか、適切な型定義を追加する。

6. **セキュリティモデルを破らない**
   Electron のプロセス分離（main / preload / renderer）を厳守する。`nodeIntegration` を有効にしない。生の `ipcRenderer` を renderer に露出しない。

### 推奨ルール

- コミットメッセージは `feat:`, `fix:`, `chore:`, `docs:`, `refactor:` などのプレフィックスを付け、内容を日本語で説明する
- エラー処理は省略しない。IPC 通信・ffmpeg 操作など外部依存がある箇所は必ずエラーをハンドリングする
- `localStorage` に新しいキーを追加したら、このファイルの「localStorageキー一覧」を更新する
- IPC チャンネル名を追加・変更したら、このファイルの「IPC API」セクションを更新する

---

## プロジェクト概要

**Champions** は Electron 製デスクトップアプリ。主な機能は2つ。

1. **RTMP ライブ配信** — カメラ・マイク入力をキャプチャし、ffmpeg 経由で YouTube Live / Twitch などへ配信する
2. **ポケモンチーム編成マネージャー** — チームを作成・保存・管理するタブ UI

対象解像度: 1920×1080 フルスクリーン

---

## 技術スタック

| 区分 | 技術 |
|---|---|
| デスクトップフレームワーク | Electron 28 |
| 言語 | TypeScript 5.3（strict モード） |
| ビルド | `tsc` + `copyfiles` |
| ランタイムターゲット | ES2020 / CommonJS |
| 動画エンコード | ffmpeg（子プロセスとして起動） |
| 動画キャプチャ | MediaRecorder API（WebM） |
| 状態の永続化 | `localStorage` |
| パッケージマネージャー | npm |

---

## ディレクトリ構成

```
champions/
├── src/
│   ├── main/
│   │   ├── main.ts           # Electron メインプロセス（ウィンドウ・IPC・ffmpeg）
│   │   └── caputure.ts       # 未使用の旧ボイラープレート（無視してよい）
│   ├── preload/
│   │   └── preload.ts        # contextBridge でレンダラーに安全な API を公開
│   └── renderer/
│       ├── index.html         # UI の HTML シェル
│       ├── style.css          # ダークテーマ CSS（Flexbox レイアウト）
│       ├── renderer.ts        # レンダラーの全ロジック
│       ├── electron-api.d.ts  # window.electronAPI の型定義
│       └── data/
│           └── pokemon.json   # ポケモンデータ（10件）
├── dist/                      # ビルド出力（gitignore 対象）
├── tsconfig.json
├── package.json
├── .vscode/
│   ├── launch.json            # Electron デバッグ設定
│   └── tasks.json             # ビルドタスク
└── .gitignore
```

---

## アーキテクチャ：Electron プロセスモデル

**プロセス間の責務を絶対に混在させないこと。**

```
┌──────────────────────────────────────────────┐
│  Renderer Process  (src/renderer/renderer.ts)  │
│  DOM 操作・MediaRecorder・UI 状態管理          │
│  → window.electronAPI.* で IPC 呼び出し       │
└───────────────────┬──────────────────────────┘
                    │ contextBridge（セキュア）
┌───────────────────▼──────────────────────────┐
│  Preload Script  (src/preload/preload.ts)     │
│  ipcRenderer を安全にラップして公開する        │
└───────────────────┬──────────────────────────┘
                    │ IPC チャンネル
┌───────────────────▼──────────────────────────┐
│  Main Process  (src/main/main.ts)             │
│  BrowserWindow 生成・ipcMain ハンドラー        │
│  ffmpeg 子プロセス管理・OS ネイティブ API      │
└──────────────────────────────────────────────┘
```

### セキュリティ設定（変更禁止）
- `nodeIntegration: false` — レンダラーから Node API に直接アクセスさせない
- `contextIsolation: true` — preload 経由でのみ API を公開する
- CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`

---

## IPC API

`src/renderer/electron-api.d.ts` に型定義。レンダラーは必ず `window.electronAPI` 経由で通信する。

| メソッド | 方向 | 説明 |
|---|---|---|
| `getAppVersion()` | R→M | アプリバージョンを返す |
| `streamStart(settings)` | R→M（invoke） | 配信開始。`{ success, error? }` を返す |
| `streamStop()` | R→M（invoke） | 配信停止。`{ success }` を返す |
| `streamSendData(buffer)` | R→M（send） | WebM チャンクを ffmpeg stdin へ送る |
| `onStreamStatus(cb)` | M→R | 配信状態の変化をレンダラーに通知 |
| `removeStreamStatusListener()` | — | 上記コールバックを解除 |

### IPC チャンネル名（main.ts 内）
- `stream:start`
- `stream:stop`
- `stream:data`
- `stream:status`（メイン → レンダラーへの push）

---

## 配信パイプライン

```
カメラ・マイク
    ↓ getUserMedia
MediaRecorder（WebM・約100msチャンク）
    ↓ ondataavailable
electronAPI.streamSendData(buffer)
    ↓ IPC stream:data
ffmpeg stdin（pipe:0）
    ↓ -vcodec libx264 -acodec aac -f flv
RTMP サーバー（YouTube / Twitch / カスタム）
```

ffmpeg の解決順:
1. `resources/ffmpeg`（バンドル済みバイナリ）
2. システム PATH のフォールバック

---

## レンダラー UI 構成

| セクション | 役割 |
|---|---|
| デバイス列挙 | 起動時にカメラ・マイクデバイスを取得・選択 |
| 配信コントロール | RTMP URL・ストリームキー入力、開始/停止、ビットレート選択 |
| ステータス表示 | LIVE インジケーター・経過時間・エラーメッセージ |
| チームマネージャー | ポケモンチームの CRUD（最大6匹/チーム）、モーダル UI |
| タブシステム | タブ1=配信、タブ2=チーム編成、タブ3=未実装 |

### localStorageキー一覧

| キー | 内容 |
|---|---|
| `champions_last_video_device_id` | 最後に選択したカメラのデバイス ID |
| `champions_last_audio_device_id` | 最後に選択したマイクのデバイス ID |
| `champions_team` | チームオブジェクトの JSON 配列 |
| `champions_stream_settings` | `{ rtmpUrl, videoBitrate }` |

---

## データ

**`src/renderer/data/pokemon.json`** — ポケモン10件のリスト

```json
{ "id": 1, "name": "Pikachu", "types": ["Electric"] }
```

フィールド: `id`（number）、`name`（string）、`types`（string[]）

---

## 開発コマンド

```bash
# 依存パッケージのインストール
npm install

# TypeScript コンパイル + アセットを dist/ へコピー
npm run build

# ビルド後に Electron を起動
npm run dev
# または
npm start
```

**ウォッチモードはない**。TypeScript を変更したら `npm run build` を再実行してから起動すること。

### ビルド出力（dist/）
- `dist/main/main.js` — Electron エントリーポイント
- `dist/preload/preload.js`
- `dist/renderer/index.html`、`style.css`、`renderer.js`、`data/pokemon.json`

---

## TypeScript 設定

`tsconfig.json` の重要な設定（変更禁止）:

| 設定 | 値 | 理由 |
|---|---|---|
| `strict` | `true` | 型安全を強制 |
| `target` | `ES2020` | Electron の対応バージョン |
| `module` | `commonjs` | Electron メインプロセスの要件 |
| `lib` | `["ES2020", "DOM"]` | DOM API を利用するため |

---

## コーディング規約

### 共通
- `any` は使用禁止。型不明な場合はジェネリクスか `unknown` を使う
- 非同期処理は `async/await` で統一する（IPC invoke は Promise を返す）
- UI テキスト・コメント・コミットメッセージは**日本語**で書く

### レンダラー（renderer.ts）
- フレームワークなしの素の DOM 操作。`document.getElementById()` 後は必ず null チェックを行う
- ユーザー設定は `localStorage` で永続化する
- イベントリスナーは DOM load 後の初期化シーケンスでまとめて登録する

### メインプロセス（main.ts）
- 返り値が必要な IPC は `ipcMain.handle()`、一方向の通知は `ipcMain.on()` を使う
- レンダラーへの push は `webContents.send()` を使う
- ffmpeg は `child_process.spawn()` で起動し、stdin にデータをパイプする

### Preload（preload.ts）
- `contextBridge.exposeInMainWorld` にのみ追記する
- 生の `ipcRenderer` を露出しない
- ロジックは main か renderer に置き、preload は薄く保つ

---

## Git ワークフロー

- `master` からフィーチャーブランチを切る: `feature/<内容>`
- プルリクエストでマージする
- コミットメッセージの形式: `<prefix>: <日本語の説明>`
  - プレフィックス例: `feat`, `fix`, `chore`, `docs`, `refactor`, `style`, `test`
- `dist/` と `node_modules/` はコミットしない（gitignore 済み）

---

## テスト・CI の現状

現時点では以下が存在しない:
- 自動テスト（Jest / Mocha 等）
- CI/CD パイプライン（GitHub Actions 等）
- リント設定（ESLint / Prettier 等）

追加した際は、このファイルに手順とコマンドを追記すること。

---

## 既知の問題・注意点

- `src/main/caputure.ts` — ファイル名のタイポ（"capture" の誤り）、未使用。削除しても問題ない
- ffmpeg バイナリが存在しない場合、`stream:start` は失敗する。エラーは `stream:status` チャンネル経由でレンダラーに通知される
- ウィンドウサイズは 1920×1080 にハードコードされており、それ以下の解像度ではレイアウトが崩れる
