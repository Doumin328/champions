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
/** カタカナをひらがなに変換（検索の表記ゆれ吸収用） */
function toHiragana(s: string): string {
  return s.replace(/[\u30A1-\u30F6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

function calcStat(base: number, isHP: boolean): number {
  if (isHP) return Math.floor((2 * base + 31) * DMG_LEVEL / 100) + DMG_LEVEL + 10;
  return Math.floor(Math.floor((2 * base + 31) * DMG_LEVEL / 100) + 5);
}

/** Lv50・能力ポイント・性格補正込みの実数値（非HP）。IV=31固定、cp=能力ポイント(0〜32) */
function calcStatWithEV(base: number, ev: number, nature: number): number {
  const raw = Math.floor((Math.floor((2 * base + 31 + ev * 2) * DMG_LEVEL / 100) + 5) * nature);
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
  koChance: number;
}
/** タイプ強化アイテム → 対応タイプ */
const TYPE_BOOSTER_ITEM_MAP: Record<string, string> = {
  "もくたん": "ほのお", "しんぴのしずく": "みず", "きせきのタネ": "くさ",
  "じしゃく": "でんき", "とけないこおり": "こおり", "くろおび": "かくとう",
  "どくバリ": "どく", "やわらかいすな": "じめん", "かたいいし": "いわ",
  "ぎんのこな": "むし", "のろいのおふだ": "ゴースト", "まがったスプーン": "エスパー",
  "りゅうのキバ": "ドラゴン", "くろいメガネ": "あく", "メタルコート": "はがね",
  "ようせいのハネ": "フェアリー", "シルクのスカーフ": "ノーマル",
};

/** タイプ半減きのみ → 対応タイプ */
const TYPE_BERRY_MAP: Record<string, string> = {
  "ヤチェ": "こおり", "オッカ": "ほのお", "ウタン": "でんき",
  "リリバ": "くさ",   "リンド": "みず",   "シュカ": "じめん",
  "ソクノ": "ひこう", "タンガ": "むし",   "チーゴ": "いわ",
  "ナナシ": "ゴースト", "ナモ": "かくとう", "ハバン": "ドラゴン",
  "ホズ": "あく",     "ヨプ": "どく",     "ロゼル": "フェアリー",
};

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
  attackerItem?: string;
  defenderItem?: string;
  defenderHpOverride?: number;
  attackerAbility?: string;
  defenderAbility?: string;
  attackerAbilityActive?: boolean;
  defenderAbilityActive?: boolean;
  moveFlags?: { contact?: boolean; pulse?: boolean; bite?: boolean; punch?: boolean; slicing?: boolean };
}): DamageResult {
  const { movePower, moveType, moveCategory, attackerTypes, attackerBaseStats, defenderTypes, defenderBaseStats, attackerStatOverride, defenderStatOverride, weather, terrain, attackerItem, defenderItem } = input;
  const defenderHP = input.defenderHpOverride ?? calcStat(defenderBaseStats.hp, true);
  if (moveCategory === "変化" || movePower == null || movePower <= 0) {
    return { damageMin: 0, damageMax: 0, percentMin: 0, percentMax: 0, defenderHP, remainingHPMin: defenderHP, remainingHPMax: defenderHP, isStatusMove: true, isImmune: false, koChance: 0 };
  }
  // 特性データ取得（条件付き特性はアクティブフラグで制御）
  // ※スキン系のタイプ変換が免疫チェックに影響するため、typeEff より前に取得
  const atkAbActive = input.attackerAbilityActive !== false;
  const defAbActive = input.defenderAbilityActive !== false;
  const atkAb = atkAbActive && input.attackerAbility ? abilitiesData.find(a => a.name === input.attackerAbility) : undefined;
  const defAb = defAbActive && input.defenderAbility ? abilitiesData.find(a => a.name === input.defenderAbility) : undefined;
  const ignoreDefAb = atkAb?.ignoreDefenderAbility ?? false;

  // スキン系：ノーマル技を別タイプに変換
  const isNormalTypeMove = moveType === "ノーマル";
  const effectiveMoveType = (atkAb?.normalTypeChange && isNormalTypeMove) ? atkAb.normalTypeChange : moveType;

  const typeEff = getTypeEff(effectiveMoveType, defenderTypes);
  if (typeEff === 0) {
    return { damageMin: 0, damageMax: 0, percentMin: 0, percentMax: 0, defenderHP, remainingHPMin: defenderHP, remainingHPMax: defenderHP, isStatusMove: false, isImmune: true, koChance: 0 };
  }

  // STAB（てきおうりょく で stabMult を上書き）
  const stab = attackerTypes.includes(effectiveMoveType) ? (atkAb?.stabMult ?? 1.5) : 1;

  const atkBase = moveCategory === "物理"
    ? (attackerStatOverride?.attack ?? calcStat(attackerBaseStats.attack, false))
    : (attackerStatOverride?.spAttack ?? calcStat(attackerBaseStats.spAttack, false));
  const defBase = moveCategory === "物理"
    ? (defenderStatOverride?.defense ?? calcStat(defenderBaseStats.defense, false))
    : (defenderStatOverride?.spDefense ?? calcStat(defenderBaseStats.spDefense, false));
  const atkRank = moveCategory === "物理" ? (input.attackerAtkRank ?? 0) : (input.attackerSpAtkRank ?? 0);
  const defRank = moveCategory === "物理" ? (input.defenderDefRank ?? 0) : (input.defenderSpDefRank ?? 0);

  // 攻撃側持ち物：ステータス補正
  const atkItemMult = (attackerItem === "choice-band" && moveCategory === "物理") ? 1.5
    : (attackerItem === "choice-specs" && moveCategory === "特殊") ? 1.5 : 1;
  // 防御側持ち物：ステータス補正
  const defItemMult = moveCategory === "物理"
    ? (defenderItem === "eviolite" ? 1.5 : 1)
    : (defenderItem === "assault-vest" || defenderItem === "eviolite" ? 1.5 : 1);

  // 天候：ノーてんき / エアロック で無効化（weatherCondition チェックより前に計算）
  const effectiveWeather = (atkAb?.ignoreWeather || defAb?.ignoreWeather) ? "" : (weather ?? "");

  // 攻撃側特性：ステータス倍率（ちからもち / はりきり / メガソーラー等）
  const atkAbStatCondMet = !atkAb?.weatherCondition || effectiveWeather === atkAb.weatherCondition;
  const atkAbMult = (atkAb?.atkStatMult != null && atkAbStatCondMet && (!atkAb.moveCategory || atkAb.moveCategory === moveCategory)) ? atkAb.atkStatMult : 1;
  // 防御側特性：ステータス倍率（ファーコート等）。かたやぶりで無効化
  const defAbMult = !ignoreDefAb && defAb?.defStatMult != null && (!defAb.moveCategory || defAb.moveCategory === moveCategory) ? defAb.defStatMult : 1;

  const atkStat = Math.max(1, Math.floor(Math.floor(atkBase * rankMult(atkRank)) * atkItemMult * atkAbMult));
  const defStat = Math.max(1, Math.floor(Math.floor(defBase * rankMult(defRank)) * defItemMult * defAbMult));

  // 威力倍率（テクニシャン / かたいツメ / すなのちから / アナライズ等の条件チェック）
  const powerMultCondMet =
    (!atkAb?.powerMultMaxPower || movePower <= atkAb.powerMultMaxPower) &&
    (!atkAb?.powerMultTypes   || atkAb.powerMultTypes.includes(effectiveMoveType)) &&
    (!atkAb?.weatherCondition || effectiveWeather === atkAb.weatherCondition) &&
    (!atkAb?.requiresFlag     || input.moveFlags?.[atkAb.requiresFlag] === true) &&
    (!atkAb?.normalTypeChange || isNormalTypeMove); // スキン系：元がノーマルのときのみ
  const effectivePower = Math.floor(movePower * ((atkAb?.powerMult != null && powerMultCondMet) ? atkAb.powerMult : 1));

  const step2 = Math.floor(Math.floor((2 * DMG_LEVEL) / 5 + 2) * effectivePower * atkStat / defStat);
  const base  = Math.floor(step2 / 50) + 2;
  let weatherMult = 1;
  if (effectiveWeather === "はれ") {
    if (effectiveMoveType === "ほのお") weatherMult = 1.5;
    else if (effectiveMoveType === "みず") weatherMult = 0.5;
  } else if (effectiveWeather === "あめ") {
    if (effectiveMoveType === "みず") weatherMult = 1.5;
    else if (effectiveMoveType === "ほのお") weatherMult = 0.5;
  }
  let terrainMult = 1;
  if (terrain === "エレキフィールド" && effectiveMoveType === "でんき") terrainMult = 1.3;
  else if (terrain === "グラスフィールド" && effectiveMoveType === "くさ") terrainMult = 1.3;
  else if (terrain === "サイコフィールド" && effectiveMoveType === "エスパー") terrainMult = 1.3;
  else if (terrain === "ミストフィールド" && effectiveMoveType === "ドラゴン") terrainMult = 0.5;

  // 攻撃側持ち物：ダメージ補正
  let attackerDamageMult = 1;
  if (attackerItem === "life-orb") attackerDamageMult = 1.3;
  else if (attackerItem === "expert-belt" && typeEff > 1) attackerDamageMult = 1.2;
  else if (attackerItem && TYPE_BOOSTER_ITEM_MAP[attackerItem] === effectiveMoveType) attackerDamageMult = 1.2;

  // 防御側持ち物：ダメージ軽減
  let defenderDamageReduceMult = 1;
  if (defenderItem && TYPE_BERRY_MAP[defenderItem] === effectiveMoveType && typeEff > 1) defenderDamageReduceMult = 0.5;

  // 攻撃側特性：タイプダメージ倍率（もうか / トランジスタ等）
  let attackerAbTypeMult = 1;
  if (atkAb?.typeDamageMult?.type === effectiveMoveType) attackerAbTypeMult = atkAb.typeDamageMult.mult;

  // 防御側特性：タイプ軽減（あついしぼう等）。かたやぶりで無効化
  let defAbTypeMult = 1;
  if (!ignoreDefAb && defAb?.typeResistMulti) {
    const r = defAb.typeResistMulti.find(e => e.type === effectiveMoveType);
    if (r) defAbTypeMult = r.mult;
  }

  // 防御側特性：効果抜群軽減（フィルター等）。かたやぶりで無効化
  let superEffAbMult = 1;
  if (!ignoreDefAb && defAb?.superEffMult != null && typeEff > 1) superEffAbMult = defAb.superEffMult;

  // 防御側特性：全体ダメージ軽減（マルチスケイル等）。かたやぶりで無効化
  let defDamageMult = 1;
  if (!ignoreDefAb && defAb?.damageMult != null) defDamageMult = defAb.damageMult;

  const otherMult = weatherMult * terrainMult * attackerDamageMult * defenderDamageReduceMult
    * attackerAbTypeMult * defAbTypeMult * superEffAbMult * defDamageMult;
  const applyRoll = (r: number): number => {
    let d = Math.floor(base * r / 100);   // ×乱数 → 切り捨て
    d = Math.round(d * stab);             // ×タイプ一致補正 → 五捨五超入
    d = Math.floor(d * typeEff);          // ×相性補正 → 切り捨て
    return Math.max(1, Math.floor(d * otherMult));
  };
  const rolls = Array.from({ length: 16 }, (_, i) => applyRoll(85 + i));
  const damageMin = rolls[0];
  const damageMax = rolls[15];
  const koCount = rolls.filter(d => d >= defenderHP).length;
  const koChance = (koCount / 16) * 100;
  return {
    damageMin, damageMax,
    percentMin: (damageMin / defenderHP) * 100, percentMax: (damageMax / defenderHP) * 100,
    defenderHP,
    remainingHPMin: Math.max(0, defenderHP - damageMax), remainingHPMax: Math.max(0, defenderHP - damageMin),
    isStatusMove: false, isImmune: false, koChance,
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
  /** 特性の日本語名一覧（通常特性→隠れ特性の順） */
  abilities?: string[];
  /** 最終進化かどうか（進化先がないポケモンは true） */
  isFinalEvolution?: boolean;
  /** レギュレーション（例: "M-A"）。未設定は "" */
  regulation?: string;
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

/** 特性効果定義 */
interface AbilityDef {
  name: string;
  desc: string;
  side: "attacker" | "defender" | "both";
  atkStatMult?: number;
  moveCategory?: "物理" | "特殊";
  stabMult?: number;
  powerMult?: number;
  typeDamageMult?: { type: string; mult: number };
  ignoreDefenderAbility?: boolean;
  ignoreWeather?: boolean;
  defStatMult?: number;
  superEffMult?: number;
  damageMult?: number;
  typeResistMulti?: { type: string; mult: number }[];
  conditional?: boolean;
  weatherCondition?: string;
  powerMultTypes?: string[];
  powerMultMaxPower?: number;
  requiresFlag?: "contact" | "pulse" | "bite" | "punch" | "slicing";
  normalTypeChange?: string;
}
let abilitiesData: AbilityDef[] = [];

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

/** ポケモン画像のパス（img/pokemon/ 配下の {id}.png に統一。id がなければ DUMMY） */
function getPokemonImageSrc(pokemon: Pokemon): string {
  return pokemon.id ? `img/pokemon_cs/${pokemon.id}.png` : DUMMY_POKEMON_IMAGE;
}

const videoEl = document.getElementById("video") as HTMLVideoElement;
const deviceSelect = document.getElementById("device-select") as HTMLSelectElement;
const audioSelect = document.getElementById("audio-select") as HTMLSelectElement;
const refreshBtn = document.getElementById("refresh-devices");
const volumeSlider = document.getElementById("volume-slider") as HTMLInputElement;
const statusEl = document.getElementById("video-status");

let currentStream: MediaStream | null = null;

// ===== ストリーム変化通知 =====
const streamChangeCallbacks: Array<(stream: MediaStream | null) => void> = [];
function notifyStreamChanged(stream: MediaStream | null): void {
  streamChangeCallbacks.forEach((cb) => cb(stream));
}

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

/** タブ1: 単体選択モーダルの名前検索テキスト */
let tab1NameSearchText = "";

/** タブ1: 単体選択モーダルの表示ソース（all=全ポケモン, box=BOXのみ） */
let tab1SourceMode: "all" | "box" = "all";

/** タブ1: 単体選択モーダルのソートキー */
let tab1SortKey: "number" | "name" = "number";

/** タブ1: 最終進化のみ表示するか */
let tab1ShowOnlyFinalEvolution = true;

/** タブ1: レギュレーションフィルター（"M-A" | "all"） */
let tab1RegulationFilter: "M-A" | "all" = "M-A";

/** タブ2: ピッカーの表示ソース（all=全ポケモン, box=BOXのみ） */
let pickerSourceMode: "all" | "box" = "all";

/** タブ2: ピッカーのソートキー */
let pickerSortKey: "number" | "name" = "number";

/** タブ2: 最終進化のみ表示するか */
let pickerShowOnlyFinalEvolution = true;

/** タブ2: レギュレーションフィルター（"M-A" | "all"） */
let pickerRegulationFilter: "M-A" | "all" = "M-A";

/** タブ1: 選択中ワザ4つ */
let selectedMoves: number[] = [];

/** タブ1: 技変更用にクリックされたスロット番号（null=未選択） */
let editingMoveSlotIndex: number | null = null;

/** タブ1: 技一覧のタイプ絞り込み（null または "すべて" で全件） */
let damageMovesTypeFilter: string | null = null;

/** タブ1: 技一覧の分類絞り込み（null または "すべて" で全件） */
let damageMovesCategoryFilter: string | null = null;

/** タブ1: 防御側の努力値・性格（HP・防御・特防） */
let defenderHpEV = 0;
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

/** タブ1: 攻撃側の選択特性 */
let attackerAbility = "";
/** タブ1: 防御側の選択特性 */
let defenderAbility = "";
/** タブ1: 攻撃側の条件付き特性が有効かどうか */
let attackerAbilityActive = true;
/** タブ1: 防御側の条件付き特性が有効かどうか */
let defenderAbilityActive = true;

/** タブ1: 攻撃側の持ち物 */
let tab1AttackerItem = "";
/** タブ1: 防御側の持ち物 */
let tab1DefenderItem = "";
/** タブ1: アイテムピッカーの検索テキスト */
let tab1AttackerItemSearch = "";
let tab1DefenderItemSearch = "";

/** 技データ（moves.json） */
interface Move {
  id: number;
  name: string;
  type: string;
  category: string;
  power: number | null;
  accuracy: number | null;
  pp: number;
  contact?: boolean;
  pulse?: boolean;
  bite?: boolean;
  punch?: boolean;
  slicing?: boolean;
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
interface CompetitiveItem { id: string; nameJa: string; effect: string; regulation?: string }
const COMPETITIVE_ITEMS: CompetitiveItem[] = [
  // こだわり系
  { id: "choice-scarf",       nameJa: "こだわりスカーフ",   effect: "すばやさ×1.5、同じ技しか選べない。" },
  { id: "choice-specs",       nameJa: "こだわりメガネ",     effect: "とくこう×1.5、同じ技しか選べない。" },
  { id: "choice-band",        nameJa: "こだわりハチマキ",   effect: "こうげき×1.5、同じ技しか選べない。" },
  // 汎用
  { id: "life-orb",           nameJa: "いのちのたま",       effect: "技ダメージ×1.3、使うたびHPが1/10減る。" },
  { id: "leftovers",          nameJa: "たべのこし",         effect: "毎ターン最大HP×1/16回復する。" },
  { id: "focus-sash",         nameJa: "きあいのタスキ",     effect: "HP満タン時、一撃耐える（一回限り）。" },
  { id: "assault-vest",       nameJa: "とつげきチョッキ",   effect: "とくぼう×1.5、変化技を使用できない。" },
  { id: "eviolite",           nameJa: "しんかのきせき",     effect: "進化前限定、ぼうぎょ・とくぼう×1.5。" },
  { id: "rocky-helmet",       nameJa: "ゴツゴツメット",     effect: "接触技を受けると相手HP−1/6。" },
  { id: "heavy-duty-boots",   nameJa: "とつげきブーツ",     effect: "場に出たときのまきびし等無効。" },
  { id: "shed-shell",         nameJa: "ぬけがら",         effect: "どんな状況でも交代できる。" },
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

/** item.json から読み込んだM-A使用可能アイテム一覧（タブ①で使用） */
let maItems: CompetitiveItem[] = [];

/** 攻撃する側のダメージに補正がかかるアイテム */
const ATTACKER_ITEM_IDS = new Set([
  "choice-band", "choice-specs",
  "life-orb", "expert-belt", "punching-glove",
  // タイプ強化プレート
  "charcoal", "mystic-water", "miracle-seed", "magnet", "never-melt-ice",
  "black-belt", "poison-barb", "soft-sand", "hard-stone", "silver-powder",
  "spell-tag", "twisted-spoon", "dragon-fang", "black-glasses", "metal-coat",
  "sharp-beak", "fairy-feather",
]);

/** 防御する側のダメージに補正がかかるアイテム */
const DEFENDER_ITEM_IDS = new Set([
  "eviolite", "assault-vest",
  // タイプ半減きのみ
  "yache-berry", "occa-berry", "wacan-berry", "rindo-berry", "passho-berry",
]);

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

/** 日本語タイプ名 → SV画像ファイル名（src/img/type/sv/） */
const TYPE_SV_IMG: Record<string, string> = {
  "ノーマル": "Normal", "かくとう": "Fighting", "ひこう": "Flying", "どく": "Poison",
  "じめん": "Ground", "いわ": "Rock", "むし": "Bug", "ゴースト": "Ghost",
  "はがね": "Steel", "ほのお": "Fire", "みず": "Water", "くさ": "Grass",
  "でんき": "Electric", "エスパー": "Psychic", "こおり": "Ice", "ドラゴン": "Dragon",
  "あく": "Dark", "フェアリー": "Fairy",
};

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
    const realIndex = box.indexOf(entry);
    card.dataset.boxIndex = String(realIndex);

    // 左側: 画像 + ポケモン名
    const leftEl = document.createElement("div");
    leftEl.className = "box-card-left";
    const pokImg = document.createElement("img");
    pokImg.className = "box-card-img";
    pokImg.alt = entry.pokemon.name;
    pokImg.src = entry.pokemon.id ? `img/pokemon/${entry.pokemon.id}.png` : BALL_MONSTER_IMAGE;
    pokImg.onerror = () => { pokImg.src = BALL_MONSTER_IMAGE; };
    leftEl.appendChild(pokImg);
    const nameEl = document.createElement("span");
    nameEl.className = "box-card-name";
    nameEl.textContent = entry.pokemon.name;
    leftEl.appendChild(nameEl);
    card.appendChild(leftEl);

    // 右側: 性格 + ステータステーブル + 持ち物
    const rightEl = document.createElement("div");
    rightEl.className = "box-card-right";

    const nat = NATURES.find((n) => n.name === entry.natureName);
    const natLabel = nat ? getNatureLabel(nat) : entry.natureName;
    const natureEl = document.createElement("span");
    natureEl.className = "box-card-nature";
    natureEl.textContent = natLabel;
    rightEl.appendChild(natureEl);

    // ステータステーブル
    const bs = entry.pokemon.baseStats;
    const statDefs: { label: string; base: number | undefined; ev: number; nature: number }[] = [
      { label: "HP",    base: bs?.hp,         ev: entry.ev.hp,    nature: 1.0 },
      { label: "こうげき", base: bs?.attack,     ev: entry.ev.atk,   nature: nat?.atk  ?? 1.0 },
      { label: "ぼうぎょ", base: bs?.defense,    ev: entry.ev.def,   nature: nat?.def  ?? 1.0 },
      { label: "とくこう", base: bs?.spAttack,   ev: entry.ev.spAtk, nature: nat?.spAtk ?? 1.0 },
      { label: "とくぼう", base: bs?.spDefense,  ev: entry.ev.spDef, nature: nat?.spDef ?? 1.0 },
      { label: "すばやさ", base: bs?.speed,      ev: entry.ev.spd,   nature: nat?.spd  ?? 1.0 },
    ];
    const tbl = document.createElement("div");
    tbl.className = "box-card-stat-table";
    // ヘッダ行
    ["", "種族値", "努力値", "実数値"].forEach((h) => {
      const hd = document.createElement("span");
      hd.className = "box-card-stat-hd";
      hd.textContent = h;
      tbl.appendChild(hd);
    });
    statDefs.forEach(({ label, base, ev, nature }) => {
      const labelEl = document.createElement("span");
      labelEl.className = "box-card-stat-label";
      labelEl.textContent = label;
      tbl.appendChild(labelEl);

      const baseVal = base ?? "—";
      const baseEl = document.createElement("span");
      baseEl.className = "box-card-stat-val";
      baseEl.textContent = String(baseVal);
      tbl.appendChild(baseEl);

      const evEl = document.createElement("span");
      evEl.className = `box-card-stat-val${ev > 0 ? " box-card-stat-ev-nz" : ""}`;
      evEl.textContent = String(ev);
      tbl.appendChild(evEl);

      let real: number | string = "—";
      if (base !== undefined) {
        if (label === "HP") {
          real = Math.floor((2 * base + 31 + ev * 2) * DMG_LEVEL / 100) + DMG_LEVEL + 10;
        } else {
          real = calcStatWithEV(base, ev, nature);
        }
      }
      const realEl = document.createElement("span");
      realEl.className = "box-card-stat-val box-card-stat-real";
      realEl.textContent = String(real);
      tbl.appendChild(realEl);
    });
    rightEl.appendChild(tbl);

    if (entry.heldItem) {
      const itemBadge = document.createElement("div");
      itemBadge.className = "box-card-item-badge";
      const itemImg = document.createElement("img");
      itemImg.className = "box-card-item-img";
      itemImg.alt = entry.heldItem;
      itemImg.src = `img/item/${entry.heldItem}.png`;
      itemImg.onerror = () => { itemBadge.hidden = true; };
      itemBadge.appendChild(itemImg);
      rightEl.appendChild(itemBadge);
    }

    card.appendChild(rightEl);
    grid.appendChild(card);
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
    img.src = pokemon.id ? `img/pokemon/${pokemon.id}.png` : BALL_MONSTER_IMAGE;
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

function deleteBoxEntry(): void {
  if (boxViewingIndex === null) return;
  box.splice(boxViewingIndex, 1);
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
    img.src = entry.pokemon.id ? `img/pokemon/${entry.pokemon.id}.png` : BALL_MONSTER_IMAGE;
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
    ? `<img src="img/item/${escapeHtml(item.id)}.png"
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

/** BOX編集フォームの実数値を再計算して表示を更新 */
function updateBoxEditRealStats(pokemon: Pokemon): void {
  const natSel = document.getElementById("box-detail-nature") as HTMLSelectElement | null;
  const nat = NATURES.find((n) => n.name === (natSel?.value ?? ""));
  const bs = pokemon.baseStats;
  const statMap: { id: string; base: number | undefined; natureKey: keyof Omit<typeof NATURES[0], "name"> | "hp" }[] = [
    { id: "box-ev-hp",    base: bs?.hp,        natureKey: "hp" },
    { id: "box-ev-atk",   base: bs?.attack,    natureKey: "atk" },
    { id: "box-ev-def",   base: bs?.defense,   natureKey: "def" },
    { id: "box-ev-spatk", base: bs?.spAttack,  natureKey: "spAtk" },
    { id: "box-ev-spdef", base: bs?.spDefense, natureKey: "spDef" },
    { id: "box-ev-spd",   base: bs?.speed,     natureKey: "spd" },
  ];
  statMap.forEach(({ id, base, natureKey }) => {
    const inp = document.getElementById(id) as HTMLInputElement | null;
    const realEl = document.getElementById(`${id}-real`);
    const labelEl = document.getElementById(`${id}-label`);
    if (!inp || !realEl || base === undefined) return;
    const ev = clampEv(Number(inp.value) || 0);
    let natMul = 1.0;
    let real: number;
    if (natureKey === "hp") {
      real = Math.floor((2 * base + 31 + ev * 2) * DMG_LEVEL / 100) + DMG_LEVEL + 10;
    } else {
      natMul = nat ? (nat[natureKey as keyof typeof nat] as number) : 1.0;
      real = calcStatWithEV(base, ev, natMul);
    }
    realEl.textContent = String(real);
    // 性格補正色
    for (const el of [realEl, labelEl]) {
      if (!el) continue;
      el.classList.remove("box-stat-nature-up", "box-stat-nature-down");
      if (natMul > 1) el.classList.add("box-stat-nature-up");
      else if (natMul < 1) el.classList.add("box-stat-nature-down");
    }
  });
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
    natSel.addEventListener("change", () => updateBoxEditRealStats(pokemon));
  }
  // ステータスグリッド生成（種族値 / 努力値 / 実数値）
  const evGrid = document.getElementById("box-ev-grid");
  if (evGrid) {
    evGrid.innerHTML = "";
    // ヘッダ行
    ["", "種族値", "努力値", "実数値"].forEach((h) => {
      const hd = document.createElement("span");
      hd.className = "box-stat-hd";
      hd.textContent = h;
      evGrid.appendChild(hd);
    });
    const bs = pokemon.baseStats;
    const baseStatMap: Record<string, number | undefined> = {
      "box-ev-hp": bs?.hp, "box-ev-atk": bs?.attack, "box-ev-def": bs?.defense,
      "box-ev-spatk": bs?.spAttack, "box-ev-spdef": bs?.spDefense, "box-ev-spd": bs?.speed,
    };
    BOX_EV_LABELS.forEach(({ label, id, key }) => {
      const base = baseStatMap[id];
      // 列1: ラベル
      const lbl = document.createElement("span");
      lbl.className = "box-stat-label";
      lbl.id = `${id}-label`;
      lbl.textContent = label;
      // 列2: 種族値
      const baseEl = document.createElement("span");
      baseEl.className = "box-stat-base";
      baseEl.textContent = base !== undefined ? String(base) : "—";
      // 列3: 努力値 controls
      const ctrlWrap = document.createElement("div");
      ctrlWrap.className = "box-stat-ctrl";
      const btn0 = document.createElement("button");
      btn0.type = "button"; btn0.className = "damage-ev-btn damage-ev-btn-0"; btn0.dataset.evInput = id; btn0.textContent = "0";
      const inp = document.createElement("input");
      inp.type = "number"; inp.id = id; inp.className = "damage-ev-input"; inp.min = "0"; inp.max = "255";
      inp.value = String(existing?.ev[key] ?? 0);
      inp.addEventListener("input", () => updateBoxEditRealStats(pokemon));
      const btn252 = document.createElement("button");
      btn252.type = "button"; btn252.className = "damage-ev-btn damage-ev-btn-252"; btn252.dataset.evInput = id; btn252.textContent = "32";
      const btnDn = document.createElement("button");
      btnDn.type = "button"; btnDn.className = "damage-ev-step-btn damage-ev-step-down"; btnDn.dataset.evInput = id; btnDn.textContent = "−";
      const btnUp = document.createElement("button");
      btnUp.type = "button"; btnUp.className = "damage-ev-step-btn damage-ev-step-up"; btnUp.dataset.evInput = id; btnUp.textContent = "＋";
      ctrlWrap.append(btn0, inp, btn252, btnDn, btnUp);
      // 列4: 実数値
      const realEl = document.createElement("span");
      realEl.className = "box-stat-real";
      realEl.id = `${id}-real`;
      evGrid.append(lbl, baseEl, ctrlWrap, realEl);
    });
    updateBoxEditRealStats(pokemon);
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
      img.src = `img/item/${boxSelectedItem.id}.png`;
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
    img.src = `img/item/${item.id}.png`;
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
    btn.innerHTML = `<img class="type-btn-img" src="img/type/sv/${TYPE_SV_IMG[typeName] ?? typeName}.png" alt="${typeName}" />`;
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
    notifyStreamChanged(null);
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
    notifyStreamChanged(stream);
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
  let list: Pokemon[] = pickerSourceMode === "box" ? box.map((e) => e.pokemon) : demoPokemon;
  if (pickerRegulationFilter === "M-A") {
    list = list.filter((p) => p.regulation === "M-A");
  }
  if (pickerShowOnlyFinalEvolution) {
    list = list.filter((p) => p.isFinalEvolution !== false);
  }
  if (pickerTypeFilter && pickerTypeFilter !== "すべて") {
    list = list.filter((p) => p.types.includes(pickerTypeFilter!));
  }
  if (pickerSortKey === "name") {
    list = [...list].sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }
  return list;
}

/** ピッカーのソース切替・ソートUIの表示状態を更新 */
function updatePickerSourceSortUI(): void {
  const toggle = document.getElementById("picker-source-toggle");
  if (toggle) {
    toggle.querySelectorAll<HTMLButtonElement>(".picker-source-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.source === pickerSourceMode);
    });
  }
  const sortSel = document.getElementById("picker-sort-select") as HTMLSelectElement | null;
  if (sortSel) sortSel.value = pickerSortKey;
  const evoToggle = document.getElementById("picker-evo-toggle");
  if (evoToggle) {
    evoToggle.querySelectorAll<HTMLButtonElement>(".picker-evo-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.evo === (pickerShowOnlyFinalEvolution ? "final" : "all"));
    });
  }
  const regulationToggle = document.getElementById("picker-regulation-toggle");
  if (regulationToggle) {
    regulationToggle.querySelectorAll<HTMLButtonElement>(".picker-regulation-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.regulation === pickerRegulationFilter);
    });
  }
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
    btn.innerHTML = `<img class="type-btn-img" src="img/type/sv/${TYPE_SV_IMG[typeName] ?? typeName}.png" alt="${typeName}" />`;
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
  return pokemon.id ? `img/pokemon_cs/${pokemon.id}.png` : BALL_MONSTER_IMAGE;
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
  pickerSourceMode = "all";
  pickerSortKey = "number";
  pickerShowOnlyFinalEvolution = true;
  pickerRegulationFilter = "M-A";
  listEl.innerHTML = "";
  renderPickerTeamPreview();
  updatePickerSourceSortUI();
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

// ---------- タブ1: アイテムピッカー ----------

function renderTab1ItemDisplay(slot: "attacker" | "defender"): void {
  const isMega = (slot === "attacker" && !!attackPokemon?.id.includes("Mega"))
    || (slot === "defender" && !!defendPokemon?.id.includes("Mega"));
  const item = slot === "attacker" ? tab1AttackerItem : tab1DefenderItem;
  const found = (!isMega && item) ? maItems.find((it) => it.id === item) : null;
  const iconEl = document.getElementById(`damage-${slot}-item-icon`) as HTMLImageElement | null;
  const nameEl = document.getElementById(`damage-${slot}-item-name`);
  const effectEl = document.getElementById(`damage-${slot}-item-effect`);
  if (isMega) {
    if (iconEl) { iconEl.src = ""; iconEl.hidden = true; }
    if (nameEl) nameEl.textContent = "メガストーン";
    if (effectEl) effectEl.textContent = "";
    return;
  }
  if (iconEl) {
    if (found) {
      iconEl.src = `img/item/${found.id}.png`;
      iconEl.hidden = false;
    } else {
      iconEl.src = "";
      iconEl.hidden = true;
    }
  }
  if (nameEl) nameEl.textContent = found ? found.nameJa : "持ち物なし";
  if (effectEl) effectEl.textContent = found ? found.effect : "";
}

function openTab1ItemPicker(slot: "attacker" | "defender"): void {
  const stats = document.getElementById(`damage-slot-stats-${slot}`);
  const picker = document.getElementById(`damage-${slot}-item-picker`);
  if (stats) stats.hidden = true;
  if (picker) picker.hidden = false;
  const searchEl = document.getElementById(`tab1-${slot}-item-search`) as HTMLInputElement | null;
  if (searchEl) searchEl.value = "";
  if (slot === "attacker") tab1AttackerItemSearch = "";
  else tab1DefenderItemSearch = "";
  renderTab1ItemGrid(slot);
}

function closeTab1ItemPicker(slot: "attacker" | "defender"): void {
  const stats = document.getElementById(`damage-slot-stats-${slot}`);
  const picker = document.getElementById(`damage-${slot}-item-picker`);
  if (stats) stats.hidden = false;
  if (picker) picker.hidden = true;
}

function renderTab1ItemGrid(slot: "attacker" | "defender"): void {
  const gridEl = document.getElementById(`damage-${slot}-item-grid`);
  if (!gridEl) return;
  gridEl.innerHTML = "";
  const searchText = slot === "attacker" ? tab1AttackerItemSearch : tab1DefenderItemSearch;
  const filtered = searchText.trim()
    ? maItems.filter((it) => toHiragana(it.nameJa).includes(toHiragana(searchText.trim())))
    : maItems;

  // 「なし」ボタン
  const noneBtn = document.createElement("button");
  noneBtn.type = "button";
  noneBtn.className = "damage-item-picker-btn";
  const noneNameEl = document.createElement("span");
  noneNameEl.className = "damage-item-picker-btn-name";
  noneNameEl.textContent = "なし";
  noneBtn.appendChild(noneNameEl);
  noneBtn.addEventListener("click", () => {
    if (slot === "attacker") tab1AttackerItem = "";
    else tab1DefenderItem = "";
    renderTab1ItemDisplay(slot);
    closeTab1ItemPicker(slot);
    renderTab1DamageDisplay();
  });
  gridEl.appendChild(noneBtn);

  filtered.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "damage-item-picker-btn";
    const img = document.createElement("img");
    img.src = `img/item/${item.id}.png`;
    img.alt = item.nameJa;
    img.onerror = () => { img.style.display = "none"; };
    const nameEl = document.createElement("span");
    nameEl.className = "damage-item-picker-btn-name";
    nameEl.textContent = item.nameJa;
    const effectEl = document.createElement("span");
    effectEl.className = "damage-item-picker-btn-effect";
    effectEl.textContent = item.effect;
    btn.append(img, nameEl, effectEl);
    btn.addEventListener("click", () => {
      if (slot === "attacker") tab1AttackerItem = item.id;
      else tab1DefenderItem = item.id;
      renderTab1ItemDisplay(slot);
      closeTab1ItemPicker(slot);
      renderTab1DamageDisplay();
    });
    gridEl.appendChild(btn);
  });
}

// ---------- タブ1: ダメージ計算 ----------

function swapAttackerDefender(): void {
  [attackPokemon, defendPokemon] = [defendPokemon, attackPokemon];
  [attackerAbility, defenderAbility] = [defenderAbility, attackerAbility];
  [attackerAbilityActive, defenderAbilityActive] = [defenderAbilityActive, attackerAbilityActive];
  [tab1AttackerItem, tab1DefenderItem] = [tab1DefenderItem, tab1AttackerItem];
  // EVs・性格・ランクはスロットごとに保持（リセットしない）
  selectedMoves = attackPokemon ? getDefaultMoves(attackPokemon) : [];
  editingMoveSlotIndex = null;
  syncStatsInputsFromState();
  renderTab1DamageDisplay();
}

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
      const defDisplayBtn = document.getElementById("damage-defender-item-display") as HTMLButtonElement | null;
      if (defDisplayBtn) {
        const isMega = defendPokemon.id.includes("Mega");
        defDisplayBtn.disabled = isMega;
        defDisplayBtn.hidden = false;
        if (isMega) { tab1DefenderItem = ""; closeTab1ItemPicker("defender"); }
      }
      renderTab1ItemDisplay("defender");
    } else {
      defenderImg.src = BALL_MONSTER_IMAGE;
      defenderImg.alt = "";
      if (defenderName) defenderName.textContent = "";
      if (defenderTypes) defenderTypes.innerHTML = "";
      closeTab1ItemPicker("defender");
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
      const atkDisplayBtn = document.getElementById("damage-attacker-item-display") as HTMLButtonElement | null;
      if (atkDisplayBtn) {
        const isMega = attackPokemon.id.includes("Mega");
        atkDisplayBtn.disabled = isMega;
        atkDisplayBtn.hidden = false;
        if (isMega) { tab1AttackerItem = ""; closeTab1ItemPicker("attacker"); }
      }
      renderTab1ItemDisplay("attacker");
    } else {
      attackerImg.src = BALL_MONSTER_IMAGE;
      attackerImg.alt = "";
      if (attackerName) attackerName.textContent = "";
      if (attackerTypes) attackerTypes.innerHTML = "";
      closeTab1ItemPicker("attacker");
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
  syncAbilityDropdowns();

  renderTab1MovesArea();
}

function syncAbilityDropdowns(): void {
  const slots = [
    { key: "attacker", pokemon: attackPokemon, current: attackerAbility, active: attackerAbilityActive },
    { key: "defender", pokemon: defendPokemon, current: defenderAbility, active: defenderAbilityActive },
  ] as const;
  for (const { key, pokemon, current, active } of slots) {
    const row = document.getElementById(`damage-${key}-ability-row`);
    const sel = document.getElementById(`damage-${key}-ability-select`) as HTMLSelectElement | null;
    const txt = document.getElementById(`damage-${key}-ability-text`) as HTMLElement | null;
    const toggleBtn = document.getElementById(`damage-${key}-ability-toggle`) as HTMLButtonElement | null;
    if (!sel || !txt) continue;

    const abilities = pokemon?.abilities ?? [];
    if (row) row.hidden = abilities.length === 0;
    if (abilities.length === 0) continue;

    const isMultiple = abilities.length > 1;
    sel.hidden = !isMultiple;
    txt.hidden = isMultiple;

    if (isMultiple) {
      sel.innerHTML = "";
      for (const ab of abilities) {
        const opt = document.createElement("option");
        opt.value = ab; opt.textContent = ab;
        sel.appendChild(opt);
      }
      sel.value = current || abilities[0];
    } else {
      txt.textContent = abilities[0];
    }

    // 条件付き特性のみトグルボタンを表示
    const displayedAbility = isMultiple ? (sel.value || abilities[0]) : abilities[0];
    if (toggleBtn) {
      const selectedDef = displayedAbility ? abilitiesData.find(a => a.name === displayedAbility) : undefined;
      if (selectedDef?.conditional) {
        toggleBtn.hidden = false;
        toggleBtn.textContent = active ? "ON" : "OFF";
        toggleBtn.className = `ability-toggle-btn ${active ? "is-on" : "is-off"}`;
      } else {
        toggleBtn.hidden = true;
      }
    }
  }
}

function syncStatsInputsFromState(): void {
  const hpEv = document.getElementById("stats-hp-ev") as HTMLInputElement | null;
  const defEv = document.getElementById("stats-def-ev") as HTMLInputElement | null;
  const defNat = document.getElementById("stats-def-nature") as HTMLSelectElement | null;
  const spDefEv = document.getElementById("stats-spdef-ev") as HTMLInputElement | null;
  const spDefNat = document.getElementById("stats-spdef-nature") as HTMLSelectElement | null;
  const atkEv = document.getElementById("stats-atk-ev") as HTMLInputElement | null;
  const atkNat = document.getElementById("stats-atk-nature") as HTMLSelectElement | null;
  const spatkEv = document.getElementById("stats-spatk-ev") as HTMLInputElement | null;
  const spatkNat = document.getElementById("stats-spatk-nature") as HTMLSelectElement | null;
  if (hpEv) hpEv.value = String(defenderHpEV);
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
  const hpEv = document.getElementById("stats-hp-ev") as HTMLInputElement | null;
  const defEv = document.getElementById("stats-def-ev") as HTMLInputElement | null;
  const defNat = document.getElementById("stats-def-nature") as HTMLSelectElement | null;
  const spDefEv = document.getElementById("stats-spdef-ev") as HTMLInputElement | null;
  const spDefNat = document.getElementById("stats-spdef-nature") as HTMLSelectElement | null;
  const atkEv = document.getElementById("stats-atk-ev") as HTMLInputElement | null;
  const atkNat = document.getElementById("stats-atk-nature") as HTMLSelectElement | null;
  const spatkEv = document.getElementById("stats-spatk-ev") as HTMLInputElement | null;
  const spatkNat = document.getElementById("stats-spatk-nature") as HTMLSelectElement | null;
  const hpReal = document.getElementById("stats-hp-real");
  const defReal = document.getElementById("stats-def-real");
  const spDefReal = document.getElementById("stats-spdef-real");
  const atkReal = document.getElementById("stats-atk-real");
  const spatkReal = document.getElementById("stats-spatk-real");

  if (defendPokemon && hpReal) {
    const base = getBaseStats(defendPokemon);
    const ev = clampEv(Number(hpEv?.value) || 0);
    hpReal.textContent = String(Math.floor((2 * base.hp + 31 + ev * 2) * 50 / 100) + 60);
  } else if (hpReal) hpReal.textContent = "—";

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
  const hpEv = document.getElementById("stats-hp-ev") as HTMLInputElement | null;
  const defEv = document.getElementById("stats-def-ev") as HTMLInputElement | null;
  const defNat = document.getElementById("stats-def-nature") as HTMLSelectElement | null;
  const spDefEv = document.getElementById("stats-spdef-ev") as HTMLInputElement | null;
  const spDefNat = document.getElementById("stats-spdef-nature") as HTMLSelectElement | null;
  const atkEv = document.getElementById("stats-atk-ev") as HTMLInputElement | null;
  const atkNat = document.getElementById("stats-atk-nature") as HTMLSelectElement | null;
  const spatkEv = document.getElementById("stats-spatk-ev") as HTMLInputElement | null;
  const spatkNat = document.getElementById("stats-spatk-nature") as HTMLSelectElement | null;
  defenderHpEV = clampEv(Number(hpEv?.value) || 0);
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
const EV_STEPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];

function clampEv(v: number): number {
  return Math.max(0, Math.min(32, Math.floor(v)));
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
  let list: Pokemon[] = tab1SourceMode === "box" ? box.map((e) => e.pokemon) : demoPokemon;
  if (tab1RegulationFilter === "M-A") {
    list = list.filter((p) => p.regulation === "M-A");
  }
  if (tab1ShowOnlyFinalEvolution) {
    list = list.filter((p) => p.isFinalEvolution !== false);
  }
  if (tab1SelectTypeFilter && tab1SelectTypeFilter !== "すべて") {
    list = list.filter((p) => p.types.includes(tab1SelectTypeFilter!));
  }
  if (tab1NameSearchText.trim()) {
    list = list.filter((p) => toHiragana(p.name).includes(toHiragana(tab1NameSearchText.trim())));
  }
  if (tab1SortKey === "name") {
    list = [...list].sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }
  return list;
}

/** タブ1ピッカーのソース切替・ソートUIの表示状態を更新 */
function updateTab1SourceSortUI(): void {
  const toggle = document.getElementById("tab1-source-toggle");
  if (toggle) {
    toggle.querySelectorAll<HTMLButtonElement>(".picker-source-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.source === tab1SourceMode);
    });
  }
  const sortSel = document.getElementById("tab1-sort-select") as HTMLSelectElement | null;
  if (sortSel) sortSel.value = tab1SortKey;
  const evoToggle = document.getElementById("tab1-evo-toggle");
  if (evoToggle) {
    evoToggle.querySelectorAll<HTMLButtonElement>(".picker-evo-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.evo === (tab1ShowOnlyFinalEvolution ? "final" : "all"));
    });
  }
  const regulationToggle = document.getElementById("tab1-regulation-toggle");
  if (regulationToggle) {
    regulationToggle.querySelectorAll<HTMLButtonElement>(".picker-regulation-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.regulation === tab1RegulationFilter);
    });
  }
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
    btn.innerHTML = `<img class="type-btn-img" src="img/type/sv/${TYPE_SV_IMG[typeName] ?? typeName}.png" alt="${typeName}" />`;
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
  tab1NameSearchText = "";
  tab1SourceMode = "all";
  tab1SortKey = "number";
  tab1ShowOnlyFinalEvolution = true;
  tab1RegulationFilter = "M-A";
  const nameSearch = document.getElementById("tab1-pokemon-name-search") as HTMLInputElement | null;
  if (nameSearch) nameSearch.value = "";
  const modal = document.getElementById("tab1-pokemon-select-modal");
  const titleEl = document.getElementById("tab1-pokemon-select-title");
  if (titleEl) {
    if (target === "attack") titleEl.textContent = "攻撃側のポケモンを選択";
    else if (target === "defend") titleEl.textContent = "防御側のポケモンを選択";
    else titleEl.textContent = "BOXに追加するポケモンを選択";
  }
  updateTab1SourceSortUI();
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
    attackerAbility = pokemon.abilities?.[0] ?? "";
    attackerAbilityActive = true;
    editingMoveSlotIndex = null;
    damageMovesTypeFilter = null;
    attackerAtkRank = 0;
    attackerSpAtkRank = 0;
    const boxEntry = tab1SourceMode === "box" ? box.find((e) => e.pokemon.id === pokemon.id) : null;
    if (boxEntry) {
      selectedMoves = [...boxEntry.moves, 0, 0, 0, 0].slice(0, 4);
      attackerAtkEV = boxEntry.ev.atk;
      attackerSpAtkEV = boxEntry.ev.spAtk;
      const nat = NATURES.find((n) => n.name === boxEntry.natureName);
      attackerAtkNature = nat?.atk ?? 1.0;
      attackerSpAtkNature = nat?.spAtk ?? 1.0;
      tab1AttackerItem = boxEntry.heldItem;
    } else {
      selectedMoves = getDefaultMoves(pokemon);
      attackerAtkEV = 0;
      attackerAtkNature = 1.0;
      attackerSpAtkEV = 0;
      attackerSpAtkNature = 1.0;
    }
  } else if (tab1SelectTarget === "defend") {
    defendPokemon = pokemon;
    defenderAbility = pokemon.abilities?.[0] ?? "";
    defenderAbilityActive = true;
    defenderDefRank = 0;
    defenderSpDefRank = 0;
    const boxEntry = tab1SourceMode === "box" ? box.find((e) => e.pokemon.id === pokemon.id) : null;
    if (boxEntry) {
      defenderHpEV = boxEntry.ev.hp;
      defenderDefEV = boxEntry.ev.def;
      defenderSpDefEV = boxEntry.ev.spDef;
      const nat = NATURES.find((n) => n.name === boxEntry.natureName);
      defenderDefNature = nat?.def ?? 1.0;
      defenderSpDefNature = nat?.spDef ?? 1.0;
      tab1DefenderItem = boxEntry.heldItem;
    } else {
      defenderHpEV = 0;
      defenderDefEV = 0;
      defenderDefNature = 1.0;
      defenderSpDefEV = 0;
      defenderSpDefNature = 1.0;
    }
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
        const defenderHpWithEV = Math.floor((2 * defenderStats.hp + 31 + defenderHpEV * 2) * 50 / 100) + 60;
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
          attackerItem: tab1AttackerItem || undefined,
          defenderItem: tab1DefenderItem || undefined,
          defenderHpOverride: defenderHpWithEV,
          attackerAbility: attackerAbility || undefined,
          defenderAbility: defenderAbility || undefined,
          attackerAbilityActive,
          defenderAbilityActive,
          moveFlags: {
            contact: move.contact,
            pulse: move.pulse,
            bite: move.bite,
            punch: move.punch,
            slicing: move.slicing,
          },
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
          const koCount = Math.round(damageResult.koChance / 100 * 16);
          const koStr =
            damageResult.koChance === 100 ? "確定" :
            damageResult.koChance === 0   ? "" :
            `乱${koCount}/16`;
          const koBadgeClass = koCount === 16 ? "" : koCount >= 8 ? " damage-ko-badge--orange" : " damage-ko-badge--yellow";
          const koBadge = koStr ? `<span class="damage-ko-badge${koBadgeClass}">${koStr}</span>` : "";
          body.innerHTML = `<span class="damage-move-damage-text">${dmgStr}</span>${koBadge}`;

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
    btn.innerHTML = `<img class="type-btn-img" src="img/type/sv/${TYPE_SV_IMG[typeName] ?? typeName}.png" alt="${typeName}" />`;
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
    { label: "物理", value: "物理" },
    { label: "特殊", value: "特殊" },
  ];
  options.forEach(({ label, value }) => {
    const isActive = damageMovesCategoryFilter === value;
    const btn = document.createElement("button");
    btn.type = "button";
    let cls = "damage-move-category-btn";
    if (value === "物理") cls += " damage-move-category-btn--physical";
    else if (value === "特殊") cls += " damage-move-category-btn--special";
    if (isActive) cls += " is-active";
    btn.className = cls;
    btn.textContent = label;
    btn.addEventListener("click", () => {
      // アクティブなボタンをクリックしたら解除（全件表示に戻る）
      damageMovesCategoryFilter = damageMovesCategoryFilter === value ? null : value;
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

  fetch("data/abilities.json")
    .then((res) => (res.ok ? res.json() : []))
    .then((data: AbilityDef[]) => { abilitiesData = Array.isArray(data) ? data : []; })
    .catch(() => { abilitiesData = []; });

  fetch("data/item.json")
    .then((res) => (res.ok ? res.json() : []))
    .then((data: CompetitiveItem[]) => {
      maItems = Array.isArray(data) ? data : [];
    })
    .catch(() => { maItems = []; });

  document.getElementById("damage-attacker-ability-select")?.addEventListener("change", (e) => {
    attackerAbility = (e.target as HTMLSelectElement).value;
    attackerAbilityActive = true;
    renderTab1DamageDisplay();
  });
  document.getElementById("damage-defender-ability-select")?.addEventListener("change", (e) => {
    defenderAbility = (e.target as HTMLSelectElement).value;
    defenderAbilityActive = true;
    renderTab1DamageDisplay();
  });
  document.getElementById("damage-attacker-ability-toggle")?.addEventListener("click", () => {
    attackerAbilityActive = !attackerAbilityActive;
    renderTab1DamageDisplay();
  });
  document.getElementById("damage-defender-ability-toggle")?.addEventListener("click", () => {
    defenderAbilityActive = !defenderAbilityActive;
    renderTab1DamageDisplay();
  });

  document.getElementById("damage-defender-select")?.addEventListener("click", () => openTab1PokemonSelect("defend"));
  document.getElementById("damage-attacker-select")?.addEventListener("click", () => openTab1PokemonSelect("attack"));
  document.querySelector(".damage-slot-defender .damage-slot-img-wrap")?.addEventListener("click", () => openTab1PokemonSelect("defend"));
  document.querySelector(".damage-slot-attacker .damage-slot-img-wrap")?.addEventListener("click", () => openTab1PokemonSelect("attack"));
  document.getElementById("damage-swap-btn")?.addEventListener("click", swapAttackerDefender);
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
        input.value = "32";
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
  document.getElementById("box-detail-delete-btn")?.addEventListener("click", deleteBoxEntry);
  // 技検索（タブ③）
  document.getElementById("box-moves-search")?.addEventListener("input", (e) => {
    boxMoveSearchText = (e.target as HTMLInputElement).value;
    renderBoxMoveList();
  });
  // 技検索（タブ①）
  document.getElementById("damage-moves-search")?.addEventListener("input", () => {
    renderTab1MovesList();
  });
  // ポケモン名検索（タブ①選択モーダル）
  document.getElementById("tab1-pokemon-name-search")?.addEventListener("input", (e) => {
    tab1NameSearchText = (e.target as HTMLInputElement).value;
    renderTab1SelectList();
  });
  // アイテムピッカー（タブ①）
  document.getElementById("damage-attacker-item-display")?.addEventListener("click", () => openTab1ItemPicker("attacker"));
  document.getElementById("damage-defender-item-display")?.addEventListener("click", () => openTab1ItemPicker("defender"));
  document.getElementById("tab1-attacker-item-search")?.addEventListener("input", (e) => {
    tab1AttackerItemSearch = (e.target as HTMLInputElement).value;
    renderTab1ItemGrid("attacker");
  });
  document.getElementById("tab1-defender-item-search")?.addEventListener("input", (e) => {
    tab1DefenderItemSearch = (e.target as HTMLInputElement).value;
    renderTab1ItemGrid("defender");
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
    else if (target.classList.contains("damage-ev-btn-252")) input.value = "32";
    else if (target.classList.contains("damage-ev-step-up")) input.value = String(getNextEvStep(val));
    else if (target.classList.contains("damage-ev-step-down")) input.value = String(getPrevEvStep(val));
    if (boxEditingPokemon) updateBoxEditRealStats(boxEditingPokemon);
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

  // タブ1: ソース切替ボタン
  document.getElementById("tab1-source-toggle")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".picker-source-btn");
    if (!btn?.dataset.source) return;
    tab1SourceMode = btn.dataset.source as "all" | "box";
    tab1SelectTypeFilter = null;
    updateTab1SourceSortUI();
    renderTab1SelectTypeButtons();
    renderTab1SelectList();
  });
  // タブ1: ソート選択
  document.getElementById("tab1-sort-select")?.addEventListener("change", (e) => {
    tab1SortKey = (e.target as HTMLSelectElement).value as "number" | "name";
    renderTab1SelectList();
  });
  // タブ1: 最終進化トグル
  document.getElementById("tab1-evo-toggle")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".picker-evo-btn");
    if (!btn?.dataset.evo) return;
    tab1ShowOnlyFinalEvolution = btn.dataset.evo === "final";
    updateTab1SourceSortUI();
    renderTab1SelectList();
  });
  // タブ1: レギュレーショントグル
  document.getElementById("tab1-regulation-toggle")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".picker-regulation-btn");
    if (!btn?.dataset.regulation) return;
    tab1RegulationFilter = btn.dataset.regulation as "M-A" | "all";
    updateTab1SourceSortUI();
    renderTab1SelectList();
  });
  // タブ2: ソース切替ボタン
  document.getElementById("picker-source-toggle")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".picker-source-btn");
    if (!btn?.dataset.source) return;
    pickerSourceMode = btn.dataset.source as "all" | "box";
    pickerTypeFilter = null;
    updatePickerSourceSortUI();
    renderPickerTypeButtons();
    renderPickerList();
  });
  // タブ2: 最終進化トグル
  document.getElementById("picker-evo-toggle")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".picker-evo-btn");
    if (!btn?.dataset.evo) return;
    pickerShowOnlyFinalEvolution = btn.dataset.evo === "final";
    updatePickerSourceSortUI();
    renderPickerList();
  });
  // タブ2: レギュレーショントグル
  document.getElementById("picker-regulation-toggle")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".picker-regulation-btn");
    if (!btn?.dataset.regulation) return;
    pickerRegulationFilter = btn.dataset.regulation as "M-A" | "all";
    updatePickerSourceSortUI();
    renderPickerList();
  });
  // タブ2: ソート選択
  document.getElementById("picker-sort-select")?.addEventListener("change", (e) => {
    pickerSortKey = (e.target as HTMLSelectElement).value as "number" | "name";
    renderPickerList();
  });

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

// ========== 配信コントロールパネル ==========
(function initStreamingPanel() {

  // ---- タブ切り替え ----
  const streamingTabBtns = document.querySelectorAll<HTMLButtonElement>(".streaming-tab-btn");
  const streamingTabPanels = document.querySelectorAll<HTMLElement>(".streaming-tab-panel");
  streamingTabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.streamingTab;
      streamingTabBtns.forEach((b) => {
        b.classList.toggle("is-active", b === btn);
        b.setAttribute("aria-selected", b === btn ? "true" : "false");
      });
      streamingTabPanels.forEach((panel) => {
        panel.hidden = panel.id !== `streaming-tab-${target}`;
      });
    });
  });

  // ---- 設定ダイアログ ----
  const settingsDialog  = document.getElementById("stream-settings-dialog") as HTMLElement | null;
  const settingsOpenBtn = document.getElementById("stream-settings-open-btn") as HTMLButtonElement | null;
  const settingsCloseBtn= document.getElementById("ssd-close-btn")           as HTMLButtonElement | null;
  const settingsCancelBtn = document.getElementById("ssd-cancel-btn")        as HTMLButtonElement | null;
  const settingsSaveBtn = document.getElementById("ssd-save-btn")            as HTMLButtonElement | null;

  function openSettingsDialog() {
    if (settingsDialog) settingsDialog.hidden = false;
  }
  function closeSettingsDialog() {
    if (settingsDialog) settingsDialog.hidden = true;
  }

  settingsOpenBtn?.addEventListener("click", openSettingsDialog);
  settingsCloseBtn?.addEventListener("click", closeSettingsDialog);
  settingsCancelBtn?.addEventListener("click", closeSettingsDialog);
  settingsSaveBtn?.addEventListener("click", closeSettingsDialog);

  // オーバーレイ背景クリックで閉じる
  settingsDialog?.addEventListener("click", (e) => {
    if (e.target === settingsDialog) closeSettingsDialog();
  });

  // サービス選択 → サーバー URL 自動入力 / ヘルプ切り替え
  const SERVICE_RTMP: Record<string, string> = {
    twitch:  "rtmp://live.twitch.tv/app",
    youtube: "rtmp://a.rtmp.youtube.com/live2",
    custom:  "",
  };
  const settingService   = document.getElementById("setting-service")   as HTMLSelectElement | null;
  const settingServer    = document.getElementById("setting-server")     as HTMLInputElement  | null;
  const settingStreamKey = document.getElementById("setting-stream-key") as HTMLInputElement  | null;
  const settingKeyToggle = document.getElementById("setting-stream-key-toggle") as HTMLButtonElement | null;
  const helpYoutube      = document.getElementById("ssd-help-youtube")   as HTMLElement | null;
  const helpTwitch       = document.getElementById("ssd-help-twitch")    as HTMLElement | null;

  function updateServerFromService() {
    if (!settingService || !settingServer) return;
    const svc = settingService.value;
    settingServer.value    = SERVICE_RTMP[svc] ?? "";
    settingServer.readOnly = svc !== "custom";
    settingServer.placeholder = svc === "custom" ? "rtmp://..." : "";
    if (helpYoutube) helpYoutube.hidden = svc !== "youtube";
    if (helpTwitch)  helpTwitch.hidden  = svc !== "twitch";
  }
  settingService?.addEventListener("change", updateServerFromService);
  updateServerFromService();

  settingKeyToggle?.addEventListener("click", () => {
    if (!settingStreamKey) return;
    const hide = settingStreamKey.type === "password";
    settingStreamKey.type = hide ? "text" : "password";
    if (settingKeyToggle) settingKeyToggle.textContent = hide ? "非表示" : "表示";
  });

  // x264 専用フィールドをエンコーダー選択に応じて表示切替
  const settingEncoder   = document.getElementById("setting-encoder")   as HTMLSelectElement | null;
  const ssdPresetField   = document.getElementById("ssd-preset-field")  as HTMLElement | null;
  const ssdProfileField  = document.getElementById("ssd-profile-field") as HTMLElement | null;
  function updateEncoderFields() {
    const isX264 = settingEncoder?.value === "x264";
    if (ssdPresetField)  ssdPresetField.hidden  = !isX264;
    if (ssdProfileField) ssdProfileField.hidden = !isX264;
  }
  settingEncoder?.addEventListener("change", updateEncoderFields);
  updateEncoderFields();

  // ---- 音量ミキサー & VU メーター ----
  const mixerChannelsEl = document.getElementById("stream-mixer-channels") as HTMLElement | null;
  const mixerEmptyEl    = document.getElementById("stream-mixer-empty")    as HTMLElement | null;

  let audioCtx:    AudioContext  | null = null;
  let analyserNode: AnalyserNode | null = null;
  let animFrameId: number | null = null;
  let analyserBuf: Float32Array<ArrayBuffer> | null = null;

  interface MixerChannelState {
    muted:     boolean;
    volume:    number;   // 0.0 – 2.0
    peakLevel: number;   // 0 – 100
    peakHoldUntil: number; // performance.now() timestamp
    maskEl: HTMLElement;
    peakEl: HTMLElement;
  }
  const channelStates: MixerChannelState[] = [];

  const PEAK_HOLD_MS   = 1500;
  const PEAK_DROP_RATE = 0.5; // % per frame

  function createMixerChannel(trackLabel: string): MixerChannelState {
    const wrap = document.createElement("div");
    wrap.className = "mixer-channel";

    // チャンネル名
    const nameEl = document.createElement("div");
    nameEl.className = "mixer-channel-name";
    nameEl.textContent = trackLabel;

    // コントロール行
    const rowEl = document.createElement("div");
    rowEl.className = "mixer-channel-row";

    const muteBtn = document.createElement("button");
    muteBtn.type = "button";
    muteBtn.className = "mixer-mute-btn";
    muteBtn.title = "ミュート";
    muteBtn.textContent = "🔊";

    const slider = document.createElement("input");
    slider.type  = "range";
    slider.className = "mixer-volume-slider";
    slider.min = "0"; slider.max = "200"; slider.value = "100";

    const valueLabel = document.createElement("span");
    valueLabel.className = "mixer-volume-value";
    valueLabel.textContent = "100%";

    rowEl.append(muteBtn, slider, valueLabel);

    // VU バー
    const vuBar  = document.createElement("div");  vuBar.className  = "mixer-vu-bar";
    const vuGrad = document.createElement("div");  vuGrad.className = "mixer-vu-bar-gradient";
    const vuMask = document.createElement("div");  vuMask.className = "mixer-vu-bar-mask"; vuMask.style.width = "100%";
    const vuPeak = document.createElement("div");  vuPeak.className = "mixer-vu-peak";     vuPeak.style.left  = "0%";
    vuBar.append(vuGrad, vuMask, vuPeak);

    wrap.append(nameEl, rowEl, vuBar);
    mixerChannelsEl?.appendChild(wrap);

    const state: MixerChannelState = {
      muted: false, volume: 1.0,
      peakLevel: 0, peakHoldUntil: 0,
      maskEl: vuMask, peakEl: vuPeak,
    };

    muteBtn.addEventListener("click", () => {
      state.muted = !state.muted;
      muteBtn.textContent = state.muted ? "🔇" : "🔊";
      muteBtn.classList.toggle("is-muted", state.muted);
      if (videoEl) videoEl.muted = state.muted;
    });
    slider.addEventListener("input", () => {
      const v = Number(slider.value);
      state.volume = v / 100;
      valueLabel.textContent = `${v}%`;
      if (videoEl && !state.muted) videoEl.volume = Math.min(1, state.volume);
    });

    return state;
  }

  function setupMixer(stream: MediaStream) {
    teardownMixer();

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      if (mixerEmptyEl) mixerEmptyEl.hidden = false;
      return;
    }
    if (mixerEmptyEl) mixerEmptyEl.hidden = true;

    // AudioContext & AnalyserNode（音量分析専用・再生はvideoEl経由のまま）
    audioCtx = audioCtx ?? new AudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume();
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 1024;
    analyserNode.smoothingTimeConstant = 0.25;
    audioCtx.createMediaStreamSource(stream).connect(analyserNode);

    audioTracks.forEach((t) => channelStates.push(createMixerChannel(t.label || "音声入力")));

    animateMeter();
  }

  function teardownMixer() {
    if (animFrameId !== null) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    analyserNode = null;
    analyserBuf  = null;
    channelStates.length = 0;
    // DOM クリア（empty メッセージだけ残す）
    if (mixerChannelsEl && mixerEmptyEl) {
      while (mixerChannelsEl.firstChild) mixerChannelsEl.removeChild(mixerChannelsEl.firstChild);
      mixerEmptyEl.hidden = false;
      mixerChannelsEl.appendChild(mixerEmptyEl);
    }
  }

  function animateMeter() {
    animFrameId = requestAnimationFrame(animateMeter);
    if (!analyserNode || channelStates.length === 0) return;

    const size = analyserNode.fftSize;
    if (!analyserBuf || analyserBuf.length !== size) analyserBuf = new Float32Array(size) as Float32Array<ArrayBuffer>;
    analyserNode.getFloatTimeDomainData(analyserBuf);

    // RMS → dB → 0–100%
    let sumSq = 0;
    for (let i = 0; i < size; i++) sumSq += analyserBuf[i] * analyserBuf[i];
    const rms   = Math.sqrt(sumSq / size);
    const db    = 20 * Math.log10(Math.max(rms, 1e-5));
    const level = Math.max(0, Math.min(100, (db + 60) / 60 * 100));

    const now = performance.now();
    for (const s of channelStates) {
      // ピーク
      if (level >= s.peakLevel) {
        s.peakLevel     = level;
        s.peakHoldUntil = now + PEAK_HOLD_MS;
      } else if (now > s.peakHoldUntil) {
        s.peakLevel = Math.max(0, s.peakLevel - PEAK_DROP_RATE);
      }
      // VU バー: マスクを右から動かして点灯量を表現
      s.maskEl.style.width = `${100 - level}%`;
      s.peakEl.style.left  = `${s.peakLevel}%`;
    }
  }

  // ストリーム開始/終了を購読
  streamChangeCallbacks.push((stream) => {
    if (stream) setupMixer(stream);
    else        teardownMixer();
  });
  // 既にストリームが存在する場合は即セットアップ
  if (currentStream) setupMixer(currentStream);

  // ---- 配信開始/停止ボタン ----
  const toggleBtn  = document.getElementById("stream-toggle-btn")   as HTMLButtonElement | null;
  const statusRoot = document.getElementById("stream-status")        as HTMLElement       | null;
  const statusText = document.getElementById("stream-status-text")   as HTMLElement       | null;

  type StreamState = "idle" | "connecting" | "live" | "error";
  let currentState: StreamState = "idle";

  function applyStreamState(state: StreamState, message?: string) {
    currentState = state;
    if (statusRoot) statusRoot.dataset.state = state;
    if (statusText) {
      statusText.textContent = {
        idle:       "停止中",
        connecting: "接続中…",
        live:       "配信中",
        error:      message ?? "エラー",
      }[state];
    }
    if (toggleBtn) {
      const isActive = state === "live" || state === "connecting";
      toggleBtn.textContent = isActive ? "配信停止" : "配信開始";
      toggleBtn.classList.toggle("streaming-btn--stop",  isActive);
      toggleBtn.classList.toggle("streaming-btn--start", !isActive);
      toggleBtn.disabled = state === "connecting";
    }
  }

  function getSettingVal(id: string, fallback: string | number): string {
    const el = document.getElementById(id) as (HTMLInputElement | HTMLSelectElement) | null;
    return el?.value ?? String(fallback);
  }

  let mediaRecorder: MediaRecorder | null = null;

  function stopMediaRecorder() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    mediaRecorder = null;
  }

  toggleBtn?.addEventListener("click", async () => {
    if (currentState === "live" || currentState === "connecting") {
      stopMediaRecorder();
      await (window as any).electronAPI?.stopStream?.();
      return;
    }

    // 映像ソース未選択チェック
    if (!currentStream) {
      applyStreamState("error", "左上のデバイス選択で映像ソースを選択してください");
      return;
    }

    const rtmpUrl   = settingServer?.value.trim()    ?? "";
    const streamKey = settingStreamKey?.value.trim() ?? "";
    if (!rtmpUrl || !streamKey) {
      applyStreamState("error", "設定でサーバーとストリームキーを入力してください");
      return;
    }

    applyStreamState("connecting");

    // ① MediaRecorder を先に起動してヘッダーチャンクをバッファさせる
    const stream = currentStream;
    const mimeType = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"]
      .find((t) => MediaRecorder.isTypeSupported(t)) ?? "video/webm";

    try {
      mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          e.data.arrayBuffer().then((buf) => {
            (window as any).electronAPI?.sendStreamChunk?.(buf);
          });
        }
      };
      mediaRecorder.onerror = () => {
        applyStreamState("error", "エンコードエラーが発生しました");
        stopMediaRecorder();
      };
      mediaRecorder.start(200); // 200ms ごとにチャンクを送信
    } catch (err) {
      applyStreamState("error", `MediaRecorder 起動失敗: ${String(err)}`);
      return;
    }

    // ② WebM ヘッダーチャンクが生成されるまで少し待つ
    await new Promise<void>((resolve) => setTimeout(resolve, 400));

    // ③ FFmpeg 起動（バッファ済みヘッダーチャンクが即座に流れる）
    const result = await (window as any).electronAPI?.startStream?.({
      rtmpUrl,
      streamKey,
      videoBitrate: Number(getSettingVal("setting-video-bitrate", 6000)),
      audioBitrate: Number(getSettingVal("setting-audio-bitrate", 160)),
      encoder:      getSettingVal("setting-encoder",      "x264"),
      rateControl:  getSettingVal("setting-rate-control", "CBR"),
      preset:       getSettingVal("setting-preset",       "veryfast"),
      profile:      getSettingVal("setting-profile",      "high"),
      keyframe:     Number(getSettingVal("setting-keyframe", 2)),
      resolution:   getSettingVal("setting-resolution",   "1920x1080"),
      fps:          Number(getSettingVal("setting-fps",   30)),
    });

    if (result && !result.success) {
      stopMediaRecorder();
      applyStreamState("error", result.error);
    }
  });

  // メインプロセスからのステータス通知
  (window as any).electronAPI?.onStreamStatus?.(
    (status: { state: StreamState; message?: string }) => applyStreamState(status.state, status.message)
  );
})();
