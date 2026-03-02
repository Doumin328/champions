// レンダラープロセス用: 映像ソースをプルダウンで選択して表示

// ========== ダメージ計算（damage-calc をインライン化。Electron nodeIntegration:false のため require 不可） ==========
/** 技タイプ → 防御側タイプ → 倍率 */
const TYPE_CHART: Record<string, Record<string, number>> = {
  ノーマル: { ノーマル: 1, かくとう: 1, ひこう: 1, どく: 1, じめん: 1, いわ: 0.5, むし: 1, ゴースト: 0, はがね: 0.5, ほのお: 1, みず: 1, くさ: 1, でんき: 1, エスパー: 1, こおり: 1, ドラゴン: 1, あく: 1, フェアリー: 1 },
  かくとう: { ノーマル: 2, かくとう: 1, ひこう: 0.5, どく: 0.5, じめん: 1, いわ: 2, むし: 0.5, ゴースト: 0, はがね: 2, ほのお: 1, みず: 1, くさ: 1, でんき: 1, エスパー: 0.5, こおり: 2, ドラゴン: 1, あく: 2, フェアリー: 0.5 },
  ひこう: { ノーマル: 1, かくとう: 2, ひこう: 1, どく: 1, じめん: 1, いわ: 0.5, むし: 2, ゴースト: 1, はがね: 0.5, ほのお: 1, みず: 1, くさ: 2, でんき: 0.5, エスパー: 1, こおり: 1, ドラゴン: 1, あく: 1, フェアリー: 1 },
  どく: { ノーマル: 1, かくとう: 1, ひこう: 1, どく: 0.5, じめん: 0.5, いわ: 0.5, むし: 1, ゴースト: 0.5, はがね: 0, ほのお: 1, みず: 1, くさ: 2, でんき: 1, エスパー: 1, こおり: 1, ドラゴン: 1, あく: 1, フェアリー: 2 },
  じめん: { ノーマル: 1, かくとう: 1, ひこう: 0, どく: 2, じめん: 1, いわ: 2, むし: 0.5, ゴースト: 1, はがね: 2, ほのお: 2, みず: 1, くさ: 0.5, でんき: 2, エスパー: 1, こおり: 1, ドラゴン: 1, あく: 1, フェアリー: 1 },
  いわ: { ノーマル: 1, かくとう: 0.5, ひこう: 2, どく: 1, じめん: 0.5, いわ: 1, むし: 2, ゴースト: 1, はがね: 0.5, ほのお: 2, みず: 1, くさ: 1, でんき: 1, エスパー: 1, こおり: 2, ドラゴン: 1, あく: 1, フェアリー: 1 },
  むし: { ノーマル: 1, かくとう: 0.5, ひこう: 0.5, どく: 0.5, じめん: 1, いわ: 1, むし: 1, ゴースト: 0.5, はがね: 0.5, ほのお: 0.5, みず: 1, くさ: 2, でんき: 1, エスパー: 2, こおり: 1, ドラゴン: 1, あく: 2, フェアリー: 0.5 },
  ゴースト: { ノーマル: 0, かくとう: 1, ひこう: 1, どく: 1, じめん: 1, いわ: 1, むし: 1, ゴースト: 2, はがね: 1, ほのお: 1, みず: 1, くさ: 1, でんき: 1, エスパー: 2, こおり: 1, ドラゴン: 1, あく: 0.5, フェアリー: 1 },
  はがね: { ノーマル: 1, かくとう: 1, ひこう: 1, どく: 1, じめん: 1, いわ: 2, むし: 1, ゴースト: 1, はがね: 0.5, ほのお: 0.5, みず: 0.5, くさ: 1, でんき: 0.5, エスパー: 1, こおり: 2, ドラゴン: 1, あく: 1, フェアリー: 2 },
  ほのお: { ノーマル: 1, かくとう: 1, ひこう: 1, どく: 1, じめん: 1, いわ: 0.5, むし: 2, ゴースト: 1, はがね: 2, ほのお: 0.5, みず: 0.5, くさ: 2, でんき: 1, エスパー: 1, こおり: 2, ドラゴン: 0.5, あく: 1, フェアリー: 1 },
  みず: { ノーマル: 1, かくとう: 1, ひこう: 1, どく: 1, じめん: 2, いわ: 2, むし: 1, ゴースト: 1, はがね: 1, ほのお: 2, みず: 0.5, くさ: 0.5, でんき: 1, エスパー: 1, こおり: 1, ドラゴン: 0.5, あく: 1, フェアリー: 1 },
  くさ: { ノーマル: 1, かくとう: 1, ひこう: 0.5, どく: 0.5, じめん: 2, いわ: 2, むし: 0.5, ゴースト: 1, はがね: 0.5, ほのお: 0.5, みず: 2, くさ: 0.5, でんき: 1, エスパー: 1, こおり: 1, ドラゴン: 0.5, あく: 1, フェアリー: 1 },
  でんき: { ノーマル: 1, かくとう: 1, ひこう: 2, どく: 1, じめん: 0, いわ: 1, むし: 1, ゴースト: 1, はがね: 1, ほのお: 1, みず: 2, くさ: 0.5, でんき: 0.5, エスパー: 1, こおり: 1, ドラゴン: 0.5, あく: 1, フェアリー: 1 },
  エスパー: { ノーマル: 1, かくとう: 2, ひこう: 1, どく: 2, じめん: 1, いわ: 1, むし: 1, ゴースト: 1, はがね: 0.5, ほのお: 1, みず: 1, くさ: 1, でんき: 1, エスパー: 0.5, こおり: 1, ドラゴン: 1, あく: 0, フェアリー: 1 },
  こおり: { ノーマル: 1, かくとう: 1, ひこう: 2, どく: 1, じめん: 2, いわ: 1, むし: 1, ゴースト: 1, はがね: 0.5, ほのお: 0.5, みず: 0.5, くさ: 2, でんき: 1, エスパー: 1, こおり: 0.5, ドラゴン: 2, あく: 1, フェアリー: 1 },
  ドラゴン: { ノーマル: 1, かくとう: 1, ひこう: 1, どく: 1, じめん: 1, いわ: 1, むし: 1, ゴースト: 1, はがね: 0.5, ほのお: 1, みず: 1, くさ: 1, でんき: 1, エスパー: 1, こおり: 1, ドラゴン: 2, あく: 1, フェアリー: 0 },
  あく: { ノーマル: 1, かくとう: 0.5, ひこう: 1, どく: 1, じめん: 1, いわ: 1, むし: 1, ゴースト: 2, はがね: 1, ほのお: 1, みず: 1, くさ: 1, でんき: 1, エスパー: 2, こおり: 1, ドラゴン: 1, あく: 0.5, フェアリー: 0.5 },
  フェアリー: { ノーマル: 1, かくとう: 2, ひこう: 1, どく: 0.5, じめん: 1, いわ: 1, むし: 1, ゴースト: 1, はがね: 0.5, ほのお: 0.5, みず: 1, くさ: 1, でんき: 1, エスパー: 1, こおり: 1, ドラゴン: 2, あく: 2, フェアリー: 1 },
};
const DMG_LEVEL = 50;
function getTypeEff(moveType: string, defenderTypes: string[]): number {
  const row = TYPE_CHART[moveType];
  if (!row) return 1;
  let mult = 1;
  for (const t of defenderTypes) mult *= row[t] ?? 1;
  return mult;
}
function calcStat(base: number, isHP: boolean): number {
  if (isHP) return Math.floor((2 * base * DMG_LEVEL) / 100) + DMG_LEVEL + 10;
  return Math.floor(Math.floor((2 * base * DMG_LEVEL) / 100) + 5);
}

/** Lv50・努力値・性格補正込みの実数値（非HP）。IV=0 で EV=0, nature=1 のとき calcStat と一致 */
function calcStatWithEV(base: number, ev: number, nature: number): number {
  const raw = Math.floor((Math.floor((2 * base + Math.floor(ev / 4)) * DMG_LEVEL / 100) + 5) * nature);
  return Math.max(1, raw);
}
interface DamageResult {
  damageMin: number;
  damageMax: number;
  percentMin: number;
  percentMax: number;
  defenderHP: number;
  remainingHPMin: number;
  remainingHPMax: number;
  isStatusMove: boolean;
  isImmune: boolean;
}
function calculateDamage(input: {
  movePower: number | null;
  moveType: string;
  moveCategory: string;
  attackerTypes: string[];
  attackerBaseStats: { hp: number; attack: number; defense: number; spAttack: number; spDefense: number; speed: number };
  defenderTypes: string[];
  defenderBaseStats: { hp: number; attack: number; defense: number; spAttack: number; spDefense: number; speed: number };
  attackerStatOverride?: { attack?: number; spAttack?: number };
  defenderStatOverride?: { defense?: number; spDefense?: number };
  attackerAtkRank?: number;
  attackerSpAtkRank?: number;
  defenderDefRank?: number;
  defenderSpDefRank?: number;
  weather?: string;
  terrain?: string;
}): DamageResult {
  const { movePower, moveType, moveCategory, attackerTypes, attackerBaseStats, defenderTypes, defenderBaseStats, attackerStatOverride, defenderStatOverride, weather, terrain } = input;
  const defenderHP = calcStat(defenderBaseStats.hp, true);
  if (moveCategory === "変化" || movePower == null || movePower <= 0) {
    return { damageMin: 0, damageMax: 0, percentMin: 0, percentMax: 0, defenderHP, remainingHPMin: defenderHP, remainingHPMax: defenderHP, isStatusMove: true, isImmune: false };
  }
  const typeEff = getTypeEff(moveType, defenderTypes);
  if (typeEff === 0) {
    return { damageMin: 0, damageMax: 0, percentMin: 0, percentMax: 0, defenderHP, remainingHPMin: defenderHP, remainingHPMax: defenderHP, isStatusMove: false, isImmune: true };
  }
  const stab = attackerTypes.includes(moveType) ? 1.5 : 1;
  const atkBase = moveCategory === "物理"
    ? (attackerStatOverride?.attack ?? calcStat(attackerBaseStats.attack, false))
    : (attackerStatOverride?.spAttack ?? calcStat(attackerBaseStats.spAttack, false));
  const defBase = moveCategory === "物理"
    ? (defenderStatOverride?.defense ?? calcStat(defenderBaseStats.defense, false))
    : (defenderStatOverride?.spDefense ?? calcStat(defenderBaseStats.spDefense, false));
  const atkRank = moveCategory === "物理" ? (input.attackerAtkRank ?? 0) : (input.attackerSpAtkRank ?? 0);
  const defRank = moveCategory === "物理" ? (input.defenderDefRank ?? 0) : (input.defenderSpDefRank ?? 0);
  const atkStat = Math.max(1, Math.floor(atkBase * rankMult(atkRank)));
  const defStat = Math.max(1, Math.floor(defBase * rankMult(defRank)));
  const base = Math.floor((Math.floor((2 * DMG_LEVEL) / 5 + 2) * movePower * atkStat) / defStat / 50) + 2;
  let weatherMult = 1;
  if (weather === "はれ") {
    if (moveType === "ほのお") weatherMult = 1.5;
    else if (moveType === "みず") weatherMult = 0.5;
  } else if (weather === "あめ") {
    if (moveType === "みず") weatherMult = 1.5;
    else if (moveType === "ほのお") weatherMult = 0.5;
  }
  let terrainMult = 1;
  if (terrain === "エレキフィールド" && moveType === "でんき") terrainMult = 1.3;
  else if (terrain === "グラスフィールド" && moveType === "くさ") terrainMult = 1.3;
  else if (terrain === "サイコフィールド" && moveType === "エスパー") terrainMult = 1.3;
  else if (terrain === "ミストフィールド" && moveType === "ドラゴン") terrainMult = 0.5;
  const modifier = stab * typeEff * weatherMult * terrainMult;
  const damageMin = Math.floor(Math.max(1, Math.floor(base * modifier * 0.85)));
  const damageMax = Math.floor(Math.max(1, Math.floor(base * modifier * 1.0)));
  return {
    damageMin, damageMax,
    percentMin: (damageMin / defenderHP) * 100, percentMax: (damageMax / defenderHP) * 100,
    defenderHP,
    remainingHPMin: Math.max(0, defenderHP - damageMax), remainingHPMax: Math.max(0, defenderHP - damageMin),
    isStatusMove: false, isImmune: false,
  };
}
// ========== ダメージ計算ここまで ==========

/** ポケモン情報（地方別 JSON と同期） */
interface Pokemon {
  /** 4桁の図鑑番号文字列（例: "0025"、リージョンフォームは "0019A"）。画像ファイル名にも使用 */
  id: string;
  name: string;
  types: string[];
  /** 4桁の図鑑番号（id と重複する場合は省略可。旧形式の JSON 用） */
  number?: string;
  /** 種族値（HP / こうげき / ぼうぎょ / とくこう / とくぼう / すばやさ） */
  baseStats?: {
    hp: number;
    attack: number;
    defense: number;
    spAttack: number;
    spDefense: number;
    speed: number;
  };
  /** 覚える技の ID 一覧（moves.json の id を参照） */
  learnset?: number[];
}

/** 地方別ポケモンデータファイル（図鑑番号順に結合して使用） */
const POKEMON_REGION_FILES = [
  "data/pokemon_kanto.json",
  "data/pokemon_johto.json",
  "data/pokemon_hoenn.json",
  "data/pokemon_sinnoh.json",
  "data/pokemon_unova.json",
  "data/pokemon_kalos.json",
  "data/pokemon_alola.json",
  "data/pokemon_galar.json",
  "data/pokemon_paldea.json",
  "data/pokemon_forms.json",
];

/** デモポケモン一覧（起動時に地方別 JSON を読み込んで結合） */
let demoPokemon: Pokemon[] = [];

const STORAGE_KEY_VIDEO = "champions_last_video_device_id";
const STORAGE_KEY_AUDIO = "champions_last_audio_device_id";
const STORAGE_KEY_TEAM = "champions_team";
const MAX_TEAM_SIZE = 6;

/** ダミー画像（SVG data URL） */
const DUMMY_POKEMON_IMAGE =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">' +
      '<rect width="80" height="80" rx="8" fill="#4a5568"/>' +
      '<circle cx="40" cy="38" r="18" fill="#6b7280"/>' +
      '<circle cx="40" cy="38" r="10" fill="#9ca3af"/>' +
      "</svg>"
  );

/** 空きマス用画像（6匹に満たない箇所）。src/img/ball_monster.png を優先し、無ければ ball_monster.svg を使用 */
const BALL_MONSTER_IMAGE = "img/ball_monster.png";

/** タイプ画像HTMLを生成 */
function typeBadgesHtml(types: string[]): string {
  return types.map(t => `<img class="type-img" src="img/type/${t}.png" alt="${t}" />`).join("");
}

/** ポケモン画像のパス（img/pokemon3/ 配下の {id}.png に統一。id がなければ DUMMY） */
function getPokemonImageSrc(pokemon: Pokemon): string {
  return pokemon.id ? `img/pokemon3/${pokemon.id}.png` : DUMMY_POKEMON_IMAGE;
}

const videoEl = document.getElementById("video") as HTMLVideoElement;
const deviceSelect = document.getElementById("device-select") as HTMLSelectElement;
const audioSelect = document.getElementById("audio-select") as HTMLSelectElement;
const refreshBtn = document.getElementById("refresh-devices");
const volumeSlider = document.getElementById("volume-slider") as HTMLInputElement;
const statusEl = document.getElementById("video-status");

let currentStream: MediaStream | null = null;

/** 複数チーム（各チームは最大6匹） */
let teams: Pokemon[][] = [];

/** 編集中のチームのインデックス（ピッカーで追加する先）※未使用時は -1 */
let editingTeamIndex: number = -1;

/** ダイアログで作成中のチーム（作成ボタン押下まで teams には追加しない） */
let editingTeam: Pokemon[] = [];

/** ポケモン一覧のタイプ絞り込み（null または "すべて" で全件表示） */
let pickerTypeFilter: string | null = null;

/** チーム一覧の編集モード（true のとき各チームに削除ボタン表示） */
let isEditMode: boolean = false;

/** 削除確認モーダルで削除対象のチームインデックス */
let deleteTargetTeamIndex: number = -1;

/** タブ1: 攻撃側ポケモン */
let attackPokemon: Pokemon | null = null;

/** タブ1: 攻撃を受ける側ポケモン */
let defendPokemon: Pokemon | null = null;

/** タブ1: 単体選択モーダルで選択対象（'attack' | 'defend' | 'box'） */
let tab1SelectTarget: "attack" | "defend" | "box" | null = null;

/** タブ1: 単体選択モーダルのタイプ絞り込み */
let tab1SelectTypeFilter: string | null = null;

/** タブ1: 選択中ワザ4つ */
let selectedMoves: number[] = [];

/** タブ1: 技変更用にクリックされたスロット番号（null=未選択） */
let editingMoveSlotIndex: number | null = null;

/** タブ1: 技一覧のタイプ絞り込み（null または "すべて" で全件） */
let damageMovesTypeFilter: string | null = null;

/** タブ1: 技一覧の分類絞り込み（null または "すべて" で全件） */
let damageMovesCategoryFilter: string | null = null;

/** タブ1: 防御側の努力値・性格（防御・特防） */
let defenderDefEV = 0;
let defenderDefNature = 1.0;
let defenderSpDefEV = 0;
let defenderSpDefNature = 1.0;

/** タブ1: 攻撃側の努力値・性格（攻撃・特攻） */
let attackerAtkEV = 0;
let attackerAtkNature = 1.0;
let attackerSpAtkEV = 0;
let attackerSpAtkNature = 1.0;

/** タブ1: 能力ランク（-6〜+6） */
let attackerAtkRank = 0;
let attackerSpAtkRank = 0;
let defenderDefRank = 0;
let defenderSpDefRank = 0;

/** タブ1: 天候・フィールド */
let currentWeather = "";
let currentTerrain = "";

/** 技データ（moves.json） */
interface Move {
  id: number;
  name: string;
  type: string;
  category: string;
  power: number | null;
  accuracy: number | null;
  pp: number;
}

let movesData: Move[] = [];

// ========== タブ3: BOX ==========

interface BoxEntry {
  pokemon: Pokemon;
  ev: { hp: number; atk: number; def: number; spAtk: number; spDef: number; spd: number };
  natureName: string;
  heldItem: string;
  moves: number[];
}

const NATURES: { name: string; atk: number; def: number; spAtk: number; spDef: number; spd: number }[] = [
  { name: "がんばりや", atk: 1.0, def: 1.0, spAtk: 1.0, spDef: 1.0, spd: 1.0 },
  { name: "さみしがり", atk: 1.1, def: 0.9, spAtk: 1.0, spDef: 1.0, spd: 1.0 },
  { name: "ゆうかん",   atk: 1.1, def: 1.0, spAtk: 1.0, spDef: 1.0, spd: 0.9 },
  { name: "いじっぱり", atk: 1.1, def: 1.0, spAtk: 0.9, spDef: 1.0, spd: 1.0 },
  { name: "やんちゃ",   atk: 1.1, def: 1.0, spAtk: 1.0, spDef: 0.9, spd: 1.0 },
  { name: "ずぶとい",   atk: 0.9, def: 1.1, spAtk: 1.0, spDef: 1.0, spd: 1.0 },
  { name: "すなお",     atk: 1.0, def: 1.0, spAtk: 1.0, spDef: 1.0, spd: 1.0 },
  { name: "のんき",     atk: 1.0, def: 1.1, spAtk: 1.0, spDef: 1.0, spd: 0.9 },
  { name: "わんぱく",   atk: 1.0, def: 1.1, spAtk: 0.9, spDef: 1.0, spd: 1.0 },
  { name: "のうてんき", atk: 1.0, def: 1.1, spAtk: 1.0, spDef: 0.9, spd: 1.0 },
  { name: "おくびょう", atk: 0.9, def: 1.0, spAtk: 1.0, spDef: 1.0, spd: 1.1 },
  { name: "せっかち",   atk: 1.0, def: 0.9, spAtk: 1.0, spDef: 1.0, spd: 1.1 },
  { name: "まじめ",     atk: 1.0, def: 1.0, spAtk: 1.0, spDef: 1.0, spd: 1.0 },
  { name: "ようき",     atk: 1.0, def: 1.0, spAtk: 0.9, spDef: 1.0, spd: 1.1 },
  { name: "むじゃき",   atk: 1.0, def: 1.0, spAtk: 1.0, spDef: 0.9, spd: 1.1 },
  { name: "ひかえめ",   atk: 0.9, def: 1.0, spAtk: 1.1, spDef: 1.0, spd: 1.0 },
  { name: "おとなしい", atk: 1.0, def: 0.9, spAtk: 1.1, spDef: 1.0, spd: 1.0 },
  { name: "れいせい",   atk: 1.0, def: 1.0, spAtk: 1.1, spDef: 1.0, spd: 0.9 },
  { name: "うっかりや", atk: 1.0, def: 1.0, spAtk: 1.1, spDef: 0.9, spd: 1.0 },
  { name: "てれや",     atk: 1.0, def: 1.0, spAtk: 1.0, spDef: 1.0, spd: 1.0 },
  { name: "おだやか",   atk: 0.9, def: 1.0, spAtk: 1.0, spDef: 1.1, spd: 1.0 },
  { name: "なごやか",   atk: 1.0, def: 0.9, spAtk: 1.0, spDef: 1.1, spd: 1.0 },
  { name: "なまいき",   atk: 1.0, def: 1.0, spAtk: 1.0, spDef: 1.1, spd: 0.9 },
  { name: "しんちょう", atk: 1.0, def: 1.0, spAtk: 0.9, spDef: 1.1, spd: 1.0 },
  { name: "きまぐれ",   atk: 1.0, def: 1.0, spAtk: 1.0, spDef: 1.0, spd: 1.0 },
];

/** 性格名に上昇・下降する能力を付加したラベルを返す */
function getNatureLabel(n: typeof NATURES[number]): string {
  const upMap: Record<string, string> = { atk: "こうげき", def: "ぼうぎょ", spAtk: "とくこう", spDef: "とくぼう", spd: "すばやさ" };
  let up = "", down = "";
  for (const key of ["atk", "def", "spAtk", "spDef", "spd"] as const) {
    if (n[key] > 1) up = upMap[key];
    if (n[key] < 1) down = upMap[key];
  }
  return up ? `${n.name}（${up}↑ ${down}↓）` : n.name;
}

/** 競技で使われる持ち物一覧 */
interface CompetitiveItem { id: string; nameJa: string; effect: string }
const COMPETITIVE_ITEMS: CompetitiveItem[] = [
  // こだわり系
  { id: "choice-scarf",       nameJa: "こだわりスカーフ",   effect: "すばやさ×1.5、最初に使った技しか選べない。" },
  { id: "choice-specs",       nameJa: "こだわりメガネ",     effect: "とくこう×1.5、最初に使った技しか選べない。" },
  { id: "choice-band",        nameJa: "こだわりハチマキ",   effect: "こうげき×1.5、最初に使った技しか選べない。" },
  // 汎用
  { id: "life-orb",           nameJa: "いのちのたま",       effect: "技ダメージ×1.3、使うたびHP−1/10。" },
  { id: "leftovers",          nameJa: "たべのこし",         effect: "毎ターン最大HP×1/16回復。" },
  { id: "focus-sash",         nameJa: "きあいのタスキ",     effect: "HP満タン時、一撃耐える（一回限り）。" },
  { id: "assault-vest",       nameJa: "とつげきチョッキ",   effect: "とくぼう×1.5、変化技使用不可。" },
  { id: "eviolite",           nameJa: "しんかのきせき",     effect: "進化前限定、ぼうぎょ・とくぼう×1.5。" },
  { id: "rocky-helmet",       nameJa: "ゴツゴツメット",     effect: "接触技を受けると相手HP−1/6。" },
  { id: "heavy-duty-boots",   nameJa: "とつげきブーツ",     effect: "場に出たときのまきびし等無効。" },
  { id: "shed-shell",         nameJa: "ぬけのから",         effect: "どんな状況でも交代できる。" },
  // SV新アイテム
  { id: "booster-energy",     nameJa: "ブーストエナジー",   effect: "最も高い種族値の能力+1段階（一回限り）。" },
  { id: "covert-cloak",       nameJa: "おんみつマント",     effect: "技の追加効果を受けない。" },
  { id: "loaded-dice",        nameJa: "いかさまダイス",     effect: "複数回ヒット技が最大回数になりやすい。" },
  { id: "punching-glove",     nameJa: "パンチグローブ",     effect: "パンチ技威力×1.1、接触判定なし。" },
  { id: "mirror-herb",        nameJa: "はんかがみ",         effect: "相手の能力上昇と同じ能力+1段階（一回限り）。" },
  { id: "clear-amulet",       nameJa: "まもりのおまもり",   effect: "技・特性による能力低下無効。" },
  { id: "ability-shield",     nameJa: "とくせいガード",     effect: "特性を書き換えられない。" },
  // 強化系
  { id: "expert-belt",        nameJa: "たつじんのおび",     effect: "効果抜群の技ダメージ×1.2。" },
  { id: "scope-lens",         nameJa: "ピントレンズ",       effect: "急所ランク+1。" },
  { id: "weakness-policy",    nameJa: "じゃくてんほけん",   effect: "抜群ダメージを受けるとこうげき・とくこう+2段階。" },
  { id: "air-balloon",        nameJa: "ふわふわのまくら",   effect: "じめん技無効（攻撃受けると割れる）。" },
  { id: "eject-button",       nameJa: "だっしゅつボタン",   effect: "攻撃受けると自動交代（一回限り）。" },
  { id: "eject-pack",         nameJa: "だっしゅつパック",   effect: "能力低下で自動交代（一回限り）。" },
  { id: "red-card",           nameJa: "レッドカード",       effect: "攻撃受けると相手をランダム交代（一回限り）。" },
  { id: "safety-goggles",     nameJa: "ぼうじんゴーグル",   effect: "砂・雹ダメージと粉技無効。" },
  // オーブ・ハーブ
  { id: "flame-orb",          nameJa: "かえんだま",         effect: "毎ターン終了時にやけど状態になる。" },
  { id: "toxic-orb",          nameJa: "どくどくだま",       effect: "毎ターン終了時に猛毒状態になる。" },
  { id: "white-herb",         nameJa: "しろいハーブ",       effect: "下がった能力を一度だけ回復（一回限り）。" },
  { id: "power-herb",         nameJa: "パワフルハーブ",     effect: "溜めを省略して技を出す（一回限り）。" },
  { id: "mental-herb",        nameJa: "メンタルハーブ",     effect: "メロメロなど精神系状態を回復（一回限り）。" },
  // 天候延長
  { id: "smooth-rock",        nameJa: "さらさらいわ",       effect: "すなあらしを8ターンに延長。" },
  { id: "heat-rock",          nameJa: "あついいわ",         effect: "はれを8ターンに延長。" },
  { id: "damp-rock",          nameJa: "しめったいわ",       effect: "あめを8ターンに延長。" },
  { id: "icy-rock",           nameJa: "ゆきだま",           effect: "ゆきを8ターンに延長。" },
  { id: "terrain-extender",   nameJa: "テレインエクステンダー", effect: "フィールド効果を8ターンに延長。" },
  // その他
  { id: "black-sludge",       nameJa: "くろいヘドロ",       effect: "どくタイプはHP+1/16、それ以外は−1/8。" },
  { id: "metronome-1",        nameJa: "メトロノーム",       effect: "同じ技を連続使用で威力最大×2（6回上限）。" },
  { id: "big-root",           nameJa: "おおきなねっこ",     effect: "吸収技の回復量×1.3。" },
  // 木の実
  { id: "lum-berry",          nameJa: "ラムのみ",           effect: "あらゆる状態異常・混乱を回復（一回限り）。" },
  { id: "sitrus-berry",       nameJa: "オボンのみ",         effect: "HP≦1/2のとき最大HPの1/4回復（一回限り）。" },
  { id: "salac-berry",        nameJa: "サンのみ",           effect: "HP≦1/4のときすばやさ+1段階（一回限り）。" },
  { id: "petaya-berry",       nameJa: "プリンのみ",         effect: "HP≦1/4のときとくこう+1段階（一回限り）。" },
  { id: "liechi-berry",       nameJa: "オヤマのみ",         effect: "HP≦1/4のときこうげき+1段階（一回限り）。" },
  { id: "custap-berry",       nameJa: "バコウのみ",         effect: "HP≦1/4のとき一度だけ最優先行動（一回限り）。" },
  { id: "yache-berry",        nameJa: "ヤチェのみ",         effect: "こおり技ダメージ半減（一回限り）。" },
  { id: "occa-berry",         nameJa: "オッカのみ",         effect: "ほのお技ダメージ半減（一回限り）。" },
  { id: "wacan-berry",        nameJa: "ウタンのみ",         effect: "でんき技ダメージ半減（一回限り）。" },
  { id: "rindo-berry",        nameJa: "リリバのみ",         effect: "くさ技ダメージ半減（一回限り）。" },
  { id: "passho-berry",       nameJa: "ヤゴのみ",           effect: "みず技ダメージ半減（一回限り）。" },
  // タイプ強化
  { id: "charcoal",           nameJa: "もくたん",           effect: "ほのお技威力×1.2。" },
  { id: "mystic-water",       nameJa: "しんぴのしずく",     effect: "みず技威力×1.2。" },
  { id: "miracle-seed",       nameJa: "きせきのタネ",       effect: "くさ技威力×1.2。" },
  { id: "magnet",             nameJa: "じしゃく",           effect: "でんき技威力×1.2。" },
  { id: "never-melt-ice",     nameJa: "とけないこおり",     effect: "こおり技威力×1.2。" },
  { id: "black-belt",         nameJa: "くろおび",           effect: "かくとう技威力×1.2。" },
  { id: "poison-barb",        nameJa: "どくバリ",           effect: "どく技威力×1.2。" },
  { id: "soft-sand",          nameJa: "やわらかいすな",     effect: "じめん技威力×1.2。" },
  { id: "hard-stone",         nameJa: "かたいいし",         effect: "いわ技威力×1.2。" },
  { id: "silver-powder",      nameJa: "ぎんのこな",         effect: "むし技威力×1.2。" },
  { id: "spell-tag",          nameJa: "のろいのおふだ",     effect: "ゴースト技威力×1.2。" },
  { id: "twisted-spoon",      nameJa: "まがったスプーン",   effect: "エスパー技威力×1.2。" },
  { id: "dragon-fang",        nameJa: "りゅうのキバ",       effect: "ドラゴン技威力×1.2。" },
  { id: "black-glasses",      nameJa: "くろいメガネ",       effect: "あく技威力×1.2。" },
  { id: "metal-coat",         nameJa: "メタルコート",       effect: "はがね技威力×1.2。" },
  { id: "sharp-beak",         nameJa: "するどいくちばし",   effect: "ひこう技威力×1.2。" },
  { id: "fairy-feather",      nameJa: "フェアリーはね",     effect: "フェアリー技威力×1.2。" },
];

const STORAGE_KEY_BOX = "champions_box";
let box: BoxEntry[] = [];
let boxTypeFilter: string | null = null;
let boxEditingPokemon: Pokemon | null = null;

/** BOX詳細モーダル: 選択中の持ち物 */
let boxSelectedItem: CompetitiveItem | null = null;
/** BOX詳細モーダル: 持ち物ピッカーの検索テキスト */
let boxItemSearchText = "";

/** BOX詳細モーダル: 選択中の技4つ（0=未選択） */
let boxSelectedMoves: number[] = [0, 0, 0, 0];
/** BOX詳細モーダル: 編集中の技スロット番号（null=未選択） */
let boxEditingMoveSlot: number | null = null;
/** BOX詳細モーダル: 技一覧のタイプ絞り込み */
let boxMoveTypeFilter: string | null = null;
/** BOX詳細モーダル: 技一覧の分類絞り込み */
let boxMoveCategoryFilter: string | null = null;
/** BOX詳細モーダル: 技一覧の検索テキスト */
let boxMoveSearchText = "";

/** 詳細確認中のBOXエントリのインデックス（null=新規作成） */
let boxViewingIndex: number | null = null;

/** タブ1技一覧の検索テキスト */
let tab1MoveSearchText = "";

// BOXのタイプ一覧（18タイプ）
const ALL_TYPES = ["ノーマル","かくとう","ひこう","どく","じめん","いわ","むし","ゴースト","はがね","ほのお","みず","くさ","でんき","エスパー","こおり","ドラゴン","あく","フェアリー"];

function saveBoxToStorage(): void {
  try { localStorage.setItem(STORAGE_KEY_BOX, JSON.stringify(box)); } catch { /* ignore */ }
}

function loadBoxFromStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BOX);
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return;
    box = parsed.filter((e): e is BoxEntry =>
      e != null && typeof e === "object" && "pokemon" in e
    );
  } catch { box = []; }
}

function renderBoxTypeButtons(): void {
  const wrap = document.getElementById("box-type-buttons");
  if (!wrap) return;
  wrap.innerHTML = "";
  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "box-type-btn" + (!boxTypeFilter ? " is-active" : "");
  allBtn.textContent = "すべて";
  allBtn.addEventListener("click", () => { boxTypeFilter = null; renderBoxGrid(); renderBoxTypeButtons(); });
  wrap.appendChild(allBtn);
  ALL_TYPES.forEach((typeName) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "box-type-btn" + (boxTypeFilter === typeName ? " is-active" : "");
    const img = document.createElement("img");
    img.src = `img/type/logos/■${typeName}.png`;
    img.alt = typeName;
    img.onerror = () => { img.style.display = "none"; btn.textContent = typeName; };
    btn.appendChild(img);
    btn.addEventListener("click", () => { boxTypeFilter = typeName; renderBoxGrid(); renderBoxTypeButtons(); });
    wrap.appendChild(btn);
  });
}

function renderBoxGrid(): void {
  const grid = document.getElementById("box-pokemon-grid");
  if (!grid) return;
  grid.innerHTML = "";
  const filtered = boxTypeFilter
    ? box.filter((e) => e.pokemon.types.includes(boxTypeFilter!))
    : box;
  if (filtered.length === 0) {
    const p = document.createElement("p");
    p.className = "box-empty-msg";
    p.textContent = "BOXにポケモンがいません";
    grid.appendChild(p);
    return;
  }
  filtered.forEach((entry, idx) => {
    const card = document.createElement("div");
    card.className = "box-pokemon-card";
    card.dataset.boxIndex = String(box.indexOf(entry));
    const imgWrap = document.createElement("div");
    imgWrap.className = "box-card-img-wrap";
    const pokImg = document.createElement("img");
    pokImg.className = "box-card-img";
    pokImg.alt = entry.pokemon.name;
    pokImg.src = entry.pokemon.id ? `img/pokemon3/${entry.pokemon.id}.png` : BALL_MONSTER_IMAGE;
    pokImg.onerror = () => { pokImg.src = BALL_MONSTER_IMAGE; };
    imgWrap.appendChild(pokImg);
    if (entry.heldItem) {
      const itemBadge = document.createElement("div");
      itemBadge.className = "box-card-item-badge";
      const itemImg = document.createElement("img");
      itemImg.className = "box-card-item-img";
      itemImg.alt = entry.heldItem;
      itemImg.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${entry.heldItem}.png`;
      itemImg.onerror = () => { itemBadge.hidden = true; };
      itemBadge.appendChild(itemImg);
      imgWrap.appendChild(itemBadge);
    }
    card.appendChild(imgWrap);
    const nameEl = document.createElement("span");
    nameEl.className = "box-card-name";
    nameEl.textContent = entry.pokemon.name;
    card.appendChild(nameEl);
    grid.appendChild(card);
    const realIndex = box.indexOf(entry);
    card.addEventListener("click", () => openBoxDetailView(realIndex));
    void idx;
  });
}

function renderTab3(): void {
  renderBoxTypeButtons();
  renderBoxGrid();
}

// BOX努力値グリッド生成
const BOX_EV_LABELS: { label: string; key: keyof BoxEntry["ev"]; id: string }[] = [
  { label: "HP",   key: "hp",    id: "box-ev-hp" },
  { label: "こうげき", key: "atk", id: "box-ev-atk" },
  { label: "ぼうぎょ", key: "def", id: "box-ev-def" },
  { label: "とくこう", key: "spAtk", id: "box-ev-spatk" },
  { label: "とくぼう", key: "spDef", id: "box-ev-spdef" },
  { label: "すばやさ", key: "spd",  id: "box-ev-spd" },
];

function openBoxDetailModal(pokemon: Pokemon): void {
  boxViewingIndex = null;
  boxEditingPokemon = pokemon;
  const modal = document.getElementById("box-detail-modal");
  const title = document.getElementById("box-detail-title");
  const img = document.getElementById("box-detail-img") as HTMLImageElement | null;
  const typesEl = document.getElementById("box-detail-types");
  if (title) title.textContent = pokemon.name;
  if (img) {
    img.src = pokemon.id ? `img/pokemon3/${pokemon.id}.png` : BALL_MONSTER_IMAGE;
    img.onerror = () => { img.src = BALL_MONSTER_IMAGE; };
  }
  if (typesEl) typesEl.innerHTML = typeBadgesHtml(pokemon.types);
  // 詳細確認非表示 / 編集フォーム表示
  const viewEl = document.getElementById("box-detail-view");
  const editEl = document.getElementById("box-detail-edit");
  if (viewEl) viewEl.hidden = true;
  if (editEl) editEl.hidden = false;
  // フォーム初期化
  initBoxEditForm(pokemon);
  if (modal) modal.hidden = false;
}

function closeBoxDetailModal(): void {
  const modal = document.getElementById("box-detail-modal");
  if (modal) modal.hidden = true;
  boxEditingPokemon = null;
  boxSelectedItem = null;
  boxItemSearchText = "";
  boxSelectedMoves = [0, 0, 0, 0];
  boxEditingMoveSlot = null;
  boxViewingIndex = null;
}

function saveBoxEntry(): void {
  if (!boxEditingPokemon) return;
  const ev: BoxEntry["ev"] = { hp: 0, atk: 0, def: 0, spAtk: 0, spDef: 0, spd: 0 };
  BOX_EV_LABELS.forEach(({ key, id }) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    ev[key] = clampEv(Number(el?.value) || 0);
  });
  const natSel = document.getElementById("box-detail-nature") as HTMLSelectElement | null;
  const natureName = natSel?.value ?? "がんばりや";
  const heldItem = boxSelectedItem?.id ?? "";
  const moves = boxSelectedMoves.filter((v) => v > 0);
  const entry: BoxEntry = { pokemon: boxEditingPokemon, ev, natureName, heldItem, moves };
  if (boxViewingIndex !== null) {
    box[boxViewingIndex] = entry;
  } else {
    box.push(entry);
  }
  saveBoxToStorage();
  closeBoxDetailModal();
  renderTab3();
}

function openBoxCreate(): void {
  openTab1PokemonSelect("box");
}

// ========== タブ3: 詳細確認・編集 ==========

/** BOX詳細モーダルを詳細確認モードで開く */
function openBoxDetailView(index: number): void {
  const entry = box[index];
  if (!entry) return;
  boxViewingIndex = index;
  boxEditingPokemon = entry.pokemon;

  // ヘッダー
  const modal = document.getElementById("box-detail-modal");
  const title = document.getElementById("box-detail-title");
  const img = document.getElementById("box-detail-img") as HTMLImageElement | null;
  const typesEl = document.getElementById("box-detail-types");
  if (title) title.textContent = entry.pokemon.name;
  if (img) {
    img.src = entry.pokemon.id ? `img/pokemon3/${entry.pokemon.id}.png` : BALL_MONSTER_IMAGE;
    img.onerror = () => { img.src = BALL_MONSTER_IMAGE; };
  }
  if (typesEl) typesEl.innerHTML = typeBadgesHtml(entry.pokemon.types);

  // 詳細ビュー表示 / 編集フォーム非表示
  const viewEl = document.getElementById("box-detail-view");
  const editEl = document.getElementById("box-detail-edit");
  if (viewEl) viewEl.hidden = false;
  if (editEl) editEl.hidden = true;

  // 詳細コンテンツ描画
  renderBoxDetailView(entry);

  // 編集フォームの初期化（編集ボタン押下時にすぐ使えるよう準備）
  initBoxEditForm(entry.pokemon, entry);

  if (modal) modal.hidden = false;
}

/** 詳細確認コンテンツを描画 */
function renderBoxDetailView(entry: BoxEntry): void {
  const viewContent = document.getElementById("box-view-content");
  if (!viewContent) return;

  const nat = NATURES.find((n) => n.name === entry.natureName) ?? NATURES[0];
  const natLabel = getNatureLabel(nat);

  const item = COMPETITIVE_ITEMS.find((it) => it.id === entry.heldItem);
  const itemHtml = item
    ? `<img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${escapeHtml(item.id)}.png"
         class="box-view-item-img" onerror="this.style.display='none'" />
       <span class="box-view-item-name">${escapeHtml(item.nameJa)}</span>
       <span class="box-view-item-effect">${escapeHtml(item.effect)}</span>`
    : (entry.heldItem ? escapeHtml(entry.heldItem) : "なし");

  const evParts = BOX_EV_LABELS
    .filter(({ key }) => entry.ev[key] > 0)
    .map(({ label, key }) => `<span class="box-view-ev-chip">${label} ${entry.ev[key]}</span>`);
  const evHtml = evParts.length > 0 ? evParts.join("") : "なし";

  const moveMap = new Map(movesData.map((m) => [m.id, m]));
  const movesHtml = entry.moves.length > 0
    ? entry.moves.map((id) => {
        const m = moveMap.get(id);
        if (!m) return "";
        const powerStr = m.power != null ? String(m.power) : "—";
        return `<div class="box-view-move">
          <img class="type-img" src="img/type/${escapeHtml(m.type)}.png" alt="${escapeHtml(m.type)}" />
          <span>${escapeHtml(m.name)}</span>
          <span class="box-view-move-meta">${escapeHtml(m.category)}・威力${powerStr}</span>
        </div>`;
      }).filter(Boolean).join("")
    : "なし";

  viewContent.innerHTML = `
    <div class="box-view-section">
      <span class="box-view-label">性格</span>
      <span class="box-view-value">${escapeHtml(natLabel)}</span>
    </div>
    <div class="box-view-section">
      <span class="box-view-label">努力値</span>
      <div class="box-view-ev-wrap">${evHtml}</div>
    </div>
    <div class="box-view-section">
      <span class="box-view-label">持ち物</span>
      <div class="box-view-item-wrap">${itemHtml}</div>
    </div>
    <div class="box-view-section box-view-section--moves">
      <span class="box-view-label">技</span>
      <div class="box-view-moves">${movesHtml}</div>
    </div>
  `;
}

/** 編集フォームを初期化（新規 or 既存エントリで事前充填） */
function initBoxEditForm(pokemon: Pokemon, existing?: BoxEntry): void {
  // 性格select
  const natSel = document.getElementById("box-detail-nature") as HTMLSelectElement | null;
  if (natSel) {
    natSel.innerHTML = "";
    NATURES.forEach((n) => {
      const opt = document.createElement("option");
      opt.value = n.name;
      opt.textContent = getNatureLabel(n);
      natSel.appendChild(opt);
    });
    natSel.value = existing?.natureName ?? "がんばりや";
  }
  // 努力値グリッド生成
  const evGrid = document.getElementById("box-ev-grid");
  if (evGrid) {
    evGrid.innerHTML = "";
    BOX_EV_LABELS.forEach(({ label, id, key }) => {
      const row = document.createElement("div");
      row.className = "box-ev-row";
      const lbl = document.createElement("span");
      lbl.className = "box-ev-label";
      lbl.textContent = label;
      const btn0 = document.createElement("button");
      btn0.type = "button"; btn0.className = "damage-ev-btn damage-ev-btn-0"; btn0.dataset.evInput = id; btn0.textContent = "0";
      const inp = document.createElement("input");
      inp.type = "number"; inp.id = id; inp.className = "damage-ev-input"; inp.min = "0"; inp.max = "255";
      inp.value = String(existing?.ev[key] ?? 0);
      const btn252 = document.createElement("button");
      btn252.type = "button"; btn252.className = "damage-ev-btn damage-ev-btn-252"; btn252.dataset.evInput = id; btn252.textContent = "252";
      const btnDn = document.createElement("button");
      btnDn.type = "button"; btnDn.className = "damage-ev-step-btn damage-ev-step-down"; btnDn.dataset.evInput = id; btnDn.textContent = "−";
      const btnUp = document.createElement("button");
      btnUp.type = "button"; btnUp.className = "damage-ev-step-btn damage-ev-step-up"; btnUp.dataset.evInput = id; btnUp.textContent = "＋";
      row.append(lbl, btn0, inp, btn252, btnDn, btnUp);
      evGrid.appendChild(row);
    });
  }
  // 持ち物
  boxSelectedItem = existing ? (COMPETITIVE_ITEMS.find((it) => it.id === existing.heldItem) ?? null) : null;
  boxItemSearchText = "";
  renderBoxItemSelected();
  const picker = document.getElementById("box-item-picker");
  if (picker) picker.hidden = true;
  const searchInp = document.getElementById("box-item-search") as HTMLInputElement | null;
  if (searchInp) searchInp.value = "";
  // 技
  boxSelectedMoves = existing ? [...existing.moves, 0, 0, 0, 0].slice(0, 4) : [0, 0, 0, 0];
  boxEditingMoveSlot = null;
  boxMoveTypeFilter = null;
  boxMoveCategoryFilter = null;
  boxMoveSearchText = "";
  renderBoxMovesArea();
  void pokemon;
}

/** 詳細確認→編集モードに切り替え */
function switchToBoxEditMode(): void {
  const viewEl = document.getElementById("box-detail-view");
  const editEl = document.getElementById("box-detail-edit");
  if (viewEl) viewEl.hidden = true;
  if (editEl) editEl.hidden = false;
}

// ========== タブ3: 持ち物ピッカー ==========

function renderBoxItemSelected(): void {
  const img = document.getElementById("box-detail-item-img") as HTMLImageElement | null;
  const nameEl = document.getElementById("box-detail-item-name");
  const clearBtn = document.getElementById("box-detail-item-clear-btn") as HTMLButtonElement | null;
  if (img) {
    if (boxSelectedItem) {
      img.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${boxSelectedItem.id}.png`;
      img.hidden = false;
      img.onerror = () => { img.hidden = true; };
    } else {
      img.hidden = true;
    }
  }
  if (nameEl) nameEl.textContent = boxSelectedItem ? boxSelectedItem.nameJa : "—";
  if (clearBtn) clearBtn.hidden = !boxSelectedItem;
}

function renderBoxItemPicker(): void {
  const list = document.getElementById("box-item-list");
  if (!list) return;
  list.innerHTML = "";
  const query = boxItemSearchText.trim().toLowerCase();
  const items = query
    ? COMPETITIVE_ITEMS.filter((it) => it.nameJa.includes(boxItemSearchText.trim()) || it.id.includes(query))
    : COMPETITIVE_ITEMS;
  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "box-item-card" + (boxSelectedItem?.id === item.id ? " is-selected" : "");
    const img = document.createElement("img");
    img.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${item.id}.png`;
    img.alt = item.nameJa;
    img.className = "box-item-card-img";
    img.onerror = () => { img.style.display = "none"; };
    const nameEl = document.createElement("span");
    nameEl.className = "box-item-card-name";
    nameEl.textContent = item.nameJa;
    const effectEl = document.createElement("span");
    effectEl.className = "box-item-card-effect";
    effectEl.textContent = item.effect;
    btn.append(img, nameEl, effectEl);
    btn.addEventListener("click", () => {
      boxSelectedItem = item;
      renderBoxItemSelected();
      const picker = document.getElementById("box-item-picker");
      if (picker) picker.hidden = true;
    });
    list.appendChild(btn);
  });
}

// ========== タブ3: 技スロット+一覧 ==========

function getBoxMoveUniqueTypes(): string[] {
  if (!boxEditingPokemon?.learnset) return [];
  const moveMap = new Map(movesData.map((m) => [m.id, m]));
  const set = new Set<string>();
  boxEditingPokemon.learnset.forEach((id) => {
    const m = moveMap.get(id);
    if (m) set.add(m.type);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
}

function renderBoxMoveSlots(): void {
  const slotsEl = document.getElementById("box-moves-slots");
  if (!slotsEl || !boxEditingPokemon) return;
  slotsEl.innerHTML = "";
  const moveMap = new Map(movesData.map((m) => [m.id, m]));
  for (let i = 0; i < 4; i++) {
    const moveId = boxSelectedMoves[i];
    const move = moveId ? moveMap.get(moveId) : null;
    const slot = document.createElement("div");
    slot.className = "damage-move-slot" + (boxEditingMoveSlot === i ? " is-editing" : "");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "damage-move-slot-btn";
    btn.addEventListener("click", () => {
      boxEditingMoveSlot = boxEditingMoveSlot === i ? null : i;
      boxMoveTypeFilter = null;
      boxMoveCategoryFilter = null;
      renderBoxMovesArea();
    });
    if (move) {
      const powerStr = move.power != null ? String(move.power) : "—";
      btn.innerHTML = `<span class="damage-move-slot-name">${escapeHtml(move.name)}</span> <span class="damage-move-slot-meta"><img class="type-img" src="img/type/${escapeHtml(move.type)}.png" alt="${escapeHtml(move.type)}" />・${escapeHtml(move.category)}・威力${powerStr}</span>`;
    } else {
      btn.textContent = "—（クリックで技を選択）";
    }
    slot.appendChild(btn);
    slotsEl.appendChild(slot);
  }
}

function renderBoxMoveListTypeButtons(): void {
  const wrap = document.getElementById("box-moves-list-type-btns");
  if (!wrap || !boxEditingPokemon) return;
  wrap.innerHTML = "";
  getBoxMoveUniqueTypes().forEach((typeName) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "damage-move-type-btn" + (boxMoveTypeFilter === typeName ? " is-active" : "");
    btn.innerHTML = `<img class="type-btn-img" src="img/type/${typeName}.png" alt="${typeName}" />`;
    btn.addEventListener("click", () => {
      boxMoveTypeFilter = boxMoveTypeFilter === typeName ? null : typeName;
      renderBoxMoveListTypeButtons();
      renderBoxMoveList();
    });
    wrap.appendChild(btn);
  });
}

function renderBoxMoveListCategoryButtons(): void {
  const wrap = document.getElementById("box-moves-list-cat-btns");
  if (!wrap || !boxEditingPokemon) return;
  wrap.innerHTML = "";
  const options = [
    { label: "すべて", value: null },
    { label: "物理", value: "物理" },
    { label: "特殊", value: "特殊" },
    { label: "変化", value: "変化" },
  ];
  options.forEach(({ label, value }) => {
    const isActive = value === null ? !boxMoveCategoryFilter : boxMoveCategoryFilter === value;
    const btn = document.createElement("button");
    btn.type = "button";
    let cls = "damage-move-category-btn";
    if (value === "物理") cls += " damage-move-category-btn--physical";
    else if (value === "特殊") cls += " damage-move-category-btn--special";
    if (isActive) cls += " is-active";
    btn.className = cls;
    btn.textContent = label;
    btn.addEventListener("click", () => { boxMoveCategoryFilter = value; renderBoxMoveListCategoryButtons(); renderBoxMoveList(); });
    wrap.appendChild(btn);
  });
}

function renderBoxMoveList(): void {
  const listEl = document.getElementById("box-moves-list");
  if (!listEl || !boxEditingPokemon) return;
  listEl.innerHTML = "";
  const learnset = boxEditingPokemon.learnset;
  if (!learnset || learnset.length === 0) {
    const p = document.createElement("p");
    p.className = "damage-moves-placeholder";
    p.textContent = "このポケモンには覚える技データがありません";
    listEl.appendChild(p);
    return;
  }
  const moveMap = new Map(movesData.map((m) => [m.id, m]));
  let moves = learnset.map((id) => moveMap.get(id)).filter((m): m is Move => m != null);
  if (boxMoveTypeFilter) moves = moves.filter((m) => m.type === boxMoveTypeFilter);
  if (boxMoveCategoryFilter) moves = moves.filter((m) => m.category === boxMoveCategoryFilter);
  if (boxMoveSearchText.trim()) moves = moves.filter((m) => m.name.includes(boxMoveSearchText.trim()));
  moves.forEach((move) => {
    const isSelected = boxSelectedMoves.includes(move.id);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "damage-move-btn" + (isSelected ? " is-selected" : "");
    const powerStr = move.power != null ? String(move.power) : "—";
    btn.innerHTML = `<img class="type-img" src="img/type/${escapeHtml(move.type)}.png" alt="${escapeHtml(move.type)}" /> ${escapeHtml(move.name)}（${escapeHtml(move.category)}・威力${powerStr}）`;
    btn.addEventListener("click", () => {
      if (boxEditingMoveSlot !== null) {
        boxSelectedMoves[boxEditingMoveSlot] = move.id;
        boxEditingMoveSlot = null;
        renderBoxMovesArea();
      }
    });
    listEl.appendChild(btn);
  });
}

function renderBoxMovesArea(): void {
  if (!boxEditingPokemon) return;
  renderBoxMoveSlots();
  const listWrap = document.getElementById("box-moves-list-wrap");
  const showList = boxEditingMoveSlot !== null;
  if (listWrap) {
    listWrap.hidden = !showList;
    if (showList) {
      renderBoxMoveListTypeButtons();
      renderBoxMoveListCategoryButtons();
      renderBoxMoveList();
    }
  }
}

// ========== タブ3: BOX ここまで ==========

function saveDeviceSelection(): void {
  try {
    if (deviceSelect) localStorage.setItem(STORAGE_KEY_VIDEO, deviceSelect.value);
    if (audioSelect) localStorage.setItem(STORAGE_KEY_AUDIO, audioSelect.value);
  } catch {
    // localStorage が使えない環境では無視
  }
}

function setStatus(message: string): void {
  if (statusEl) statusEl.textContent = message;
}

function stopCurrentStream(): void {
  if (currentStream) {
    currentStream.getTracks().forEach((t) => t.stop());
    currentStream = null;
  }
  if (videoEl) videoEl.srcObject = null;
}

async function loadDevices(): Promise<void> {
  if (!deviceSelect || !audioSelect) return;

  setStatus("デバイスを取得中…");

  let devices: MediaDeviceInfo[] = [];
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch (e) {
    console.error(e);
    setStatus("デバイス一覧の取得に失敗しました。");
    return;
  }

  const videoDevices = devices.filter((d) => d.kind === "videoinput");
  const audioDevices = devices.filter((d) => d.kind === "audioinput");

  // ラベルが空の場合は一度メディア許可を取ってから再取得（ラベルが付くことがある）
  const hasVideoLabels = videoDevices.some((d) => d.label && d.label.trim() !== "");
  const hasAudioLabels = audioDevices.some((d) => d.label && d.label.trim() !== "");
  if ((!hasVideoLabels && videoDevices.length > 0) || (!hasAudioLabels && audioDevices.length > 0)) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach((t) => t.stop());
      const again = await navigator.mediaDevices.enumerateDevices();
      const againVideo = again.filter((d) => d.kind === "videoinput");
      const againAudio = again.filter((d) => d.kind === "audioinput");
      if (againVideo.some((d) => d.label && d.label.trim() !== "")) {
        videoDevices.length = 0;
        videoDevices.push(...againVideo);
      }
      if (againAudio.some((d) => d.label && d.label.trim() !== "")) {
        audioDevices.length = 0;
        audioDevices.push(...againAudio);
      }
    } catch {
      // 許可が得られなくても一覧は表示する
    }
  }

  deviceSelect.innerHTML = '<option value="">映像ソースを選択</option>';
  videoDevices.forEach((device, i) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.textContent = device.label && device.label.trim() !== "" ? device.label : `カメラ ${i + 1}`;
    deviceSelect.appendChild(option);
  });

  audioSelect.innerHTML = '<option value="">音声ソースを選択（デフォルト）</option>';
  audioDevices.forEach((device, i) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.textContent = device.label && device.label.trim() !== "" ? device.label : `マイク ${i + 1}`;
    audioSelect.appendChild(option);
  });

  // 前回の起動で選択していたデバイスを復元
  try {
    const savedVideo = localStorage.getItem(STORAGE_KEY_VIDEO);
    const savedAudio = localStorage.getItem(STORAGE_KEY_AUDIO);
    if (savedVideo && videoDevices.some((d) => d.deviceId === savedVideo)) {
      deviceSelect.value = savedVideo;
    }
    if (savedAudio && audioDevices.some((d) => d.deviceId === savedAudio)) {
      audioSelect.value = savedAudio;
    }
  } catch {
    // 復元できなくても続行
  }

  const msg = videoDevices.length === 0 ? "映像デバイスが見つかりません" : "デバイスを選択してください";
  setStatus(msg);

  // 復元した選択でストリームを開始（映像が選ばれていれば）
  if (deviceSelect.value) {
    startStream();
  }
}

function startStream(): void {
  if (!videoEl || !deviceSelect) return;

  const videoDeviceId = deviceSelect.value;
  const audioDeviceId = audioSelect?.value ?? "";

  stopCurrentStream();

  if (!videoDeviceId) {
    setStatus("");
    return;
  }

  setStatus("接続中…");

  // 音声: マイク向けの処理をオフにするとキャプチャカードの音がクリアになる
  const audioConstraints: MediaTrackConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    ...(audioDeviceId ? { deviceId: { exact: audioDeviceId } } : {}),
  };

  const constraints: MediaStreamConstraints = {
    video: {
      deviceId: { exact: videoDeviceId },
      frameRate: { ideal: 60 },
    },
    audio: audioConstraints,
  };

  navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
    currentStream = stream;
    videoEl.srcObject = stream;

    videoEl.onloadedmetadata = () => {
      videoEl.play().then(() => setStatus("再生中")).catch((e) => {
        console.error(e);
        setStatus("再生に失敗しました");
      });
    };
    videoEl.onerror = () => setStatus("映像の読み込みに失敗しました");
  }).catch((e) => {
    console.error(e);
    setStatus("映像の取得に失敗しました。デバイスが使用中か、許可を確認してください。");
  });
}

// ---------- チーム編成（タブ2） ----------
function isValidPokemon(p: unknown): p is Pokemon {
  return (
    p != null &&
    typeof p === "object" &&
    typeof (p as Pokemon).id === "string" &&
    typeof (p as Pokemon).name === "string" &&
    Array.isArray((p as Pokemon).types)
  );
}

function loadTeamFromStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TEAM);
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return;
    // 旧形式（1チームの配列）か新形式（チームの配列）かを判定
    if (parsed.length > 0 && Array.isArray(parsed[0])) {
      teams = (parsed as unknown[][]).map((t) =>
        (Array.isArray(t) ? t : []).filter(isValidPokemon).slice(0, MAX_TEAM_SIZE)
      );
    } else {
      const single = (Array.isArray(parsed) ? parsed : []).filter(isValidPokemon).slice(0, MAX_TEAM_SIZE);
      teams = single.length > 0 ? [single] : [];
    }
  } catch {
    teams = [];
  }
}

function saveTeamToStorage(): void {
  try {
    localStorage.setItem(STORAGE_KEY_TEAM, JSON.stringify(teams));
  } catch {
    // 無視
  }
}

/** localStorage の champions_* を削除し、チームを空にする */
function clearLocalStorageAndResetTeams(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_TEAM);
    localStorage.removeItem(STORAGE_KEY_VIDEO);
    localStorage.removeItem(STORAGE_KEY_AUDIO);
  } catch {
    // 無視
  }
  teams = [];
  renderTeamList();
}

function renderTeamList(): void {
  const listEl = document.getElementById("team-list");
  if (!listEl) return;
  listEl.innerHTML = "";
  teams.forEach((team, teamIndex) => {
    const card = document.createElement("li");
    card.className = "team-card";
    card.dataset.teamIndex = String(teamIndex);
    const grid = document.createElement("div");
    grid.className = "team-grid";
    for (let i = 0; i < 6; i++) {
      const slot = document.createElement("div");
      slot.className = "team-slot";
      const pokemon = team[i];
      if (pokemon) {
        const img = document.createElement("img");
        img.alt = pokemon.name;
        img.className = "team-slot-img";
        img.onerror = () => { img.src = DUMMY_POKEMON_IMAGE; };
        img.src = DUMMY_POKEMON_IMAGE;
        const teamPicSrc = getPokemonImageSrc(pokemon);
        if (teamPicSrc !== DUMMY_POKEMON_IMAGE) img.src = teamPicSrc;
        const name = document.createElement("span");
        name.className = "team-slot-name";
        name.textContent = pokemon.name;
        slot.appendChild(img);
        slot.appendChild(name);
      } else {
        const img = document.createElement("img");
        img.src = BALL_MONSTER_IMAGE;
        img.alt = "";
        img.className = "team-slot-img team-slot-img--empty";
        img.onerror = () => { img.src = "img/ball_monster.svg"; };
        const name = document.createElement("span");
        name.className = "team-slot-name team-slot-name--empty";
        name.textContent = "（空）";
        slot.appendChild(img);
        slot.appendChild(name);
      }
      grid.appendChild(slot);
    }
    card.appendChild(grid);
    if (isEditMode) {
      const actions = document.createElement("div");
      actions.className = "team-card-actions";
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "team-delete-btn";
      deleteBtn.textContent = "削除";
      deleteBtn.dataset.teamIndex = String(teamIndex);
      deleteBtn.setAttribute("aria-label", "このチームを削除");
      actions.appendChild(deleteBtn);
      card.appendChild(actions);
    }
    listEl.appendChild(card);
  });
}

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function getCurrentEditingTeam(): Pokemon[] {
  return editingTeam;
}

/** ダイアログ内の「選んだチーム」プレビューを描画 */
function renderPickerTeamPreview(): void {
  const wrap = document.getElementById("pokemon-picker-team-preview");
  if (!wrap) return;
  const team = getCurrentEditingTeam();
  wrap.innerHTML = "";
  for (let i = 0; i < 6; i++) {
    const slot = document.createElement("div");
    slot.className = "pokemon-picker-team-slot";
    const pokemon = team[i];
    if (pokemon) {
      slot.dataset.slotIndex = String(i);
      const img = document.createElement("img");
      img.alt = pokemon.name;
      img.className = "pokemon-picker-team-slot-img";
      img.onerror = () => { img.src = DUMMY_POKEMON_IMAGE; };
      img.src = DUMMY_POKEMON_IMAGE;
      const previewPicSrc = getPokemonImageSrc(pokemon);
      if (previewPicSrc !== DUMMY_POKEMON_IMAGE) img.src = previewPicSrc;
      const name = document.createElement("span");
      name.className = "pokemon-picker-team-slot-name";
      name.textContent = pokemon.name;
      slot.appendChild(img);
      slot.appendChild(name);
    } else {
      slot.classList.add("pokemon-picker-team-slot--empty");
      const img = document.createElement("img");
      img.src = BALL_MONSTER_IMAGE;
      img.alt = "";
      img.className = "pokemon-picker-team-slot-img";
      img.onerror = () => { img.src = "img/ball_monster.svg"; };
      slot.appendChild(img);
    }
    wrap.appendChild(slot);
  }
}

/** ダイアログ内のポケモン一覧のボタン有効/無効を更新 */
function updatePickerListButtons(): void {
  const team = getCurrentEditingTeam();
  const isFull = team.length >= MAX_TEAM_SIZE;
  document.querySelectorAll(".pokemon-picker-btn").forEach((b) => {
    (b as HTMLButtonElement).disabled = isFull;
  });
}

/** タイプ絞り込み後のポケモン一覧を返す */
function getFilteredPokemonList(): Pokemon[] {
  if (!pickerTypeFilter || pickerTypeFilter === "すべて") return demoPokemon;
  return demoPokemon.filter((p) => p.types.includes(pickerTypeFilter!));
}

/** 全ポケモンからユニークなタイプ一覧を取得（ソート済み） */
function getUniqueTypes(): string[] {
  const set = new Set<string>();
  demoPokemon.forEach((p) => p.types.forEach((t) => set.add(t)));
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
}

/** ダイアログ内のタイプボタンを描画 */
function renderPickerTypeButtons(): void {
  const wrap = document.getElementById("pokemon-picker-type-buttons");
  if (!wrap) return;
  wrap.innerHTML = "";
  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "picker-type-btn" + (!pickerTypeFilter || pickerTypeFilter === "すべて" ? " is-active" : "");
  allBtn.textContent = "すべて";
  allBtn.dataset.typeFilter = "すべて";
  allBtn.addEventListener("click", () => {
    pickerTypeFilter = null;
    renderPickerTypeButtons();
    renderPickerList();
  });
  wrap.appendChild(allBtn);
  getUniqueTypes().forEach((typeName) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "picker-type-btn" + (pickerTypeFilter === typeName ? " is-active" : "");
    btn.innerHTML = `<img class="type-btn-img" src="img/type/${typeName}.png" alt="${typeName}" />`;
    btn.dataset.typeFilter = typeName;
    btn.addEventListener("click", () => {
      pickerTypeFilter = typeName;
      renderPickerTypeButtons();
      renderPickerList();
    });
    wrap.appendChild(btn);
  });
}

/** ピッカー一覧用の画像パス（id に統一。id がなければ ball_monster、読み込み失敗時は onerror で差し替え） */
function getPickerPokemonImageSrc(pokemon: Pokemon): string {
  return pokemon.id ? `img/pokemon3/${pokemon.id}.png` : BALL_MONSTER_IMAGE;
}

/** ダイアログ内のポケモン一覧のみ再描画（タイプ絞り込み反映） */
function renderPickerList(): void {
  const listEl = document.getElementById("pokemon-picker-list");
  if (!listEl) return;
  listEl.innerHTML = "";
  const filtered = getFilteredPokemonList();
  const team = getCurrentEditingTeam();
  const isFull = team.length >= MAX_TEAM_SIZE;
  filtered.forEach((pokemon) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pokemon-picker-btn";
    btn.dataset.pokemonId = pokemon.id;
    const img = document.createElement("img");
    img.className = "pokemon-picker-btn-img";
    img.alt = pokemon.name;
    img.onerror = () => {
      img.src = BALL_MONSTER_IMAGE;
    };
    // 一度フォールバックを表示してから正しい src を設定（存在しないファイルで別ポケモン画像が残るのを防ぐ）
    img.src = BALL_MONSTER_IMAGE;
    const picSrc = getPickerPokemonImageSrc(pokemon);
    if (picSrc !== BALL_MONSTER_IMAGE) {
      img.src = picSrc;
    }
    const nameEl = document.createElement("span");
    nameEl.className = "pokemon-picker-btn-name";
    nameEl.textContent = pokemon.name;
    btn.appendChild(img);
    btn.appendChild(nameEl);
    if (isFull) btn.disabled = true;
    li.appendChild(btn);
    listEl.appendChild(li);
  });
  updatePickerListButtons();
}

function openPokemonPicker(): void {
  const modal = document.getElementById("pokemon-picker-modal");
  const listEl = document.getElementById("pokemon-picker-list");
  if (!modal || !listEl) return;
  pickerTypeFilter = null;
  listEl.innerHTML = "";
  renderPickerTeamPreview();
  renderPickerTypeButtons();
  if (demoPokemon.length === 0) {
    const li = document.createElement("li");
    li.textContent = "読み込み中…";
    li.style.color = "rgba(255,255,255,0.6)";
    li.style.padding = "1rem";
    listEl.appendChild(li);
    modal.hidden = false;
    return;
  }
  renderPickerList();
  modal.hidden = false;
}

/** ダイアログ内でチームのスロットをクリックして解除 */
function removeFromTeamInPicker(slotIndex: number): void {
  if (slotIndex < 0 || slotIndex >= editingTeam.length) return;
  editingTeam.splice(slotIndex, 1);
  renderPickerTeamPreview();
  updatePickerListButtons();
}

function closePokemonPicker(): void {
  const modal = document.getElementById("pokemon-picker-modal");
  if (modal) modal.hidden = true;
  editingTeam = [];
  editingTeamIndex = -1;
}

/** チーム作成をキャンセル（編集中チームを破棄してモーダルを閉じる） */
function cancelTeamCreation(): void {
  editingTeam = [];
  closePokemonPicker();
}

/** ダイアログの作成ボタン押下：編集中チームを teams に追加してモーダルを閉じる */
function confirmTeamCreation(): void {
  teams.push([...editingTeam]);
  saveTeamToStorage();
  renderTeamList();
  editingTeam = [];
  closePokemonPicker();
}

function openDeleteConfirmModal(teamIndex: number): void {
  deleteTargetTeamIndex = teamIndex;
  const modal = document.getElementById("team-delete-confirm-modal");
  if (modal) modal.hidden = false;
}

function closeDeleteConfirmModal(): void {
  deleteTargetTeamIndex = -1;
  const modal = document.getElementById("team-delete-confirm-modal");
  if (modal) modal.hidden = true;
}

function confirmDeleteTeam(): void {
  if (deleteTargetTeamIndex >= 0 && deleteTargetTeamIndex < teams.length) {
    teams.splice(deleteTargetTeamIndex, 1);
    saveTeamToStorage();
    renderTeamList();
  }
  closeDeleteConfirmModal();
  isEditMode = false;
  renderTeamList();
}

function addPokemonToTeam(pokemon: Pokemon): void {
  if (editingTeam.length >= MAX_TEAM_SIZE) return;
  editingTeam.push(pokemon);
  renderPickerTeamPreview();
  updatePickerListButtons();
}

// ---------- タブ1: ダメージ計算 ----------

function renderTab1DamageDisplay(): void {
  const defenderImg = document.getElementById("damage-defender-img") as HTMLImageElement | null;
  const attackerImg = document.getElementById("damage-attacker-img") as HTMLImageElement | null;
  const defenderName = document.getElementById("damage-defender-name");
  const defenderTypes = document.getElementById("damage-defender-types");
  const attackerName = document.getElementById("damage-attacker-name");
  const attackerTypes = document.getElementById("damage-attacker-types");

  if (defenderImg) {
    if (defendPokemon) {
      defenderImg.src = BALL_MONSTER_IMAGE;
      const src = getPokemonImageSrc(defendPokemon);
      if (src !== DUMMY_POKEMON_IMAGE) defenderImg.src = src;
      defenderImg.alt = defendPokemon.name;
      defenderImg.onerror = () => { defenderImg.src = BALL_MONSTER_IMAGE; };
      if (defenderName) defenderName.textContent = defendPokemon.name;
      if (defenderTypes) defenderTypes.innerHTML = typeBadgesHtml(defendPokemon.types);
    } else {
      defenderImg.src = BALL_MONSTER_IMAGE;
      defenderImg.alt = "";
      if (defenderName) defenderName.textContent = "";
      if (defenderTypes) defenderTypes.innerHTML = "";
    }
  }
  if (attackerImg) {
    if (attackPokemon) {
      attackerImg.src = BALL_MONSTER_IMAGE;
      const src = getPokemonImageSrc(attackPokemon);
      if (src !== DUMMY_POKEMON_IMAGE) attackerImg.src = src;
      attackerImg.alt = attackPokemon.name;
      attackerImg.onerror = () => { attackerImg.src = BALL_MONSTER_IMAGE; };
      if (attackerName) attackerName.textContent = attackPokemon.name;
      if (attackerTypes) attackerTypes.innerHTML = typeBadgesHtml(attackPokemon.types);
    } else {
      attackerImg.src = BALL_MONSTER_IMAGE;
      attackerImg.alt = "";
      if (attackerName) attackerName.textContent = "";
      if (attackerTypes) attackerTypes.innerHTML = "";
    }
  }
  const defenderStatsBlock = document.getElementById("damage-slot-stats-defender");
  const attackerStatsBlock = document.getElementById("damage-slot-stats-attacker");
  if (defenderStatsBlock) {
    defenderStatsBlock.querySelectorAll("input, select, button").forEach((el) => {
      (el as HTMLInputElement).disabled = !defendPokemon;
    });
  }
  if (attackerStatsBlock) {
    attackerStatsBlock.querySelectorAll("input, select, button").forEach((el) => {
      (el as HTMLInputElement).disabled = !attackPokemon;
    });
  }

  updateStatsRealValues();
  updateRankDisplays();

  renderTab1MovesArea();
}

function syncStatsInputsFromState(): void {
  const defEv = document.getElementById("stats-def-ev") as HTMLInputElement | null;
  const defNat = document.getElementById("stats-def-nature") as HTMLSelectElement | null;
  const spDefEv = document.getElementById("stats-spdef-ev") as HTMLInputElement | null;
  const spDefNat = document.getElementById("stats-spdef-nature") as HTMLSelectElement | null;
  const atkEv = document.getElementById("stats-atk-ev") as HTMLInputElement | null;
  const atkNat = document.getElementById("stats-atk-nature") as HTMLSelectElement | null;
  const spatkEv = document.getElementById("stats-spatk-ev") as HTMLInputElement | null;
  const spatkNat = document.getElementById("stats-spatk-nature") as HTMLSelectElement | null;
  if (defEv) defEv.value = String(defenderDefEV);
  if (defNat) defNat.value = String(defenderDefNature);
  if (spDefEv) spDefEv.value = String(defenderSpDefEV);
  if (spDefNat) spDefNat.value = String(defenderSpDefNature);
  if (atkEv) atkEv.value = String(attackerAtkEV);
  if (atkNat) atkNat.value = String(attackerAtkNature);
  if (spatkEv) spatkEv.value = String(attackerSpAtkEV);
  if (spatkNat) spatkNat.value = String(attackerSpAtkNature);
  updateStatsRealValues();
}

function updateStatsRealValues(): void {
  const defEv = document.getElementById("stats-def-ev") as HTMLInputElement | null;
  const defNat = document.getElementById("stats-def-nature") as HTMLSelectElement | null;
  const spDefEv = document.getElementById("stats-spdef-ev") as HTMLInputElement | null;
  const spDefNat = document.getElementById("stats-spdef-nature") as HTMLSelectElement | null;
  const atkEv = document.getElementById("stats-atk-ev") as HTMLInputElement | null;
  const atkNat = document.getElementById("stats-atk-nature") as HTMLSelectElement | null;
  const spatkEv = document.getElementById("stats-spatk-ev") as HTMLInputElement | null;
  const spatkNat = document.getElementById("stats-spatk-nature") as HTMLSelectElement | null;
  const defReal = document.getElementById("stats-def-real");
  const spDefReal = document.getElementById("stats-spdef-real");
  const atkReal = document.getElementById("stats-atk-real");
  const spatkReal = document.getElementById("stats-spatk-real");

  if (defendPokemon && defReal && defEv && defNat) {
    const base = getBaseStats(defendPokemon);
    const real = calcStatWithEV(base.defense, clampEv(Number(defEv.value) || 0), clampNature(Number(defNat.value) || 1));
    defReal.textContent = String(real);
  } else if (defReal) defReal.textContent = "—";

  if (defendPokemon && spDefReal && spDefEv && spDefNat) {
    const base = getBaseStats(defendPokemon);
    const real = calcStatWithEV(base.spDefense, clampEv(Number(spDefEv.value) || 0), clampNature(Number(spDefNat.value) || 1));
    spDefReal.textContent = String(real);
  } else if (spDefReal) spDefReal.textContent = "—";

  if (attackPokemon && atkReal && atkEv && atkNat) {
    const base = getBaseStats(attackPokemon);
    const real = calcStatWithEV(base.attack, clampEv(Number(atkEv.value) || 0), clampNature(Number(atkNat.value) || 1));
    atkReal.textContent = String(real);
  } else if (atkReal) atkReal.textContent = "—";

  if (attackPokemon && spatkReal && spatkEv && spatkNat) {
    const base = getBaseStats(attackPokemon);
    const real = calcStatWithEV(base.spAttack, clampEv(Number(spatkEv.value) || 0), clampNature(Number(spatkNat.value) || 1));
    spatkReal.textContent = String(real);
  } else if (spatkReal) spatkReal.textContent = "—";
}

function readStatsInputsToState(): void {
  const defEv = document.getElementById("stats-def-ev") as HTMLInputElement | null;
  const defNat = document.getElementById("stats-def-nature") as HTMLSelectElement | null;
  const spDefEv = document.getElementById("stats-spdef-ev") as HTMLInputElement | null;
  const spDefNat = document.getElementById("stats-spdef-nature") as HTMLSelectElement | null;
  const atkEv = document.getElementById("stats-atk-ev") as HTMLInputElement | null;
  const atkNat = document.getElementById("stats-atk-nature") as HTMLSelectElement | null;
  const spatkEv = document.getElementById("stats-spatk-ev") as HTMLInputElement | null;
  const spatkNat = document.getElementById("stats-spatk-nature") as HTMLSelectElement | null;
  defenderDefEV = clampEv(Number(defEv?.value) || 0);
  defenderDefNature = clampNature(Number(defNat?.value) || 1);
  defenderSpDefEV = clampEv(Number(spDefEv?.value) || 0);
  defenderSpDefNature = clampNature(Number(spDefNat?.value) || 1);
  attackerAtkEV = clampEv(Number(atkEv?.value) || 0);
  attackerAtkNature = clampNature(Number(atkNat?.value) || 1);
  attackerSpAtkEV = clampEv(Number(spatkEv?.value) || 0);
  attackerSpAtkNature = clampNature(Number(spatkNat?.value) || 1);
}

/** 努力値のステップ値（4,12,20,...244,252 および 0） */
const EV_STEPS = [0, 4, 12, 20, 28, 36, 44, 52, 60, 68, 76, 84, 92, 100, 108, 116, 124, 132, 140, 148, 156, 164, 172, 180, 188, 196, 204, 212, 220, 228, 236, 244, 252];

function clampEv(v: number): number {
  return Math.max(0, Math.min(255, Math.floor(v)));
}

function getClosestEvStep(v: number): number {
  let closest = EV_STEPS[0];
  let minDist = Math.abs(v - closest);
  for (const s of EV_STEPS) {
    const d = Math.abs(v - s);
    if (d < minDist) {
      minDist = d;
      closest = s;
    }
  }
  return closest;
}

function getNextEvStep(v: number): number {
  const idx = EV_STEPS.indexOf(getClosestEvStep(v));
  if (idx < 0) return EV_STEPS[0];
  if (idx >= EV_STEPS.length - 1) return EV_STEPS[EV_STEPS.length - 1];
  return EV_STEPS[idx + 1];
}

function getPrevEvStep(v: number): number {
  const idx = EV_STEPS.indexOf(getClosestEvStep(v));
  if (idx <= 0) return EV_STEPS[0];
  return EV_STEPS[idx - 1];
}

function clampNature(v: number): number {
  return v === 0.9 || v === 1.1 ? v : 1.0;
}

/** 能力ランク(-6〜+6)の倍率を返す */
function rankMult(rank: number): number {
  const n = Math.max(-6, Math.min(6, rank));
  return n >= 0 ? (2 + n) / 2 : 2 / (2 - n);
}

/** ランク表示を更新 */
function updateRankDisplays(): void {
  const atkVal = document.getElementById("atk-rank-value");
  const spatkVal = document.getElementById("spatk-rank-value");
  const defVal = document.getElementById("def-rank-value");
  const spdefVal = document.getElementById("spdef-rank-value");
  if (atkVal) atkVal.textContent = String(attackerAtkRank);
  if (spatkVal) spatkVal.textContent = String(attackerSpAtkRank);
  if (defVal) defVal.textContent = String(defenderDefRank);
  if (spdefVal) spdefVal.textContent = String(defenderSpDefRank);
}

function applyStatsFromInputsAndRecalc(): void {
  readStatsInputsToState();
  renderTab1DamageDisplay();
}

function getTab1FilteredPokemonList(): Pokemon[] {
  if (!tab1SelectTypeFilter || tab1SelectTypeFilter === "すべて") return demoPokemon;
  return demoPokemon.filter((p) => p.types.includes(tab1SelectTypeFilter!));
}

function getTab1UniqueTypes(): string[] {
  const set = new Set<string>();
  demoPokemon.forEach((p) => p.types.forEach((t) => set.add(t)));
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
}

function renderTab1SelectTypeButtons(): void {
  const wrap = document.getElementById("tab1-pokemon-select-type-buttons");
  if (!wrap) return;
  wrap.innerHTML = "";
  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "picker-type-btn" + (!tab1SelectTypeFilter || tab1SelectTypeFilter === "すべて" ? " is-active" : "");
  allBtn.textContent = "すべて";
  allBtn.dataset.typeFilter = "すべて";
  allBtn.addEventListener("click", () => {
    tab1SelectTypeFilter = null;
    renderTab1SelectTypeButtons();
    renderTab1SelectList();
  });
  wrap.appendChild(allBtn);
  getTab1UniqueTypes().forEach((typeName) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "picker-type-btn" + (tab1SelectTypeFilter === typeName ? " is-active" : "");
    btn.innerHTML = `<img class="type-btn-img" src="img/type/${typeName}.png" alt="${typeName}" />`;
    btn.dataset.typeFilter = typeName;
    btn.addEventListener("click", () => {
      tab1SelectTypeFilter = typeName;
      renderTab1SelectTypeButtons();
      renderTab1SelectList();
    });
    wrap.appendChild(btn);
  });
}

function renderTab1SelectList(): void {
  const listEl = document.getElementById("tab1-pokemon-select-list");
  if (!listEl) return;
  listEl.innerHTML = "";
  const filtered = getTab1FilteredPokemonList();
  filtered.forEach((pokemon) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pokemon-picker-btn";
    btn.dataset.pokemonId = pokemon.id;
    const img = document.createElement("img");
    img.className = "pokemon-picker-btn-img";
    img.alt = pokemon.name;
    img.onerror = () => { img.src = BALL_MONSTER_IMAGE; };
    img.src = BALL_MONSTER_IMAGE;
    const picSrc = getPickerPokemonImageSrc(pokemon);
    if (picSrc !== BALL_MONSTER_IMAGE) img.src = picSrc;
    const nameEl = document.createElement("span");
    nameEl.className = "pokemon-picker-btn-name";
    nameEl.textContent = pokemon.name;
    btn.appendChild(img);
    btn.appendChild(nameEl);
    li.appendChild(btn);
    listEl.appendChild(li);
  });
}

function openTab1PokemonSelect(target: "attack" | "defend" | "box"): void {
  tab1SelectTarget = target;
  tab1SelectTypeFilter = null;
  const modal = document.getElementById("tab1-pokemon-select-modal");
  const titleEl = document.getElementById("tab1-pokemon-select-title");
  if (titleEl) {
    if (target === "attack") titleEl.textContent = "攻撃側のポケモンを選択";
    else if (target === "defend") titleEl.textContent = "防御側のポケモンを選択";
    else titleEl.textContent = "BOXに追加するポケモンを選択";
  }
  renderTab1SelectTypeButtons();
  if (demoPokemon.length === 0) {
    const listEl = document.getElementById("tab1-pokemon-select-list");
    if (listEl) {
      listEl.innerHTML = "<li style='color:rgba(255,255,255,0.6);padding:1rem'>読み込み中…</li>";
    }
  } else {
    renderTab1SelectList();
  }
  if (modal) modal.hidden = false;
}

function closeTab1PokemonSelect(): void {
  tab1SelectTarget = null;
  const modal = document.getElementById("tab1-pokemon-select-modal");
  if (modal) modal.hidden = true;
}

function onTab1PokemonSelected(pokemon: Pokemon): void {
  if (tab1SelectTarget === "attack") {
    attackPokemon = pokemon;
    selectedMoves = getDefaultMoves(pokemon);
    editingMoveSlotIndex = null;
    attackerAtkEV = 0;
    attackerAtkNature = 1.0;
    attackerSpAtkEV = 0;
    attackerSpAtkNature = 1.0;
    attackerAtkRank = 0;
    attackerSpAtkRank = 0;
  } else if (tab1SelectTarget === "defend") {
    defendPokemon = pokemon;
    defenderDefEV = 0;
    defenderDefNature = 1.0;
    defenderSpDefEV = 0;
    defenderSpDefNature = 1.0;
    defenderDefRank = 0;
    defenderSpDefRank = 0;
  } else if (tab1SelectTarget === "box") {
    closeTab1PokemonSelect();
    openBoxDetailModal(pokemon);
    return;
  }
  syncStatsInputsFromState();
  closeTab1PokemonSelect();
  renderTab1DamageDisplay();
}

/** 攻撃側ポケモンのデフォルト技4つ（②同タイプ・攻撃/特攻で物理/特殊、威力上位4つ） */
function getDefaultMoves(pokemon: Pokemon): number[] {
  const learnset = pokemon.learnset;
  const baseStats = pokemon.baseStats;
  if (!learnset || learnset.length === 0) return [];

  const moveMap = new Map(movesData.map((m) => [m.id, m]));
  const candidateMoves = learnset
    .map((id) => moveMap.get(id))
    .filter((m): m is Move => m != null)
    .filter((m) => m.category !== "変化")
    .filter((m) => m.power != null && m.power > 0);

  if (candidateMoves.length === 0) return [];

  const atk = baseStats?.attack ?? 0;
  const spa = baseStats?.spAttack ?? 0;
  const usePhysical = atk >= spa;
  const targetCategory = usePhysical ? "物理" : "特殊";

  const sameTypeMoves = candidateMoves.filter((m) => pokemon.types.includes(m.type));
  const typedMoves = sameTypeMoves.filter((m) => m.category === targetCategory);

  let pool = typedMoves.length >= 4 ? typedMoves : typedMoves;
  if (pool.length < 4) {
    const fallback = candidateMoves.filter((m) => m.category === targetCategory);
    pool = fallback.length >= 4 ? fallback : candidateMoves;
  }

  const sorted = [...pool].sort((a, b) => (b.power ?? 0) - (a.power ?? 0));
  return sorted.slice(0, 4).map((m) => m.id);
}

/** ポケモンの種族値（未定義時はデフォルト50） */
function getBaseStats(pokemon: Pokemon): {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
} {
  const d = { hp: 50, attack: 50, defense: 50, spAttack: 50, spDefense: 50, speed: 50 };
  const s = pokemon.baseStats;
  if (!s) return d;
  return {
    hp: s.hp ?? d.hp,
    attack: s.attack ?? d.attack,
    defense: s.defense ?? d.defense,
    spAttack: s.spAttack ?? d.spAttack,
    spDefense: s.spDefense ?? d.spDefense,
    speed: s.speed ?? d.speed,
  };
}

function renderTab1MovesSlots(): void {
  const slotsEl = document.getElementById("damage-moves-slots");
  if (!slotsEl || !attackPokemon) return;

  slotsEl.innerHTML = "";
  const moveMap = new Map(movesData.map((m) => [m.id, m]));
  const attackerStats = getBaseStats(attackPokemon);
  const defenderStats = defendPokemon ? getBaseStats(defendPokemon) : null;

  for (let i = 0; i < 4; i++) {
    const moveId = selectedMoves[i];
    const move = moveId != null ? moveMap.get(moveId) : null;

    const slot = document.createElement("div");
    slot.className =
      "damage-move-slot" + (editingMoveSlotIndex === i ? " is-editing" : "");
    slot.dataset.slotIndex = String(i);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "damage-move-slot-btn";
    btn.addEventListener("click", () => {
      editingMoveSlotIndex = editingMoveSlotIndex === i ? null : i;
      renderTab1DamageDisplay();
    });

    if (move) {
      btn.innerHTML = "";
      const header = document.createElement("div");
      header.className = "damage-move-slot-header";
      const powerStr = move.power != null ? String(move.power) : "—";
      header.innerHTML = `<span class="damage-move-slot-name">${escapeHtml(move.name)}</span> <span class="damage-move-slot-meta"><img class="type-img" src="img/type/${escapeHtml(move.type)}.png" alt="${escapeHtml(move.type)}" />・${escapeHtml(move.category)}・威力${powerStr}</span>`;
      btn.appendChild(header);

      let damageResult: DamageResult | null = null;
      if (defendPokemon && defenderStats) {
        const atkOverride = { attack: calcStatWithEV(attackerStats.attack, attackerAtkEV, attackerAtkNature), spAttack: calcStatWithEV(attackerStats.spAttack, attackerSpAtkEV, attackerSpAtkNature) };
        const defOverride = { defense: calcStatWithEV(defenderStats.defense, defenderDefEV, defenderDefNature), spDefense: calcStatWithEV(defenderStats.spDefense, defenderSpDefEV, defenderSpDefNature) };
        damageResult = calculateDamage({
          movePower: move.power,
          moveType: move.type,
          moveCategory: move.category,
          attackerTypes: attackPokemon.types,
          attackerBaseStats: attackerStats,
          defenderTypes: defendPokemon.types,
          defenderBaseStats: defenderStats,
          attackerStatOverride: atkOverride,
          defenderStatOverride: defOverride,
          attackerAtkRank,
          attackerSpAtkRank,
          defenderDefRank,
          defenderSpDefRank,
          weather: currentWeather || undefined,
          terrain: currentTerrain || undefined,
        });
      }

      const body = document.createElement("div");
      body.className = "damage-move-slot-body";
      if (damageResult) {
        if (damageResult.isStatusMove) {
          body.innerHTML = '<span class="damage-move-damage-text">—（変化技）</span>';
        } else if (damageResult.isImmune) {
          body.innerHTML = '<span class="damage-move-damage-text">効果がない</span>';
        } else {
          const dmgStr =
            damageResult.damageMin === damageResult.damageMax
              ? `${damageResult.damageMin}（${damageResult.percentMin.toFixed(1)}%）`
              : `${damageResult.damageMin}〜${damageResult.damageMax}（${damageResult.percentMin.toFixed(1)}〜${damageResult.percentMax.toFixed(1)}%）`;
          body.innerHTML = `<span class="damage-move-damage-text">${dmgStr}</span>`;

          const gaugeWrap = document.createElement("div");
          gaugeWrap.className = "damage-move-gauge-wrap";
          const remainMinPct = (damageResult.remainingHPMin / damageResult.defenderHP) * 100;
          const remainMaxPct = (damageResult.remainingHPMax / damageResult.defenderHP) * 100;
          const colorFor = (pct: number) => (pct > 75 ? "is-red" : pct > 50 ? "is-yellow" : "is-green");
          const colorMin = colorFor(damageResult.percentMin);
          const colorMax = colorFor(damageResult.percentMax);
          gaugeWrap.innerHTML = `
            <div class="damage-move-gauge" role="presentation" aria-label="攻撃後の残りHP目安">
              <div class="damage-move-gauge-fill damage-move-gauge-fill-min ${colorMin}" style="width: ${Math.min(100, remainMaxPct)}%"></div>
              <div class="damage-move-gauge-fill damage-move-gauge-fill-max ${colorMax}" style="width: ${Math.min(100, remainMinPct)}%"></div>
            </div>
            <span class="damage-move-gauge-label">残りHP目安: ${damageResult.remainingHPMin}〜${damageResult.remainingHPMax} / ${damageResult.defenderHP}</span>
          `;
          body.appendChild(gaugeWrap);
        }
      } else {
        body.innerHTML = '<span class="damage-move-damage-text">防御側を選択するとダメージを表示</span>';
      }
      btn.appendChild(body);
    } else {
      btn.textContent = "—（クリックで技を選択）";
    }

    slot.appendChild(btn);
    slotsEl.appendChild(slot);
  }
}

function getTab1MovesUniqueTypes(): string[] {
  if (!attackPokemon?.learnset) return [];
  const moveMap = new Map(movesData.map((m) => [m.id, m]));
  const set = new Set<string>();
  attackPokemon.learnset.forEach((id) => {
    const m = moveMap.get(id);
    if (m && m.category !== "変化") set.add(m.type);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
}

function renderTab1MovesListTypeButtons(): void {
  const wrap = document.getElementById("damage-moves-list-type-buttons");
  if (!wrap || !attackPokemon) return;
  wrap.innerHTML = "";
  getTab1MovesUniqueTypes().forEach((typeName) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "damage-move-type-btn" + (damageMovesTypeFilter === typeName ? " is-active" : "");
    btn.innerHTML = `<img class="type-btn-img" src="img/type/${typeName}.png" alt="${typeName}" />`;
    btn.dataset.typeFilter = typeName;
    btn.addEventListener("click", () => {
      damageMovesTypeFilter = damageMovesTypeFilter === typeName ? null : typeName;
      renderTab1MovesListTypeButtons();
      renderTab1MovesList();
    });
    wrap.appendChild(btn);
  });
}

function renderTab1MovesListCategoryButtons(): void {
  const wrap = document.getElementById("damage-moves-list-category-buttons");
  if (!wrap || !attackPokemon) return;
  wrap.innerHTML = "";
  const options = [
    { label: "すべて", value: null },
    { label: "物理", value: "物理" },
    { label: "特殊", value: "特殊" },
  ];
  options.forEach(({ label, value }) => {
    const isActive = (value === null && !damageMovesCategoryFilter) || (value !== null && damageMovesCategoryFilter === value);
    const btn = document.createElement("button");
    btn.type = "button";
    let cls = "damage-move-category-btn";
    if (value === "物理") cls += " damage-move-category-btn--physical";
    else if (value === "特殊") cls += " damage-move-category-btn--special";
    if (isActive) cls += " is-active";
    btn.className = cls;
    btn.textContent = label;
    btn.addEventListener("click", () => {
      damageMovesCategoryFilter = value;
      renderTab1MovesListCategoryButtons();
      renderTab1MovesList();
    });
    wrap.appendChild(btn);
  });
}

function renderTab1MovesList(): void {
  const listEl = document.getElementById("damage-moves-list");
  const labelEl = document.getElementById("damage-moves-list-label");
  if (!listEl || !attackPokemon) return;

  if (editingMoveSlotIndex !== null && labelEl) {
    labelEl.textContent = `技を選択（スロット${editingMoveSlotIndex + 1}を変更中）`;
  } else if (labelEl) {
    labelEl.textContent = "技一覧（スロットをクリックしてから技を選択）";
  }

  renderTab1MovesListTypeButtons();
  renderTab1MovesListCategoryButtons();

  listEl.innerHTML = "";
  const learnset = attackPokemon.learnset;
  if (!learnset || learnset.length === 0) {
    const p = document.createElement("p");
    p.className = "damage-moves-placeholder";
    p.textContent = "このポケモンには覚える技データがありません";
    listEl.appendChild(p);
    return;
  }

  const moveMap = new Map(movesData.map((m) => [m.id, m]));
  let moves = learnset
    .map((id) => moveMap.get(id))
    .filter((m): m is Move => m != null)
    .filter((m) => m.category !== "変化");

  if (damageMovesTypeFilter) moves = moves.filter((m) => m.type === damageMovesTypeFilter);
  if (damageMovesCategoryFilter) moves = moves.filter((m) => m.category === damageMovesCategoryFilter);
  const searchText = (document.getElementById("damage-moves-search") as HTMLInputElement | null)?.value.trim() ?? "";
  if (searchText) moves = moves.filter((m) => m.name.includes(searchText));

  moves.forEach((move) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "damage-move-btn";
    const powerStr = move.power != null ? String(move.power) : "—";
    btn.innerHTML = `<img class="type-img" src="img/type/${escapeHtml(move.type)}.png" alt="${escapeHtml(move.type)}" /> ${escapeHtml(move.name)}（${escapeHtml(move.category)}・威力${powerStr}）`;
    btn.dataset.moveId = String(move.id);
    btn.addEventListener("click", () => {
      if (editingMoveSlotIndex !== null) {
        selectedMoves[editingMoveSlotIndex] = move.id;
        editingMoveSlotIndex = null;
      }
      renderTab1DamageDisplay();
    });
    listEl.appendChild(btn);
  });
}

function renderTab1MovesArea(): void {
  const area = document.getElementById("damage-moves-area");
  const placeholder = area?.querySelector(".damage-moves-placeholder");
  const slotsWrap = document.getElementById("damage-moves-slots-wrap");
  const listWrap = document.getElementById("damage-moves-list-wrap");
  const listEl = document.getElementById("damage-moves-list");
  if (!area || !listEl) return;

  if (!attackPokemon) {
    area.classList.add("damage-moves-area--disabled");
    area.setAttribute("aria-disabled", "true");
    if (placeholder) (placeholder as HTMLElement).hidden = false;
    if (slotsWrap) slotsWrap.hidden = true;
    if (listWrap) listWrap.hidden = true;
    return;
  }

  area.classList.remove("damage-moves-area--disabled");
  area.setAttribute("aria-disabled", "false");
  if (placeholder) (placeholder as HTMLElement).hidden = true;
  if (slotsWrap) slotsWrap.hidden = false;
  /* 技一覧は選択済み技4つのうちいずれかがアクティブ（編集中）のときのみ表示 */
  const showMoveList = editingMoveSlotIndex !== null;
  if (listWrap) {
    listWrap.hidden = !showMoveList;
    listWrap.classList.toggle("is-editing", showMoveList);
  }

  renderTab1MovesSlots();
  if (showMoveList) {
    renderTab1MovesList();
  } else if (listEl) {
    listEl.innerHTML = "";
    document.getElementById("damage-moves-list-type-buttons")?.replaceChildren();
    document.getElementById("damage-moves-list-category-buttons")?.replaceChildren();
  }
}

function initTabs(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>(".tab-btn");
  const panels = document.querySelectorAll<HTMLElement>(".tab-panel");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabId = btn.getAttribute("data-tab");
      if (!tabId) return;

      buttons.forEach((b) => b.classList.remove("is-active"));
      panels.forEach((p) => {
        const isTarget = p.id === tabId;
        p.classList.toggle("is-active", isTarget);
        p.hidden = !isTarget;
      });
      btn.classList.add("is-active");
      if (tabId === "tab3") renderTab3();
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initTabs();

  // チーム編成（タブ2）
  const teamCreateBtn = document.getElementById("team-create-btn");
  const teamEditBtn = document.getElementById("team-edit-btn");
  const teamListEl = document.getElementById("team-list");
  const pokemonPickerModal = document.getElementById("pokemon-picker-modal");
  const pokemonPickerList = document.getElementById("pokemon-picker-list");
  const pokemonPickerConfirm = document.getElementById("pokemon-picker-confirm");
  const pokemonPickerCancel = document.getElementById("pokemon-picker-cancel");
  const teamDeleteConfirmModal = document.getElementById("team-delete-confirm-modal");
  const teamDeleteConfirmOk = document.getElementById("team-delete-confirm-ok");
  const teamDeleteConfirmCancel = document.getElementById("team-delete-confirm-cancel");
  loadTeamFromStorage();
  loadBoxFromStorage();
  renderTeamList();
  renderTab1DamageDisplay();

  fetch("data/moves.json")
    .then((res) => (res.ok ? res.json() : []))
    .then((data: Move[]) => {
      movesData = Array.isArray(data) ? data : [];
      renderTab1DamageDisplay();
    })
    .catch(() => {
      movesData = [];
      renderTab1DamageDisplay();
    });

  document.getElementById("damage-defender-select")?.addEventListener("click", () => openTab1PokemonSelect("defend"));
  document.getElementById("damage-attacker-select")?.addEventListener("click", () => openTab1PokemonSelect("attack"));
  // インラインステータス: EVボタン・ステップボタンの委譲処理
  const damagePanel = document.querySelector(".damage-panel");
  damagePanel?.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest("button");
    if (!target) return;
    const inputId = target.dataset.evInput;
    if (inputId) {
      const input = document.getElementById(inputId) as HTMLInputElement | null;
      if (!input) return;
      const val = clampEv(Number(input.value) || 0);
      if (target.classList.contains("damage-ev-btn-0")) {
        input.value = "0";
      } else if (target.classList.contains("damage-ev-btn-252")) {
        input.value = "252";
      } else if (target.classList.contains("damage-ev-step-up")) {
        input.value = String(getNextEvStep(val));
      } else if (target.classList.contains("damage-ev-step-down")) {
        input.value = String(getPrevEvStep(val));
      } else {
        return;
      }
      e.preventDefault();
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    // ランクボタン
    const rankUp = target.classList.contains("rank-btn-up");
    const rankDown = target.classList.contains("rank-btn-down");
    if (!rankUp && !rankDown) return;
    const delta = rankUp ? 1 : -1;
    const id = target.id;
    if (id === "atk-rank-up" || id === "atk-rank-down") attackerAtkRank = Math.max(-6, Math.min(6, attackerAtkRank + delta));
    else if (id === "spatk-rank-up" || id === "spatk-rank-down") attackerSpAtkRank = Math.max(-6, Math.min(6, attackerSpAtkRank + delta));
    else if (id === "def-rank-up" || id === "def-rank-down") defenderDefRank = Math.max(-6, Math.min(6, defenderDefRank + delta));
    else if (id === "spdef-rank-up" || id === "spdef-rank-down") defenderSpDefRank = Math.max(-6, Math.min(6, defenderSpDefRank + delta));
    updateRankDisplays();
    readStatsInputsToState();
    renderTab1MovesSlots();
  });

  // インラインEV/性格 変更時に自動再計算
  damagePanel?.addEventListener("input", (e) => {
    const el = e.target as HTMLElement;
    if (el.classList.contains("damage-ev-input")) {
      const inp = el as HTMLInputElement;
      let v = Number(inp.value);
      if (Number.isNaN(v) || v < 0) v = 0;
      if (v > 255) v = 255;
      inp.value = String(Math.floor(v));
      readStatsInputsToState();
      updateStatsRealValues();
      renderTab1MovesSlots();
    }
  });
  damagePanel?.addEventListener("change", (e) => {
    const el = e.target as HTMLElement;
    if (el.matches("select[id^='stats-']")) {
      readStatsInputsToState();
      updateStatsRealValues();
      renderTab1MovesSlots();
    }
  });
  // 天候・フィールドの変更
  document.getElementById("damage-weather-select")?.addEventListener("change", (e) => {
    currentWeather = (e.target as HTMLSelectElement).value;
    renderTab1MovesSlots();
  });
  document.getElementById("damage-terrain-select")?.addEventListener("change", (e) => {
    currentTerrain = (e.target as HTMLSelectElement).value;
    renderTab1MovesSlots();
  });
  // タブ3: BOX
  document.getElementById("box-create-btn")?.addEventListener("click", openBoxCreate);
  document.getElementById("box-detail-cancel")?.addEventListener("click", closeBoxDetailModal);
  document.getElementById("box-detail-backdrop")?.addEventListener("click", closeBoxDetailModal);
  document.getElementById("box-detail-save")?.addEventListener("click", saveBoxEntry);
  // 持ち物ピッカー
  document.getElementById("box-detail-item-select-btn")?.addEventListener("click", () => {
    const picker = document.getElementById("box-item-picker");
    if (!picker) return;
    const isHidden = picker.hidden;
    picker.hidden = !isHidden;
    if (isHidden) renderBoxItemPicker();
  });
  document.getElementById("box-detail-item-clear-btn")?.addEventListener("click", () => {
    boxSelectedItem = null;
    renderBoxItemSelected();
  });
  document.getElementById("box-item-search")?.addEventListener("input", (e) => {
    boxItemSearchText = (e.target as HTMLInputElement).value;
    renderBoxItemPicker();
  });
  // 詳細確認モード: 編集ボタン・閉じるボタン
  document.getElementById("box-detail-edit-btn")?.addEventListener("click", switchToBoxEditMode);
  document.getElementById("box-detail-view-close")?.addEventListener("click", closeBoxDetailModal);
  // 技検索（タブ③）
  document.getElementById("box-moves-search")?.addEventListener("input", (e) => {
    boxMoveSearchText = (e.target as HTMLInputElement).value;
    renderBoxMoveList();
  });
  // 技検索（タブ①）
  document.getElementById("damage-moves-search")?.addEventListener("input", () => {
    renderTab1MovesList();
  });
  // BOX詳細モーダル内のEVボタン委譲
  document.getElementById("box-detail-modal")?.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
    if (!target) return;
    const inputId = target.dataset.evInput;
    if (!inputId) return;
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    if (!input) return;
    const val = clampEv(Number(input.value) || 0);
    if (target.classList.contains("damage-ev-btn-0")) input.value = "0";
    else if (target.classList.contains("damage-ev-btn-252")) input.value = "252";
    else if (target.classList.contains("damage-ev-step-up")) input.value = String(getNextEvStep(val));
    else if (target.classList.contains("damage-ev-step-down")) input.value = String(getPrevEvStep(val));
  });
  document.getElementById("tab1-pokemon-select-list")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest(".pokemon-picker-btn");
    if (!btn) return;
    const id = (btn as HTMLElement).dataset.pokemonId;
    const pokemon = demoPokemon.find((p) => p.id === id);
    if (pokemon) onTab1PokemonSelected(pokemon);
  });
  document.getElementById("tab1-pokemon-select-cancel")?.addEventListener("click", closeTab1PokemonSelect);
  document.getElementById("tab1-pokemon-select-modal")?.querySelector(".pokemon-modal-backdrop")?.addEventListener("click", closeTab1PokemonSelect);

  Promise.all(
    POKEMON_REGION_FILES.map((file) =>
      fetch(file)
        .then((res) => (res.ok ? res.json() : []))
        .then((data: Pokemon[]) => (Array.isArray(data) ? data : []))
        .catch(() => [] as Pokemon[])
    )
  ).then((arrays) => {
    demoPokemon = arrays.flat();
    if (tab1SelectTarget) {
      renderTab1SelectList();
    }
  });
  teamCreateBtn?.addEventListener("click", () => {
    editingTeam = [];
    openPokemonPicker();
  });
  teamEditBtn?.addEventListener("click", () => {
    isEditMode = !isEditMode;
    renderTeamList();
  });
  const teamResetStorageBtn = document.getElementById("team-reset-storage-btn");
  teamResetStorageBtn?.addEventListener("click", () => {
    if (!confirm("保存したチームとデバイス選択をすべて削除して初期化します。よろしいですか？")) return;
    clearLocalStorageAndResetTeams();
  });
  teamListEl?.addEventListener("click", (e) => {
    const deleteBtn = (e.target as HTMLElement).closest(".team-delete-btn");
    if (!deleteBtn) return;
    const index = parseInt((deleteBtn as HTMLElement).dataset.teamIndex ?? "", 10);
    if (!Number.isNaN(index)) openDeleteConfirmModal(index);
  });
  pokemonPickerConfirm?.addEventListener("click", () => confirmTeamCreation());
  pokemonPickerCancel?.addEventListener("click", () => cancelTeamCreation());
  pokemonPickerModal?.querySelector(".pokemon-modal-backdrop")?.addEventListener("click", () => cancelTeamCreation());
  pokemonPickerList?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest(".pokemon-picker-btn");
    if (!btn || (btn as HTMLButtonElement).disabled) return;
    const id = (btn as HTMLElement).dataset.pokemonId;
    const pokemon = demoPokemon.find((p) => p.id === id);
    if (pokemon) addPokemonToTeam(pokemon);
  });
  document.getElementById("pokemon-picker-team-preview")?.addEventListener("click", (e) => {
    const slot = (e.target as HTMLElement).closest(".pokemon-picker-team-slot");
    if (!slot || slot.classList.contains("pokemon-picker-team-slot--empty")) return;
    const index = parseInt((slot as HTMLElement).dataset.slotIndex ?? "", 10);
    if (!Number.isNaN(index)) removeFromTeamInPicker(index);
  });
  teamDeleteConfirmOk?.addEventListener("click", () => confirmDeleteTeam());
  teamDeleteConfirmCancel?.addEventListener("click", () => closeDeleteConfirmModal());
  teamDeleteConfirmModal?.querySelector(".pokemon-modal-backdrop")?.addEventListener("click", () => closeDeleteConfirmModal());

  if (!deviceSelect || !videoEl) return;

  const onDeviceChange = () => {
    saveDeviceSelection();
    startStream();
  };
  deviceSelect.addEventListener("change", onDeviceChange);
  audioSelect?.addEventListener("change", onDeviceChange);

  refreshBtn?.addEventListener("click", () => {
    loadDevices();
  });

  volumeSlider?.addEventListener("input", () => {
    const v = Number(volumeSlider.value) / 100;
    if (videoEl) videoEl.volume = v;
  });
  if (videoEl && volumeSlider) videoEl.volume = Number(volumeSlider.value) / 100;

  loadDevices();
});
