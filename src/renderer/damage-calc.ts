/**
 * 公式ダメージ計算（Gen5以降の式）
 * Lv50固定、努力値・性格補正は未対応
 */

/** 技タイプ（日本語）→ 防御側タイプ（日本語）→ 倍率 */
const TYPE_CHART: Record<string, Record<string, number>> = {
  ノーマル: {
    ノーマル: 1, かくとう: 1, ひこう: 1, どく: 1, じめん: 1, いわ: 0.5, むし: 1,
    ゴースト: 0, はがね: 0.5, ほのお: 1, みず: 1, くさ: 1, でんき: 1, エスパー: 1, こおり: 1, ドラゴン: 1, あく: 1, フェアリー: 1,
  },
  かくとう: {
    ノーマル: 2, かくとう: 1, ひこう: 0.5, どく: 0.5, じめん: 1, いわ: 2, むし: 0.5,
    ゴースト: 0, はがね: 2, ほのお: 1, みず: 1, くさ: 1, でんき: 1, エスパー: 0.5, こおり: 2, ドラゴン: 1, あく: 2, フェアリー: 0.5,
  },
  ひこう: {
    ノーマル: 1, かくとう: 2, ひこう: 1, どく: 1, じめん: 1, いわ: 0.5, むし: 2,
    ゴースト: 1, はがね: 0.5, ほのお: 1, みず: 1, くさ: 2, でんき: 0.5, エスパー: 1, こおり: 1, ドラゴン: 1, あく: 1, フェアリー: 1,
  },
  どく: {
    ノーマル: 1, かくとう: 1, ひこう: 1, どく: 0.5, じめん: 0.5, いわ: 0.5, むし: 1,
    ゴースト: 0.5, はがね: 0, ほのお: 1, みず: 1, くさ: 2, でんき: 1, エスパー: 1, こおり: 1, ドラゴン: 1, あく: 1, フェアリー: 2,
  },
  じめん: {
    ノーマル: 1, かくとう: 1, ひこう: 0, どく: 2, じめん: 1, いわ: 2, むし: 0.5,
    ゴースト: 1, はがね: 2, ほのお: 2, みず: 1, くさ: 0.5, でんき: 2, エスパー: 1, こおり: 1, ドラゴン: 1, あく: 1, フェアリー: 1,
  },
  いわ: {
    ノーマル: 1, かくとう: 0.5, ひこう: 2, どく: 1, じめん: 0.5, いわ: 1, むし: 2,
    ゴースト: 1, はがね: 0.5, ほのお: 2, みず: 1, くさ: 1, でんき: 1, エスパー: 1, こおり: 2, ドラゴン: 1, あく: 1, フェアリー: 1,
  },
  むし: {
    ノーマル: 1, かくとう: 0.5, ひこう: 0.5, どく: 0.5, じめん: 1, いわ: 1, むし: 1,
    ゴースト: 0.5, はがね: 0.5, ほのお: 0.5, みず: 1, くさ: 2, でんき: 1, エスパー: 2, こおり: 1, ドラゴン: 1, あく: 2, フェアリー: 0.5,
  },
  ゴースト: {
    ノーマル: 0, かくとう: 1, ひこう: 1, どく: 1, じめん: 1, いわ: 1, むし: 1,
    ゴースト: 2, はがね: 1, ほのお: 1, みず: 1, くさ: 1, でんき: 1, エスパー: 2, こおり: 1, ドラゴン: 1, あく: 0.5, フェアリー: 1,
  },
  はがね: {
    ノーマル: 1, かくとう: 1, ひこう: 1, どく: 1, じめん: 1, いわ: 2, むし: 1,
    ゴースト: 1, はがね: 0.5, ほのお: 0.5, みず: 0.5, くさ: 1, でんき: 0.5, エスパー: 1, こおり: 2, ドラゴン: 1, あく: 1, フェアリー: 2,
  },
  ほのお: {
    ノーマル: 1, かくとう: 1, ひこう: 1, どく: 1, じめん: 1, いわ: 0.5, むし: 2,
    ゴースト: 1, はがね: 2, ほのお: 0.5, みず: 0.5, くさ: 2, でんき: 1, エスパー: 1, こおり: 2, ドラゴン: 0.5, あく: 1, フェアリー: 1,
  },
  みず: {
    ノーマル: 1, かくとう: 1, ひこう: 1, どく: 1, じめん: 2, いわ: 2, むし: 1,
    ゴースト: 1, はがね: 1, ほのお: 2, みず: 0.5, くさ: 0.5, でんき: 1, エスパー: 1, こおり: 1, ドラゴン: 0.5, あく: 1, フェアリー: 1,
  },
  くさ: {
    ノーマル: 1, かくとう: 1, ひこう: 0.5, どく: 0.5, じめん: 2, いわ: 2, むし: 0.5,
    ゴースト: 1, はがね: 0.5, ほのお: 0.5, みず: 2, くさ: 0.5, でんき: 1, エスパー: 1, こおり: 1, ドラゴン: 0.5, あく: 1, フェアリー: 1,
  },
  でんき: {
    ノーマル: 1, かくとう: 1, ひこう: 2, どく: 1, じめん: 0, いわ: 1, むし: 1,
    ゴースト: 1, はがね: 1, ほのお: 1, みず: 2, くさ: 0.5, でんき: 0.5, エスパー: 1, こおり: 1, ドラゴン: 0.5, あく: 1, フェアリー: 1,
  },
  エスパー: {
    ノーマル: 1, かくとう: 2, ひこう: 1, どく: 2, じめん: 1, いわ: 1, むし: 1,
    ゴースト: 1, はがね: 0.5, ほのお: 1, みず: 1, くさ: 1, でんき: 1, エスパー: 0.5, こおり: 1, ドラゴン: 1, あく: 0, フェアリー: 1,
  },
  こおり: {
    ノーマル: 1, かくとう: 1, ひこう: 2, どく: 1, じめん: 2, いわ: 1, むし: 1,
    ゴースト: 1, はがね: 0.5, ほのお: 0.5, みず: 0.5, くさ: 2, でんき: 1, エスパー: 1, こおり: 0.5, ドラゴン: 2, あく: 1, フェアリー: 1,
  },
  ドラゴン: {
    ノーマル: 1, かくとう: 1, ひこう: 1, どく: 1, じめん: 1, いわ: 1, むし: 1,
    ゴースト: 1, はがね: 0.5, ほのお: 1, みず: 1, くさ: 1, でんき: 1, エスパー: 1, こおり: 1, ドラゴン: 2, あく: 1, フェアリー: 0,
  },
  あく: {
    ノーマル: 1, かくとう: 0.5, ひこう: 1, どく: 1, じめん: 1, いわ: 1, むし: 1,
    ゴースト: 2, はがね: 1, ほのお: 1, みず: 1, くさ: 1, でんき: 1, エスパー: 2, こおり: 1, ドラゴン: 1, あく: 0.5, フェアリー: 0.5,
  },
  フェアリー: {
    ノーマル: 1, かくとう: 2, ひこう: 1, どく: 0.5, じめん: 1, いわ: 1, むし: 1,
    ゴースト: 1, はがね: 0.5, ほのお: 0.5, みず: 1, くさ: 1, でんき: 1, エスパー: 1, こおり: 1, ドラゴン: 2, あく: 2, フェアリー: 1,
  },
};

const LEVEL = 50;

function getTypeMultiplier(moveType: string, defenderType: string): number {
  const row = TYPE_CHART[moveType];
  if (!row) return 1;
  return row[defenderType] ?? 1;
}

export interface BaseStats {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
}

export interface DamageInput {
  movePower: number | null;
  moveType: string;
  moveCategory: string;
  attackerTypes: string[];
  attackerBaseStats: BaseStats;
  defenderTypes: string[];
  defenderBaseStats: BaseStats;
  isCritical?: boolean;
  isBurned?: boolean;
  isSpreadMove?: boolean;
  protectMultiplier?: number;
  hasParentalBond?: boolean;
}

export interface DamageResult {
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

/** タイプ相性倍率（複数タイプは乗算） */
function getTypeEffectiveness(moveType: string, defenderTypes: string[]): number {
  let mult = 1;
  for (const t of defenderTypes) {
    mult *= getTypeMultiplier(moveType, t);
  }
  return mult;
}

/** STAB（タイプ一致補正） */
function getStab(moveType: string, attackerTypes: string[]): number {
  return attackerTypes.includes(moveType) ? 1.5 : 1;
}

/** Lv50・努力値0・性格補正なしの実数値 */
function calcStat(base: number, isHP: boolean): number {
  if (isHP) {
    return Math.floor((2 * base * LEVEL) / 100) + LEVEL + 10;
  }
  return Math.floor(Math.floor((2 * base * LEVEL) / 100) + 5);
}

function roundHalfDown(value: number): number {
  const floored = Math.floor(value);
  return value - floored > 0.5 ? floored + 1 : floored;
}

/**
 * 公式ダメージ計算（Gen5以降）
 * 乱数は 0.85〜1.00 の範囲で、min/max を返す
 */
export function calculateDamage(input: DamageInput): DamageResult {
  const {
    movePower,
    moveType,
    moveCategory,
    attackerTypes,
    attackerBaseStats,
    defenderTypes,
    defenderBaseStats,
  } = input;

  const defenderHP = calcStat(defenderBaseStats.hp, true);

  if (moveCategory === "変化" || movePower == null || movePower <= 0) {
    return {
      damageMin: 0,
      damageMax: 0,
      percentMin: 0,
      percentMax: 0,
      defenderHP,
      remainingHPMin: defenderHP,
      remainingHPMax: defenderHP,
      isStatusMove: true,
      isImmune: false,
    };
  }

  const typeEff = getTypeEffectiveness(moveType, defenderTypes);
  if (typeEff === 0) {
    return {
      damageMin: 0,
      damageMax: 0,
      percentMin: 0,
      percentMax: 0,
      defenderHP,
      remainingHPMin: defenderHP,
      remainingHPMax: defenderHP,
      isStatusMove: false,
      isImmune: true,
    };
  }

  const stab = getStab(moveType, attackerTypes);
  const spreadMult = input.isSpreadMove ? 0.75 : 1;
  const parentalBondMult = input.hasParentalBond ? 1.25 : 1;
  const criticalMult = input.isCritical ? 1.5 : 1;
  const burnMult = input.isBurned && moveCategory === "物理" ? 0.5 : 1;
  const protectMult = input.protectMultiplier ?? 1;
  const atkStat =
    moveCategory === "物理"
      ? calcStat(attackerBaseStats.attack, false)
      : calcStat(attackerBaseStats.spAttack, false);
  const defStat =
    moveCategory === "物理"
      ? calcStat(defenderBaseStats.defense, false)
      : calcStat(defenderBaseStats.spDefense, false);

  // 公式: floor(floor(floor(2*Lv/5+2)*Power*A/D)/50 + 2) * Modifier
  const base = Math.floor(
    (Math.floor((2 * LEVEL) / 5 + 2) * movePower * atkStat) / defStat / 50
  ) + 2;

  const applyRoll = (roll: number): number => {
    let damage = base;
    damage = roundHalfDown(damage * spreadMult);
    damage = roundHalfDown(damage * parentalBondMult);
    damage = roundHalfDown(damage * 1);
    damage = roundHalfDown(damage * criticalMult);
    damage = Math.floor(damage * roll / 100);
    damage = roundHalfDown(damage * stab);
    damage = Math.floor(damage * typeEff);
    damage = roundHalfDown(damage * burnMult);
    damage = roundHalfDown(damage * 1);
    damage = roundHalfDown(damage * protectMult);
    return Math.max(1, damage);
  };

  const damageMin = applyRoll(85);
  const damageMax = applyRoll(100);

  const percentMin = (damageMin / defenderHP) * 100;
  const percentMax = (damageMax / defenderHP) * 100;

  return {
    damageMin,
    damageMax,
    percentMin,
    percentMax,
    defenderHP,
    remainingHPMin: Math.max(0, defenderHP - damageMax),
    remainingHPMax: Math.max(0, defenderHP - damageMin),
    isStatusMove: false,
    isImmune: false,
  };
}
