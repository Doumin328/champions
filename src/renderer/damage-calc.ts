/**
 * 公式ダメージ計算（Gen5以降の式）
 * renderer.ts からもブラウザ直読みで使えるよう、module export ではなく
 * グローバルスクリプトとして読み込む。
 */

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
const FREEZE_DRY_MOVE_NAME = "フリーズドライ";
const WEATHER_BALL_MOVE_NAME = "ウェザーボール";
const WEATHER_BALL_TYPE_BY_WEATHER: Record<string, string> = {
  はれ: "ほのお",
  あめ: "みず",
  ゆき: "こおり",
  すなあらし: "いわ",
};
const SPECIAL_MOVES_TARGET_DEFENSE = new Set(["サイコショック", "サイコブレイク", "しんぴのつるぎ"]);

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

interface BaseStats {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
}

interface DamageMoveFlags {
  contact?: boolean;
  pulse?: boolean;
  bite?: boolean;
  punch?: boolean;
  slicing?: boolean;
}

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
  forceWeather?: string;
  defStatMult?: number;
  superEffMult?: number;
  damageMult?: number;
  typeResistMulti?: { type: string; mult: number }[];
  conditional?: boolean;
  weatherCondition?: string;
  powerMultTypes?: string[];
  powerMultMaxPower?: number;
  parentalBondMult?: number;
  requiresFlag?: keyof DamageMoveFlags;
  normalTypeChange?: string;
  scrappy?: boolean;
}

interface DamageInput {
  movePower: number | null;
  moveName?: string;
  moveType: string;
  moveCategory: string;
  attackerTypes: string[];
  attackerBaseStats: BaseStats;
  defenderTypes: string[];
  defenderBaseStats: BaseStats;
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
  abilityDefs?: AbilityDef[];
  isBurned?: boolean;
  typeBoostActive?: boolean;
  wall?: string;
  isCritical?: boolean;
  moveFlags?: DamageMoveFlags;
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
  isUnsupportedMove?: boolean;
  unsupportedReason?: string;
  damageRolls?: number[];
}

interface MoveDamageResult extends DamageResult {
  criticalResult?: DamageResult;
}

interface DamageMove {
  name: string;
  type: string;
  category: string;
  power: number | null;
  contact?: boolean;
  pulse?: boolean;
  bite?: boolean;
  punch?: boolean;
  slicing?: boolean;
}

interface CalculateMoveDamageInput {
  move: DamageMove;
  baseInput: Omit<DamageInput, "movePower" | "moveName" | "moveType" | "moveCategory" | "moveFlags">;
  defenderWeightKg?: number;
  defenderHpFallback: number;
  tripleAxelHits?: number;
  fixedDamage?: number;
}

function getTypeEff(moveType: string, defenderTypes: string[], moveName?: string): number {
  const row = TYPE_CHART[moveType];
  if (!row) return 1;
  let mult = 1;
  for (const t of defenderTypes) {
    mult *= moveName === FREEZE_DRY_MOVE_NAME && moveType === "こおり" && t === "みず"
      ? 2
      : row[t] ?? 1;
  }
  return mult;
}

/** Lv50・能力ポイント込みのHP実数値。IV=31固定、ev=能力ポイント(0〜32) */
function calcHpStatWithEV(base: number, ev: number): number {
  return Math.floor((2 * base + 31 + ev * 2) * DMG_LEVEL / 100) + DMG_LEVEL + 10;
}

/** Lv50・能力ポイント・性格補正込みの非HP実数値。IV=31固定、ev=能力ポイント(0〜32) */
function calcStatWithEV(base: number, ev: number, nature: number): number {
  const raw = Math.floor((Math.floor((2 * base + 31 + ev * 2) * DMG_LEVEL / 100) + 5) * nature);
  return Math.max(1, raw);
}

function calcStat(base: number, isHP: boolean): number {
  return isHP ? calcHpStatWithEV(base, 0) : calcStatWithEV(base, 0, 1);
}

function roundHalfDown(value: number): number {
  const floored = Math.floor(value);
  return value - floored > 0.5 ? floored + 1 : floored;
}

/** 能力ランク(-6〜+6)の倍率を返す */
function rankMult(rank: number): number {
  const n = Math.max(-6, Math.min(6, rank));
  return n >= 0 ? (2 + n) / 2 : 2 / (2 - n);
}

/**
 * 公式ダメージ計算（Gen5以降）
 * 乱数は 85〜100 の16段階で計算し、min/max と各乱数ダメージを返す。
 */
function calculateDamage(input: DamageInput): DamageResult {
  const {
    movePower,
    moveName,
    moveType,
    moveCategory,
    attackerTypes,
    attackerBaseStats,
    defenderTypes,
    defenderBaseStats,
    attackerStatOverride,
    defenderStatOverride,
    weather,
    terrain,
    attackerItem,
    defenderItem,
    wall,
  } = input;
  const defenderHP = input.defenderHpOverride ?? calcStat(defenderBaseStats.hp, true);
  if (moveCategory === "変化" || movePower == null || movePower <= 0) {
    return { damageMin: 0, damageMax: 0, percentMin: 0, percentMax: 0, defenderHP, remainingHPMin: defenderHP, remainingHPMax: defenderHP, isStatusMove: true, isImmune: false, koChance: 0 };
  }

  const abilityDefs = input.abilityDefs ?? [];
  const atkAbActive = input.attackerAbilityActive !== false;
  const defAbActive = input.defenderAbilityActive !== false;
  const atkAb = atkAbActive && input.attackerAbility ? abilityDefs.find((a) => a.name === input.attackerAbility) : undefined;
  const defAb = defAbActive && input.defenderAbility ? abilityDefs.find((a) => a.name === input.defenderAbility) : undefined;
  const ignoreDefAb = atkAb?.ignoreDefenderAbility ?? false;

  const effectiveWeather = atkAb?.forceWeather ?? ((atkAb?.ignoreWeather || defAb?.ignoreWeather) ? "" : (weather ?? ""));
  const weatherBallType = moveName === WEATHER_BALL_MOVE_NAME ? WEATHER_BALL_TYPE_BY_WEATHER[effectiveWeather] : undefined;
  const baseMoveType = weatherBallType ?? moveType;
  const isNormalTypeMove = baseMoveType === "ノーマル";
  const effectiveMoveType = (atkAb?.normalTypeChange && isNormalTypeMove) ? atkAb.normalTypeChange : baseMoveType;

  const typeEff = atkAb?.scrappy && (effectiveMoveType === "ノーマル" || effectiveMoveType === "かくとう") && defenderTypes.includes("ゴースト")
    ? defenderTypes.reduce((mult, t) => mult * (t === "ゴースト" ? 1 : (TYPE_CHART[effectiveMoveType]?.[t] ?? 1)), 1)
    : getTypeEff(effectiveMoveType, defenderTypes, moveName);
  if (typeEff === 0) {
    return { damageMin: 0, damageMax: 0, percentMin: 0, percentMax: 0, defenderHP, remainingHPMin: defenderHP, remainingHPMax: defenderHP, isStatusMove: false, isImmune: true, koChance: 0 };
  }

  const stab = attackerTypes.includes(effectiveMoveType) ? (atkAb?.stabMult ?? 1.5) : 1;
  const targetsDefense = moveName != null && SPECIAL_MOVES_TARGET_DEFENSE.has(moveName);
  const defenderStatCategory = targetsDefense ? "物理" : moveCategory;

  const atkBase = moveCategory === "物理"
    ? (attackerStatOverride?.attack ?? calcStat(attackerBaseStats.attack, false))
    : (attackerStatOverride?.spAttack ?? calcStat(attackerBaseStats.spAttack, false));
  const defBase = defenderStatCategory === "物理"
    ? (defenderStatOverride?.defense ?? calcStat(defenderBaseStats.defense, false))
    : (defenderStatOverride?.spDefense ?? calcStat(defenderBaseStats.spDefense, false));
  const isCritical = input.isCritical === true;
  const rawAtkRank = moveCategory === "物理" ? (input.attackerAtkRank ?? 0) : (input.attackerSpAtkRank ?? 0);
  const rawDefRank = defenderStatCategory === "物理" ? (input.defenderDefRank ?? 0) : (input.defenderSpDefRank ?? 0);
  const atkRank = isCritical && rawAtkRank < 0 ? 0 : rawAtkRank;
  const defRank = isCritical && rawDefRank > 0 ? 0 : rawDefRank;

  const atkItemMult = (attackerItem === "choice-band" && moveCategory === "物理") ? 1.5
    : (attackerItem === "choice-specs" && moveCategory === "特殊") ? 1.5 : 1;
  const defItemMult = defenderStatCategory === "物理"
    ? (defenderItem === "eviolite" ? 1.5 : 1)
    : (defenderItem === "assault-vest" || defenderItem === "eviolite" ? 1.5 : 1);

  const atkAbStatCondMet = !atkAb?.weatherCondition || effectiveWeather === atkAb.weatherCondition;
  const atkAbMult = (atkAb?.atkStatMult != null && atkAbStatCondMet && (!atkAb.moveCategory || atkAb.moveCategory === moveCategory)) ? atkAb.atkStatMult : 1;
  const defAbMult = !ignoreDefAb && defAb?.defStatMult != null && (!defAb.moveCategory || defAb.moveCategory === defenderStatCategory) ? defAb.defStatMult : 1;
  const snowDefenseMult = effectiveWeather === "ゆき" && defenderStatCategory === "物理" && defenderTypes.includes("こおり") ? 1.5 : 1;

  const atkStat = Math.max(1, Math.floor(Math.floor(atkBase * rankMult(atkRank)) * atkItemMult * atkAbMult));
  const defStat = Math.max(1, Math.floor(Math.floor(defBase * rankMult(defRank)) * defItemMult * defAbMult * snowDefenseMult));

  const baseMovePower = weatherBallType ? 100 : movePower;
  const boostedMovePower = input.typeBoostActive ? Math.floor(baseMovePower * 1.2) : baseMovePower;
  const powerMultCondMet =
    (!atkAb?.powerMultMaxPower || boostedMovePower <= atkAb.powerMultMaxPower) &&
    (!atkAb?.powerMultTypes   || atkAb.powerMultTypes.includes(effectiveMoveType)) &&
    (!atkAb?.weatherCondition || effectiveWeather === atkAb.weatherCondition) &&
    (!atkAb?.requiresFlag     || input.moveFlags?.[atkAb.requiresFlag] === true) &&
    (!atkAb?.normalTypeChange || isNormalTypeMove);
  const effectivePower = Math.floor(boostedMovePower * ((atkAb?.powerMult != null && powerMultCondMet) ? atkAb.powerMult : 1));

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

  let attackerDamageMult = 1;
  if (attackerItem === "life-orb") attackerDamageMult = 1.3;
  else if (attackerItem === "expert-belt" && typeEff > 1) attackerDamageMult = 1.2;
  else if (attackerItem && TYPE_BOOSTER_ITEM_MAP[attackerItem] === effectiveMoveType) attackerDamageMult = 1.2;

  let defenderDamageReduceMult = 1;
  if (defenderItem && TYPE_BERRY_MAP[defenderItem] === effectiveMoveType && typeEff > 1) defenderDamageReduceMult = 0.5;

  let attackerAbTypeMult = 1;
  if (atkAb?.typeDamageMult?.type === effectiveMoveType) attackerAbTypeMult = atkAb.typeDamageMult.mult;

  let defAbTypeMult = 1;
  if (!ignoreDefAb && defAb?.typeResistMulti) {
    const r = defAb.typeResistMulti.find((e) => e.type === effectiveMoveType);
    if (r) defAbTypeMult = r.mult;
  }

  let superEffAbMult = 1;
  if (!ignoreDefAb && defAb?.superEffMult != null && typeEff > 1) superEffAbMult = defAb.superEffMult;

  let defDamageMult = 1;
  if (!ignoreDefAb && defAb?.damageMult != null) defDamageMult = defAb.damageMult;
  const burnMult = input.isBurned && moveCategory === "物理" ? 0.5 : 1;
  const wallApplies = (wall === "ひかりのかべ" && moveCategory === "特殊")
    || (wall === "リフレクター" && moveCategory === "物理");
  const wallMult = !isCritical && wallApplies ? 0.5 : 1;

  const parentalBondMult = atkAb?.parentalBondMult ?? 1;
  const criticalMult = isCritical ? 1.5 : 1;
  const mMult = terrainMult * attackerDamageMult * defenderDamageReduceMult
    * attackerAbTypeMult * defAbTypeMult * superEffAbMult * defDamageMult * wallMult;
  const applyRoll = (r: number): number => {
    let d = base;
    d = roundHalfDown(d * 1);
    d = roundHalfDown(d * parentalBondMult);
    d = roundHalfDown(d * weatherMult);
    d = roundHalfDown(d * criticalMult);
    d = Math.floor(d * r / 100);
    d = roundHalfDown(d * stab);
    d = Math.floor(d * typeEff);
    d = roundHalfDown(d * burnMult);
    d = roundHalfDown(d * mMult);
    d = roundHalfDown(d * 1);
    return Math.max(1, d);
  };
  const rolls = Array.from({ length: 16 }, (_, i) => applyRoll(85 + i));
  const damageMin = rolls[0];
  const damageMax = rolls[15];
  const koCount = rolls.filter((d) => d >= defenderHP).length;
  const koChance = (koCount / 16) * 100;
  return {
    damageMin,
    damageMax,
    percentMin: (damageMin / defenderHP) * 100,
    percentMax: (damageMax / defenderHP) * 100,
    defenderHP,
    remainingHPMin: Math.max(0, defenderHP - damageMax),
    remainingHPMax: Math.max(0, defenderHP - damageMin),
    isStatusMove: false,
    isImmune: false,
    koChance,
    damageRolls: rolls,
  };
}

const WEIGHT_BASED_MOVE_NAMES = new Set(["けたぐり"]);

function isWeightBasedMove(move: DamageMove): boolean {
  return WEIGHT_BASED_MOVE_NAMES.has(move.name);
}

function getWeightBasedMovePower(weightKg: number): number {
  if (weightKg < 10) return 20;
  if (weightKg < 25) return 40;
  if (weightKg < 50) return 60;
  if (weightKg < 100) return 80;
  if (weightKg < 200) return 100;
  return 120;
}

function resolveMovePower(move: DamageMove, defender: { weightKg?: number } | null): number | null {
  if (!isWeightBasedMove(move)) return move.power;
  const weightKg = defender?.weightKg;
  return typeof weightKg === "number" && Number.isFinite(weightKg)
    ? getWeightBasedMovePower(weightKg)
    : null;
}

function createUnsupportedMoveResult(defenderHP: number, reason: string): DamageResult {
  return {
    damageMin: 0,
    damageMax: 0,
    percentMin: 0,
    percentMax: 0,
    defenderHP,
    remainingHPMin: defenderHP,
    remainingHPMax: defenderHP,
    isStatusMove: false,
    isImmune: false,
    koChance: 0,
    isUnsupportedMove: true,
    unsupportedReason: reason,
  };
}

function combineDamageResults(hitResults: DamageResult[], defenderHpFallback: number): DamageResult {
  const totalMin = hitResults.reduce((sum, r) => sum + r.damageMin, 0);
  const totalMax = hitResults.reduce((sum, r) => sum + r.damageMax, 0);
  const defenderHP = hitResults[0]?.defenderHP ?? defenderHpFallback;
  const damageRolls = hitResults.every((r) => r.damageRolls && r.damageRolls.length > 0)
    ? hitResults.reduce<number[]>(
        (totals, result) => totals.flatMap((total) => result.damageRolls!.map((damage) => total + damage)),
        [0],
      )
    : undefined;
  const koChance = damageRolls
    ? (damageRolls.filter((damage) => damage >= defenderHP).length / damageRolls.length) * 100
    : totalMin >= defenderHP ? 100 : 0;
  return {
    damageMin: totalMin,
    damageMax: totalMax,
    percentMin: (totalMin / defenderHP) * 100,
    percentMax: (totalMax / defenderHP) * 100,
    defenderHP,
    remainingHPMin: Math.max(0, defenderHP - totalMax),
    remainingHPMax: Math.max(0, defenderHP - totalMin),
    isStatusMove: hitResults.every((r) => r.isStatusMove),
    isImmune: hitResults.every((r) => r.isImmune),
    koChance,
    damageRolls,
  };
}

function addFixedDamageToResult(result: DamageResult, fixedDamage: number): DamageResult {
  if (fixedDamage <= 0 || result.isStatusMove || result.isImmune || result.isUnsupportedMove) {
    return result;
  }
  const damageMin = result.damageMin + fixedDamage;
  const damageMax = result.damageMax + fixedDamage;
  const damageRolls = result.damageRolls?.map((damage) => damage + fixedDamage);
  const koChance = damageRolls
    ? (damageRolls.filter((damage) => damage >= result.defenderHP).length / damageRolls.length) * 100
    : damageMin >= result.defenderHP ? 100 : damageMax < result.defenderHP ? 0 : result.koChance;
  return {
    ...result,
    damageMin,
    damageMax,
    percentMin: (damageMin / result.defenderHP) * 100,
    percentMax: (damageMax / result.defenderHP) * 100,
    remainingHPMin: Math.max(0, result.defenderHP - damageMax),
    remainingHPMax: Math.max(0, result.defenderHP - damageMin),
    koChance,
    damageRolls,
  };
}

function addFixedDamageToMoveResult(result: MoveDamageResult, fixedDamage: number): MoveDamageResult {
  const next = addFixedDamageToResult(result, fixedDamage) as MoveDamageResult;
  if (result.criticalResult) {
    next.criticalResult = addFixedDamageToResult(result.criticalResult, fixedDamage);
  }
  return next;
}

function calculateMoveDamage(input: CalculateMoveDamageInput): MoveDamageResult {
  const { move, baseInput, defenderHpFallback } = input;
  const defenderWeight = input.defenderWeightKg;
  const resolvedPower = resolveMovePower(
    move,
    defenderWeight == null ? null : { weightKg: defenderWeight },
  );
  if (resolvedPower == null && isWeightBasedMove(move)) {
    return createUnsupportedMoveResult(
      defenderHpFallback,
      `${move.name}は相手のおもさが未登録のため計算できません`,
    ) as MoveDamageResult;
  }

  const damageInput = {
    ...baseInput,
    moveName: move.name,
    moveType: move.type,
    moveCategory: move.category,
    moveFlags: {
      contact: move.contact,
      pulse: move.pulse,
      bite: move.bite,
      punch: move.punch,
      slicing: move.slicing,
    },
  };
  const fixedDamage = input.fixedDamage ?? 0;

  if (move.name !== "トリプルアクセル") {
    const result = calculateDamage({ ...damageInput, movePower: resolvedPower });
    return addFixedDamageToMoveResult({
      ...result,
      criticalResult: calculateDamage({ ...damageInput, movePower: resolvedPower, isCritical: true }),
    }, fixedDamage);
  }

  const hitCount = Math.max(1, Math.min(3, input.tripleAxelHits ?? 3));
  const hitPowers = [20, 40, 60].slice(0, hitCount);
  const hitResults = hitPowers.map((power) => calculateDamage({ ...damageInput, movePower: power }));
  const criticalHitResults = hitPowers.map((power) => calculateDamage({ ...damageInput, movePower: power, isCritical: true }));
  return addFixedDamageToMoveResult({
    ...combineDamageResults(hitResults, defenderHpFallback),
    criticalResult: combineDamageResults(criticalHitResults, defenderHpFallback),
  }, fixedDamage);
}
