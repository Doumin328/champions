// レンダラープロセス用: 映像ソースをプルダウンで選択して表示

const APP_DESIGN_WIDTH = 2640;
const APP_DESIGN_HEIGHT = 1280;

function updateAppScale(): void {
  const scale = Math.min(window.innerWidth / APP_DESIGN_WIDTH, window.innerHeight / APP_DESIGN_HEIGHT);

  document.documentElement.style.setProperty("--app-scale", String(scale));
}

// ========== ダメージ計算 UI 補助 ==========
const TYPE_OVERRIDE_ABILITIES = new Set(["へんげんじざい", "リベロ"]);

/** カタカナをひらがなに変換（検索の表記ゆれ吸収用） */
function toHiragana(s: string): string {
  return s.replace(/[\u30A1-\u30F6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

function calculateMoveDamageResult(
  move: Move,
  attackerStats: { hp: number; attack: number; defense: number; spAttack: number; spDefense: number; speed: number },
  defenderStats: { hp: number; attack: number; defense: number; spAttack: number; spDefense: number; speed: number },
): MoveDamageResult {
  const atkOverride = {
    attack: calcStatWithEV(attackerStats.attack, attackerAtkEV, attackerAtkNature),
    spAttack: calcStatWithEV(attackerStats.spAttack, attackerSpAtkEV, attackerSpAtkNature),
  };
  const defOverride = {
    defense: calcStatWithEV(defenderStats.defense, defenderDefEV, defenderDefNature),
    spDefense: calcStatWithEV(defenderStats.spDefense, defenderSpDefEV, defenderSpDefNature),
  };
  const defenderHpWithEV = calcHpStatWithEV(defenderStats.hp, defenderHpEV);
  const baseInput = {
    attackerTypes: getEffectiveDamageTypes("attacker"),
    attackerBaseStats: attackerStats,
    defenderTypes: getEffectiveDamageTypes("defender"),
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
    abilityDefs: abilitiesData,
    isBurned: attackerIsBurned,
    typeBoostActive: attackerTypeBoostActive,
    wall: currentWall || undefined,
  };

  const disguiseDamage = shouldApplyMimikyuDisguiseDamage() ? Math.floor(defenderHpWithEV / 8) : 0;
  return calculateMoveDamage({
    move,
    baseInput,
    defenderWeightKg: defendPokemon?.weightKg,
    defenderHpFallback: defenderHpWithEV,
    tripleAxelHits,
    fixedDamage: disguiseDamage,
  });
}

function syncDamageConditionButtons(): void {
  document.querySelectorAll<HTMLElement>("[data-weather]").forEach((btn) => {
    const active = (btn.dataset.weather ?? "") === currentWeather;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
  document.querySelectorAll<HTMLElement>("[data-terrain]").forEach((btn) => {
    const active = (btn.dataset.terrain ?? "") === currentTerrain;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
  document.querySelectorAll<HTMLElement>("[data-wall]").forEach((btn) => {
    const active = (btn.dataset.wall ?? "") === currentWall;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function createTripleAxelControl(): HTMLLabelElement {
  const wrap = document.createElement("label");
  wrap.className = "damage-hit-count-control damage-hit-count-control--inline";
  const text = document.createElement("span");
  text.className = "damage-hit-count-label";
  text.textContent = "回数";
  const select = document.createElement("select");
  select.className = "damage-hit-count-select";
  select.setAttribute("aria-label", "トリプルアクセルのヒット回数");
  [1, 2, 3].forEach((hits) => {
    const option = document.createElement("option");
    option.value = String(hits);
    option.textContent = `${hits}回`;
    option.selected = hits === tripleAxelHits;
    select.appendChild(option);
  });
  wrap.addEventListener("click", (e) => e.stopPropagation());
  wrap.addEventListener("mousedown", (e) => e.stopPropagation());
  select.addEventListener("click", (e) => e.stopPropagation());
  select.addEventListener("mousedown", (e) => e.stopPropagation());
  select.addEventListener("change", (e) => {
    tripleAxelHits = Math.max(1, Math.min(3, Number((e.target as HTMLSelectElement).value) || 3));
    renderTab1MovesSlots();
  });
  wrap.append(text, select);
  return wrap;
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
  /** 図鑑上のおもさ（kg）。けたぐり等の重さ依存技で使用 */
  weightKg?: number;
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

let abilitiesData: AbilityDef[] = [];

/** デモポケモン一覧（起動時に地方別 JSON を読み込んで結合） */
let demoPokemon: Pokemon[] = [];

const STORAGE_KEY_VIDEO = "champions_last_video_device_id";
const STORAGE_KEY_AUDIO = "champions_last_audio_device_id";
const STORAGE_KEY_TEAM = "champions_team";
const STORAGE_KEY_BATTLE_LAYOUT = "champions_battle_layout";
const STORAGE_KEY_BATTLE_LAYOUT_PRESETS = "champions_battle_layout_presets";
const MAX_TEAM_SIZE = 6;

const BATTLE_LAYOUT_SOURCE_KEYS = [
  "game",
  "playerPokemon1",
  "playerPokemon2",
  "playerPokemon3",
  "playerItemName1",
  "playerItemName2",
  "playerItemName3",
  "playerItemIcon1",
  "playerItemIcon2",
  "playerItemIcon3",
  "opponentPokemon1",
  "opponentPokemon2",
  "opponentPokemon3",
  "opponentPokemon4",
  "opponentPokemon5",
  "opponentPokemon6",
] as const;

type BattleLayoutSourceKey = typeof BATTLE_LAYOUT_SOURCE_KEYS[number];

const BATTLE_LAYOUT_SOURCE_LABELS: Record<BattleLayoutSourceKey, string> = {
  game: "Game",
  playerPokemon1: "My Pokemon 1",
  playerPokemon2: "My Pokemon 2",
  playerPokemon3: "My Pokemon 3",
  playerItemName1: "Item Name 1",
  playerItemName2: "Item Name 2",
  playerItemName3: "Item Name 3",
  playerItemIcon1: "Item Icon 1",
  playerItemIcon2: "Item Icon 2",
  playerItemIcon3: "Item Icon 3",
  opponentPokemon1: "Opponent 1",
  opponentPokemon2: "Opponent 2",
  opponentPokemon3: "Opponent 3",
  opponentPokemon4: "Opponent 4",
  opponentPokemon5: "Opponent 5",
  opponentPokemon6: "Opponent 6",
};

const DEFAULT_BATTLE_LAYOUT: BattleLayoutConfig = {
  version: 2,
  sources: {
    game: { x: 0.02, y: 0.035, width: 0.75, height: 0.68 },
    playerPokemon1: { x: 0.055, y: 0.765, width: 0.12, height: 0.18 },
    playerPokemon2: { x: 0.315, y: 0.765, width: 0.12, height: 0.18 },
    playerPokemon3: { x: 0.575, y: 0.765, width: 0.12, height: 0.18 },
    playerItemName1: { x: 0.18, y: 0.84, width: 0.16, height: 0.055 },
    playerItemName2: { x: 0.44, y: 0.84, width: 0.16, height: 0.055 },
    playerItemName3: { x: 0.70, y: 0.84, width: 0.16, height: 0.055 },
    playerItemIcon1: { x: 0.18, y: 0.765, width: 0.055, height: 0.075 },
    playerItemIcon2: { x: 0.44, y: 0.765, width: 0.055, height: 0.075 },
    playerItemIcon3: { x: 0.70, y: 0.765, width: 0.055, height: 0.075 },
    opponentPokemon1: { x: 0.84, y: 0.08, width: 0.11, height: 0.115 },
    opponentPokemon2: { x: 0.84, y: 0.215, width: 0.11, height: 0.115 },
    opponentPokemon3: { x: 0.84, y: 0.35, width: 0.11, height: 0.115 },
    opponentPokemon4: { x: 0.84, y: 0.485, width: 0.11, height: 0.115 },
    opponentPokemon5: { x: 0.84, y: 0.62, width: 0.11, height: 0.115 },
    opponentPokemon6: { x: 0.84, y: 0.755, width: 0.11, height: 0.115 },
  },
  lockedSources: createBattleLayoutLockedSources(),
};

let battleLayoutConfig: BattleLayoutConfig = cloneBattleLayoutConfig(DEFAULT_BATTLE_LAYOUT);
const expandedBattleLayoutSources = new Set<BattleLayoutSourceKey>();
let battleLayoutEditing = false;
type BattleLayoutDragMode = "move" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
let battleLayoutDragState: {
  source: BattleLayoutSourceKey;
  mode: BattleLayoutDragMode;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startRect: NormalizedRect;
  wrapWidth: number;
  wrapHeight: number;
} | null = null;

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

/** 空きマス用画像（6匹に満たない箇所）。img/ball_monster.png を優先し、無ければ ball_monster.svg を使用 */
const BALL_MONSTER_IMAGE = "img/ball_monster.png";

/** demoPokemon から最新データを取得（learnset・abilities が古い場合の対策） */
function getFreshPokemon(pokemon: Pokemon): Pokemon {
  const fresh = demoPokemon.find((p) => p.id === pokemon.id);
  return fresh ?? pokemon;
}

const AEGISLASH_SHIELD_ID = "0681";
const AEGISLASH_BLADE_ID = "0681A";
const MIMIKYU_ID = "0778";

function isAegislashForm(pokemon: Pokemon | null | undefined): boolean {
  return !!pokemon && (pokemon.id === AEGISLASH_SHIELD_ID || pokemon.id === AEGISLASH_BLADE_ID);
}

function isMimikyu(pokemon: Pokemon | null | undefined): boolean {
  return pokemon?.id === MIMIKYU_ID;
}

function getAegislashAlternateForm(pokemon: Pokemon | null | undefined): Pokemon | null {
  if (!pokemon) return null;
  const nextId =
    pokemon.id === AEGISLASH_SHIELD_ID ? AEGISLASH_BLADE_ID :
    pokemon.id === AEGISLASH_BLADE_ID ? AEGISLASH_SHIELD_ID :
    null;
  if (!nextId) return null;
  return demoPokemon.find((p) => p.id === nextId) ?? null;
}

/** タイプ画像HTMLを生成 */
const TYPE_NAME_TO_SV: Record<string, string> = {
  "ノーマル": "Normal", "ほのお": "Fire", "みず": "Water", "でんき": "Electric",
  "くさ": "Grass", "こおり": "Ice", "かくとう": "Fighting", "どく": "Poison",
  "じめん": "Ground", "ひこう": "Flying", "エスパー": "Psychic", "むし": "Bug",
  "いわ": "Rock", "ゴースト": "Ghost", "ドラゴン": "Dragon", "あく": "Dark",
  "はがね": "Steel", "フェアリー": "Fairy",
};

function typeSvSrc(type: string): string {
  const en = TYPE_NAME_TO_SV[type];
  return en ? `img/type/sv/${en}.png` : `img/type/${type}.png`;
}

function typeBadgesHtml(types: string[]): string {
  return types.map(t => `<img class="type-img" src="img/type/${t}.png" alt="${t}" />`).join("");
}

function typeBadgesSvHtml(types: string[]): string {
  return types.map(t => `<img class="type-img type-img-sv" src="${typeSvSrc(t)}" alt="${escapeHtml(t)}" />`).join("");
}

/** ポケモン画像のパス（img/pokemon/ 配下の {id}.png に統一。id がなければ DUMMY） */
function getPokemonImageSrc(pokemon: Pokemon): string {
  return pokemon.id ? `img/pokemon_cs/${pokemon.id}.png` : DUMMY_POKEMON_IMAGE;
}

function createBattleLayoutLockedSources(): Record<BattleLayoutSourceKey, boolean> {
  const lockedSources = {} as Record<BattleLayoutSourceKey, boolean>;
  for (const key of BATTLE_LAYOUT_SOURCE_KEYS) {
    lockedSources[key] = false;
  }
  return lockedSources;
}

function cloneBattleLayoutConfig(config: BattleLayoutConfig): BattleLayoutConfig {
  const sources = {} as Record<BattleLayoutSourceKey, NormalizedRect>;
  const lockedSources = createBattleLayoutLockedSources();
  for (const key of BATTLE_LAYOUT_SOURCE_KEYS) {
    sources[key] = { ...config.sources[key] };
    lockedSources[key] = config.lockedSources?.[key] === true;
  }
  return {
    version: 2,
    sources,
    lockedSources,
  };
}

function normalizeBroadcastLookupText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").trim();
}

function getPlayerSelectionPokemonByName(pokemonName: string | null): Pokemon | null {
  const normalizedName = normalizeBroadcastLookupText(pokemonName);
  if (!normalizedName) return null;
  return demoPokemon.find((pokemon) => normalizeBroadcastLookupText(pokemon.name) === normalizedName) ?? null;
}

function getPlayerSelectionImageSrc(entry: BroadcastPlayerSelectionEntry | null): string {
  if (!entry?.selectionOrder || entry.selectionOrder < 1 || entry.selectionOrder > 3) return BALL_MONSTER_IMAGE;
  return getFixedPlayerSelectionImageSrc(entry.selectionOrder);
}

function getFixedPlayerSelectionImageSrc(selectionOrder: number): string {
  return `../../outputImg/sensyutu/sensyutuPoke${selectionOrder}.png?v=${playerSelectionImageVersion}`;
}

function getPlayerSelectionItemByName(itemName: string | null): (CompetitiveItem & { imageSrc: string }) | null {
  const normalizedName = normalizeBroadcastLookupText(itemName);
  if (!normalizedName) return null;
  const item = maItems.find((candidate) => normalizeBroadcastLookupText(candidate.nameJa) === normalizedName)
    ?? COMPETITIVE_ITEMS.find((candidate) => normalizeBroadcastLookupText(candidate.nameJa) === normalizedName)
    ?? maItems.find((candidate) => normalizeBroadcastLookupText(candidate.id) === normalizedName)
    ?? COMPETITIVE_ITEMS.find((candidate) => normalizeBroadcastLookupText(candidate.id) === normalizedName)
    ?? null;
  return item ? { ...item, imageSrc: getHeldItemImageSrc(item) } : null;
}

function sanitizeBattleLayoutRect(rect: NormalizedRect, source?: BattleLayoutSourceKey): NormalizedRect {
  const { minWidth, minHeight } = getBattleLayoutMinSize(source);
  const width = Math.min(1, Math.max(minWidth, Number.isFinite(rect.width) ? rect.width : minWidth));
  const height = Math.min(1, Math.max(minHeight, Number.isFinite(rect.height) ? rect.height : minHeight));
  const x = Math.min(1 - width, Math.max(0, Number.isFinite(rect.x) ? rect.x : 0));
  const y = Math.min(1 - height, Math.max(0, Number.isFinite(rect.y) ? rect.y : 0));
  return { x, y, width, height };
}

function getBattleLayoutMinSize(source?: BattleLayoutSourceKey): { minWidth: number; minHeight: number } {
  const isSmallIcon = source?.startsWith("playerItemIcon") || source?.startsWith("opponentPokemon");
  return {
    minWidth: isSmallIcon ? 0.025 : 0.04,
    minHeight: isSmallIcon ? 0.025 : 0.035,
  };
}

function isBattleLayoutConfig(value: unknown): value is BattleLayoutConfig {
  if (!value || typeof value !== "object") return false;
  const config = value as Partial<BattleLayoutConfig>;
  const sources = config.sources as Partial<Record<BattleLayoutSourceKey, NormalizedRect>> | undefined;
  const lockedSources = config.lockedSources as Partial<Record<BattleLayoutSourceKey, boolean>> | undefined;
  return config.version === 2
    && !!sources
    && BATTLE_LAYOUT_SOURCE_KEYS.every((key) => isValidNormalizedRect(sources[key]))
    && (!lockedSources || BATTLE_LAYOUT_SOURCE_KEYS.every((key) => typeof lockedSources[key] === "boolean" || lockedSources[key] === undefined));
}

function loadBattleLayoutFromStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BATTLE_LAYOUT);
    if (!raw) {
      battleLayoutConfig = cloneBattleLayoutConfig(DEFAULT_BATTLE_LAYOUT);
      return;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!isBattleLayoutConfig(parsed)) {
      battleLayoutConfig = cloneBattleLayoutConfig(DEFAULT_BATTLE_LAYOUT);
      return;
    }
    const sources = {} as Record<BattleLayoutSourceKey, NormalizedRect>;
    const lockedSources = createBattleLayoutLockedSources();
    for (const key of BATTLE_LAYOUT_SOURCE_KEYS) {
      sources[key] = sanitizeBattleLayoutRect(parsed.sources[key], key);
      lockedSources[key] = parsed.lockedSources?.[key] === true;
    }
    battleLayoutConfig = { version: 2, sources, lockedSources };
  } catch {
    battleLayoutConfig = cloneBattleLayoutConfig(DEFAULT_BATTLE_LAYOUT);
  }
}

function saveBattleLayoutToStorage(): void {
  localStorage.setItem(STORAGE_KEY_BATTLE_LAYOUT, JSON.stringify(battleLayoutConfig));
}

function loadBattleLayoutPresetsFromStorage(): BattleLayoutPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BATTLE_LAYOUT_PRESETS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is BattleLayoutPreset =>
      item !== null &&
      typeof item === "object" &&
      typeof (item as BattleLayoutPreset).name === "string" &&
      isBattleLayoutConfig((item as BattleLayoutPreset).config)
    );
  } catch {
    return [];
  }
}

function saveBattleLayoutPresetsToStorage(presets: BattleLayoutPreset[]): void {
  localStorage.setItem(STORAGE_KEY_BATTLE_LAYOUT_PRESETS, JSON.stringify(presets));
}

function renderBattleLayoutPresetSelect(): void {
  if (!battlePresetSelectEl) return;
  const presets = loadBattleLayoutPresetsFromStorage();
  while (battlePresetSelectEl.options.length > 1) battlePresetSelectEl.remove(1);
  for (const preset of presets) {
    const opt = document.createElement("option");
    opt.value = preset.name;
    opt.textContent = preset.name;
    battlePresetSelectEl.appendChild(opt);
  }
  if (battlePresetLoadBtnEl) battlePresetLoadBtnEl.disabled = presets.length === 0;
  if (battlePresetDeleteBtnEl) battlePresetDeleteBtnEl.disabled = presets.length === 0;
}

function saveBattleLayoutPreset(): void {
  const name = battlePresetNameInputEl?.value.trim() ?? "";
  if (!name) {
    battlePresetNameInputEl?.classList.add("is-error");
    battlePresetNameInputEl?.focus();
    return;
  }
  battlePresetNameInputEl?.classList.remove("is-error");
  const presets = loadBattleLayoutPresetsFromStorage();
  const idx = presets.findIndex((p) => p.name === name);
  const entry: BattleLayoutPreset = { name, config: cloneBattleLayoutConfig(battleLayoutConfig) };
  if (idx >= 0) {
    presets[idx] = entry;
  } else {
    presets.push(entry);
  }
  saveBattleLayoutPresetsToStorage(presets);
  renderBattleLayoutPresetSelect();
  if (battlePresetSelectEl) battlePresetSelectEl.value = name;
}

function loadBattleLayoutPreset(): void {
  const selected = battlePresetSelectEl?.value ?? "";
  if (!selected) return;
  const preset = loadBattleLayoutPresetsFromStorage().find((p) => p.name === selected);
  if (!preset) return;
  battleLayoutConfig = cloneBattleLayoutConfig(preset.config);
  applyBattleLayoutConfig();
  saveBattleLayoutToStorage();
}

function deleteBattleLayoutPreset(): void {
  const selected = battlePresetSelectEl?.value ?? "";
  if (!selected) return;
  saveBattleLayoutPresetsToStorage(loadBattleLayoutPresetsFromStorage().filter((p) => p.name !== selected));
  renderBattleLayoutPresetSelect();
  if (battlePresetSelectEl) battlePresetSelectEl.value = "";
}

function applyNormalizedRectStyle(target: HTMLElement, rect: NormalizedRect): void {
  target.style.left = `${rect.x * 100}%`;
  target.style.top = `${rect.y * 100}%`;
  target.style.width = `${rect.width * 100}%`;
  target.style.height = `${rect.height * 100}%`;
}

function setBattleLayoutGameCssVars(target: HTMLElement, rect: NormalizedRect): void {
  target.style.setProperty("--battle-game-x", `${rect.x * 100}%`);
  target.style.setProperty("--battle-game-y", `${rect.y * 100}%`);
  target.style.setProperty("--battle-game-w", `${rect.width * 100}%`);
  target.style.setProperty("--battle-game-h", `${rect.height * 100}%`);
}

function applyBattleLayoutConfig(): void {
  const layoutEl = document.querySelector(".broadcast-layout") as HTMLElement | null;
  const targets = [layoutEl, videoWrapEl].filter((target): target is HTMLElement => !!target);
  for (const target of targets) {
    setBattleLayoutGameCssVars(target, battleLayoutConfig.sources.game);
  }
  document.querySelectorAll<HTMLElement>(".broadcast-layout-source[data-layout-source]").forEach((sourceEl) => {
    const source = sourceEl.dataset.layoutSource as BattleLayoutSourceKey | undefined;
    if (!source || source === "game" || !battleLayoutConfig.sources[source]) return;
    applyNormalizedRectStyle(sourceEl, getBattleLayoutDisplayRect(source, battleLayoutConfig.sources[source]));
  });
  if (videoEl) {
    setBattleLayoutGameCssVars(videoEl, battleLayoutConfig.sources.game);
  }
  updateBattleLayoutEditorBoxes();
  renderBattleLayoutSourceList();
}

function isPlayerPokemonLayoutSource(source: BattleLayoutSourceKey): boolean {
  return source.startsWith("playerPokemon");
}

function getBattleLayoutSourceImage(source: BattleLayoutSourceKey): HTMLImageElement | null {
  const sourceEl = document.querySelector<HTMLElement>(`.broadcast-layout-source[data-layout-source="${source}"]`);
  return sourceEl?.querySelector("img") ?? null;
}

function getBattleLayoutSourceImageAspect(source: BattleLayoutSourceKey): number | null {
  const img = getBattleLayoutSourceImage(source);
  if (!img || img.hidden || img.naturalWidth <= 0 || img.naturalHeight <= 0) return null;
  return img.naturalWidth / img.naturalHeight;
}

function getBattleLayoutBounds(): DOMRect | null {
  const layoutRect = document.querySelector<HTMLElement>(".broadcast-layout")?.getBoundingClientRect() ?? null;
  if (layoutRect && layoutRect.width > 0 && layoutRect.height > 0) return layoutRect;
  const editLayerRect = document.getElementById("broadcast-layout-edit-layer")?.getBoundingClientRect() ?? null;
  if (editLayerRect && editLayerRect.width > 0 && editLayerRect.height > 0) return editLayerRect;
  const wrapRect = videoWrapEl?.getBoundingClientRect() ?? null;
  return wrapRect && wrapRect.width > 0 && wrapRect.height > 0 ? wrapRect : null;
}

function getPlayerPokemonNormalizedAspect(source: BattleLayoutSourceKey): number | null {
  if (!isPlayerPokemonLayoutSource(source)) return null;
  const layerRect = getBattleLayoutBounds();
  const imageAspect = getBattleLayoutSourceImageAspect(source);
  if (!layerRect || layerRect.width <= 0 || layerRect.height <= 0 || !imageAspect) return null;
  return imageAspect * (layerRect.height / layerRect.width);
}

function getAspectCorrectedPlayerPokemonRect(source: BattleLayoutSourceKey, rect: NormalizedRect): NormalizedRect {
  const aspect = getPlayerPokemonNormalizedAspect(source);
  if (!aspect) return rect;

  const min = getBattleLayoutMinSize(source);
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const maxWidthByCenter = 2 * Math.min(centerX, 1 - centerX);
  const maxHeightByCenter = 2 * Math.min(centerY, 1 - centerY);
  const maxWidth = Math.max(min.minWidth, Math.min(1, maxWidthByCenter, maxHeightByCenter * aspect));

  let width = Math.min(maxWidth, Math.max(min.minWidth, min.minHeight * aspect, rect.width));
  let height = width / aspect;
  if (height > maxHeightByCenter) {
    height = Math.max(min.minHeight, maxHeightByCenter);
    width = height * aspect;
  }

  return sanitizeBattleLayoutRect({
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  }, source);
}

function getBattleLayoutDisplayRect(source: BattleLayoutSourceKey, rect: NormalizedRect): NormalizedRect {
  return isPlayerPokemonLayoutSource(source) ? getAspectCorrectedPlayerPokemonRect(source, rect) : rect;
}

function getScaledPlayerPokemonRect(
  source: BattleLayoutSourceKey,
  startRect: NormalizedRect,
  mode: BattleLayoutDragMode,
  aspect: number,
  dx: number,
  dy: number,
): NormalizedRect {
  if (mode === "move") return sanitizeBattleLayoutRect(startRect, source);

  const min = getBattleLayoutMinSize(source);
  const anchorX = mode.includes("w") ? startRect.x + startRect.width : startRect.x;
  const anchorY = mode.includes("n") ? startRect.y + startRect.height : startRect.y;
  const minWidth = Math.max(min.minWidth, min.minHeight * aspect);
  const horizontalDelta = (mode.includes("w") ? -dx : dx) / startRect.width;
  const verticalDelta = (mode.includes("n") ? -dy : dy) / startRect.height;
  const scaleDelta = Math.abs(horizontalDelta) >= Math.abs(verticalDelta) ? horizontalDelta : verticalDelta;

  const maxWidth = mode.includes("w") ? anchorX : 1 - anchorX;
  const maxHeight = mode.includes("n") ? anchorY : 1 - anchorY;
  const maxAspectWidth = Math.max(minWidth, Math.min(maxWidth, maxHeight * aspect));
  const width = Math.max(minWidth, Math.min(maxAspectWidth, startRect.width * (1 + scaleDelta)));
  const height = width / aspect;

  const x = mode.includes("w") ? anchorX - width : anchorX;
  const y = mode.includes("n") ? anchorY - height : anchorY;
  return sanitizeBattleLayoutRect({ x, y, width, height }, source);
}

function createBattleLayoutEditorBox(source: BattleLayoutSourceKey): HTMLElement {
  const box = document.createElement("div");
  box.className = "broadcast-layout-edit-box";
  box.dataset.editorSource = source;
  box.hidden = true;

  const label = document.createElement("span");
  label.className = "broadcast-layout-edit-label";
  label.textContent = BATTLE_LAYOUT_SOURCE_LABELS[source];

  box.append(label);
  return box;
}

function ensureBattleLayoutEditorBoxes(): void {
  const layer = document.getElementById("broadcast-layout-edit-layer");
  if (!layer || layer.childElementCount > 0) return;
  for (const source of BATTLE_LAYOUT_SOURCE_KEYS) {
    layer.appendChild(createBattleLayoutEditorBox(source));
  }
}

function updateBattleLayoutEditorBoxes(): void {
  const boxes = document.querySelectorAll<HTMLElement>(".broadcast-layout-edit-box[data-editor-source]");
  for (const box of Array.from(boxes)) {
    const source = box.dataset.editorSource as BattleLayoutSourceKey | undefined;
    if (!source || !battleLayoutConfig.sources[source]) continue;
    const rect = getBattleLayoutDisplayRect(source, battleLayoutConfig.sources[source]);
    box.hidden = !battleLayoutEditing;
    box.classList.toggle("is-locked", isBattleLayoutSourceLocked(source));
    box.setAttribute("aria-disabled", isBattleLayoutSourceLocked(source) ? "true" : "false");
    applyNormalizedRectStyle(box, rect);
  }
}

function isBattleLayoutSourceLocked(source: BattleLayoutSourceKey): boolean {
  return battleLayoutConfig.lockedSources?.[source] === true;
}

function formatBattleLayoutPercent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

function isBattleLayoutSourceVisible(source: BattleLayoutSourceKey): boolean {
  if (source === "game") return true;
  const sourceEl = document.querySelector<HTMLElement>(`.broadcast-layout-source[data-layout-source="${source}"]`);
  return !!sourceEl && !sourceEl.classList.contains("is-empty");
}

function renderBattleLayoutSourceList(): void {
  if (!battleLayoutSourceListEl) return;
  const previousScrollTop = battleLayoutSourceListEl.scrollTop;
  battleLayoutSourceListEl.innerHTML = "";

  for (const source of BATTLE_LAYOUT_SOURCE_KEYS) {
    const rect = getBattleLayoutDisplayRect(source, battleLayoutConfig.sources[source]);
    const locked = isBattleLayoutSourceLocked(source);
    const visible = isBattleLayoutSourceVisible(source);
    const expanded = expandedBattleLayoutSources.has(source);

    const row = document.createElement("div");
    row.className = `battle-source-row${locked ? " is-locked" : ""}${visible ? "" : " is-empty"}${expanded ? " is-expanded" : ""}`;
    row.dataset.source = source;

    const main = document.createElement("div");
    main.className = "battle-source-row-main";
    main.setAttribute("role", "button");
    main.setAttribute("tabindex", "0");
    main.setAttribute("aria-expanded", expanded ? "true" : "false");

    const name = document.createElement("span");
    name.className = "battle-source-row-name";
    name.textContent = BATTLE_LAYOUT_SOURCE_LABELS[source];

    const status = document.createElement("span");
    status.className = "battle-source-row-status";
    status.textContent = visible ? "表示中" : "空";

    const metrics = document.createElement("span");
    metrics.className = "battle-source-row-metrics";
    metrics.textContent = `X ${formatBattleLayoutPercent(rect.x)} / Y ${formatBattleLayoutPercent(rect.y)} / W ${formatBattleLayoutPercent(rect.width)} / H ${formatBattleLayoutPercent(rect.height)}`;

    const chevron = document.createElement("span");
    chevron.className = "battle-source-row-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = expanded ? "▲" : "▼";

    main.append(name, status, metrics, chevron);

    const toggleExpand = (): void => {
      if (expandedBattleLayoutSources.has(source)) {
        expandedBattleLayoutSources.delete(source);
      } else {
        expandedBattleLayoutSources.add(source);
      }
      renderBattleLayoutSourceList();
    };
    main.addEventListener("click", toggleExpand);
    main.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleExpand();
      }
    });

    const lockButton = document.createElement("button");
    lockButton.type = "button";
    lockButton.className = "battle-source-lock-btn";
    lockButton.setAttribute("aria-pressed", locked ? "true" : "false");
    lockButton.setAttribute("aria-label", `${BATTLE_LAYOUT_SOURCE_LABELS[source]} ${locked ? "ロック解除" : "ロック"}`);
    lockButton.textContent = locked ? "固定中" : "固定";
    lockButton.addEventListener("click", () => {
      setBattleLayoutSourceLocked(source, !isBattleLayoutSourceLocked(source));
    });

    row.append(main, lockButton);

    if (expanded) {
      const detail = document.createElement("div");
      detail.className = "battle-source-row-detail";

      const fields: Array<{ key: keyof NormalizedRect; label: string }> = [
        { key: "x", label: "X" },
        { key: "y", label: "Y" },
        { key: "width", label: "W" },
        { key: "height", label: "H" },
      ];

      for (const field of fields) {
        const fieldWrap = document.createElement("label");
        fieldWrap.className = "battle-source-input-field";

        const labelEl = document.createElement("span");
        labelEl.className = "battle-source-input-label";
        labelEl.textContent = field.label;

        const input = document.createElement("input");
        input.type = "number";
        input.className = "battle-source-input-number";
        input.step = "0.1";
        input.min = "0";
        input.max = "100";
        input.value = String(Math.round(rect[field.key] * 1000) / 10);
        input.disabled = locked;
        input.setAttribute("aria-label", `${BATTLE_LAYOUT_SOURCE_LABELS[source]} ${field.label}`);

        input.addEventListener("input", () => {
          if (isBattleLayoutSourceLocked(source)) return;
          const raw = parseFloat(input.value);
          if (!Number.isFinite(raw)) return;
          const normalized = raw / 100;
          const nextRect: NormalizedRect = { ...battleLayoutConfig.sources[source], [field.key]: normalized };
          updateBattleLayoutSource(source, nextRect, true);
          const updatedRect = getBattleLayoutDisplayRect(source, battleLayoutConfig.sources[source]);
          metrics.textContent = `X ${formatBattleLayoutPercent(updatedRect.x)} / Y ${formatBattleLayoutPercent(updatedRect.y)} / W ${formatBattleLayoutPercent(updatedRect.width)} / H ${formatBattleLayoutPercent(updatedRect.height)}`;
          const syncKeys: Array<keyof NormalizedRect> = ["x", "y", "width", "height"];
          detail.querySelectorAll<HTMLInputElement>(".battle-source-input-number").forEach((inp, idx) => {
            if (inp !== input) {
              inp.value = String(Math.round(updatedRect[syncKeys[idx]] * 1000) / 10);
            }
          });
        });

        fieldWrap.append(labelEl, input);
        detail.appendChild(fieldWrap);
      }

      row.appendChild(detail);
    }

    battleLayoutSourceListEl.appendChild(row);
  }
  battleLayoutSourceListEl.scrollTop = previousScrollTop;
}

function setBattleLayoutSourceLocked(source: BattleLayoutSourceKey, locked: boolean): void {
  battleLayoutConfig.lockedSources[source] = locked;
  saveBattleLayoutToStorage();
  updateBattleLayoutEditorBoxes();
  renderBattleLayoutSourceList();
}

function setBattleLayoutEditing(enabled: boolean): void {
  battleLayoutEditing = enabled;
  if (videoWrapEl) videoWrapEl.dataset.layoutEditing = enabled ? "true" : "false";
  if (battleLayoutEditToggleEl) {
    battleLayoutEditToggleEl.textContent = enabled ? "編集終了" : "レイアウト編集";
    battleLayoutEditToggleEl.classList.toggle("is-active", enabled);
  }
  if (battleLayoutEditControlEl) {
    battleLayoutEditControlEl.textContent = enabled ? "編集終了" : "レイアウト編集";
    battleLayoutEditControlEl.classList.toggle("is-active", enabled);
    battleLayoutEditControlEl.setAttribute("aria-pressed", enabled ? "true" : "false");
  }
  if (battleLayoutResetBtnEl) battleLayoutResetBtnEl.hidden = !enabled;
  updateBattleLayoutEditorBoxes();
  renderBroadcastOverlayState("setBattleLayoutEditing");
}

function updateBattleLayoutSource(source: BattleLayoutSourceKey, rect: NormalizedRect, persist = true): void {
  battleLayoutConfig.sources[source] = getBattleLayoutDisplayRect(source, sanitizeBattleLayoutRect(rect, source));
  applyBattleLayoutConfig();
  if (persist) saveBattleLayoutToStorage();
}

function getBattleLayoutPointerMode(event: PointerEvent, box: HTMLElement): BattleLayoutDragMode {
  const source = box.dataset.editorSource as BattleLayoutSourceKey | undefined;
  const rect = box.getBoundingClientRect();
  const edge = Math.max(4, Math.min(10, rect.width / 2, rect.height / 2));
  const nearLeft = event.clientX - rect.left <= edge;
  const nearRight = rect.right - event.clientX <= edge;
  const nearTop = event.clientY - rect.top <= edge;
  const nearBottom = rect.bottom - event.clientY <= edge;

  if (nearTop && nearLeft) return "nw";
  if (nearTop && nearRight) return "ne";
  if (nearBottom && nearLeft) return "sw";
  if (nearBottom && nearRight) return "se";
  if (source && isPlayerPokemonLayoutSource(source)) return "move";
  if (nearTop) return "n";
  if (nearRight) return "e";
  if (nearBottom) return "s";
  if (nearLeft) return "w";
  return "move";
}

function getBattleLayoutCursor(mode: BattleLayoutDragMode): string {
  return {
    move: "move",
    n: "n-resize",
    ne: "nesw-resize",
    e: "e-resize",
    se: "nwse-resize",
    s: "s-resize",
    sw: "nesw-resize",
    w: "w-resize",
    nw: "nwse-resize",
  }[mode];
}

function getResizedBattleLayoutRect(
  source: BattleLayoutSourceKey,
  startRect: NormalizedRect,
  mode: BattleLayoutDragMode,
  dx: number,
  dy: number
): NormalizedRect {
  if (mode === "move") {
    return sanitizeBattleLayoutRect({
      ...startRect,
      x: startRect.x + dx,
      y: startRect.y + dy,
    }, source);
  }

  const aspect = getPlayerPokemonNormalizedAspect(source);
  if (aspect) {
    return getScaledPlayerPokemonRect(source, startRect, mode, aspect, dx, dy);
  }

  const min = getBattleLayoutMinSize(source);
  let left = startRect.x;
  let top = startRect.y;
  let right = startRect.x + startRect.width;
  let bottom = startRect.y + startRect.height;

  if (mode.includes("w")) left += dx;
  if (mode.includes("e")) right += dx;
  if (mode.includes("n")) top += dy;
  if (mode.includes("s")) bottom += dy;

  left = Math.max(0, Math.min(left, 1));
  right = Math.max(0, Math.min(right, 1));
  top = Math.max(0, Math.min(top, 1));
  bottom = Math.max(0, Math.min(bottom, 1));

  if (right - left < min.minWidth) {
    if (mode.includes("w")) left = Math.max(0, right - min.minWidth);
    else right = Math.min(1, left + min.minWidth);
  }
  if (bottom - top < min.minHeight) {
    if (mode.includes("n")) top = Math.max(0, bottom - min.minHeight);
    else bottom = Math.min(1, top + min.minHeight);
  }

  const nextRect = sanitizeBattleLayoutRect({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }, source);
  return nextRect;
}

function resetBattleLayoutConfig(): void {
  battleLayoutConfig = cloneBattleLayoutConfig(DEFAULT_BATTLE_LAYOUT);
  localStorage.removeItem(STORAGE_KEY_BATTLE_LAYOUT);
  applyBattleLayoutConfig();
}

function initBattleLayoutEditor(): void {
  loadBattleLayoutFromStorage();
  ensureBattleLayoutEditorBoxes();
  applyBattleLayoutConfig();

  battleLayoutEditToggleEl?.addEventListener("click", () => {
    setBattleLayoutEditing(!battleLayoutEditing);
  });
  battleLayoutEditControlEl?.addEventListener("click", () => {
    setBattleLayoutEditing(!battleLayoutEditing);
  });
  battleLayoutResetBtnEl?.addEventListener("click", resetBattleLayoutConfig);

  document.querySelectorAll<HTMLElement>(".broadcast-layout-edit-box[data-editor-source]").forEach((box) => {
    box.addEventListener("pointermove", (event) => {
      if (!battleLayoutEditing || battleLayoutDragState) return;
      const source = box.dataset.editorSource as BattleLayoutSourceKey | undefined;
      box.style.cursor = source && isBattleLayoutSourceLocked(source) ? "not-allowed" : getBattleLayoutCursor(getBattleLayoutPointerMode(event, box));
    });
    box.addEventListener("pointerleave", () => {
      if (!battleLayoutDragState) box.style.cursor = "";
    });
    box.addEventListener("pointerdown", (event) => {
      if (!battleLayoutEditing) return;
      const source = box.dataset.editorSource as BattleLayoutSourceKey | undefined;
      if (!source) return;
      if (isBattleLayoutSourceLocked(source)) return;
      const wrapRect = getBattleLayoutBounds();
      if (!wrapRect || wrapRect.width <= 0 || wrapRect.height <= 0) return;
      const mode = getBattleLayoutPointerMode(event, box);
      const startRect = getBattleLayoutDisplayRect(source, battleLayoutConfig.sources[source]);
      battleLayoutDragState = {
        source,
        mode,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startRect,
        wrapWidth: wrapRect.width,
        wrapHeight: wrapRect.height,
      };
      box.style.cursor = getBattleLayoutCursor(mode);
      box.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
  });

  document.addEventListener("pointermove", (event) => {
    if (!battleLayoutDragState || event.pointerId !== battleLayoutDragState.pointerId) return;
    const state = battleLayoutDragState;
    const dx = (event.clientX - state.startClientX) / state.wrapWidth;
    const dy = (event.clientY - state.startClientY) / state.wrapHeight;
    const nextRect = getResizedBattleLayoutRect(state.source, state.startRect, state.mode, dx, dy);
    updateBattleLayoutSource(state.source, nextRect, false);
  });

  document.addEventListener("pointerup", (event) => {
    if (!battleLayoutDragState || event.pointerId !== battleLayoutDragState.pointerId) return;
    battleLayoutDragState = null;
    document.querySelectorAll<HTMLElement>(".broadcast-layout-edit-box[data-editor-source]").forEach((box) => {
      box.style.cursor = "";
    });
    saveBattleLayoutToStorage();
  });

  renderBattleLayoutPresetSelect();
  battlePresetSaveBtnEl?.addEventListener("click", saveBattleLayoutPreset);
  battlePresetNameInputEl?.addEventListener("input", () => {
    battlePresetNameInputEl.classList.remove("is-error");
  });
  battlePresetLoadBtnEl?.addEventListener("click", loadBattleLayoutPreset);
  battlePresetDeleteBtnEl?.addEventListener("click", deleteBattleLayoutPreset);
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

const videoWrapEl = document.querySelector(".video-wrap") as HTMLElement | null;
const sceneDetectionBadgeEl = document.getElementById("scene-detection-badge") as HTMLElement | null;
const sceneDetectionTextEl = document.getElementById("scene-detection-text") as HTMLElement | null;
const sceneDetectionEnabledEl = document.getElementById("scene-detection-enabled") as HTMLInputElement | null;
const sceneDebugEnabledEl = document.getElementById("scene-debug-enabled") as HTMLInputElement | null;
const sceneDetectionDebugEl = document.getElementById("scene-detection-debug") as HTMLElement | null;
const battleLayoutEditToggleEl = document.getElementById("battle-layout-edit-toggle") as HTMLButtonElement | null;
const battleLayoutEditControlEl = document.getElementById("battle-layout-edit-control") as HTMLButtonElement | null;
const battleLayoutResetBtnEl = document.getElementById("battle-layout-reset-btn") as HTMLButtonElement | null;
const battleLayoutSourceListEl = document.getElementById("battle-layout-source-list") as HTMLElement | null;
const battlePresetNameInputEl = document.getElementById("battle-preset-name-input") as HTMLInputElement | null;
const battlePresetSelectEl = document.getElementById("battle-preset-select") as HTMLSelectElement | null;
const battlePresetSaveBtnEl = document.getElementById("battle-preset-save-btn") as HTMLButtonElement | null;
const battlePresetLoadBtnEl = document.getElementById("battle-preset-load-btn") as HTMLButtonElement | null;
const battlePresetDeleteBtnEl = document.getElementById("battle-preset-delete-btn") as HTMLButtonElement | null;
let broadcastTeamNameEl: HTMLElement | null = null;
let broadcastRosterEl: HTMLElement | null = null;
const broadcastPlayerCardEls: Array<HTMLElement | null> = [];
const broadcastPlayerPokemonEls = [1, 2, 3].map((index) => document.getElementById(`broadcast-player-pokemon-${index}`) as HTMLImageElement | null);
const broadcastPlayerItemNameEls = [1, 2, 3].map((index) => document.getElementById(`broadcast-player-item-name-${index}`) as HTMLElement | null);
const broadcastPlayerItemIconEls = [1, 2, 3].map((index) => document.getElementById(`broadcast-player-item-icon-${index}`) as HTMLImageElement | null);
const broadcastOpponentPokemonEls = [1, 2, 3, 4, 5, 6].map((index) => document.getElementById(`broadcast-opponent-pokemon-${index}`) as HTMLImageElement | null);

type SceneKind = "idle" | "selection" | "battle" | "unknown";
type SelectionSceneDetectionMode = "none" | "complete-and-arrow" | "complete-only" | "arrow-only";

interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BattleLayoutConfig {
  version: 2;
  sources: Record<BattleLayoutSourceKey, NormalizedRect>;
  lockedSources: Record<BattleLayoutSourceKey, boolean>;
}

interface BattleLayoutPreset {
  name: string;
  config: BattleLayoutConfig;
}

interface BroadcastBattleIndicator {
  id: string;
  targetState?: Exclude<SceneKind, "unknown">;
  detectFromScene?: Exclude<SceneKind, "unknown">;
  scanSlotRects?: "player";
  rect: NormalizedRect;
  threshold: number;
  templateImage?: string;
  minTemplateScore?: number;
  templateSearchOffsetX?: number;
  templateSearchOffsetY?: number;
  templateSearchScale?: number;
}

interface BroadcastRecognitionConfig {
  opponentSlotRects: NormalizedRect[];
  playerSlotRects?: NormalizedRect[];
  playerSelectionBadgeRect?: NormalizedRect;
  playerSelectionBadgeNumberRect?: NormalizedRect;
  playerPokemonNameRect?: NormalizedRect;
  playerItemNameRect?: NormalizedRect;
  playerPokemonSpriteRect?: NormalizedRect;
  playerPokemonVisualRecognition?: {
    enabled?: boolean;
    modelName?: string;
  };
  spriteSubrect: NormalizedRect;
  battleIndicators?: BroadcastBattleIndicator[];
}

interface BroadcastRecognitionMatch {
  pokemonId: string;
  pokemonName: string;
  imageSrc: string;
  score: number;
}

interface BroadcastRecognitionSlotState {
  confirmed: BroadcastRecognitionMatch | null;
  pending: BroadcastRecognitionMatch | null;
  consecutiveMatches: number;
}

interface BroadcastConfirmedRosterState {
  slots: Array<BroadcastRecognitionMatch | null>;
  lastConfirmedAt: number;
}

interface BroadcastPlayerDebugSlotImage {
  slotIndex: number;
  imageBase64: string;
  itemImageBase64: string;
  timestamp: number;
}

interface BroadcastPlayerSelectionEntry {
  slotIndex: number;
  selectionOrder: number;
  pokemonId: string | null;
  pokemonName: string | null;
  itemName: string | null;
  score: number;
}

interface BroadcastPlayerPartySlotEntry {
  slotIndex: number;
  pokemonId: string | null;
  pokemonName: string | null;
  itemName: string | null;
  score: number;
}

interface BroadcastPlayerSelectionRecognitionResult {
  slotIndex: number;
  selectionOrder: number | null;
  pokemonName: string | null;
  itemName: string | null;
  score: number;
  debugOcrTexts?: {
    slot: string[];
    pokemonName: string[];
    itemName: string[];
    badge: string[];
    selectedPokemonName: string[];
    selectedItemName: string[];
  };
  debugSlotRecognition?: {
    ocrPokemonName: string | null;
    ocrPokemonScore: number;
    slotPokemonName: string | null;
    slotPokemonScore: number;
    cropPokemonName: string | null;
    cropPokemonScore: number;
  };
  debugVisualMatch?: {
    pokemonId: string | null;
    pokemonName: string | null;
    score: number;
    error?: string;
    topCandidates?: Array<{
      pokemonId: string;
      pokemonName: string;
      score: number;
      referencePath?: string;
    }>;
  } | null;
}

interface BroadcastPlayerSelectionTrackerSlot {
  selectionOrder: number | null;
  consecutiveSelectedFrames: number;
  confidence: number;
  lastUpdatedAt: number;
}

interface PlayerSelectionBadgeDetection {
  slotIndex: number;
  isSelected: boolean;
  confidence: number;
  selectionOrder: number | null;
  selectionOrderScore: number;
  debugFeatures?: Record<string, number | null>;
}

interface SceneDetectionState {
  rawScene: SceneKind;
  displayScene: SceneKind;
  pendingScene: SceneKind;
  consecutiveMatches: number;
}

interface LoadedIndicatorTemplate {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

interface SceneSampleCache {
  frameId: number;
  samples: Map<string, Uint8ClampedArray>;
}

interface SceneDetectionWorkerTemplate {
  id: string;
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

interface SceneDetectionWorkerIndicator {
  id: string;
  targetState: Exclude<SceneKind, "unknown">;
  detectFromScene?: Exclude<SceneKind, "unknown">;
  scanSlotRects?: "player";
  threshold: number;
  minTemplateScore?: number;
}

interface SceneDetectionSamplePayload {
  indicatorId: string;
  variants: Uint8ClampedArray[];
}

interface SceneDetectionWorkerScore {
  indicatorId: string;
  score: number;
  threshold: number;
  matched: boolean;
  detectFromScene?: Exclude<SceneKind, "unknown">;
}

interface SceneDetectionWorkerResult {
  rawScene: SceneKind;
  scores: SceneDetectionWorkerScore[];
}

interface SceneDetectionEvidenceIndicator {
  indicatorId: string;
  templateImage: string;
  score: number;
  threshold: number;
  matched: boolean;
  detectFromScene?: Exclude<SceneKind, "unknown">;
}

interface SceneDetectionEvidence {
  currentScene: SceneKind;
  candidateScene: SceneKind;
  rawScene: SceneKind;
  indicators: SceneDetectionEvidenceIndicator[];
}

interface SceneDetectionResult {
  rawScene: SceneKind;
  evidence: SceneDetectionEvidence | null;
}

const SCENE_DETECTION_INTERVAL_MS = 200;
const SCENE_STABLE_MATCHES = 3;
const BATTLE_TO_IDLE_STABLE_MATCHES = 2;
const BROADCAST_RECOGNITION_INTERVAL_MS = 350;
const SCENE_DETECTION_INTERVAL_WHILE_DAMAGE_TAB_MS = 550;
const BROADCAST_RECOGNITION_INTERVAL_WHILE_DAMAGE_TAB_MS = 900;
const BROADCAST_WORKER_RETRY_INTERVAL_MS = 2000;
const BROADCAST_RECOGNITION_STABLE_FRAMES = 2;
const PLAYER_SELECTION_TRACK_STABLE_FRAMES = 2;
const PLAYER_SELECTION_TRACK_MIN_CONFIDENCE = 0.48;
const BROADCAST_TEMPLATE_SIZE = 112;
const DEFAULT_BROADCAST_OPPONENT_SLOT_RECTS: NormalizedRect[] = [
  { x: 0.828, y: 0.143, width: 0.08, height: 0.105 },
  { x: 0.828, y: 0.26, width: 0.08, height: 0.105 },
  { x: 0.828, y: 0.377, width: 0.08, height: 0.105 },
  { x: 0.828, y: 0.493, width: 0.08, height: 0.105 },
  { x: 0.828, y: 0.611, width: 0.08, height: 0.103 },
  { x: 0.828, y: 0.727, width: 0.08, height: 0.105 },
];
const DEFAULT_BROADCAST_PLAYER_SLOT_RECTS: NormalizedRect[] = [
  { x: 0.042, y: 0.146, width: 0.273, height: 0.101 },
  { x: 0.042, y: 0.264, width: 0.273, height: 0.101 },
  { x: 0.042, y: 0.382, width: 0.273, height: 0.101 },
  { x: 0.042, y: 0.500, width: 0.273, height: 0.101 },
  { x: 0.042, y: 0.619, width: 0.273, height: 0.101 },
  { x: 0.042, y: 0.737, width: 0.273, height: 0.101 },
];
const DEFAULT_BROADCAST_PLAYER_SELECTION_BADGE_RECT: NormalizedRect = { x: 0.0, y: 0.10, width: 0.17, height: 0.74 };
const DEFAULT_BROADCAST_PLAYER_SELECTION_BADGE_NUMBER_RECT: NormalizedRect = { x: 0.03, y: 0.16, width: 0.45, height: 0.72 };
const DEFAULT_BROADCAST_PLAYER_POKEMON_NAME_RECT: NormalizedRect = { x: 0.18, y: 0.06, width: 0.60, height: 0.28 };
const DEFAULT_BROADCAST_PLAYER_ITEM_NAME_RECT: NormalizedRect = { x: 0.18, y: 0.39, width: 0.52, height: 0.28 };
const DEFAULT_BROADCAST_PLAYER_POKEMON_SPRITE_RECT: NormalizedRect = { x: 0.72, y: 0.0, width: 0.28, height: 1.0 };
const DEFAULT_BROADCAST_PLAYER_POKEMON_VISUAL_RECOGNITION = {
  enabled: false,
  modelName: "facebook/dinov3-vits16-pretrain-lvd1689m",
};
const DEFAULT_BROADCAST_SPRITE_SUBRECT: NormalizedRect = { x: 0.03, y: 0.08, width: 0.54, height: 1.0 };
const DEFAULT_BROADCAST_BATTLE_INDICATORS: BroadcastBattleIndicator[] = [
  {
    id: "selection-complete",
    targetState: "selection",
    rect: { x: 0.15625, y: 0.8407407407407408, width: 0.13020833333333334, height: 0.05925925925925926 },
    threshold: 0.93,
    templateImage: "scene/selection_complete_text.png",
    minTemplateScore: 0.93,
    templateSearchOffsetX: 0.02,
    templateSearchOffsetY: 0.02,
    templateSearchScale: 0.02,
  },
  {
    id: "selection-arrow",
    targetState: "selection",
    scanSlotRects: "player",
    rect: { x: 0.0, y: 0.1574074074074074, width: 0.06145833333333334, height: 0.11851851851851852 },
    threshold: 0.9,
    templateImage: "scene/selection_arrow.png",
    minTemplateScore: 0.9,
    templateSearchOffsetX: 0.015,
    templateSearchOffsetY: 0.015,
    templateSearchScale: 0.02,
  },
  {
    id: "vs-center",
    targetState: "battle",
    rect: { x: 0.385, y: 0.327, width: 0.23, height: 0.345 },
    threshold: 0.88,
    templateImage: "scene/vs_center.png",
    minTemplateScore: 0.88,
    templateSearchOffsetX: 0.04,
    templateSearchOffsetY: 0.04,
    templateSearchScale: 0.06,
  },
  {
    id: "matching-waiting-text",
    targetState: "idle",
    detectFromScene: "battle",
    rect: { x: 0.4005208333333333, y: 0.5722222222222222, width: 0.20104166666666667, height: 0.062037037037037036 },
    threshold: 0.89,
    templateImage: "scene/matching_waiting_text.png",
    minTemplateScore: 0.89,
    templateSearchOffsetX: 0.025,
    templateSearchOffsetY: 0.025,
    templateSearchScale: 0.03,
  },
  {
    id: "matching-waiting-dialog",
    targetState: "idle",
    detectFromScene: "battle",
    rect: { x: 0.3770833333333333, y: 0.3814814814814815, width: 0.2453125, height: 0.25925925925925924 },
    threshold: 0.87,
    templateImage: "scene/matching_waiting_dialog.png",
    minTemplateScore: 0.87,
    templateSearchOffsetX: 0.03,
    templateSearchOffsetY: 0.03,
    templateSearchScale: 0.04,
  },
  {
    id: "continue-battle-button",
    targetState: "idle",
    rect: { x: 0.6567708333333333, y: 0.8712962962962963, width: 0.2791666666666667, height: 0.10555555555555556 },
    threshold: 0.88,
    templateImage: "scene/continue_battle_button.png",
    minTemplateScore: 0.88,
    templateSearchOffsetX: 0.03,
    templateSearchOffsetY: 0.03,
    templateSearchScale: 0.03,
  },
  {
    id: "team-edit-button",
    targetState: "idle",
    rect: { x: 0.36770833333333336, y: 0.8712962962962963, width: 0.2791666666666667, height: 0.10555555555555556 },
    threshold: 0.88,
    templateImage: "scene/team_edit_button.png",
    minTemplateScore: 0.88,
    templateSearchOffsetX: 0.03,
    templateSearchOffsetY: 0.03,
    templateSearchScale: 0.03,
  },
];

let broadcastOpponentSlotRects: NormalizedRect[] = [...DEFAULT_BROADCAST_OPPONENT_SLOT_RECTS];
let broadcastPlayerSlotRects: NormalizedRect[] = [...DEFAULT_BROADCAST_PLAYER_SLOT_RECTS];
let broadcastPlayerSelectionBadgeRect: NormalizedRect = { ...DEFAULT_BROADCAST_PLAYER_SELECTION_BADGE_RECT };
let broadcastPlayerSelectionBadgeNumberRect: NormalizedRect = { ...DEFAULT_BROADCAST_PLAYER_SELECTION_BADGE_NUMBER_RECT };
let broadcastPlayerPokemonNameRect: NormalizedRect = { ...DEFAULT_BROADCAST_PLAYER_POKEMON_NAME_RECT };
let broadcastPlayerItemNameRect: NormalizedRect = { ...DEFAULT_BROADCAST_PLAYER_ITEM_NAME_RECT };
let broadcastPlayerPokemonSpriteRect: NormalizedRect = { ...DEFAULT_BROADCAST_PLAYER_POKEMON_SPRITE_RECT };
let broadcastPlayerPokemonVisualRecognition = { ...DEFAULT_BROADCAST_PLAYER_POKEMON_VISUAL_RECOGNITION };
let broadcastSpriteSubrect: NormalizedRect = { ...DEFAULT_BROADCAST_SPRITE_SUBRECT };
let broadcastBattleIndicators: BroadcastBattleIndicator[] = DEFAULT_BROADCAST_BATTLE_INDICATORS.map((indicator) => ({
  ...indicator,
  rect: { ...indicator.rect },
}));
let broadcastIndicatorsByScene = new Map<Exclude<SceneKind, "unknown">, BroadcastBattleIndicator[]>();
let broadcastIndicatorTemplates = new Map<string, LoadedIndicatorTemplate>();
let sceneDetectionState: SceneDetectionState = {
  rawScene: "unknown",
  displayScene: "idle",
  pendingScene: "unknown",
  consecutiveMatches: 0,
};

//選出画面を1枚の画像にして切り出すための変数
let broadcastFrameCanvas: HTMLCanvasElement | null = null;
let broadcastFrameContext: CanvasRenderingContext2D | null = null;

let sceneDetectionRunning = false;
let sceneDetectionTimerHandle: number | null = null;
let sceneDetectionLastRunAt = 0;
let latestSelectionSceneDetectionMode: SelectionSceneDetectionMode = "none";
let broadcastRecognitionCanvas: HTMLCanvasElement | null = null;
let broadcastRecognitionContext: CanvasRenderingContext2D | null = null;
let sceneTemplateCanvas: HTMLCanvasElement | null = null;
let sceneTemplateContext: CanvasRenderingContext2D | null = null;
let broadcastRecognitionReady = false;
let broadcastRecognitionInFlight = false;
let broadcastRecognitionLastRunAt = 0;
let broadcastRecognitionLastStartAttemptAt = 0;
let broadcastRecognitionStartPromise: Promise<boolean> | null = null;
let broadcastRecognitionStates: BroadcastRecognitionSlotState[] = Array.from({ length: 6 }, () => ({
  confirmed: null,
  pending: null,
  consecutiveMatches: 0,
}));
let confirmedOpponentRoster: BroadcastConfirmedRosterState = {
  slots: Array.from({ length: 6 }, () => null),
  lastConfirmedAt: 0,
};
let lastSavedOpponentSlotImageSignature = "";
let selectionSnapshotCaptured = false;
let selectionSnapshotRecognized = false;
let selectionSnapshotSlots: Array<{ slotIndex: number; imageBase64: string; timestamp: number }> = [];
let playerSelectionSnapshotCaptured = false;
let playerSelectionSnapshotRecognized = false;
let playerSelectionSnapshotSlots: Array<{ slotIndex: number; imageBase64: string; timestamp: number }> = [];
let playerSelectionSnapshotDebugSlots: BroadcastPlayerDebugSlotImage[] = [];
let opponentRecognitionDebugLogged = false;
let playerPartyRecognitionDebugLogged = false;
let playerPartySnapshotRecognized = false;
let confirmedPlayerPartySlots: Array<BroadcastPlayerPartySlotEntry | null> = Array.from({ length: 6 }, () => null);
let confirmedPlayerSelection: Array<BroadcastPlayerSelectionEntry | null> = Array.from({ length: 3 }, () => null);
let playerSelectionTrackingSlots: BroadcastPlayerSelectionTrackerSlot[] = Array.from({ length: 6 }, () => ({
  selectionOrder: null,
  consecutiveSelectedFrames: 0,
  confidence: 0,
  lastUpdatedAt: 0,
}));
let playerSelectionTrackingNextOrder = 1;
let lastPlayerSelectionTrackingLogSignature = "";
let lastPlayerSelectionBadgeRawLogSignature = "";
let playerSelectionImageVersion = Date.now();
let recognitionBootstrapPromise: Promise<void> | null = null;
let sceneSampleCache: SceneSampleCache = { frameId: 0, samples: new Map() };
let activeMainTabId = "tab1";
let sceneDetectionWorker: Worker | null = null;
let sceneDetectionWorkerReady = false;
let sceneDetectionWorkerReadyPromise: Promise<void> | null = null;
let sceneDetectionWorkerRequestCounter = 0;
const sceneDetectionPendingRequests = new Map<
  number,
  {
    resolve: (value: SceneDetectionWorkerResult) => void;
    reject: (reason?: unknown) => void;
  }
>();

function serializeConfirmedPlayerSelection(): Array<{
  displayIndex: number;
  slotIndex: number | null;
  selectionOrder: number | null;
  pokemonId: string | null;
  pokemonName: string | null;
  itemName: string | null;
  score: number | null;
}> {
  return confirmedPlayerSelection.map((entry, index) => ({
    displayIndex: index + 1,
    slotIndex: entry?.slotIndex ?? null,
    selectionOrder: entry?.selectionOrder ?? null,
    pokemonId: entry?.pokemonId ?? null,
    pokemonName: entry?.pokemonName ?? null,
    itemName: entry?.itemName ?? null,
    score: entry?.score ?? null,
  }));
}

function resetPlayerSelectionTracking(): void {
  playerSelectionTrackingSlots = Array.from({ length: 6 }, () => ({
    selectionOrder: null,
    consecutiveSelectedFrames: 0,
    confidence: 0,
    lastUpdatedAt: 0,
  }));
  playerSelectionTrackingNextOrder = 1;
  lastPlayerSelectionTrackingLogSignature = "";
  lastPlayerSelectionBadgeRawLogSignature = "";
}

function getTrackedPlayerSelectionSlots(): Array<{ slotIndex: number; selectionOrder: number }> {
  return playerSelectionTrackingSlots
    .map((slot, slotIndex) => ({
      slotIndex,
      selectionOrder: slot.selectionOrder,
    }))
    .filter((slot): slot is { slotIndex: number; selectionOrder: number } => slot.selectionOrder !== null)
    .sort((a, b) => a.selectionOrder - b.selectionOrder);
}

function emitPlayerSelectionTrackingLog(): void {
  const table = [1, 2, 3].map((selectionOrder) => {
    const sourceSlotIndex = playerSelectionTrackingSlots.findIndex((slot) => slot.selectionOrder === selectionOrder);
    const state = sourceSlotIndex >= 0 ? playerSelectionTrackingSlots[sourceSlotIndex] : null;
    return {
      selectionOrder,
      sourceSlot: sourceSlotIndex >= 0 ? sourceSlotIndex + 1 : "",
      confidence: state ? state.confidence : "",
    };
  });
  const signature = table.map((row) => `${row.selectionOrder}:${row.sourceSlot}:${row.confidence}`).join("|");
  if (signature === lastPlayerSelectionTrackingLogSignature) return;
  lastPlayerSelectionTrackingLogSignature = signature;
  emitRendererDebugLog("broadcast-player-selection-tracking", undefined, table);
}

function emitPlayerSelectionBadgeRawLog(results: PlayerSelectionBadgeDetection[]): void {
  const table = results
    .map((result) => ({
      slot: result.slotIndex + 1,
      isSelected: result.isSelected,
      selectionOrder: result.selectionOrder ?? "",
      selectionOrderScore: result.selectionOrderScore,
      confidence: result.confidence,
    }))
    .sort((a, b) => a.slot - b.slot);
  const signature = table
    .map((row) => `${row.slot}:${row.isSelected}:${row.selectionOrder}:${row.selectionOrderScore}:${row.confidence}`)
    .join("|");
  if (signature === lastPlayerSelectionBadgeRawLogSignature) return;
  lastPlayerSelectionBadgeRawLogSignature = signature;
  emitRendererDebugLog("broadcast-player-selection-badge-raw", undefined, table);
}

function applyPlayerSelectionBadgeDetections(results: PlayerSelectionBadgeDetection[]): boolean {
  let newlyConfirmed = false;
  const now = Date.now();

  emitPlayerSelectionBadgeRawLog(results);

  for (const result of results) {
    if (!result || result.slotIndex < 0 || result.slotIndex >= playerSelectionTrackingSlots.length) continue;
    const state = playerSelectionTrackingSlots[result.slotIndex];
    if (state.selectionOrder !== null) {
      state.confidence = Math.max(state.confidence, result.confidence ?? 0);
      state.lastUpdatedAt = now;
      continue;
    }

    if (result.isSelected && result.confidence >= PLAYER_SELECTION_TRACK_MIN_CONFIDENCE) {
      state.consecutiveSelectedFrames += 1;
      state.confidence = result.confidence;
    } else {
      state.consecutiveSelectedFrames = 0;
      state.confidence = result.confidence ?? 0;
    }
    state.lastUpdatedAt = now;
  }

  const bestByOrder = new Map<number, PlayerSelectionBadgeDetection>();
  for (const result of results) {
    if (!result || result.slotIndex < 0 || result.slotIndex >= playerSelectionTrackingSlots.length) continue;
    const selectionOrder = result.selectionOrder;
    if (!result.isSelected || result.confidence < PLAYER_SELECTION_TRACK_MIN_CONFIDENCE) continue;
    if (selectionOrder === null || selectionOrder < 1 || selectionOrder > 3) continue;

    const current = bestByOrder.get(selectionOrder);
    if (
      !current
      || result.selectionOrderScore > current.selectionOrderScore
      || (
        result.selectionOrderScore === current.selectionOrderScore
        && result.confidence > current.confidence
      )
    ) {
      bestByOrder.set(selectionOrder, result);
    }
  }

  for (const [selectionOrder, result] of bestByOrder) {
    for (const state of playerSelectionTrackingSlots) {
      if (state.selectionOrder === selectionOrder) state.selectionOrder = null;
    }

    const state = playerSelectionTrackingSlots[result.slotIndex];
    if (!state) continue;
    if (state.selectionOrder !== selectionOrder) newlyConfirmed = true;
    state.selectionOrder = selectionOrder;
    state.confidence = result.confidence;
    state.lastUpdatedAt = now;
  }

  const trackedOrders = new Set(
    playerSelectionTrackingSlots
      .map((slot) => slot.selectionOrder)
      .filter((selectionOrder): selectionOrder is number => selectionOrder !== null)
  );
  playerSelectionTrackingNextOrder = Math.min(4, Math.max(1, ...Array.from(trackedOrders, (order) => order + 1)));

  if (isSceneDebugEnabled()) {
    console.debug("[broadcast-player-selection-tracking]", {
      rawResults: results,
      tracked: playerSelectionTrackingSlots.map((slot, slotIndex) => ({
        slotIndex,
        selectionOrder: slot.selectionOrder,
        consecutiveSelectedFrames: slot.consecutiveSelectedFrames,
        confidence: slot.confidence,
      })),
    });
  }

  emitPlayerSelectionTrackingLog();
  return newlyConfirmed;
}

function getSceneDetectionIntervalMs(): number {
  return activeMainTabId === "tab1"
    ? SCENE_DETECTION_INTERVAL_WHILE_DAMAGE_TAB_MS
    : SCENE_DETECTION_INTERVAL_MS;
}

function getBroadcastRecognitionIntervalMs(): number {
  return activeMainTabId === "tab1"
    ? BROADCAST_RECOGNITION_INTERVAL_WHILE_DAMAGE_TAB_MS
    : BROADCAST_RECOGNITION_INTERVAL_MS;
}

function isSceneDebugEnabled(): boolean {
  return !!sceneDebugEnabledEl?.checked;
}

function logConfirmedPlayerSelectionState(context: string, extra?: Record<string, unknown>): void {
  if (!isSceneDebugEnabled()) return;
  console.debug("[broadcast-player-selection]", {
    context,
    scene: sceneDetectionState.displayScene,
    rawScene: sceneDetectionState.rawScene,
    pendingScene: sceneDetectionState.pendingScene,
    selectionSnapshotCaptured,
    playerSelectionSnapshotCaptured,
    confirmedPlayerSelection: serializeConfirmedPlayerSelection(),
    ...extra,
  });
}

function isValidNormalizedRect(value: unknown): value is NormalizedRect {
  if (!value || typeof value !== "object") return false;
  const rect = value as NormalizedRect;
  return [rect.x, rect.y, rect.width, rect.height].every((part) => Number.isFinite(part));
}

function clampRect(rect: NormalizedRect): NormalizedRect {
  const x = Math.min(1, Math.max(0, rect.x));
  const y = Math.min(1, Math.max(0, rect.y));
  const width = Math.min(1 - x, Math.max(0.0001, rect.width));
  const height = Math.min(1 - y, Math.max(0.0001, rect.height));
  return { x, y, width, height };
}

async function loadImageTemplate(templatePath: string): Promise<LoadedIndicatorTemplate | null> {
  const src = `recognize/${templatePath}`;
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(image, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      resolve({
        width: imageData.width,
        height: imageData.height,
        data: imageData.data,
      });
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

async function loadBroadcastRecognitionConfig(): Promise<void> {
  let nextSlotRects = [...DEFAULT_BROADCAST_OPPONENT_SLOT_RECTS];
  let nextPlayerSlotRects = [...DEFAULT_BROADCAST_PLAYER_SLOT_RECTS];
  let nextPlayerSelectionBadgeRect = { ...DEFAULT_BROADCAST_PLAYER_SELECTION_BADGE_RECT };
  let nextPlayerSelectionBadgeNumberRect = { ...DEFAULT_BROADCAST_PLAYER_SELECTION_BADGE_NUMBER_RECT };
  let nextPlayerPokemonNameRect = { ...DEFAULT_BROADCAST_PLAYER_POKEMON_NAME_RECT };
  let nextPlayerItemNameRect = { ...DEFAULT_BROADCAST_PLAYER_ITEM_NAME_RECT };
  let nextPlayerPokemonSpriteRect = { ...DEFAULT_BROADCAST_PLAYER_POKEMON_SPRITE_RECT };
  let nextPlayerPokemonVisualRecognition = { ...DEFAULT_BROADCAST_PLAYER_POKEMON_VISUAL_RECOGNITION };
  let nextSpriteSubrect = { ...DEFAULT_BROADCAST_SPRITE_SUBRECT };
  let nextIndicators = DEFAULT_BROADCAST_BATTLE_INDICATORS.map((indicator) => ({
    ...indicator,
    rect: { ...indicator.rect },
  }));

  try {
    const response = await fetch("data/broadcast_recognition_config.json");
    if (response.ok) {
      const data = (await response.json()) as BroadcastRecognitionConfig;
      if (Array.isArray(data.opponentSlotRects)) {
        const rects = data.opponentSlotRects.filter((rect) => isValidNormalizedRect(rect)).map((rect) => clampRect(rect));
        if (rects.length === 6) nextSlotRects = rects;
      }
      if (Array.isArray(data.playerSlotRects)) {
        const rects = data.playerSlotRects.filter((rect) => isValidNormalizedRect(rect)).map((rect) => clampRect(rect));
        if (rects.length === 6) nextPlayerSlotRects = rects;
      }
      if (isValidNormalizedRect(data.playerSelectionBadgeRect)) {
        nextPlayerSelectionBadgeRect = clampRect(data.playerSelectionBadgeRect);
      }
      if (isValidNormalizedRect(data.playerSelectionBadgeNumberRect)) {
        nextPlayerSelectionBadgeNumberRect = clampRect(data.playerSelectionBadgeNumberRect);
      }
      if (isValidNormalizedRect(data.playerPokemonNameRect)) {
        nextPlayerPokemonNameRect = clampRect(data.playerPokemonNameRect);
      }
      if (isValidNormalizedRect(data.playerItemNameRect)) {
        nextPlayerItemNameRect = clampRect(data.playerItemNameRect);
      }
      if (isValidNormalizedRect(data.playerPokemonSpriteRect)) {
        nextPlayerPokemonSpriteRect = clampRect(data.playerPokemonSpriteRect);
      }
      if (data.playerPokemonVisualRecognition && typeof data.playerPokemonVisualRecognition === "object") {
        nextPlayerPokemonVisualRecognition = {
          enabled: !!data.playerPokemonVisualRecognition.enabled,
          modelName: typeof data.playerPokemonVisualRecognition.modelName === "string" && data.playerPokemonVisualRecognition.modelName.trim()
            ? data.playerPokemonVisualRecognition.modelName.trim()
            : DEFAULT_BROADCAST_PLAYER_POKEMON_VISUAL_RECOGNITION.modelName,
        };
      }
      if (isValidNormalizedRect(data.spriteSubrect)) {
        nextSpriteSubrect = clampRect(data.spriteSubrect);
      }
      if (Array.isArray(data.battleIndicators)) {
        const indicators = data.battleIndicators
          .filter((indicator) => indicator && typeof indicator.id === "string" && isValidNormalizedRect(indicator.rect))
          .map((indicator) => {
            const targetState: Exclude<SceneKind, "unknown"> =
              indicator.targetState === "selection"
                ? "selection"
                : indicator.targetState === "idle"
                  ? "idle"
                  : "battle";
            const detectFromScene: Exclude<SceneKind, "unknown"> | undefined =
              indicator.detectFromScene === "idle"
                ? "idle"
                : indicator.detectFromScene === "selection"
                  ? "selection"
                  : indicator.detectFromScene === "battle"
                    ? "battle"
                    : undefined;
            const scanSlotRects: "player" | undefined =
              indicator.scanSlotRects === "player" || indicator.id === "selection-arrow" ? "player" : undefined;
            return {
              ...indicator,
              rect: clampRect(indicator.rect),
              targetState,
              detectFromScene,
              scanSlotRects,
            };
          });
        if (indicators.length > 0) nextIndicators = indicators;
      }
    }
  } catch {
    // Keep defaults when config loading fails.
  }

  broadcastOpponentSlotRects = nextSlotRects;
  broadcastPlayerSlotRects = nextPlayerSlotRects;
  broadcastPlayerSelectionBadgeRect = nextPlayerSelectionBadgeRect;
  broadcastPlayerSelectionBadgeNumberRect = nextPlayerSelectionBadgeNumberRect;
  broadcastPlayerPokemonNameRect = nextPlayerPokemonNameRect;
  broadcastPlayerItemNameRect = nextPlayerItemNameRect;
  broadcastPlayerPokemonSpriteRect = nextPlayerPokemonSpriteRect;
  broadcastPlayerPokemonVisualRecognition = nextPlayerPokemonVisualRecognition;
  broadcastSpriteSubrect = nextSpriteSubrect;
  broadcastBattleIndicators = nextIndicators;
  broadcastIndicatorsByScene = new Map<Exclude<SceneKind, "unknown">, BroadcastBattleIndicator[]>([
    ["idle", broadcastBattleIndicators.filter((indicator) => indicator.targetState === "idle")],
    ["selection", broadcastBattleIndicators.filter((indicator) => indicator.targetState === "selection")],
    ["battle", broadcastBattleIndicators.filter((indicator) => indicator.targetState === "battle")],
  ]);

  const loadedTemplates = await Promise.all(
    broadcastBattleIndicators.map(async (indicator) => {
      if (!indicator.templateImage) return [indicator.id, null] as const;
      const template = await loadImageTemplate(indicator.templateImage);
      return [indicator.id, template] as const;
    })
  );
  broadcastIndicatorTemplates = new Map(loadedTemplates.filter((entry): entry is [string, LoadedIndicatorTemplate] => !!entry[1]));
}

function createSceneDetectionWorkerIndicators(): SceneDetectionWorkerIndicator[] {
  return broadcastBattleIndicators.map((indicator) => ({
    id: indicator.id,
    targetState: indicator.targetState ?? "battle",
    detectFromScene: indicator.detectFromScene,
    scanSlotRects: indicator.scanSlotRects,
    threshold: indicator.threshold,
    minTemplateScore: indicator.minTemplateScore,
  }));
}

function createSceneDetectionWorkerTemplates(): SceneDetectionWorkerTemplate[] {
  return Array.from(broadcastIndicatorTemplates.entries()).map(([id, template]) => ({
    id,
    width: template.width,
    height: template.height,
    data: template.data,
  }));
}

function stopSceneDetectionWorker(): void {
  sceneDetectionWorker?.terminate();
  sceneDetectionWorker = null;
  sceneDetectionWorkerReady = false;
  sceneDetectionWorkerReadyPromise = null;
  for (const pending of sceneDetectionPendingRequests.values()) {
    pending.reject(new Error("Scene detection worker stopped"));
  }
  sceneDetectionPendingRequests.clear();
}

function ensureSceneDetectionWorker(): Promise<void> {
  if (sceneDetectionWorkerReady && sceneDetectionWorker) {
    return Promise.resolve();
  }
  if (sceneDetectionWorkerReadyPromise) return sceneDetectionWorkerReadyPromise;

  sceneDetectionWorkerReadyPromise = new Promise((resolve, reject) => {
    try {
      const worker = new Worker("scene-detection-worker.js");
      sceneDetectionWorker = worker;
      sceneDetectionWorkerReady = false;

      worker.onmessage = (event: MessageEvent<{
        type: "detect-scene-result";
        requestId: number;
        rawScene: SceneKind;
        scores: SceneDetectionWorkerScore[];
      }>) => {
        const message = event.data;
        if (!message || message.type !== "detect-scene-result") return;
        const pending = sceneDetectionPendingRequests.get(message.requestId);
        if (!pending) return;
        sceneDetectionPendingRequests.delete(message.requestId);
        pending.resolve({
          rawScene: message.rawScene,
          scores: message.scores,
        });
      };

      worker.onerror = (event) => {
        stopSceneDetectionWorker();
        reject(event.error ?? new Error(event.message || "Scene detection worker error"));
      };

      worker.postMessage({
        type: "init",
        indicators: createSceneDetectionWorkerIndicators(),
        templates: createSceneDetectionWorkerTemplates(),
      });
      sceneDetectionWorkerReady = true;
      sceneDetectionWorkerReadyPromise = null;
      resolve();
    } catch (error) {
      stopSceneDetectionWorker();
      sceneDetectionWorkerReadyPromise = null;
      reject(error);
    }
  });

  return sceneDetectionWorkerReadyPromise;
}

function collectSceneDetectionSamples(
  candidateIndicators: BroadcastBattleIndicator[]
): SceneDetectionSamplePayload[] {
  sceneSampleCache = {
    frameId: sceneSampleCache.frameId + 1,
    samples: new Map(),
  };

  return candidateIndicators.map((indicator) => {
    const template = broadcastIndicatorTemplates.get(indicator.id);
    if (!template) {
      return { indicatorId: indicator.id, variants: [] };
    }

    const offsetX = indicator.templateSearchOffsetX ?? 0;
    const offsetY = indicator.templateSearchOffsetY ?? 0;
    const scaleOffset = indicator.templateSearchScale ?? 0;
    const dxCandidates = offsetX > 0 ? [-offsetX, 0, offsetX] : [0];
    const dyCandidates = offsetY > 0 ? [-offsetY, 0, offsetY] : [0];
    const scaleCandidates = scaleOffset > 0 ? [1 - scaleOffset, 1, 1 + scaleOffset] : [1];
    const variants: Uint8ClampedArray[] = [];

    for (const baseRect of getIndicatorBaseRects(indicator)) {
      for (const scale of scaleCandidates) {
        const scaledRect: NormalizedRect = {
          x: baseRect.x + baseRect.width * (1 - scale) * 0.5,
          y: baseRect.y + baseRect.height * (1 - scale) * 0.5,
          width: baseRect.width * scale,
          height: baseRect.height * scale,
        };
        for (const dx of dxCandidates) {
          for (const dy of dyCandidates) {
            const candidateRect = clampRect({
              x: scaledRect.x + baseRect.width * dx,
              y: scaledRect.y + baseRect.height * dy,
              width: scaledRect.width,
              height: scaledRect.height,
            });
            const observed = cropRectFromVideo(candidateRect, template.width, template.height, sceneSampleCache);
            if (observed) variants.push(observed);
          }
        }
      }
    }

    return {
      indicatorId: indicator.id,
      variants,
    };
  });
}

function buildSceneDetectionDebugLines(
  nextScene: SceneKind,
  currentScene: SceneKind,
  scores: SceneDetectionWorkerScore[]
): string[] {
  return [
    `current=${currentScene} next=${nextScene}`,
    ...(nextScene === "selection" ? [`selectionRule=${getSelectionSceneDetectionMode(scores)}`] : []),
    ...scores.map(({ indicatorId, score, threshold, matched, detectFromScene }) =>
      `${matched ? "PASS" : "FAIL"} ${indicatorId}${detectFromScene ? ` [from:${detectFromScene}]` : ""}: ${score.toFixed(4)} / ${threshold.toFixed(2)}`
    ),
  ];
}

function buildSceneDetectionEvidence(
  currentScene: SceneKind,
  candidateScene: SceneKind,
  rawScene: SceneKind,
  indicators: BroadcastBattleIndicator[],
  scores: SceneDetectionWorkerScore[]
): SceneDetectionEvidence {
  const indicatorById = new Map(indicators.map((indicator) => [indicator.id, indicator]));
  return {
    currentScene,
    candidateScene,
    rawScene,
    indicators: scores.map((score) => {
      const indicator = indicatorById.get(score.indicatorId);
      return {
        indicatorId: score.indicatorId,
        templateImage: indicator?.templateImage ?? "",
        score: score.score,
        threshold: score.threshold,
        matched: score.matched,
        detectFromScene: score.detectFromScene,
      };
    }),
  };
}

function getSelectionSceneDetectionMode(scores: SceneDetectionWorkerScore[]): SelectionSceneDetectionMode {
  const completeScore = scores.find(({ indicatorId }) => indicatorId === "selection-complete");
  const arrowScores = scores.filter(({ indicatorId }) => indicatorId === "selection-arrow");
  const hasArrowMatch = arrowScores.some(({ matched }) => matched);
  if (!completeScore) {
    return scores.every(({ matched }) => matched) ? "complete-and-arrow" : "none";
  }

  if (!completeScore.matched) return hasArrowMatch ? "arrow-only" : "none";

  if (hasArrowMatch) {
    return "complete-and-arrow";
  }
  return "complete-only";
}

//「選出完了」と選択の矢印の両方を認識した場合のみ、選出画面として認識する
function detectSelectionSceneFromScores(scores: SceneDetectionWorkerScore[]): SceneKind {
  return getSelectionSceneDetectionMode(scores) === "complete-and-arrow" ? "selection" : "unknown";
}

function detectSceneFromVideoSync(): SceneDetectionResult {
  const candidateIndicators = getIndicatorsForSceneDetection(sceneDetectionState.displayScene);
  if (candidateIndicators.length === 0) {
    updateSceneDetectionDebug([]);
    return { rawScene: "unknown", evidence: null };
  }

  sceneSampleCache = {
    frameId: sceneSampleCache.frameId + 1,
    samples: new Map(),
  };
  const nextScene = candidateIndicators[0]?.targetState ?? "unknown";
  const scores = candidateIndicators.map((indicator) => {
    const score = getBestIndicatorScore(indicator, sceneSampleCache);
    const threshold = indicator.minTemplateScore ?? indicator.threshold ?? 0.8;
    return { indicatorId: indicator.id, score, threshold, matched: score >= threshold, detectFromScene: indicator.detectFromScene };
  });

  if (isSceneDebugEnabled() && nextScene === "idle") {
    updateSceneDetectionDebug(buildSceneDetectionDebugLines(nextScene, sceneDetectionState.displayScene, scores));
  } else if (isSceneDebugEnabled() && nextScene === "selection") {
    updateSceneDetectionDebug(buildSceneDetectionDebugLines(nextScene, sceneDetectionState.displayScene, scores));
  } else {
    updateSceneDetectionDebug([]);
  }

  if (nextScene === "selection") {
    latestSelectionSceneDetectionMode = getSelectionSceneDetectionMode(scores);
    const rawScene = detectSelectionSceneFromScores(scores);
    return {
      rawScene,
      evidence: buildSceneDetectionEvidence(sceneDetectionState.displayScene, nextScene, rawScene, candidateIndicators, scores),
    };
  }

  if (nextScene === "idle") {
    const rawScene = detectIdleSceneFromScores(
      scores.map((score) => ({
        indicator: candidateIndicators.find((indicator) => indicator.id === score.indicatorId)!,
        score: score.score,
        threshold: score.threshold,
        matched: score.matched,
      })),
      sceneDetectionState.displayScene
    );
    return {
      rawScene,
      evidence: buildSceneDetectionEvidence(sceneDetectionState.displayScene, nextScene, rawScene, candidateIndicators, scores),
    };
  }

  const matchedScore = scores.find(({ matched }) => matched);
  const rawScene = matchedScore ? (nextScene ?? "battle") : "unknown";
  return {
    rawScene,
    evidence: buildSceneDetectionEvidence(sceneDetectionState.displayScene, nextScene, rawScene, candidateIndicators, scores),
  };
}

async function detectSceneFromVideo(): Promise<SceneDetectionResult> {
  const candidateIndicators = getIndicatorsForSceneDetection(sceneDetectionState.displayScene);
  if (candidateIndicators.length === 0) {
    updateSceneDetectionDebug([]);
    return { rawScene: "unknown", evidence: null };
  }

  try {
    await ensureSceneDetectionWorker();
  } catch {
    return detectSceneFromVideoSync();
  }
  if (!sceneDetectionWorker) {
    return detectSceneFromVideoSync();
  }

  const nextScene = candidateIndicators[0]?.targetState ?? "unknown";
  const requestId = ++sceneDetectionWorkerRequestCounter;
  const resultPromise = new Promise<SceneDetectionWorkerResult>((resolve, reject) => {
    sceneDetectionPendingRequests.set(requestId, { resolve, reject });
  });

  sceneDetectionWorker.postMessage({
    type: "detect-scene",
    requestId,
    currentScene: sceneDetectionState.displayScene,
    indicatorIds: candidateIndicators.map((indicator) => indicator.id),
    samples: collectSceneDetectionSamples(candidateIndicators),
  });

  try {
    const result = await resultPromise;
    if (isSceneDebugEnabled() && nextScene === "idle") {
      updateSceneDetectionDebug(buildSceneDetectionDebugLines(nextScene, sceneDetectionState.displayScene, result.scores));
    } else if (isSceneDebugEnabled() && nextScene === "selection") {
      updateSceneDetectionDebug(buildSceneDetectionDebugLines(nextScene, sceneDetectionState.displayScene, result.scores));
    } else {
      updateSceneDetectionDebug([]);
    }
    if (nextScene === "selection") {
      latestSelectionSceneDetectionMode = getSelectionSceneDetectionMode(result.scores);
    }
    return {
      rawScene: result.rawScene,
      evidence: buildSceneDetectionEvidence(sceneDetectionState.displayScene, nextScene, result.rawScene, candidateIndicators, result.scores),
    };
  } catch {
    return detectSceneFromVideoSync();
  } finally {
    sceneDetectionPendingRequests.delete(requestId);
  }
}

function ensureBroadcastRecognitionCanvas(): CanvasRenderingContext2D | null {
  if (!broadcastRecognitionCanvas) {
    broadcastRecognitionCanvas = document.createElement("canvas");
  }
  broadcastRecognitionContext = broadcastRecognitionCanvas.getContext("2d", { willReadFrequently: true });
  return broadcastRecognitionContext;
}

function ensureSceneTemplateCanvas(width: number, height: number): CanvasRenderingContext2D | null {
  if (!sceneTemplateCanvas) {
    sceneTemplateCanvas = document.createElement("canvas");
  }
  if (sceneTemplateCanvas.width !== width) sceneTemplateCanvas.width = width;
  if (sceneTemplateCanvas.height !== height) sceneTemplateCanvas.height = height;
  sceneTemplateContext = sceneTemplateCanvas.getContext("2d", { willReadFrequently: true });
  return sceneTemplateContext;
}

function getRectSampleCacheKey(
  frameId: number,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  targetWidth: number,
  targetHeight: number
): string {
  return `${frameId}:${sx}:${sy}:${sw}:${sh}:${targetWidth}:${targetHeight}`;
}

function cropRectFromVideo(
  rect: NormalizedRect,
  targetWidth: number,
  targetHeight: number,
  cache: SceneSampleCache | null = null
): Uint8ClampedArray | null {
  const ctx = ensureSceneTemplateCanvas(targetWidth, targetHeight);
  if (!ctx || !sceneTemplateCanvas || !videoEl) return null;
  const videoWidth = videoEl.videoWidth;
  const videoHeight = videoEl.videoHeight;
  if (videoWidth <= 0 || videoHeight <= 0) return null;

  const clamped = clampRect(rect);
  const rawSx = Math.floor(clamped.x * videoWidth);
  const rawSy = Math.floor(clamped.y * videoHeight);
  const rawSw = Math.max(1, Math.floor(clamped.width * videoWidth));
  const rawSh = Math.max(1, Math.floor(clamped.height * videoHeight));
  const sx = Math.min(Math.max(0, rawSx), Math.max(0, videoWidth - 1));
  const sy = Math.min(Math.max(0, rawSy), Math.max(0, videoHeight - 1));
  const sw = Math.max(1, Math.min(rawSw, videoWidth - sx));
  const sh = Math.max(1, Math.min(rawSh, videoHeight - sy));
  const cacheKey = cache
    ? getRectSampleCacheKey(cache.frameId, sx, sy, sw, sh, targetWidth, targetHeight)
    : null;

  if (cacheKey) {
    const cached = cache?.samples.get(cacheKey);
    if (cached) return cached;
  }

  ctx.clearRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
  const data = ctx.getImageData(0, 0, targetWidth, targetHeight).data;
  if (cacheKey) cache?.samples.set(cacheKey, data);
  return data;
}

function computeTemplateScore(observed: Uint8ClampedArray, template: Uint8ClampedArray): number {
  if (observed.length !== template.length || observed.length === 0) return 0;
  let totalDiff = 0;
  const pixelCount = observed.length / 4;
  for (let index = 0; index < observed.length; index += 4) {
    const observedGray = observed[index] * 0.299 + observed[index + 1] * 0.587 + observed[index + 2] * 0.114;
    const templateGray = template[index] * 0.299 + template[index + 1] * 0.587 + template[index + 2] * 0.114;
    totalDiff += Math.abs(observedGray - templateGray);
  }
  return Math.max(0, 1 - totalDiff / (pixelCount * 255));
}

function getIndicatorBaseRects(indicator: BroadcastBattleIndicator): NormalizedRect[] {
  if (indicator.scanSlotRects !== "player" || broadcastPlayerSlotRects.length === 0) {
    return [indicator.rect];
  }

  const firstSlot = broadcastPlayerSlotRects[0];
  if (!firstSlot || firstSlot.height <= 0) return [indicator.rect];

  const yOffsetRatio = (indicator.rect.y - firstSlot.y) / firstSlot.height;
  const heightRatio = indicator.rect.height / firstSlot.height;
  return broadcastPlayerSlotRects.map((slotRect) =>
    clampRect({
      x: indicator.rect.x,
      y: slotRect.y + slotRect.height * yOffsetRatio,
      width: indicator.rect.width,
      height: slotRect.height * heightRatio,
    })
  );
}

function getBestIndicatorScore(indicator: BroadcastBattleIndicator, cache: SceneSampleCache | null = null): number {
  const template = broadcastIndicatorTemplates.get(indicator.id);
  if (!template) return 0;

  const offsetX = indicator.templateSearchOffsetX ?? 0;
  const offsetY = indicator.templateSearchOffsetY ?? 0;
  const scaleOffset = indicator.templateSearchScale ?? 0;
  const dxCandidates = offsetX > 0 ? [-offsetX, 0, offsetX] : [0];
  const dyCandidates = offsetY > 0 ? [-offsetY, 0, offsetY] : [0];
  const scaleCandidates = scaleOffset > 0 ? [1 - scaleOffset, 1, 1 + scaleOffset] : [1];
  let bestScore = 0;

  for (const baseRect of getIndicatorBaseRects(indicator)) {
    for (const scale of scaleCandidates) {
      const scaledRect: NormalizedRect = {
        x: baseRect.x + baseRect.width * (1 - scale) * 0.5,
        y: baseRect.y + baseRect.height * (1 - scale) * 0.5,
        width: baseRect.width * scale,
        height: baseRect.height * scale,
      };
      for (const dx of dxCandidates) {
        for (const dy of dyCandidates) {
          const candidateRect = clampRect({
            x: scaledRect.x + baseRect.width * dx,
            y: scaledRect.y + baseRect.height * dy,
            width: scaledRect.width,
            height: scaledRect.height,
          });
          const observed = cropRectFromVideo(candidateRect, template.width, template.height, cache);
          if (!observed) continue;
          bestScore = Math.max(bestScore, computeTemplateScore(observed, template.data));
        }
      }
    }
  }

  return bestScore;
}

function getExpectedNextScene(scene: SceneKind): SceneKind {
  if (scene === "idle") return "selection";
  if (scene === "selection") return "battle";
  if (scene === "battle") return "idle";
  return "unknown";
}

function getIndicatorsForSceneDetection(scene: SceneKind): BroadcastBattleIndicator[] {
  const nextScene = getExpectedNextScene(scene);
  if (nextScene !== "unknown") {
    const indicators = broadcastIndicatorsByScene.get(nextScene as Exclude<SceneKind, "unknown">) ?? [];
    return indicators.filter((indicator) => !indicator.detectFromScene || indicator.detectFromScene === scene);
  }
  return broadcastBattleIndicators;
}

function detectIdleSceneFromScores(
  scores: Array<{
    indicator: BroadcastBattleIndicator;
    score: number;
    threshold: number;
    matched: boolean;
  }>,
  currentScene: SceneKind
): SceneKind {
  if (currentScene !== "battle") {
    return scores.every(({ matched }) => matched) ? "idle" : "unknown";
  }

  const battleSpecificScores = scores.filter(({ indicator }) => indicator.detectFromScene === "battle");
  if (battleSpecificScores.length >= 2 && battleSpecificScores.every(({ matched }) => matched)) {
    return "idle";
  }

  const fallbackScores = scores.filter(({ indicator }) => !indicator.detectFromScene);
  if (fallbackScores.length > 0 && fallbackScores.every(({ matched }) => matched)) {
    return "idle";
  }

  return "unknown";
}

function updateSceneDetectionDebug(lines: string[]): void {
  if (!sceneDetectionDebugEl) return;
  if (!sceneDebugEnabledEl?.checked || lines.length === 0) {
    sceneDetectionDebugEl.hidden = true;
    sceneDetectionDebugEl.textContent = "";
    return;
  }
  sceneDetectionDebugEl.hidden = false;
  sceneDetectionDebugEl.textContent = lines.join("\n");
}

function getRequiredStableMatches(from: SceneKind, to: SceneKind): number {
  if (from === "idle" && to === "selection" && latestSelectionSceneDetectionMode === "complete-only") {
    return SCENE_STABLE_MATCHES + 2;
  }
  if (from === "battle" && to === "idle") return BATTLE_TO_IDLE_STABLE_MATCHES;
  return SCENE_STABLE_MATCHES;
}

function resetRecognitionStates(reason = "unspecified", options: { preserveOpponentRoster?: boolean } = {}): void {
  const beforeReset = serializeConfirmedPlayerSelection();
  const preservedOpponentRoster = options.preserveOpponentRoster
    ? {
        slots: confirmedOpponentRoster.slots.map((slot) => (slot ? { ...slot } : null)),
        lastConfirmedAt: confirmedOpponentRoster.lastConfirmedAt,
      }
    : null;
  broadcastRecognitionStates = Array.from({ length: 6 }, () => ({
    confirmed: null,
    pending: null,
    consecutiveMatches: 0,
  }));
  confirmedOpponentRoster = preservedOpponentRoster ?? {
    slots: Array.from({ length: 6 }, () => null),
    lastConfirmedAt: 0,
  };
  lastSavedOpponentSlotImageSignature = "";
  selectionSnapshotCaptured = false;
  selectionSnapshotRecognized = false;
  selectionSnapshotSlots = [];
  playerSelectionSnapshotCaptured = false;
  playerSelectionSnapshotRecognized = false;
  playerSelectionSnapshotSlots = [];
  playerSelectionSnapshotDebugSlots = [];
  opponentRecognitionDebugLogged = false;
  playerPartyRecognitionDebugLogged = false;
  playerPartySnapshotRecognized = false;
  confirmedPlayerPartySlots = Array.from({ length: 6 }, () => null);
  confirmedPlayerSelection = Array.from({ length: 3 }, () => null);
  resetPlayerSelectionTracking();
  if (isSceneDebugEnabled()) {
    console.debug("[broadcast-player-selection]", {
      context: "resetRecognitionStates",
      reason,
      preserveOpponentRoster: !!options.preserveOpponentRoster,
      beforeReset,
      afterReset: serializeConfirmedPlayerSelection(),
    });
  }
  renderDamageRosterSlots();
}

function renderBroadcastPlayerSelection(): void {
  for (let index = 0; index < broadcastPlayerCardEls.length; index += 1) {
    const cardEl = broadcastPlayerCardEls[index];
    if (!cardEl) continue;
    const entry = confirmedPlayerSelection[index];
    cardEl.classList.toggle("broadcast-info-card--accent", index === 1);
    cardEl.innerHTML = "";

    const art = document.createElement("div");
    art.className = "broadcast-info-art";
    art.textContent = entry ? String(entry.selectionOrder) : String(index + 1);

    const body = document.createElement("div");
    body.className = "broadcast-info-body";

    const label = document.createElement("div");
    label.className = "broadcast-info-label";
    label.textContent = `${index + 1}番手`;

    const title = document.createElement("div");
    title.className = "broadcast-info-title";
    title.textContent = entry?.pokemonName ?? "Unknown";

    const subtitle = document.createElement("div");
    subtitle.className = "broadcast-info-subtitle";
    subtitle.textContent = `持ち物: ${entry?.itemName ?? "Unknown"}`;

    const chips = document.createElement("div");
    chips.className = "broadcast-info-chip-row";

    if (entry) {
      const slotChip = document.createElement("span");
      slotChip.className = "broadcast-info-chip";
      slotChip.textContent = `選出枠 ${entry.slotIndex + 1}`;
      chips.append(slotChip);
    } else {
      const waitingChip = document.createElement("span");
      waitingChip.className = "broadcast-info-chip";
      waitingChip.textContent = "認識待ち";
      chips.append(waitingChip);
    }

    body.append(label, title, subtitle);
    if (chips.childElementCount > 0) body.append(chips);
    cardEl.append(art, body);
  }
}

function renderBroadcastPlayerSelectionCards(): void {
  for (let index = 0; index < broadcastPlayerCardEls.length; index += 1) {
    const cardEl = broadcastPlayerCardEls[index];
    if (!cardEl) continue;
    const entry = confirmedPlayerSelection[index];
    const item = getPlayerSelectionItemByName(entry?.itemName ?? null);
    cardEl.classList.toggle("broadcast-info-card--accent", index === 1);
    cardEl.classList.toggle("is-empty", !entry);
    cardEl.innerHTML = "";

    const art = document.createElement("img");
    art.className = "broadcast-info-art";
    art.src = getPlayerSelectionImageSrc(entry);
    art.alt = entry?.pokemonName ?? "";
    art.onerror = () => {
      art.src = BALL_MONSTER_IMAGE;
    };

    const body = document.createElement("div");
    body.className = "broadcast-info-body";

    const label = document.createElement("div");
    label.className = "broadcast-info-label";
    label.textContent = entry ? `Select ${entry.selectionOrder}` : `Select ${index + 1}`;

    const title = document.createElement("div");
    title.className = "broadcast-info-title";
    title.textContent = entry?.pokemonName ?? "Unknown";

    const subtitle = document.createElement("div");
    subtitle.className = "broadcast-info-subtitle";
    if (item) {
      const itemIcon = document.createElement("img");
      itemIcon.className = "broadcast-info-item-icon";
      itemIcon.src = item.imageSrc;
      itemIcon.alt = item.nameJa;
      itemIcon.onerror = () => {
        itemIcon.hidden = true;
      };
      subtitle.append(itemIcon);
    }
    const itemText = document.createElement("span");
    itemText.className = "broadcast-info-subtitle-text";
    itemText.textContent = entry?.itemName ?? "Unknown";
    subtitle.append(itemText);

    const chip = document.createElement("span");
    chip.className = "broadcast-info-chip";
    chip.textContent = entry ? `Slot ${entry.slotIndex + 1}` : "Waiting";

    const chips = document.createElement("div");
    chips.className = "broadcast-info-chip-row";
    chips.append(chip);

    const top = document.createElement("div");
    top.className = "broadcast-info-top";
    top.append(label, title);
    const bottom = document.createElement("div");
    bottom.className = "broadcast-info-bottom";
    bottom.append(subtitle, chips);

    body.append(top, bottom);
    cardEl.append(art, body);
  }
}

function renderBroadcastRoster(): void {
  if (!broadcastRosterEl) return;
  broadcastRosterEl.innerHTML = "";

  const slots = sceneDetectionState.displayScene === "battle" && confirmedOpponentRoster.slots.some((slot) => !!slot)
    ? confirmedOpponentRoster.slots
    : broadcastRecognitionStates.map((state) => state.confirmed);

  for (let index = 0; index < 6; index += 1) {
    const slot = document.createElement("div");
    const match = slots[index] ?? null;
    slot.className = `broadcast-roster-slot${match ? "" : " is-empty"}${index === 0 ? " is-focus" : ""}`;

    const slotIndex = document.createElement("span");
    slotIndex.className = "broadcast-roster-slot-index";
    slotIndex.textContent = String(index + 1);

    const caption = document.createElement("span");
    caption.className = "broadcast-roster-slot-caption";
    caption.textContent = match ? "LOCKED" : "SCAN";

    const thumb = document.createElement("img");
    thumb.className = "broadcast-roster-thumb";
    thumb.src = match?.imageSrc ?? "img/ball_monster.png";
    thumb.alt = match?.pokemonName ?? "";
    thumb.onerror = () => {
      thumb.src = "img/ball_monster.png";
    };

    const meta = document.createElement("div");
    meta.className = "broadcast-roster-meta";

    const name = document.createElement("div");
    name.className = "broadcast-roster-name";
    name.textContent = match?.pokemonName ?? "Recognizing";

    const detail = document.createElement("div");
    detail.className = "broadcast-roster-detail";
    detail.textContent = match ? `id: ${match.pokemonId}` : "No confirmed match";

    meta.append(name, detail);
    slot.append(slotIndex, caption, thumb, meta);
    broadcastRosterEl.appendChild(slot);
  }

  if (broadcastTeamNameEl) {
    broadcastTeamNameEl.textContent = sceneDetectionState.displayScene === "battle" ? "Opponent Locked" : "Opponent Preview";
  }
}

function syncFixedPlayerSelectionImagesFromState(): void {
  const slots = confirmedPlayerSelection.map((entry, index) => ({
    selectionOrder: index + 1,
    pokemonId: entry?.pokemonId ?? null,
  }));
  const result = (window as any).electronAPI?.syncPlayerSelectionImages?.(slots);
  if (result && typeof result.catch === "function") {
    void result
      .then(() => {
        playerSelectionImageVersion = Date.now();
        renderBroadcastOverlayState("syncFixedPlayerSelectionImagesFromState");
      })
      .catch(() => {
        // External fixed-name image sync should not affect recognition or rendering.
      });
    return;
  }
  playerSelectionImageVersion = Date.now();
}

function setBroadcastSourceEmpty(sourceEl: HTMLElement | null, empty: boolean, label: string): void {
  if (!sourceEl) return;
  sourceEl.classList.toggle("is-empty", empty);
  sourceEl.dataset.emptyLabel = label;
}

function setBroadcastImageSource(img: HTMLImageElement | null, source: string | null, alt: string, emptyLabel: string): void {
  const sourceEl = img?.closest<HTMLElement>(".broadcast-layout-source") ?? null;
  const isEmpty = !source;
  setBroadcastSourceEmpty(sourceEl, isEmpty, emptyLabel);
  if (!img) return;
  img.hidden = isEmpty;
  img.alt = alt;
  if (!source) {
    img.removeAttribute("src");
    return;
  }
  img.onload = () => {
    applyBattleLayoutConfig();
  };
  img.onerror = () => {
    if (img.src.endsWith(BALL_MONSTER_IMAGE)) return;
    img.src = BALL_MONSTER_IMAGE;
  };
  img.src = source;
}

function renderBroadcastPlayerSources(): void {
  for (let index = 0; index < 3; index += 1) {
    const entry = confirmedPlayerSelection[index];
    const item = getPlayerSelectionItemByName(entry?.itemName ?? null);

    setBroadcastImageSource(
      broadcastPlayerPokemonEls[index],
      entry ? getPlayerSelectionImageSrc(entry) : battleLayoutEditing ? getFixedPlayerSelectionImageSrc(index + 1) : null,
      entry?.pokemonName ?? "",
      `My Pokemon ${index + 1}`,
    );

    const itemNameEl = broadcastPlayerItemNameEls[index];
    if (itemNameEl) {
      const itemName = entry?.itemName ?? "";
      itemNameEl.textContent = itemName;
      setBroadcastSourceEmpty(itemNameEl, !itemName, `Item Name ${index + 1}`);
    }

    setBroadcastImageSource(
      broadcastPlayerItemIconEls[index],
      item?.imageSrc ?? null,
      item?.nameJa ?? "",
      `Item Icon ${index + 1}`,
    );
  }
}

function renderBroadcastOpponentSources(): void {
  const slots = sceneDetectionState.displayScene === "battle" && confirmedOpponentRoster.slots.some((slot) => !!slot)
    ? confirmedOpponentRoster.slots
    : broadcastRecognitionStates.map((state) => state.confirmed);

  for (let index = 0; index < 6; index += 1) {
    const match = slots[index] ?? null;
    setBroadcastImageSource(
      broadcastOpponentPokemonEls[index],
      match?.imageSrc ?? null,
      match?.pokemonName ?? "",
      `Opponent ${index + 1}`,
    );
  }
}

function countConfirmedOpponentSlots(): number {
  return confirmedOpponentRoster.slots.filter((slot) => !!slot).length;
}

function countConfirmedPlayerSelection(): number {
  return confirmedPlayerSelection.filter((entry) => !!entry).length;
}

function renderBroadcastOverlayState(context = "renderBroadcastOverlayState"): void {
  renderBroadcastOpponentSources();
  renderBroadcastPlayerSources();
  renderDamageRosterSlots();
  renderBattleLayoutSourceList();
  if (isSceneDebugEnabled()) {
    console.debug("[recognition] overlay-render", {
      context,
      scene: sceneDetectionState.displayScene,
      opponentConfirmed: countConfirmedOpponentSlots(),
      playerConfirmed: countConfirmedPlayerSelection(),
      selectionSnapshotCaptured,
      selectionSnapshotRecognized,
      playerSelectionSnapshotCaptured,
      playerSelectionSnapshotRecognized,
    });
  }
}

function setSceneStatus(scene: SceneKind, message?: string): void {
  if (videoWrapEl) {
    videoWrapEl.dataset.scene = scene;
    videoWrapEl.dataset.overlayVisible = scene === "battle" ? "true" : "false";
  }

  if (sceneDetectionBadgeEl) {
    sceneDetectionBadgeEl.textContent = {
      idle: "待機中",
      selection: "選出中",
      battle: "対戦中",
      unknown: "待機中",
    }[scene];
  }

  if (sceneDetectionTextEl) {
    sceneDetectionTextEl.textContent = message ?? {
      idle: "待機画面を認識中",
      selection: "選出画面を認識中",
      battle: "対戦画面を認識中",
      unknown: "場面認識を待機中",
    }[scene];
  }

  renderBroadcastOverlayState("setSceneStatus");
}

function syncReadableSceneStatus(scene: SceneKind, message?: string): void {
  if (sceneDetectionBadgeEl) {
    sceneDetectionBadgeEl.textContent = {
      idle: "\u5F85\u6A5F\u4E2D",
      selection: "\u9078\u51FA\u4E2D",
      battle: "\u5BFE\u6226\u4E2D",
      unknown: "\u5F85\u6A5F\u4E2D",
    }[scene];
  }

  if (sceneDetectionTextEl) {
    sceneDetectionTextEl.textContent = message ?? {
      idle: "\u5F85\u6A5F\u753B\u9762\u3092\u8A8D\u8B58\u4E2D",
      selection: "\u9078\u51FA\u753B\u9762\u3092\u8A8D\u8B58\u4E2D",
      battle: "\u5BFE\u6226\u753B\u9762\u3092\u8A8D\u8B58\u4E2D",
      unknown: "\u5834\u9762\u8A8D\u8B58\u3092\u5F85\u6A5F\u4E2D",
    }[scene];
  }
}

function isAllowedSceneTransition(from: SceneKind, to: SceneKind): boolean {
  if (to === "unknown" || from === to) return true;
  if (from === "idle") return to === "selection";
  if (from === "selection") return to === "battle";
  if (from === "battle") return to === "idle";
  return to === "idle";
}

function advanceSceneDetectionState(rawScene: SceneKind, evidence: SceneDetectionEvidence | null = null): void {
  const previousDisplayScene = sceneDetectionState.displayScene;
  sceneDetectionState.rawScene = rawScene;
  if (rawScene === "unknown") {
    setSceneStatus(sceneDetectionState.displayScene);
    syncReadableSceneStatus(sceneDetectionState.displayScene);
    return;
  }

  if (rawScene === sceneDetectionState.displayScene) {
    sceneDetectionState.pendingScene = rawScene;
    sceneDetectionState.consecutiveMatches = 0;
    setSceneStatus(sceneDetectionState.displayScene);
    syncReadableSceneStatus(sceneDetectionState.displayScene);
    return;
  }

  if (!isAllowedSceneTransition(sceneDetectionState.displayScene, rawScene)) {
    sceneDetectionState.pendingScene = sceneDetectionState.displayScene;
    sceneDetectionState.consecutiveMatches = 0;
    setSceneStatus(sceneDetectionState.displayScene);
    syncReadableSceneStatus(sceneDetectionState.displayScene);
    return;
  }

  if (sceneDetectionState.pendingScene === rawScene) sceneDetectionState.consecutiveMatches += 1;
  else {
    sceneDetectionState.pendingScene = rawScene;
    sceneDetectionState.consecutiveMatches = 1;
  }

  const requiredStableMatches = getRequiredStableMatches(previousDisplayScene, rawScene);
  if (sceneDetectionState.consecutiveMatches >= requiredStableMatches) {
    sceneDetectionState.displayScene = rawScene;
    sceneDetectionState.pendingScene = rawScene;
    sceneDetectionState.consecutiveMatches = 0;
    emitRendererDebugLog("broadcast-scene-transition", {
      previousScene: previousDisplayScene,
      nextScene: rawScene,
      candidateScene: evidence?.candidateScene ?? rawScene,
      requiredStableMatches,
      recognitionImages: evidence?.indicators ?? [],
    });
    logConfirmedPlayerSelectionState("scene-transition-committed", {
      previousScene: previousDisplayScene,
      nextScene: rawScene,
    });
    if (rawScene === "idle") resetRecognitionStates("scene-transition-to-idle", { preserveOpponentRoster: true });
    if (rawScene === "selection" && previousDisplayScene !== "selection") {
      resetRecognitionStates("scene-transition-to-selection", { preserveOpponentRoster: true });
    }
  }

  setSceneStatus(sceneDetectionState.displayScene);
  syncReadableSceneStatus(sceneDetectionState.displayScene);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIndex = result.indexOf(",");
      if (commaIndex >= 0) {
        resolve(result.slice(commaIndex + 1));
        return;
      }
      reject(new Error("Failed to encode blob to base64"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

function captureBroadcastFrame(): HTMLCanvasElement | null {
  if (!videoEl) return null;
  const videoWidth = videoEl.videoWidth;
  const videoHeight = videoEl.videoHeight;
  if (videoWidth <= 0 || videoHeight <= 0) return null;

  if (!broadcastFrameCanvas) {
    broadcastFrameCanvas = document.createElement("canvas");
  }
  if (broadcastFrameCanvas.width !== videoWidth) broadcastFrameCanvas.width = videoWidth;
  if (broadcastFrameCanvas.height !== videoHeight) broadcastFrameCanvas.height = videoHeight;

  broadcastFrameContext = broadcastFrameCanvas.getContext("2d", { willReadFrequently: true });
  if (!broadcastFrameContext) return null;
  broadcastFrameContext.clearRect(0, 0, videoWidth, videoHeight);
  broadcastFrameContext.drawImage(videoEl, 0, 0, videoWidth, videoHeight);
  return broadcastFrameCanvas;
}

async function cropBroadcastSlotImage(slotRect: NormalizedRect, sourceCanvas?: HTMLCanvasElement | null): Promise<string | null> {
  const ctx = ensureBroadcastRecognitionCanvas();
  const source = sourceCanvas ?? videoEl;
  if (!ctx || !broadcastRecognitionCanvas || !source) return null;
  const sourceWidth = sourceCanvas ? sourceCanvas.width : videoEl?.videoWidth ?? 0;
  const sourceHeight = sourceCanvas ? sourceCanvas.height : videoEl?.videoHeight ?? 0;
  if (sourceWidth <= 0 || sourceHeight <= 0) return null;

  const clamped = clampRect(slotRect);
  const rawSx = Math.floor(clamped.x * sourceWidth);
  const rawSy = Math.floor(clamped.y * sourceHeight);
  const rawSw = Math.max(1, Math.floor(clamped.width * sourceWidth));
  const rawSh = Math.max(1, Math.floor(clamped.height * sourceHeight));
  const sx = Math.min(Math.max(0, rawSx), Math.max(0, sourceWidth - 1));
  const sy = Math.min(Math.max(0, rawSy), Math.max(0, sourceHeight - 1));
  const sw = Math.max(1, Math.min(rawSw, sourceWidth - sx));
  const sh = Math.max(1, Math.min(rawSh, sourceHeight - sy));

  if (broadcastRecognitionCanvas.width !== sw) broadcastRecognitionCanvas.width = sw;
  if (broadcastRecognitionCanvas.height !== sh) broadcastRecognitionCanvas.height = sh;
  ctx.clearRect(0, 0, sw, sh);
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  const blob = await canvasToPngBlob(broadcastRecognitionCanvas);
  if (!blob) return null;
  try {
    return await blobToBase64(blob);
  } catch {
    return null;
  }
}

async function collectCurrentBroadcastSlots(sourceCanvas?: HTMLCanvasElement | null): Promise<Array<{ slotIndex: number; imageBase64: string; timestamp: number }>> {
  const capturedAt = Date.now();
  const slots: Array<{ slotIndex: number; imageBase64: string; timestamp: number }> = [];
  for (const [index, rect] of broadcastOpponentSlotRects.entries()) {
    const imageBase64 = await cropBroadcastSlotImage(rect, sourceCanvas);
    if (imageBase64) slots.push({ slotIndex: index, imageBase64, timestamp: capturedAt });
  }
  return slots;
}

async function collectCurrentPlayerSlots(sourceCanvas?: HTMLCanvasElement | null): Promise<Array<{ slotIndex: number; imageBase64: string; timestamp: number }>> {
  const capturedAt = Date.now();
  const slots: Array<{ slotIndex: number; imageBase64: string; timestamp: number }> = [];
  for (const [index, rect] of broadcastPlayerSlotRects.entries()) {
    const imageBase64 = await cropBroadcastSlotImage(rect, sourceCanvas);
    if (imageBase64) slots.push({ slotIndex: index, imageBase64, timestamp: capturedAt });
  }
  return slots;
}

function getNestedBroadcastRect(parentRect: NormalizedRect, childRect: NormalizedRect): NormalizedRect {
  return clampRect({
    x: parentRect.x + childRect.x * parentRect.width,
    y: parentRect.y + childRect.y * parentRect.height,
    width: childRect.width * parentRect.width,
    height: childRect.height * parentRect.height,
  });
}

async function collectCurrentPlayerDebugSlots(sourceCanvas?: HTMLCanvasElement | null): Promise<BroadcastPlayerDebugSlotImage[]> {
  const capturedAt = Date.now();
  const slots: BroadcastPlayerDebugSlotImage[] = [];
  for (const [index, rect] of broadcastPlayerSlotRects.entries()) {
    const imageBase64 = await cropBroadcastSlotImage(rect, sourceCanvas);
    const itemImageBase64 = await cropBroadcastSlotImage(getNestedBroadcastRect(rect, broadcastPlayerItemNameRect), sourceCanvas);
    if (imageBase64) {
      slots.push({ slotIndex: index, imageBase64, itemImageBase64: itemImageBase64 ?? "", timestamp: capturedAt });
    }
  }
  return slots;
}

async function saveSelectionSlotImages(slots: Array<{ slotIndex: number; imageBase64: string }>): Promise<void> {
  const signature = slots.map((slot) => `${slot.slotIndex}:${slot.imageBase64.length}:${slot.imageBase64.slice(0, 24)}`).join("|");
  if (!signature || signature === lastSavedOpponentSlotImageSignature) return;

  try {
    await (window as any).electronAPI?.saveOpponentSlotImages?.(slots);
    lastSavedOpponentSlotImageSignature = signature;
  } catch {
    // Ignore save failures to keep recognition running.
  }
}

async function savePlayerDebugImages(
  slots: BroadcastPlayerDebugSlotImage[],
  results: Array<{ slotIndex: number; selectionOrder: number | null }> = []
): Promise<void> {
  if (slots.length === 0) return;

  const slotsByIndex = new Map(slots.map((slot) => [slot.slotIndex, slot]));
  const selectedSlots: Array<{ selectionOrder: number; imageBase64: string; itemImageBase64: string }> = [];
  const usedOrders = new Set<number>();
  for (const result of results) {
    const selectionOrder = result.selectionOrder;
    if (!selectionOrder || selectionOrder < 1 || selectionOrder > 3 || usedOrders.has(selectionOrder)) continue;
    const slot = slotsByIndex.get(result.slotIndex);
    if (!slot) continue;
    usedOrders.add(selectionOrder);
    selectedSlots.push({
      selectionOrder,
      imageBase64: slot.imageBase64,
      itemImageBase64: slot.itemImageBase64,
    });
  }

  try {
    await (window as any).electronAPI?.savePlayerDebugImages?.({
      slots: slots.map(({ slotIndex, imageBase64, itemImageBase64 }) => ({ slotIndex, imageBase64, itemImageBase64 })),
      selectedSlots,
    });
  } catch {
    // Debug image save failures should not affect recognition.
  }
}

function syncConfirmedRosterFromSelection(): void {
  const nextSlots = broadcastRecognitionStates.map((state) => (state.confirmed ? { ...state.confirmed } : null));
  if (!nextSlots.some((slot) => !!slot)) return;

  const currentSignature = confirmedOpponentRoster.slots.map((slot) => slot?.pokemonId ?? "").join("|");
  const nextSignature = nextSlots.map((slot) => slot?.pokemonId ?? "").join("|");
  if (currentSignature === nextSignature) return;

  confirmedOpponentRoster = {
    slots: nextSlots,
    lastConfirmedAt: Date.now(),
  };
  renderBroadcastOverlayState("syncConfirmedRosterFromSelection");
}

function applyBroadcastRecognitionResults(
  results: Array<{ slotIndex: number; pokemonId: string | null; pokemonName: string | null; score: number }>,
  forceConfirm = false
): void {
  let changed = false;
  for (const result of results) {
    const state = broadcastRecognitionStates[result.slotIndex];
    if (!state) continue;

    const nextMatch = result.pokemonId && result.pokemonName
      ? {
          pokemonId: result.pokemonId,
          pokemonName: result.pokemonName,
          imageSrc: `img/pokemon_cs/${result.pokemonId}.png`,
          score: result.score,
        }
      : null;

    if (!nextMatch) {
      state.pending = null;
      state.consecutiveMatches = 0;
      continue;
    }

    if (state.pending?.pokemonId === nextMatch.pokemonId) state.consecutiveMatches += 1;
    else {
      state.pending = nextMatch;
      state.consecutiveMatches = 1;
    }

    if (forceConfirm || state.consecutiveMatches >= BROADCAST_RECOGNITION_STABLE_FRAMES) {
      if (state.confirmed?.pokemonId !== nextMatch.pokemonId || Math.abs((state.confirmed?.score ?? 0) - nextMatch.score) > 0.03) {
        state.confirmed = nextMatch;
        changed = true;
      }
    }
  }

  if (changed) {
    if (sceneDetectionState.displayScene === "selection" || sceneDetectionState.displayScene === "battle") {
      syncConfirmedRosterFromSelection();
    }
    renderBroadcastOverlayState("applyBroadcastRecognitionResults");
  }
}

function hasOpponentRecognitionMatch(
  results: Array<{ pokemonId: string | null; pokemonName: string | null }>
): boolean {
  return results.some((result) => !!result.pokemonId && !!result.pokemonName);
}

function updateConfirmedPlayerPartySlots(results: BroadcastPlayerSelectionRecognitionResult[]): boolean {
  let changed = false;

  for (const result of results) {
    if (!result || result.slotIndex < 0 || result.slotIndex >= confirmedPlayerPartySlots.length) continue;
    const existing = confirmedPlayerPartySlots[result.slotIndex];
    const pokemonName = existing?.pokemonName ?? result.pokemonName ?? null;
    const itemName = existing?.itemName ?? result.itemName ?? null;
    if (!pokemonName && !itemName) continue;

    const pokemon = getPlayerSelectionPokemonByName(pokemonName);
    const next: BroadcastPlayerPartySlotEntry = {
      slotIndex: result.slotIndex,
      pokemonId: pokemon?.id ?? existing?.pokemonId ?? null,
      pokemonName,
      itemName,
      score: result.score,
    };

    if (
      !existing
      || existing.pokemonId !== next.pokemonId
      || existing.pokemonName !== next.pokemonName
      || existing.itemName !== next.itemName
    ) {
      confirmedPlayerPartySlots[result.slotIndex] = next;
      changed = true;
    }
  }

  return changed;
}

function applyPlayerPartyRecognitionResults(results: BroadcastPlayerSelectionRecognitionResult[]): boolean {
  const partyUpdated = updateConfirmedPlayerPartySlots(results);

  if (!playerPartyRecognitionDebugLogged) {
    const partyDebugData = {
      context: "applyPlayerPartyRecognitionResults",
      scene: sceneDetectionState.displayScene,
      rawResults: results,
    };
    const partyDebugTable = results.map((result) => {
      const visualTop = result.debugVisualMatch?.topCandidates?.[0] ?? null;
      const visualSecond = result.debugVisualMatch?.topCandidates?.[1] ?? null;
      const matchedPokemon = getPlayerSelectionPokemonByName(result.pokemonName);
      const ocrPokemon = getPlayerSelectionPokemonByName(result.debugSlotRecognition?.ocrPokemonName ?? null);
      return {
        slot: result.slotIndex + 1,
        selectedOrder: result.selectionOrder ?? "",
        matchedPokemonId: matchedPokemon?.id ?? "",
        matchedPokemon: result.pokemonName ?? "",
        ocrPokemonId: ocrPokemon?.id ?? "",
        ocrPokemon: result.debugSlotRecognition?.ocrPokemonName ?? "",
        ocrScore: result.debugSlotRecognition?.ocrPokemonScore ?? "",
        visualPokemonId: result.debugVisualMatch?.pokemonId ?? visualTop?.pokemonId ?? "",
        visualPokemon: result.debugVisualMatch?.pokemonName ?? visualTop?.pokemonName ?? "",
        visualScore: result.debugVisualMatch?.score || visualTop?.score || "",
        visualSecond: visualSecond ? `${visualSecond.pokemonName} (${visualSecond.score})` : "",
        visualError: result.debugVisualMatch?.error ?? "",
        nameCropText: result.debugOcrTexts?.pokemonName.join(" / ") ?? "",
        itemCropText: result.debugOcrTexts?.itemName.join(" / ") ?? "",
      };
    });
    emitRendererDebugLog("broadcast-player-party-recognition", partyDebugData, partyDebugTable);
    playerPartyRecognitionDebugLogged = true;
  }

  if (partyUpdated || results.some((result) => !!result.pokemonName || !!result.itemName)) {
    playerPartySnapshotRecognized = true;
  }
  return partyUpdated;
}

function applyTrackedPlayerSelectionResults(
  trackedSelections: Array<{ slotIndex: number; selectionOrder: number }>
): void {
  const nextSelection: Array<BroadcastPlayerSelectionEntry | null> = Array.from({ length: 3 }, () => null);

  for (const tracked of trackedSelections) {
    if (!tracked || tracked.selectionOrder < 1 || tracked.selectionOrder > 3) continue;
    if (tracked.slotIndex < 0 || tracked.slotIndex >= confirmedPlayerPartySlots.length) continue;
    const partySlot = confirmedPlayerPartySlots[tracked.slotIndex] ?? null;
    const pokemon = partySlot?.pokemonId ? null : getPlayerSelectionPokemonByName(partySlot?.pokemonName ?? null);
    nextSelection[tracked.selectionOrder - 1] = {
      slotIndex: tracked.slotIndex,
      selectionOrder: tracked.selectionOrder,
      pokemonId: partySlot?.pokemonId ?? pokemon?.id ?? null,
      pokemonName: partySlot?.pokemonName ?? null,
      itemName: partySlot?.itemName ?? null,
      score: partySlot?.score ?? 0,
    };
  }

  const selectedDebugTable = nextSelection.map((entry, index) => ({
    selection: index + 1,
    sourceSlot: entry ? entry.slotIndex + 1 : "",
    pokemonId: entry?.pokemonId ?? "",
    pokemonName: entry?.pokemonName ?? "",
    itemName: entry?.itemName ?? "",
    score: entry?.score ?? "",
  }));
  emitRendererDebugLog("broadcast-player-selected-recognition", undefined, selectedDebugTable);
  confirmedPlayerSelection = nextSelection;
  syncFixedPlayerSelectionImagesFromState();
  logConfirmedPlayerSelectionState("confirmedPlayerSelection-updated");
  renderBroadcastOverlayState("applyTrackedPlayerSelectionResults");
}

function hasPendingBroadcastRecognition(): boolean {
  return (selectionSnapshotCaptured && !selectionSnapshotRecognized)
    || (playerSelectionSnapshotCaptured && !playerSelectionSnapshotRecognized);
}

function shouldRunBroadcastRecognitionForScene(): boolean {
  return sceneDetectionState.displayScene === "selection" || hasPendingBroadcastRecognition();
}

function emitRendererDebugLog(label: string, data?: unknown, table?: unknown): void {
  try {
    (window as any).electronAPI?.debugRendererLog?.({ label, data, table });
  } catch {
    // Debug forwarding should never affect recognition.
  }
}

async function startBroadcastRecognitionWorker(): Promise<void> {
  try {
    const result = await (window as any).electronAPI?.startRecognitionWorker?.();
    broadcastRecognitionReady = !!result?.success;
    if (!broadcastRecognitionReady) {
      emitRendererDebugLog("broadcast-recognition-worker-start-failed", {
        error: result?.error ?? "Recognition worker did not report ready",
        result,
      });
    }
  } catch {
    broadcastRecognitionReady = false;
    emitRendererDebugLog("broadcast-recognition-worker-start-failed", {
      error: "Failed to invoke recognition worker start",
    });
  }
}

async function ensureBroadcastRecognitionWorkerReady(now = performance.now()): Promise<boolean> {
  if (broadcastRecognitionReady) return true;
  if (broadcastRecognitionStartPromise) return broadcastRecognitionStartPromise;
  if (now - broadcastRecognitionLastStartAttemptAt < BROADCAST_WORKER_RETRY_INTERVAL_MS) return false;

  broadcastRecognitionLastStartAttemptAt = now;
  broadcastRecognitionStartPromise = (async () => {
    await startBroadcastRecognitionWorker();
    return broadcastRecognitionReady;
  })();

  try {
    return await broadcastRecognitionStartPromise;
  } finally {
    broadcastRecognitionStartPromise = null;
  }
}

async function stopBroadcastRecognitionWorker(): Promise<void> {
  try {
    await (window as any).electronAPI?.stopRecognitionWorker?.();
  } catch {
    // Ignore stop failures.
  }
  broadcastRecognitionReady = false;
  broadcastRecognitionStartPromise = null;
}

async function updateBroadcastRecognition(): Promise<void> {
  if (!shouldRunBroadcastRecognitionForScene()) return;
  if (selectionSnapshotRecognized && playerSelectionSnapshotRecognized) return;
  if (!videoEl || videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    scheduleSceneRecognition();
    return;
  }
  const now = performance.now();
  if (now - broadcastRecognitionLastRunAt < getBroadcastRecognitionIntervalMs()) return;
  broadcastRecognitionLastRunAt = now;
  const captureStartedAt = isSceneDebugEnabled() ? performance.now() : 0;

  const canCaptureSelectionSnapshot = sceneDetectionState.displayScene === "selection";
  
  //選出画面での構築認識→画像切り出し
  const selectionFrame = canCaptureSelectionSnapshot
    && (!selectionSnapshotCaptured || !playerSelectionSnapshotCaptured)
    ? captureBroadcastFrame()
    : null;

  //相手構築6匹の認識→切り出し
  if (canCaptureSelectionSnapshot && selectionFrame && !selectionSnapshotCaptured) {
    const slots = await collectCurrentBroadcastSlots(selectionFrame);
    if (slots.length > 0) {
      selectionSnapshotSlots = slots.map((slot) => ({ ...slot }));
      if (isSceneDebugEnabled()) {
        await saveSelectionSlotImages(selectionSnapshotSlots.map(({ slotIndex, imageBase64 }) => ({ slotIndex, imageBase64 })));
      }
      selectionSnapshotCaptured = true;
    }
  }
  //自分構築6匹の認識→切り出し
  if (canCaptureSelectionSnapshot && selectionFrame && !playerSelectionSnapshotCaptured) {
    const playerSlots = await collectCurrentPlayerSlots(selectionFrame);
    if (playerSlots.length > 0) {
      playerSelectionSnapshotSlots = playerSlots.map((slot) => ({ ...slot }));
      if (isSceneDebugEnabled()) {
        const playerDebugSlots = await collectCurrentPlayerDebugSlots(selectionFrame);
        playerSelectionSnapshotDebugSlots = playerDebugSlots.map((slot) => ({ ...slot }));
        await savePlayerDebugImages(playerDebugSlots);
      } else {
        playerSelectionSnapshotDebugSlots = [];
      }
      playerSelectionSnapshotCaptured = true;
    }
  }

  if (isSceneDebugEnabled()) {
    console.debug("[recognition] snapshot-capture-ms", (performance.now() - captureStartedAt).toFixed(1));
  }

  if (broadcastRecognitionInFlight) return;
  const workerReady = await ensureBroadcastRecognitionWorkerReady(now);
  if (!workerReady) {
    return;
  }

  broadcastRecognitionInFlight = true;
  try {
    const recognitionStartedAt = isSceneDebugEnabled() ? performance.now() : 0;
    if (!selectionSnapshotRecognized && selectionSnapshotSlots.length > 0) {
      const response = await (window as any).electronAPI?.recognizeOpponentSlots?.(selectionSnapshotSlots);
      if (!response?.success || !Array.isArray(response.results)) {
        broadcastRecognitionReady = false;
      } else {
        const hasMatch = hasOpponentRecognitionMatch(response.results);
        if (hasMatch && !opponentRecognitionDebugLogged) {
          emitRendererDebugLog(
            "broadcast-opponent-party-recognition",
            {
              scene: sceneDetectionState.displayScene,
              source: "selection-snapshot",
              hasMatch,
              captured: selectionSnapshotCaptured,
              recognized: selectionSnapshotRecognized,
              resultCount: response.results.length,
            },
            response.results.map((result: {
              slotIndex: number;
              pokemonId: string | null;
              pokemonName: string | null;
              score: number;
              topCandidates?: Array<{ pokemonId: string | null; pokemonName: string | null; score: number }>;
            }) => ({
              slot: result.slotIndex + 1,
              pokemonId: result.pokemonId ?? "",
              pokemonName: result.pokemonName ?? "",
              score: result.score,
              top1: result.topCandidates?.[0]?.pokemonName ?? "",
              top1Score: result.topCandidates?.[0]?.score ?? "",
              top2: result.topCandidates?.[1]?.pokemonName ?? "",
              top2Score: result.topCandidates?.[1]?.score ?? "",
            }))
          );
          opponentRecognitionDebugLogged = true;
        }
        if (isSceneDebugEnabled()) {
          console.debug("[recognition] opponent-result", {
            scene: sceneDetectionState.displayScene,
            source: "selection-snapshot",
            hasMatch,
            captured: selectionSnapshotCaptured,
            recognized: selectionSnapshotRecognized,
            resultCount: response.results.length,
          });
        }
        if (hasMatch) {
          applyBroadcastRecognitionResults(response.results, true);
          selectionSnapshotRecognized = true;
        } else if (canCaptureSelectionSnapshot) {
          selectionSnapshotCaptured = false;
          selectionSnapshotSlots = [];
        }
      }
    }
    if (!playerSelectionSnapshotRecognized && playerSelectionSnapshotSlots.length > 0) {
      let trackingChanged = false;
      if (canCaptureSelectionSnapshot) {
        const livePlayerSlots = await collectCurrentPlayerSlots();
        const badgeResponse = await (window as any).electronAPI?.detectPlayerSelectionBadges?.(
          livePlayerSlots,
          {
            selectionBadgeRect: broadcastPlayerSelectionBadgeRect,
          }
        );
        if (badgeResponse?.success && Array.isArray(badgeResponse.results)) {
          trackingChanged = applyPlayerSelectionBadgeDetections(badgeResponse.results);
        }
      }

      const trackedSelections = getTrackedPlayerSelectionSlots();
      const shouldRecognizePlayerParty = playerSelectionSnapshotCaptured && !playerPartySnapshotRecognized;

      if (shouldRecognizePlayerParty) {
        const playerResponse = await (window as any).electronAPI?.recognizePlayerSelection?.(
          playerSelectionSnapshotSlots,
          {
            selectionBadgeRect: broadcastPlayerSelectionBadgeRect,
            pokemonNameRect: broadcastPlayerPokemonNameRect,
            itemNameRect: broadcastPlayerItemNameRect,
            pokemonSpriteRect: broadcastPlayerPokemonSpriteRect,
            visualRecognition: broadcastPlayerPokemonVisualRecognition,
          },
          []
        );
        if (!playerResponse?.success || !Array.isArray(playerResponse.results)) {
          return;
        }

        const partyUpdated = applyPlayerPartyRecognitionResults(playerResponse.results);
        if (isSceneDebugEnabled()) {
          console.debug("[recognition] player-party-result", {
            scene: sceneDetectionState.displayScene,
            partyUpdated,
            trackedSelections,
            captured: playerSelectionSnapshotCaptured,
            recognized: playerPartySnapshotRecognized,
            resultCount: playerResponse.results.length,
          });
        }
        if (canCaptureSelectionSnapshot && !playerPartySnapshotRecognized) {
          playerSelectionSnapshotCaptured = false;
          playerSelectionSnapshotSlots = [];
          playerSelectionSnapshotDebugSlots = [];
        }
      }

      if (playerPartySnapshotRecognized && trackedSelections.length > 0 && (trackingChanged || trackedSelections.length >= 3)) {
        if (isSceneDebugEnabled()) {
          await savePlayerDebugImages(playerSelectionSnapshotDebugSlots, trackedSelections);
        }
        applyTrackedPlayerSelectionResults(trackedSelections);
        playerSelectionSnapshotRecognized = trackedSelections.length >= 3;
      }
    }
    if (isSceneDebugEnabled()) {
      console.debug("[recognition] worker-roundtrip-ms", (performance.now() - recognitionStartedAt).toFixed(1));
    }
  } catch (error) {
    emitRendererDebugLog("broadcast-recognition-error", {
      scene: sceneDetectionState.displayScene,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Scene detection can continue independently.
  } finally {
    broadcastRecognitionInFlight = false;
  }
}

async function ensureSceneRecognitionBootstrap(): Promise<void> {
  if (!recognitionBootstrapPromise) {
    recognitionBootstrapPromise = (async () => {
      await loadBroadcastRecognitionConfig();
      try {
        await ensureSceneDetectionWorker();
      } catch {
        // Fall back to synchronous scene detection when worker bootstrap fails.
      }
      await startBroadcastRecognitionWorker();
      renderBroadcastOverlayState("bootstrap");
      setSceneStatus(sceneDetectionState.displayScene);
      syncReadableSceneStatus(sceneDetectionState.displayScene);
    })();
  }
  await recognitionBootstrapPromise;
}

function stopSceneRecognitionLoop(): void {
  sceneDetectionRunning = false;
  if (sceneDetectionTimerHandle !== null) {
    window.clearTimeout(sceneDetectionTimerHandle);
    sceneDetectionTimerHandle = null;
  }
  sceneDetectionLastRunAt = 0;
  broadcastRecognitionLastRunAt = 0;
  broadcastRecognitionInFlight = false;
  sceneDetectionState = {
    rawScene: "unknown",
    displayScene: "idle",
    pendingScene: "unknown",
    consecutiveMatches: 0,
  };
  resetRecognitionStates();
  stopSceneDetectionWorker();
  void stopBroadcastRecognitionWorker();
  setSceneStatus("idle", currentStream ? "待機中" : "映像デバイスを選択してください");
  syncReadableSceneStatus("idle", currentStream ? "待機中" : "映像デバイスを選択してください");
}

function scheduleSceneRecognition(delayMs = getSceneDetectionIntervalMs()): void {
  if (!sceneDetectionRunning) return;
  if (sceneDetectionTimerHandle !== null) {
    window.clearTimeout(sceneDetectionTimerHandle);
  }
  sceneDetectionTimerHandle = window.setTimeout(() => {
    sceneDetectionTimerHandle = null;
    void runSceneRecognitionLoop();
  }, Math.max(0, delayMs));
}

async function runSceneRecognitionLoop(): Promise<void> {
  if (!sceneDetectionRunning) return;
  if (!videoEl || videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    scheduleSceneRecognition();
    return;
  }
  if (sceneDetectionEnabledEl && !sceneDetectionEnabledEl.checked) {
    setSceneStatus(sceneDetectionState.displayScene, "映像認識を停止中");
    syncReadableSceneStatus(sceneDetectionState.displayScene, "映像認識を停止中");
    scheduleSceneRecognition();
    return;
  }
  if (sceneDetectionEnabledEl && !sceneDetectionEnabledEl.checked) {
    setSceneStatus(sceneDetectionState.displayScene, "譏蜒剰ｪ崎ｭ倥ｒ蛛懈ｭ｢荳ｭ");
    syncReadableSceneStatus(sceneDetectionState.displayScene, "譏蜒剰ｪ崎ｭ倥ｒ蛛懈ｭ｢荳ｭ");
    scheduleSceneRecognition();
    return;
  }
  if (sceneDetectionEnabledEl && !sceneDetectionEnabledEl.checked) {
    setSceneStatus(sceneDetectionState.displayScene, "映像認識を停止中");
    syncReadableSceneStatus(sceneDetectionState.displayScene, "映像認識を停止中");
    return;
  }
  if (!videoEl || videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

  const startedAt = performance.now();
  sceneDetectionLastRunAt = startedAt;

  const sceneDetectionResult = await detectSceneFromVideo();
  const previousDisplayScene = sceneDetectionState.displayScene;
  advanceSceneDetectionState(sceneDetectionResult.rawScene, sceneDetectionResult.evidence);
  if (sceneDetectionState.displayScene === "battle" && previousDisplayScene !== "battle") {
    renderBroadcastOverlayState("scene-transition-to-battle");
  }
  if (sceneDetectionState.displayScene === "selection" && previousDisplayScene !== "selection") {
    broadcastRecognitionLastRunAt = 0;
    void updateBroadcastRecognition();
  } else if (shouldRunBroadcastRecognitionForScene()) {
    void updateBroadcastRecognition();
  }

  if (isSceneDebugEnabled()) {
    console.debug("[recognition] scene-detection-ms", (performance.now() - startedAt).toFixed(1));
  }
  scheduleSceneRecognition(Math.max(0, getSceneDetectionIntervalMs() - (performance.now() - startedAt)));
}

function shouldRunSceneRecognition(): boolean {
  return !!currentStream && !!sceneDetectionEnabledEl?.checked;
}

function startSceneRecognitionLoop(): void {
  if (!shouldRunSceneRecognition()) return;
  void ensureSceneRecognitionBootstrap().then(() => {
    if (!shouldRunSceneRecognition()) return;
    sceneDetectionRunning = true;
    if (sceneDetectionTimerHandle === null) {
      scheduleSceneRecognition(0);
    }
  });
}

streamChangeCallbacks.push((stream) => {
  if (stream && sceneDetectionEnabledEl?.checked) startSceneRecognitionLoop();
  else stopSceneRecognitionLoop();
});

sceneDetectionEnabledEl?.addEventListener("change", () => {
  if (!sceneDetectionEnabledEl.checked) {
    stopSceneRecognitionLoop();
    if (videoWrapEl) videoWrapEl.dataset.overlayVisible = "false";
    setSceneStatus(sceneDetectionState.displayScene, "映像認識を停止中");
    syncReadableSceneStatus(sceneDetectionState.displayScene, "映像認識を停止中");
    return;
  }
  if (currentStream) {
    startSceneRecognitionLoop();
    return;
  }
  setSceneStatus("idle", "\u6620\u50CF\u30C7\u30D0\u30A4\u30B9\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044");
  syncReadableSceneStatus("idle", "\u6620\u50CF\u30C7\u30D0\u30A4\u30B9\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044");
});

/** 複数チーム（各チームは最大6匹） */
let teams: TeamMember[][] = [];
let selectedDamageTeamIndex = 0;
let damageRostersSwapped = false;

/** 各チームの名前（teams と同インデックス） */
let teamNames: string[] = [];

/** 編集中のチームのインデックス（ピッカーで追加する先）※未使用時は -1 */
let editingTeamIndex: number = -1;

/** ダイアログで作成中のチーム（作成ボタン押下まで teams には追加しない） */
let editingTeam: TeamMember[] = [];

/** ポケモン一覧のタイプ絞り込み（null または "すべて" で全件表示） */
let pickerTypeFilter: string | null = null;

/** チーム一覧の編集モード（true のとき各チームに削除ボタン表示） */
let isEditMode: boolean = false;

/** 削除確認モーダルで削除対象のチームインデックス */
let deleteTargetTeamIndex: number = -1;

/** ドラッグ中のチームインデックス */
let dragSourceTeamIndex: number = -1;
let dragSourceTeamSlotIndex: number = -1;
let suppressTeamDetailSlotClickAfterDrag = false;

/** タブ1: 攻撃側ポケモン */
let attackPokemon: Pokemon | null = null;

/** タブ1: 攻撃を受ける側ポケモン */
let defendPokemon: Pokemon | null = null;

interface DamagePokemonState {
  pokemon: Pokemon | null;
  heldItem: string;
  ability: string;
  abilityActive: boolean;
  abilityOverrideType: string;
  moves: number[];
  atkEV: number;
  atkNature: number;
  spAtkEV: number;
  spAtkNature: number;
  atkRank: number;
  spAtkRank: number;
  isBurned: boolean;
  hpEV: number;
  defEV: number;
  defNature: number;
  spDefEV: number;
  spDefNature: number;
  defRank: number;
  spDefRank: number;
  disguiseBroken: boolean;
}

function createDefaultDamagePokemonState(): DamagePokemonState {
  return {
    pokemon: null,
    heldItem: "",
    ability: "",
    abilityActive: true,
    abilityOverrideType: "",
    moves: [],
    atkEV: 0,
    atkNature: 1.0,
    spAtkEV: 0,
    spAtkNature: 1.0,
    atkRank: 0,
    spAtkRank: 0,
    isBurned: false,
    hpEV: 0,
    defEV: 0,
    defNature: 1.0,
    spDefEV: 0,
    spDefNature: 1.0,
    defRank: 0,
    spDefRank: 0,
    disguiseBroken: false,
  };
}

let attackerState: DamagePokemonState = createDefaultDamagePokemonState();
let defenderState: DamagePokemonState = createDefaultDamagePokemonState();

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

type Tab1PickerEntry =
  | { kind: "pokemon"; pokemon: Pokemon }
  | { kind: "box"; entry: BoxEntry; boxIndex: number };

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
let currentWall = "";
let tripleAxelHits = 3;

/** タブ1: 攻撃側の選択特性 */
let attackerAbility = "";
/** タブ1: 防御側の選択特性 */
let defenderAbility = "";
/** タブ1: 攻撃側の条件付き特性が有効かどうか */
let attackerAbilityActive = true;
/** タブ1: 防御側の条件付き特性が有効かどうか */
let defenderAbilityActive = true;
/** タブ1: 攻撃側がやけど状態かどうか */
let attackerIsBurned = false;
/** タブ1: 攻撃側のタイプ強化が有効かどうか */
let attackerTypeBoostActive = false;

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
let movesDataById = new Map<number, Move>();

function rebuildMovesDataIndex(): void {
  movesDataById = new Map(movesData.map((move) => [move.id, move]));
}

function syncLegacyStateFromDamageStates(): void {
  attackPokemon = attackerState.pokemon;
  defendPokemon = defenderState.pokemon;
  attackerAbility = attackerState.ability;
  defenderAbility = defenderState.ability;
  attackerAbilityActive = attackerState.abilityActive;
  defenderAbilityActive = defenderState.abilityActive;
  selectedMoves = [...attackerState.moves];
  attackerAtkEV = attackerState.atkEV;
  attackerAtkNature = attackerState.atkNature;
  attackerSpAtkEV = attackerState.spAtkEV;
  attackerSpAtkNature = attackerState.spAtkNature;
  attackerAtkRank = attackerState.atkRank;
  attackerSpAtkRank = attackerState.spAtkRank;
  attackerIsBurned = attackerState.isBurned;
  defenderHpEV = defenderState.hpEV;
  defenderDefEV = defenderState.defEV;
  defenderDefNature = defenderState.defNature;
  defenderSpDefEV = defenderState.spDefEV;
  defenderSpDefNature = defenderState.spDefNature;
  defenderDefRank = defenderState.defRank;
  defenderSpDefRank = defenderState.spDefRank;
  tab1AttackerItem = attackerState.heldItem;
  tab1DefenderItem = defenderState.heldItem;
}

function syncDamageStatesFromLegacyState(): void {
  attackerState = {
    ...attackerState,
    pokemon: attackPokemon,
    heldItem: tab1AttackerItem,
    ability: attackerAbility,
    abilityActive: attackerAbilityActive,
    moves: [...selectedMoves],
    atkEV: attackerAtkEV,
    atkNature: attackerAtkNature,
    spAtkEV: attackerSpAtkEV,
    spAtkNature: attackerSpAtkNature,
    atkRank: attackerAtkRank,
    spAtkRank: attackerSpAtkRank,
    isBurned: attackerIsBurned,
  };
  defenderState = {
    ...defenderState,
    pokemon: defendPokemon,
    heldItem: tab1DefenderItem,
    ability: defenderAbility,
    abilityActive: defenderAbilityActive,
    hpEV: defenderHpEV,
    defEV: defenderDefEV,
    defNature: defenderDefNature,
    spDefEV: defenderSpDefEV,
    spDefNature: defenderSpDefNature,
    defRank: defenderDefRank,
    spDefRank: defenderSpDefRank,
  };
}

function createDamageStateForPokemon(pokemon: Pokemon): DamagePokemonState {
  return {
    ...createDefaultDamagePokemonState(),
    pokemon,
    ability: pokemon.abilities?.[0] ?? "",
    moves: getDefaultMoves(pokemon),
  };
}

function createDamageStateFromBoxEntry(entry: BoxEntry): DamagePokemonState {
  const pokemon = entry.pokemon;
  const nat = NATURES.find((n) => n.name === entry.natureName);
  return {
    ...createDefaultDamagePokemonState(),
    pokemon,
    heldItem: entry.heldItem,
    ability: entry.ability || (pokemon.abilities?.[0] ?? ""),
    moves: [...entry.moves, 0, 0, 0, 0].slice(0, 4),
    atkEV: entry.ev.atk,
    atkNature: nat?.atk ?? 1.0,
    spAtkEV: entry.ev.spAtk,
    spAtkNature: nat?.spAtk ?? 1.0,
    hpEV: entry.ev.hp,
    defEV: entry.ev.def,
    defNature: nat?.def ?? 1.0,
    spDefEV: entry.ev.spDef,
    spDefNature: nat?.spDef ?? 1.0,
  };
}

// ========== タブ3: BOX ==========

function createDamageStateFromTeamMember(member: TeamMember): DamagePokemonState {
  return createDamageStateFromBoxEntry(teamMemberToBoxEntry(member));
}

function getPokemonById(pokemonId: string | null | undefined): Pokemon | null {
  if (!pokemonId) return null;
  return demoPokemon.find((p) => p.id === pokemonId) ?? null;
}

function applyTestPlayerSelectionByIds(pokemonIds: string[]): void {
  confirmedPlayerSelection = Array.from({ length: 3 }, (_, index) => {
    const pokemonId = pokemonIds[index] ?? "";
    if (!pokemonId) return null;
    const pokemon = getPokemonById(pokemonId);
    return {
      slotIndex: index,
      selectionOrder: index + 1,
      pokemonId: pokemon?.id ?? pokemonId,
      pokemonName: pokemon?.name ?? pokemonId,
      itemName: null,
      score: 1,
    };
  });
  syncFixedPlayerSelectionImagesFromState();
  setSceneStatus("battle", "Player selection test");
  if (videoWrapEl) videoWrapEl.dataset.overlayVisible = "true";
  renderBroadcastOverlayState("applyTestPlayerSelectionByIds");
}

function installPlayerSelectionTestHelper(): void {
  (window as any).championsTestPlayerSelection = (pokemonIds: string[] = ["0132", "0149", "0730"]) => {
    applyTestPlayerSelectionByIds(pokemonIds);
    return serializeConfirmedPlayerSelection();
  };
}

function getSelectedDamageTeam(): TeamMember[] | null {
  if (teams.length === 0) return null;
  if (selectedDamageTeamIndex < 0 || selectedDamageTeamIndex >= teams.length) selectedDamageTeamIndex = 0;
  return teams[selectedDamageTeamIndex] ?? null;
}

type DamageSide = "attacker" | "defender";
type DamageRosterSource = "opponent" | "team";
let openAbilityTypeDropdownSide: DamageSide | null = null;

function isTypeOverrideAbility(ability: string | null | undefined): boolean {
  return !!ability && TYPE_OVERRIDE_ABILITIES.has(ability);
}

function getTypeOverrideOptions(): string[] {
  return Object.keys(TYPE_NAME_TO_SV);
}

function getDamageSideState(side: DamageSide): DamagePokemonState {
  return side === "attacker" ? attackerState : defenderState;
}

function setDamageSideState(side: DamageSide, state: DamagePokemonState): void {
  if (side === "attacker") attackerState = state;
  else defenderState = state;
}

function shouldApplyMimikyuDisguiseDamage(): boolean {
  return isMimikyu(defenderState.pokemon) && defenderState.disguiseBroken;
}

function resetMimikyuDisguiseState(state: DamagePokemonState): DamagePokemonState {
  return { ...state, disguiseBroken: false };
}

function getEffectiveDamageTypes(side: DamageSide): string[] {
  const state = getDamageSideState(side);
  const pokemon = state.pokemon;
  if (!pokemon) return [];
  if (!isTypeOverrideAbility(state.ability)) return pokemon.types;

  const options = getTypeOverrideOptions();
  const fallbackType = pokemon.types[0] ?? options[0] ?? "";
  const overrideType = options.includes(state.abilityOverrideType)
    ? state.abilityOverrideType
    : fallbackType;
  return overrideType ? [overrideType] : pokemon.types;
}

function normalizeTypeOverrideForState(state: DamagePokemonState): DamagePokemonState {
  const pokemon = state.pokemon;
  if (!pokemon || !isTypeOverrideAbility(state.ability)) {
    return state.abilityOverrideType ? { ...state, abilityOverrideType: "" } : state;
  }

  const options = getTypeOverrideOptions();
  const fallbackType = pokemon.types[0] ?? options[0] ?? "";
  const nextType = options.includes(state.abilityOverrideType)
    ? state.abilityOverrideType
    : fallbackType;
  return nextType !== state.abilityOverrideType
    ? { ...state, abilityOverrideType: nextType }
    : state;
}

function closeAbilityTypeDropdowns(): void {
  if (openAbilityTypeDropdownSide === null) return;
  openAbilityTypeDropdownSide = null;
  renderAbilityTypeDropdown("attacker");
  renderAbilityTypeDropdown("defender");
}

function renderAbilityTypeDropdown(side: DamageSide): void {
  const root = document.getElementById(`damage-${side}-ability-type-dropdown`);
  if (!root) return;

  const state = normalizeTypeOverrideForState(getDamageSideState(side));
  setDamageSideState(side, state);
  const pokemon = state.pokemon;
  const shouldShow = !!pokemon && isTypeOverrideAbility(state.ability);
  root.hidden = !shouldShow;
  root.innerHTML = "";
  if (!shouldShow || !pokemon) {
    if (openAbilityTypeDropdownSide === side) openAbilityTypeDropdownSide = null;
    return;
  }

  const options = getTypeOverrideOptions();
  const currentType = getEffectiveDamageTypes(side)[0] ?? pokemon.types[0] ?? options[0] ?? "";
  const isOpen = openAbilityTypeDropdownSide === side;

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "ability-type-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
  trigger.setAttribute("aria-label", "へんげんじざい／リベロのタイプ");
  trigger.innerHTML = `
    <img src="${typeSvSrc(currentType)}" alt="${escapeHtml(currentType)}" />
    <span class="ability-type-name">${escapeHtml(currentType)}</span>
    <span class="ability-type-arrow" aria-hidden="true">▼</span>
  `;
  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    openAbilityTypeDropdownSide = isOpen ? null : side;
    renderAbilityTypeDropdown("attacker");
    renderAbilityTypeDropdown("defender");
  });
  root.appendChild(trigger);

  if (!isOpen) return;

  const menu = document.createElement("div");
  menu.className = "ability-type-menu";
  menu.setAttribute("role", "listbox");
  menu.addEventListener("click", (event) => event.stopPropagation());
  for (const type of options) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "ability-type-option" + (type === currentType ? " is-active" : "");
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", type === currentType ? "true" : "false");
    option.innerHTML = `
      <img src="${typeSvSrc(type)}" alt="${escapeHtml(type)}" />
      <span class="ability-type-name">${escapeHtml(type)}</span>
    `;
    option.addEventListener("click", (event) => {
      event.stopPropagation();
      setDamageSideState(side, { ...getDamageSideState(side), abilityOverrideType: type });
      openAbilityTypeDropdownSide = null;
      syncLegacyStateFromDamageStates();
      renderTab1DamageDisplay();
    });
    menu.appendChild(option);
  }
  root.appendChild(menu);
}

function getDamageRosterSource(side: DamageSide): DamageRosterSource {
  if (side === "defender") return damageRostersSwapped ? "team" : "opponent";
  return damageRostersSwapped ? "opponent" : "team";
}

function getDamageSidePokemon(side: DamageSide): Pokemon | null {
  return side === "attacker" ? attackPokemon : defendPokemon;
}

function getOpponentRosterSlots(): Array<BroadcastRecognitionMatch | null> {
  return confirmedOpponentRoster.slots.some((slot) => !!slot)
    ? confirmedOpponentRoster.slots
    : broadcastRecognitionStates.map((state) => state.confirmed);
}

function createDamageRosterButton(options: {
  slotIndex: number;
  pokemon: Pokemon | null;
  itemId?: string;
  selected: boolean;
  disabled: boolean;
  emptyLabel: string;
}): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `damage-roster-slot${options.pokemon ? "" : " is-empty"}${options.selected ? " is-selected" : ""}`;
  btn.dataset.slotIndex = String(options.slotIndex);
  btn.disabled = options.disabled;
  btn.setAttribute("aria-label", options.pokemon ? options.pokemon.name : options.emptyLabel);

  const img = document.createElement("img");
  img.className = "damage-roster-slot-img";
  img.alt = options.pokemon?.name ?? "";
  img.onerror = () => { img.src = BALL_MONSTER_IMAGE; };
  img.src = options.pokemon ? getPokemonImageSrc(options.pokemon) : BALL_MONSTER_IMAGE;
  btn.appendChild(img);
  return btn;
}

function renderDamageTeamSelect(side: DamageSide, source: DamageRosterSource): void {
  const select = document.getElementById(`damage-${side}-team-select`) as HTMLSelectElement | null;
  if (!select) return;
  const isTeamSource = source === "team";
  select.hidden = !isTeamSource;
  if (!isTeamSource) {
    select.disabled = true;
    return;
  }
  if (teams.length === 0) {
    selectedDamageTeamIndex = 0;
    select.innerHTML = "";
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No Team";
    select.appendChild(opt);
    select.disabled = true;
    return;
  }

  if (selectedDamageTeamIndex < 0 || selectedDamageTeamIndex >= teams.length) selectedDamageTeamIndex = 0;
  select.disabled = false;
  select.innerHTML = "";
  teams.forEach((_, teamIndex) => {
    const opt = document.createElement("option");
    opt.value = String(teamIndex);
    opt.textContent = teamNames[teamIndex] ?? `Team ${teamIndex + 1}`;
    select.appendChild(opt);
  });
  select.value = String(selectedDamageTeamIndex);
}

function renderDamageRoster(side: DamageSide): void {
  const wrap = document.getElementById(`damage-${side}-roster`);
  if (!wrap) return;
  wrap.innerHTML = "";
  const source = getDamageRosterSource(side);
  const label = document.getElementById(`damage-${side}-roster-label`);
  if (label) label.textContent = source === "team" ? "My Team" : "Opponent";
  const bar = wrap.closest(".damage-roster-bar");
  bar?.classList.toggle("is-team-source", source === "team");
  renderDamageTeamSelect(side, source);
  const selectedPokemon = getDamageSidePokemon(side);

  if (source === "opponent") {
    const slots = getOpponentRosterSlots();
    for (let i = 0; i < MAX_TEAM_SIZE; i++) {
      const match = slots[i] ?? null;
      const pokemon = getPokemonById(match?.pokemonId);
      wrap.appendChild(createDamageRosterButton({
        slotIndex: i,
        pokemon,
        selected: !!pokemon && selectedPokemon?.id === pokemon.id,
        disabled: !pokemon,
        emptyLabel: match?.pokemonName ?? "Empty",
      }));
    }
    return;
  }

  const team = getSelectedDamageTeam();
  for (let i = 0; i < MAX_TEAM_SIZE; i++) {
    const member = team?.[i] ?? null;
    const pokemon = member?.pokemon ?? null;
    wrap.appendChild(createDamageRosterButton({
      slotIndex: i,
      pokemon,
      itemId: member?.heldItem,
      selected: !!pokemon && selectedPokemon?.id === pokemon.id,
      disabled: !member,
      emptyLabel: "Empty",
    }));
  }
}

function renderDamageRosterSlots(): void {
  renderDamageRoster("defender");
  renderDamageRoster("attacker");
}

function applyDamageRosterSlot(side: DamageSide, slotIndex: number): void {
  closeAbilityTypeDropdowns();
  const source = getDamageRosterSource(side);
  if (source === "team") {
    const member = getSelectedDamageTeam()?.[slotIndex];
    if (!member) return;
    const nextState = createDamageStateFromTeamMember(member);
    if (side === "attacker") {
      attackerState = nextState;
      editingMoveSlotIndex = null;
      damageMovesTypeFilter = null;
    } else {
      defenderState = nextState;
    }
    syncLegacyStateFromDamageStates();
    syncStatsInputsFromState();
    renderTab1DamageDisplay();
    return;
  }

  const pokemon = getPokemonById(getOpponentRosterSlots()[slotIndex]?.pokemonId);
  if (!pokemon) return;
  const nextState = createDamageStateForPokemon(pokemon);
  if (side === "attacker") {
    attackerState = nextState;
    editingMoveSlotIndex = null;
    damageMovesTypeFilter = null;
  } else {
    defenderState = nextState;
  }
  syncLegacyStateFromDamageStates();
  syncStatsInputsFromState();
  renderTab1DamageDisplay();
}

interface BoxEntry {
  pokemon: Pokemon;
  ev: { hp: number; atk: number; def: number; spAtk: number; spDef: number; spd: number };
  natureName: string;
  ability: string;
  heldItem: string;
  moves: number[];
}

interface TeamMember {
  pokemon: Pokemon;
  ev: BoxEntry["ev"];
  natureName: string;
  ability: string;
  heldItem: string;
  moves: number[];
}

type DetailModalContext =
  | { mode: "box" }
  | { mode: "team"; teamIndex: number; slotIndex: number };

type PokemonPickerMode = "create-team" | "team-slot" | "change-pokemon";

const EV_TABLE_COLS: { label: string; key: keyof BoxEntry["ev"]; natKey: keyof Omit<(typeof NATURES)[0], "name"> | null }[] = [
  { label: "H", key: "hp", natKey: null },
  { label: "A", key: "atk", natKey: "atk" },
  { label: "B", key: "def", natKey: "def" },
  { label: "C", key: "spAtk", natKey: "spAtk" },
  { label: "D", key: "spDef", natKey: "spDef" },
  { label: "S", key: "spd", natKey: "spd" },
];

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

/** 5×5 性格グリッド（行=上昇ステータス, 列=下降ステータス）*/
const NATURE_GRID_5x5: string[][] = [
  ["がんばりや", "さみしがり", "いじっぱり", "やんちゃ",   "ゆうかん"],
  ["ずぶとい",   "すなお",    "わんぱく",   "のうてんき",  "のんき"],
  ["ひかえめ",   "おとなしい", "まじめ",     "うっかりや",  "れいせい"],
  ["おだやか",   "なごやか",   "しんちょう", "てれや",     "なまいき"],
  ["おくびょう",  "せっかち",   "ようき",    "むじゃき",   "きまぐれ"],
];
const NATURE_STAT_LABELS = ["こうげき", "ぼうぎょ", "とくこう", "とくぼう", "すばやさ"];

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
let boxSortMode: "created" | "number" = "created";
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
let detailModalContext: DetailModalContext | null = null;
let selectedTeamIndex: number | null = null;
let selectedTeamSlotIndex: number | null = null;
let teamDetailPendingSlotIndex: number | null = null;
let pendingTeamDraft: { teamIndex: number; slotIndex: number } | null = null;
let pokemonPickerMode: PokemonPickerMode = "create-team";
let shouldReopenTeamDetailOnPickerClose = false;
let hasAddedCurrentEntryToBox = false;

/** タブ1技一覧の検索テキスト */
let tab1MoveSearchText = "";

// BOXのタイプ一覧（18タイプ）
const ALL_TYPES = ["ノーマル","かくとう","ひこう","どく","じめん","いわ","むし","ゴースト","はがね","ほのお","みず","くさ","でんき","エスパー","こおり","ドラゴン","あく","フェアリー"];

/** 日本語タイプ名 → SV画像ファイル名（img/type/sv/） */
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
    img.src = typeSvSrc(typeName);
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
  const moveMap = new Map(movesData.map((m) => [m.id, m]));
  const filtered = getDisplayedBoxEntries();
  if (filtered.length === 0) {
    const p = document.createElement("p");
    p.className = "box-empty-msg";
    p.textContent = "BOXにポケモンがいません";
    grid.appendChild(p);
    return;
  }
  filtered.forEach(({ entry, index }) => {
    const card = createPokemonDetailCard(createTeamMemberFromBoxEntry(entry), moveMap, {
      asButton: true,
      extraClassName: "box-pokemon-card",
    });
    card.dataset.boxIndex = String(index);
    grid.appendChild(card);
    card.addEventListener("click", () => openBoxDetailView(index));
  });
}

function renderTab3(): void {
  renderBoxTypeButtons();
  renderBoxGrid();
}

function getPokemonNumberSortKey(pokemon: Pokemon): { number: number; id: string; name: string } {
  const num = Number.parseInt(pokemon.id, 10);
  return {
    number: Number.isFinite(num) ? num : Number.MAX_SAFE_INTEGER,
    id: pokemon.id,
    name: pokemon.name,
  };
}

function getDisplayedBoxEntries(): { entry: BoxEntry; index: number }[] {
  const indexed = box
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !boxTypeFilter || entry.pokemon.types.includes(boxTypeFilter));

  if (boxSortMode === "number") {
    indexed.sort((a, b) => {
      const aKey = getPokemonNumberSortKey(a.entry.pokemon);
      const bKey = getPokemonNumberSortKey(b.entry.pokemon);
      if (aKey.number !== bKey.number) return aKey.number - bKey.number;
      const idCmp = aKey.id.localeCompare(bKey.id, "ja");
      if (idCmp !== 0) return idCmp;
      return a.index - b.index;
    });
  }

  return indexed;
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
  detailModalContext = { mode: "box" };
  hasAddedCurrentEntryToBox = false;
  boxViewingIndex = null;
  boxEditingPokemon = pokemon;
  const modal = document.getElementById("box-detail-modal");
  const title = document.getElementById("box-detail-title");
  const img = document.getElementById("box-detail-img") as HTMLImageElement | null;
  const typesEl = document.getElementById("box-detail-types");
  if (title) title.textContent = pokemon.name;
  if (img) {
    img.src = getPokemonImageSrc(pokemon);
    img.onerror = () => { img.src = BALL_MONSTER_IMAGE; };
  }
  if (typesEl) typesEl.innerHTML = typeBadgesSvHtml(pokemon.types);
  // 詳細確認非表示 / 編集フォーム表示
  const viewEl = document.getElementById("box-detail-view");
  const editEl = document.getElementById("box-detail-edit");
  if (viewEl) viewEl.hidden = true;
  if (editEl) editEl.hidden = false;
  initBoxEditForm(pokemon);
  updateDetailModalActionButtons();
  if (modal) modal.hidden = false;
}

function closeBoxDetailModal(): void {
  const modal = document.getElementById("box-detail-modal");
  if (modal) modal.hidden = true;
  if (pendingTeamDraft) {
    const team = teams[pendingTeamDraft.teamIndex];
    if (team) delete team[pendingTeamDraft.slotIndex];
    renderTeamList();
    if (selectedTeamIndex === pendingTeamDraft.teamIndex) renderTeamDetailModal(pendingTeamDraft.teamIndex);
    pendingTeamDraft = null;
    teamDetailPendingSlotIndex = null;
  }
  boxEditingPokemon = null;
  boxSelectedItem = null;
  boxItemSearchText = "";
  boxSelectedMoves = [0, 0, 0, 0];
  boxEditingMoveSlot = null;
  boxViewingIndex = null;
  detailModalContext = null;
  hasAddedCurrentEntryToBox = false;
}

function collectBoxEntryFromForm(): BoxEntry | null {
  if (!boxEditingPokemon) return null;
  normalizeAllBoxEvInputs();
  const ev: BoxEntry["ev"] = { hp: 0, atk: 0, def: 0, spAtk: 0, spDef: 0, spd: 0 };
  BOX_EV_LABELS.forEach(({ key, id }) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    ev[key] = clampBoxEv(Number(el?.value) || 0);
  });
  const natSel = document.getElementById("box-detail-nature") as HTMLSelectElement | null;
  const natureName = natSel?.value ?? "がんばりや";
  const abilitySel = document.getElementById("box-detail-ability") as HTMLSelectElement | null;
  const ability = abilitySel?.value ?? "";
  const heldItem = boxSelectedItem?.id ?? "";
  const moves = boxSelectedMoves.filter((v) => v > 0);
  return { pokemon: boxEditingPokemon, ev, natureName, ability, heldItem, moves };
}

function saveBoxEntry(): void {
  const entry = collectBoxEntryFromForm();
  if (!entry) return;
  if (detailModalContext?.mode === "team") {
    const { teamIndex, slotIndex } = detailModalContext;
    const team = teams[teamIndex];
    if (!team || !team[slotIndex]) return;
    team[slotIndex] = createTeamMemberFromBoxEntry(entry);
    pendingTeamDraft = null;
    teamDetailPendingSlotIndex = null;
    saveTeamToStorage();
    closeBoxDetailModal();
    renderTeamList();
    renderTeamDetailModal(teamIndex);
    return;
  }
  if (boxViewingIndex !== null) {
    box[boxViewingIndex] = entry;
  } else {
    box.push(entry);
  }
  saveBoxToStorage();
  closeBoxDetailModal();
  renderTab3();
}

function addCurrentEntryToBox(): void {
  const entry = collectBoxEntryFromForm();
  if (!entry) return;
  box.push(entry);
  saveBoxToStorage();
  hasAddedCurrentEntryToBox = true;
  updateDetailModalActionButtons();
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
  detailModalContext = { mode: "box" };
  hasAddedCurrentEntryToBox = false;
  boxViewingIndex = index;
  boxEditingPokemon = getFreshPokemon(entry.pokemon);

  // ヘッダー
  const modal = document.getElementById("box-detail-modal");
  const title = document.getElementById("box-detail-title");
  const img = document.getElementById("box-detail-img") as HTMLImageElement | null;
  const typesEl = document.getElementById("box-detail-types");
  if (title) title.textContent = entry.pokemon.name;
  if (img) {
    img.src = getPokemonImageSrc(entry.pokemon);
    img.onerror = () => { img.src = BALL_MONSTER_IMAGE; };
  }
  if (typesEl) typesEl.innerHTML = typeBadgesSvHtml(entry.pokemon.types);

  // 詳細ビュー表示 / 編集フォーム非表示
  const viewEl = document.getElementById("box-detail-view");
  const editEl = document.getElementById("box-detail-edit");
  if (viewEl) viewEl.hidden = false;
  if (editEl) editEl.hidden = true;

  // 詳細コンテンツ描画
  renderBoxDetailView(entry);
  initBoxEditForm(entry.pokemon, entry);
  updateDetailModalActionButtons();

  if (modal) modal.hidden = false;
}

function openTeamMemberDetailView(teamIndex: number, slotIndex: number, startInEditMode = false): void {
  const member = teams[teamIndex]?.[slotIndex];
  if (!member) return;
  detailModalContext = { mode: "team", teamIndex, slotIndex };
  hasAddedCurrentEntryToBox = false;
  selectedTeamIndex = teamIndex;
  selectedTeamSlotIndex = slotIndex;
  boxViewingIndex = null;
  boxEditingPokemon = getFreshPokemon(member.pokemon);
  const modal = document.getElementById("box-detail-modal");
  const title = document.getElementById("box-detail-title");
  const img = document.getElementById("box-detail-img") as HTMLImageElement | null;
  const typesEl = document.getElementById("box-detail-types");
  if (title) title.textContent = member.pokemon.name;
  if (img) {
    img.src = getPokemonImageSrc(member.pokemon);
    img.onerror = () => { img.src = BALL_MONSTER_IMAGE; };
  }
  if (typesEl) typesEl.innerHTML = typeBadgesSvHtml(member.pokemon.types);
  const viewEl = document.getElementById("box-detail-view");
  const editEl = document.getElementById("box-detail-edit");
  if (viewEl) viewEl.hidden = startInEditMode;
  if (editEl) editEl.hidden = !startInEditMode;
  renderBoxDetailView(teamMemberToBoxEntry(member));
  initBoxEditForm(member.pokemon, teamMemberToBoxEntry(member));
  updateDetailModalActionButtons();
  if (modal) modal.hidden = false;
}

/** 詳細確認コンテンツを描画 */
function renderBoxDetailView(entry: BoxEntry): void {
  const viewContent = document.getElementById("box-view-content");
  if (!viewContent) return;

  const nat = NATURES.find((n) => n.name === entry.natureName) ?? NATURES[0];
  const natLabel = getNatureLabel(nat);

  const item = getDisplayHeldItemInfo(entry.heldItem, entry.pokemon);
  const itemHtml = item
    ? `<img src="${escapeHtml(item.imageSrc)}"
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
          <img class="type-img type-img-sv" src="${typeSvSrc(m.type)}" alt="${escapeHtml(m.type)}" />
          <span>${escapeHtml(m.name)}</span>
          <span class="box-view-move-meta">${escapeHtml(m.category)}・威力${powerStr}</span>
        </div>`;
      }).filter(Boolean).join("")
    : "なし";

  viewContent.innerHTML = `
    <div class="box-view-section">
      <span class="box-view-label">とくせい</span>
      <span class="box-view-value">${entry.ability ? escapeHtml(entry.ability) : "—"}</span>
    </div>
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
    const ev = clampBoxEv(Number(inp.value) || 0);
    let natMul = 1.0;
    let real: number;
    if (natureKey === "hp") {
      real = calcHpStatWithEV(base, ev);
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

/** 性格5×5グリッドを描画（現在の natSel.value をハイライト） */
function renderNatureGrid(): void {
  const wrap = document.getElementById("box-nature-grid-wrap");
  const natSel = document.getElementById("box-detail-nature") as HTMLSelectElement | null;
  if (!wrap) return;
  const current = natSel?.value ?? "がんばりや";
  wrap.innerHTML = "";
  const table = document.createElement("table");
  table.className = "box-nature-table";
  // ヘッダ行
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  headerRow.appendChild(document.createElement("th"));
  NATURE_STAT_LABELS.forEach((label) => {
    const th = document.createElement("th");
    th.className = "nature-col-header";
    th.innerHTML = `${label}<span class="nature-arrow">▼</span>`;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);
  // ボディ行
  const tbody = document.createElement("tbody");
  NATURE_GRID_5x5.forEach((row, ri) => {
    const tr = document.createElement("tr");
    const rowTh = document.createElement("th");
    rowTh.className = "nature-row-header";
    rowTh.innerHTML = `${NATURE_STAT_LABELS[ri]}<span class="nature-arrow">▲</span>`;
    tr.appendChild(rowTh);
    row.forEach((natureName, ci) => {
      const td = document.createElement("td");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "box-nature-cell" +
        (ri === ci ? " is-neutral" : "") +
        (natureName === current ? " is-selected" : "");
      btn.textContent = natureName;
      btn.addEventListener("click", () => {
        if (natSel) {
          natSel.value = natureName;
          natSel.dispatchEvent(new Event("change"));
        }
        const nb = document.getElementById("box-nature-btn");
        if (nb) nb.textContent = natureName;
        if (wrap) wrap.hidden = true;
      });
      td.appendChild(btn);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
}

/** 編集フォームを初期化（新規 or 既存エントリで事前充填） */
function initBoxEditForm(pokemon: Pokemon, existing?: BoxEntry): void {
  // とくせい
  const abilitySel = document.getElementById("box-detail-ability") as HTMLSelectElement | null;
  if (abilitySel) {
    abilitySel.innerHTML = "";
    const abilities = pokemon.abilities ?? [];
    if (abilities.length === 0) {
      const opt = document.createElement("option");
      opt.value = ""; opt.textContent = "—";
      abilitySel.appendChild(opt);
    } else {
      abilities.forEach((ab) => {
        const opt = document.createElement("option");
        opt.value = ab; opt.textContent = ab;
        abilitySel.appendChild(opt);
      });
    }
    abilitySel.value = existing?.ability && abilities.includes(existing.ability) ? existing.ability : (abilities[0] ?? "");
  }
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
    const nb = document.getElementById("box-nature-btn");
    if (nb) nb.textContent = natSel.value;
    const ngw = document.getElementById("box-nature-grid-wrap");
    if (ngw) ngw.hidden = true;
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
      inp.type = "number"; inp.id = id; inp.className = "damage-ev-input"; inp.min = "0"; inp.max = String(BOX_EV_PER_STAT_MAX);
      inp.value = String(clampBoxEv(existing?.ev[key] ?? 0));
      inp.addEventListener("input", () => {
        normalizeBoxEvInput(inp);
        updateBoxEditRealStats(pokemon);
      });
      const btn252 = document.createElement("button");
      btn252.type = "button"; btn252.className = "damage-ev-btn damage-ev-btn-252"; btn252.dataset.evInput = id; btn252.textContent = String(BOX_EV_PER_STAT_MAX);
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
    normalizeAllBoxEvInputs();
    updateBoxEditRealStats(pokemon);
  }
  boxSelectedItem = existing ? (getCompetitiveItemById(existing.heldItem, pokemon) ?? null) : null;
  syncMegaStoneForCurrentEditingPokemon(existing?.heldItem ?? "");
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
  const selectBtn = document.getElementById("box-detail-item-select-btn") as HTMLButtonElement | null;
  const clearBtn = document.getElementById("box-detail-item-clear-btn") as HTMLButtonElement | null;
  const isMega = !!boxEditingPokemon && getMegaStoneItemId(boxEditingPokemon.id) !== null;
  const displayItem = getDisplayHeldItemInfo(boxSelectedItem?.id ?? "", boxEditingPokemon);
  if (img) {
    if (displayItem) {
      img.src = displayItem.imageSrc;
      img.hidden = false;
      img.onerror = () => { img.hidden = true; };
    } else {
      img.hidden = true;
    }
  }
  if (nameEl) nameEl.textContent = displayItem ? displayItem.nameJa : "—";
  if (selectBtn) {
    selectBtn.disabled = isMega;
    selectBtn.textContent = isMega ? "メガストーン固定" : "選択する";
  }
  if (clearBtn) clearBtn.hidden = !boxSelectedItem || isMega;
}

function renderBoxItemPicker(): void {
  const list = document.getElementById("box-item-list");
  if (!list) return;
  if (boxEditingPokemon && getMegaStoneItemId(boxEditingPokemon.id)) {
    list.innerHTML = "";
    return;
  }
  list.innerHTML = "";
  const query = boxItemSearchText.trim().toLowerCase();
  const sourceItems = maItems.length > 0 ? maItems : COMPETITIVE_ITEMS;
  const items = query
    ? sourceItems.filter((it) => it.nameJa.includes(boxItemSearchText.trim()) || it.id.includes(query))
    : sourceItems;
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
      btn.innerHTML = getMoveMetaHtml(move);
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
    btn.innerHTML = `<img class="type-img type-img-sv" src="${typeSvSrc(move.type)}" alt="${escapeHtml(move.type)}" /> ${escapeHtml(move.name)}（${escapeHtml(move.category)}・威力${powerStr}）`;
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
      width: { ideal: 1920 },
      height: { ideal: 1080 },
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

function createDefaultTeamMember(pokemon: Pokemon): TeamMember {
  return {
    pokemon,
    ev: { hp: 0, atk: 0, def: 0, spAtk: 0, spDef: 0, spd: 0 },
    natureName: "がんばりや",
    ability: "",
    heldItem: "",
    moves: [],
  };
}

function isValidTeamMember(value: unknown): value is TeamMember {
  return (
    value != null &&
    typeof value === "object" &&
    isValidPokemon((value as TeamMember).pokemon) &&
    typeof (value as TeamMember).natureName === "string" &&
    typeof (value as TeamMember).heldItem === "string" &&
    Array.isArray((value as TeamMember).moves) &&
    typeof (value as TeamMember).ev === "object"
  );
}

function normalizeTeamMember(value: unknown): TeamMember | null {
  if (isValidTeamMember(value)) {
    return {
      pokemon: value.pokemon,
      natureName: value.natureName,
      ability: typeof (value as TeamMember).ability === "string" ? (value as TeamMember).ability : "",
      heldItem: value.heldItem,
      moves: value.moves.filter((moveId): moveId is number => typeof moveId === "number"),
      ev: {
        hp: Number(value.ev?.hp) || 0,
        atk: Number(value.ev?.atk) || 0,
        def: Number(value.ev?.def) || 0,
        spAtk: Number(value.ev?.spAtk) || 0,
        spDef: Number(value.ev?.spDef) || 0,
        spd: Number(value.ev?.spd) || 0,
      },
    };
  }
  if (isValidPokemon(value)) {
    return createDefaultTeamMember(value);
  }
  return null;
}

function teamMemberToBoxEntry(member: TeamMember): BoxEntry {
  return {
    pokemon: member.pokemon,
    ev: { ...member.ev },
    natureName: member.natureName,
    ability: member.ability,
    heldItem: member.heldItem,
    moves: [...member.moves],
  };
}

function createTeamMemberFromBoxEntry(entry: BoxEntry): TeamMember {
  return {
    pokemon: entry.pokemon,
    ev: { ...entry.ev },
    natureName: entry.natureName,
    ability: entry.ability,
    heldItem: entry.heldItem,
    moves: [...entry.moves],
  };
}

function buildPokemonDetailEvTable(member: TeamMember | null): HTMLTableElement {
  const nat = member ? (NATURES.find((n) => n.name === member.natureName) ?? NATURES[0]) : null;
  const evTable = document.createElement("table");
  evTable.className = "team-detail-ev-table";
  const labelRow = document.createElement("tr");
  const valRow = document.createElement("tr");

  EV_TABLE_COLS.forEach(({ label, key, natKey }) => {
    const mul = (nat && natKey) ? (nat[natKey] as number) : 1;
    const th = document.createElement("th");
    th.textContent = label;
    if (mul > 1) th.classList.add("nat-up");
    else if (mul < 1) th.classList.add("nat-down");
    labelRow.appendChild(th);

    const td = document.createElement("td");
    const val = member ? member.ev[key] : 0;
    td.textContent = val > 0 ? String(val) : "—";
    valRow.appendChild(td);
  });

  const tbody = document.createElement("tbody");
  tbody.append(labelRow, valRow);
  evTable.appendChild(tbody);
  return evTable;
}

function createPokemonDetailCard(
  member: TeamMember | null,
  moveMap: Map<number, Move>,
  options: { asButton?: boolean; extraClassName?: string } = {},
): HTMLElement {
  const pokemon = member?.pokemon;
  const isBoxCard = options.extraClassName?.split(" ").includes("box-pokemon-card") ?? false;
  const root = options.asButton ? document.createElement("button") : document.createElement("div");
  if (root instanceof HTMLButtonElement) root.type = "button";
  root.className = [
    "team-detail-slot",
    pokemon ? "is-filled" : "is-empty",
    options.extraClassName ?? "",
  ].filter(Boolean).join(" ");

  const rightCol = document.createElement("div");
  rightCol.className = "team-slot-right";

  const imgWrap = document.createElement("div");
  imgWrap.className = "team-slot-img-wrap";

  const img = document.createElement("img");
  img.className = "team-detail-slot-img" + (pokemon ? "" : " team-detail-slot-img--empty");
  img.alt = pokemon?.name ?? "";
  img.onerror = () => { img.src = BALL_MONSTER_IMAGE; };
  img.src = pokemon ? getPokemonImageSrc(pokemon) : BALL_MONSTER_IMAGE;
  imgWrap.appendChild(img);

  const itemData = getDisplayHeldItemInfo(member?.heldItem ?? "", pokemon ?? null);
  if (itemData) {
    const itemIcon = document.createElement("img");
    itemIcon.className = "team-slot-item-icon";
    itemIcon.src = itemData.imageSrc;
    itemIcon.alt = itemData.nameJa;
    itemIcon.onerror = () => { itemIcon.hidden = true; };
    imgWrap.appendChild(itemIcon);
  }
  rightCol.appendChild(imgWrap);

  const leftCol = document.createElement("div");
  leftCol.className = "team-slot-left";
  const movesEl = document.createElement("div");
  movesEl.className = "team-detail-slot-moves" + (isBoxCard ? " box-card-moves-grid" : "");

  if (!pokemon || !member) {
    const name = document.createElement("span");
    name.className = "team-detail-slot-name team-detail-slot-name--empty";
    name.textContent = "未選択";

    const typesEl = document.createElement("div");
    typesEl.className = "team-detail-slot-types";

    const abilityEl = document.createElement("span");
    abilityEl.className = "team-detail-slot-ability";
    abilityEl.textContent = "\u00a0";

    for (let i = 0; i < 4; i++) {
      const row = document.createElement("div");
      row.className = "team-slot-move";
      row.textContent = "\u00a0";
      movesEl.appendChild(row);
    }
    leftCol.append(name, typesEl, abilityEl);
  } else {
    const name = document.createElement("span");
    name.className = "team-detail-slot-name";
    name.textContent = pokemon.name;

    const typesEl = document.createElement("div");
    typesEl.className = "team-detail-slot-types";
    pokemon.types.forEach((t) => {
      const typeImg = document.createElement("img");
      typeImg.className = "team-detail-type-img";
      typeImg.src = typeSvSrc(t);
      typeImg.alt = t;
      typeImg.onerror = () => { typeImg.src = `img/type/${t}.png`; };
      typesEl.appendChild(typeImg);
    });

    const abilityEl = document.createElement("span");
    abilityEl.className = "team-detail-slot-ability";
    abilityEl.textContent = member.ability || "—";

    const filledMoves = [...member.moves.filter((id) => id > 0), 0, 0, 0, 0].slice(0, 4);
    filledMoves.forEach((id) => {
      const row = document.createElement("div");
      row.className = "team-slot-move";
      const move = id > 0 ? moveMap.get(id) : null;
      if (move) {
        const typeIcon = document.createElement("img");
        typeIcon.className = "team-slot-move-type";
        typeIcon.src = typeSvSrc(move.type);
        typeIcon.alt = move.type;
        typeIcon.onerror = () => { typeIcon.src = `img/type/${move.type}.png`; };
        const moveName = document.createElement("span");
        moveName.textContent = move.name;
        row.append(typeIcon, moveName);
      } else {
        row.textContent = "\u00a0";
      }
      movesEl.appendChild(row);
    });

    leftCol.append(name, typesEl, abilityEl);
  }

  const evEl = document.createElement("div");
  evEl.className = "team-detail-slot-evs";
  evEl.appendChild(buildPokemonDetailEvTable(member));

  if (isBoxCard) {
    const boxMovesWrap = document.createElement("div");
    boxMovesWrap.className = "team-detail-slot-evs box-card-moves-wrap";
    boxMovesWrap.appendChild(movesEl);
    evEl.classList.add("box-card-evs");
    root.append(leftCol, rightCol, boxMovesWrap, evEl);
  } else {
    leftCol.append(movesEl);
    root.append(leftCol, rightCol, evEl);
  }
  return root;
}

const SUPPORTED_MEGA_POKEMON_IDS = new Set([
  "0003Mega", "0006MegaX", "0006MegaY", "0009Mega", "0015Mega", "0018Mega",
  "0026MegaX", "0026MegaY", "0036Mega", "0065Mega", "0071Mega", "0080Mega",
  "0094Mega", "0115Mega", "0121Mega", "0127Mega", "0130Mega", "0142Mega",
  "0149Mega", "0150MegaX", "0150MegaY", "0154Mega", "0160Mega", "0181Mega",
  "0208Mega", "0212Mega", "0214Mega", "0227Mega", "0229Mega", "0248Mega",
  "0254Mega", "0257Mega", "0260Mega", "0282Mega", "0302Mega", "0303Mega",
  "0306Mega", "0308Mega", "0310Mega", "0319Mega", "0323Mega", "0334Mega",
  "0354Mega", "0358Mega", "0359Mega", "0359MegaZ", "0362Mega", "0373Mega",
  "0376Mega", "0380Mega", "0381Mega", "0384Mega", "0428Mega", "0445Mega",
  "0445MegaZ", "0448Mega", "0448MegaZ", "0460Mega", "0475Mega", "0478Mega",
  "0500Mega", "0530Mega", "0531Mega", "0609Mega", "0623Mega", "0652Mega",
  "0655Mega", "0658Mega", "0670AMega", "0678Mega", "0701Mega", "0719Mega",
  "0740Mega", "0780Mega", "0952Mega", "0970Mega",
]);

function isMegaStoneItemId(itemId: string | undefined): boolean {
  return !!itemId && itemId.startsWith("mega-stone-");
}

function getMegaStoneItemId(pokemonId: string): string | null {
  return SUPPORTED_MEGA_POKEMON_IDS.has(pokemonId) ? `mega-stone-${pokemonId}` : null;
}

function isMegaPokemonId(pokemonId: string | undefined): boolean {
  return !!pokemonId && pokemonId.includes("Mega");
}

function getMegaBasePokemonId(pokemonId: string): string {
  const megaIndex = pokemonId.indexOf("Mega");
  return megaIndex >= 0 ? pokemonId.slice(0, megaIndex) : pokemonId;
}

function getMegaFormCandidates(pokemon: Pokemon | null | undefined): Pokemon[] {
  if (!pokemon) return [];
  const baseId = getMegaBasePokemonId(pokemon.id);
  return Array.from(SUPPORTED_MEGA_POKEMON_IDS)
    .filter((id) => getMegaBasePokemonId(id) === baseId)
    .map((id) => demoPokemon.find((p) => p.id === id))
    .filter((p): p is Pokemon => p != null);
}

function getMegaToggleTarget(pokemon: Pokemon | null | undefined): Pokemon | null {
  if (!pokemon) return null;
  if (isMegaPokemonId(pokemon.id)) {
    return demoPokemon.find((p) => p.id === getMegaBasePokemonId(pokemon.id)) ?? null;
  }
  return getMegaFormCandidates(pokemon)[0] ?? null;
}

function getMegaFormSuffixLabel(pokemonId: string): string {
  const megaIndex = pokemonId.indexOf("Mega");
  if (megaIndex < 0) return "";
  const suffix = pokemonId.slice(megaIndex + 4);
  return suffix ? ` - ${suffix}` : "";
}

function getMegaStoneItemByPokemonId(pokemonId: string, pokemonName?: string): CompetitiveItem | null {
  const itemId = getMegaStoneItemId(pokemonId);
  if (!itemId) return null;
  const megaIndex = pokemonId.indexOf("Mega");
  const baseId = megaIndex >= 0 ? pokemonId.slice(0, megaIndex) : pokemonId;
  const suffixRaw = megaIndex >= 0 ? pokemonId.slice(megaIndex + 4) : "";
  const suffix = suffixRaw === "X" || suffixRaw === "Y" || suffixRaw === "Z" ? suffixRaw : "";
  const basePokemon = demoPokemon.find((p) => p.id === baseId);
  const baseName = basePokemon?.name ?? pokemonName ?? pokemonId;
  return {
    id: itemId,
    nameJa: `${baseName}ナイト${suffix}`,
    effect: `${baseName}をメガシンカさせる。`,
  };
}

function getCompetitiveItemById(itemId: string, pokemon?: Pokemon | null): CompetitiveItem | null {
  const found = COMPETITIVE_ITEMS.find((it) => it.id === itemId) ?? maItems.find((it) => it.id === itemId);
  if (found) return found;
  if (isMegaStoneItemId(itemId)) {
    return getMegaStoneItemByPokemonId(itemId.replace("mega-stone-", ""), pokemon?.name);
  }
  return null;
}

function getHeldItemImageSrc(item: CompetitiveItem): string {
  const imageItem = maItems.find((it) => it.id === item.id)
    ?? maItems.find((it) => it.nameJa === item.nameJa)
    ?? item;
  return `img/item/${imageItem.id}.png`;
}

function getDisplayHeldItemInfo(heldItem: string, pokemon?: Pokemon | null): (CompetitiveItem & { imageSrc: string }) | null {
  const megaItem = pokemon ? getMegaStoneItemByPokemonId(pokemon.id, pokemon.name) : null;
  if (megaItem) {
    return {
      id: "megaStone",
      nameJa: "メガストーン",
      effect: megaItem.effect,
      imageSrc: "img/item/megaStone.png",
    };
  }
  const item = heldItem ? getCompetitiveItemById(heldItem, pokemon) : null;
  return item ? { ...item, imageSrc: getHeldItemImageSrc(item) } : null;
}

function syncMegaStoneForCurrentEditingPokemon(existingHeldItem = ""): void {
  if (!boxEditingPokemon) return;
  const megaItem = getMegaStoneItemByPokemonId(boxEditingPokemon.id, boxEditingPokemon.name);
  if (megaItem) {
    boxSelectedItem = megaItem;
    return;
  }
  if (!boxSelectedItem || isMegaStoneItemId(boxSelectedItem.id)) {
    boxSelectedItem = existingHeldItem ? getCompetitiveItemById(existingHeldItem, boxEditingPokemon) : null;
  }
}

function getMoveMetaHtml(move: Move): string {
  const powerStr = move.power != null ? String(move.power) : "—";
  return `<img class="type-img type-img-sv" src="${typeSvSrc(move.type)}" alt="${escapeHtml(move.type)}" /> <span class="damage-move-slot-name">${escapeHtml(move.name)}</span> <span class="damage-move-slot-meta">${escapeHtml(move.category)}・威力${powerStr}</span>`;
}

function loadTeamFromStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TEAM);
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown;
    // 新フォーマット: { version: 2, teams, names }
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) && "teams" in (parsed as object)) {
      const data = parsed as { teams: unknown[][]; names?: string[] };
      teams = (data.teams as unknown[][])
        .map((t) => {
          const team: TeamMember[] = [];
          for (let i = 0; i < MAX_TEAM_SIZE; i++) {
            const member = normalizeTeamMember(Array.isArray(t) ? t[i] : undefined);
            if (member) team[i] = member;
          }
          return team;
        })
        .filter((team) => team.some(Boolean));
      teamNames = (data.names ?? []).slice(0, teams.length);
      while (teamNames.length < teams.length) teamNames.push(`チーム ${teamNames.length + 1}`);
      return;
    }
    // 旧フォーマット: TeamMember[][] or TeamMember[]
    if (!Array.isArray(parsed)) return;
    if (parsed.length > 0 && Array.isArray(parsed[0])) {
      teams = (parsed as unknown[][])
        .map((t) => {
          const team: TeamMember[] = [];
          for (let i = 0; i < MAX_TEAM_SIZE; i++) {
            const member = normalizeTeamMember(Array.isArray(t) ? t[i] : undefined);
            if (member) team[i] = member;
          }
          return team;
        })
        .filter((team) => team.some(Boolean));
    } else {
      const single = (parsed as unknown[])
        .map(normalizeTeamMember)
        .filter((member): member is TeamMember => member != null)
        .slice(0, MAX_TEAM_SIZE);
      teams = single.length > 0 ? [single] : [];
    }
    teamNames = teams.map((_, i) => `チーム ${i + 1}`);
  } catch {
    teams = [];
    teamNames = [];
  }
}

function saveTeamToStorage(): void {
  try {
    localStorage.setItem(STORAGE_KEY_TEAM, JSON.stringify({ teams, names: teamNames }));
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
  teamNames = [];
  renderTeamList();
}

function updateDetailModalActionButtons(): void {
  const deleteBtn = document.getElementById("box-detail-delete-btn") as HTMLButtonElement | null;
  const saveBtn = document.getElementById("box-detail-save") as HTMLButtonElement | null;
  const editBtn = document.getElementById("box-detail-edit-btn") as HTMLButtonElement | null;
  const addToBoxBtn = document.getElementById("box-detail-add-to-box-btn") as HTMLButtonElement | null;
  if (detailModalContext?.mode === "team") {
    if (deleteBtn) deleteBtn.hidden = true;
    if (saveBtn) saveBtn.textContent = "更新";
    if (editBtn) editBtn.textContent = "編集";
    if (addToBoxBtn) {
      addToBoxBtn.hidden = false;
      addToBoxBtn.disabled = hasAddedCurrentEntryToBox;
      addToBoxBtn.textContent = hasAddedCurrentEntryToBox ? "BOXに追加しました！" : "BOXに追加";
    }
  } else {
    if (deleteBtn) deleteBtn.hidden = false;
    if (saveBtn) saveBtn.textContent = "保存";
    if (editBtn) editBtn.textContent = "編集";
    if (addToBoxBtn) {
      addToBoxBtn.hidden = true;
      addToBoxBtn.disabled = false;
      addToBoxBtn.textContent = "BOXに追加";
    }
  }
}

function updateTeamEditButtonLabel(): void {
  const teamEditBtn = document.getElementById("team-edit-btn") as HTMLButtonElement | null;
  if (teamEditBtn) teamEditBtn.textContent = isEditMode ? "完了" : "編集";
}

function reorderTeamDetailSlots(teamIndex: number, sourceSlotIndex: number, targetSlotIndex: number): void {
  const team = teams[teamIndex];
  if (!team) return;
  if (sourceSlotIndex === targetSlotIndex) return;
  if (sourceSlotIndex < 0 || sourceSlotIndex >= MAX_TEAM_SIZE) return;
  if (targetSlotIndex < 0 || targetSlotIndex >= MAX_TEAM_SIZE) return;
  if (!team[sourceSlotIndex]?.pokemon || !team[targetSlotIndex]?.pokemon) return;

  const slots: Array<TeamMember | null> = Array.from(
    { length: MAX_TEAM_SIZE },
    (_, index) => team[index] ?? null,
  );
  const [moved] = slots.splice(sourceSlotIndex, 1);
  slots.splice(targetSlotIndex, 0, moved);

  for (let i = 0; i < MAX_TEAM_SIZE; i++) {
    const member = slots[i] ?? null;
    if (member) team[i] = member;
    else delete team[i];
  }

  saveTeamToStorage();
  renderTeamList();
  renderTeamDetailModal(teamIndex);
  renderDamageRosterSlots();
}

function renderTeamDetailModal(teamIndex: number): void {
  const grid = document.getElementById("team-detail-grid");
  const title = document.getElementById("team-detail-title");
  if (!grid) return;
  const team = teams[teamIndex];
  if (!team) return;
  const moveMap = new Map(movesData.map((m) => [m.id, m]));
  if (title) {
    const name = teamNames[teamIndex] ?? `チーム ${teamIndex + 1}`;
    title.innerHTML = "";
    const nameSpan = document.createElement("span");
    nameSpan.textContent = name;
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "team-name-edit-btn";
    editBtn.innerHTML = "✎";
    editBtn.setAttribute("aria-label", "チーム名を変更");
    editBtn.addEventListener("click", () => {
      const current = teamNames[teamIndex] ?? `チーム ${teamIndex + 1}`;
      const input = document.createElement("input");
      input.type = "text";
      input.value = current;
      input.className = "team-name-input";
      nameSpan.replaceWith(input);
      editBtn.hidden = true;
      input.focus();
      input.select();
      const save = () => {
        const newName = input.value.trim() || current;
        teamNames[teamIndex] = newName;
        saveTeamToStorage();
        renderTeamList();
        renderTeamDetailModal(teamIndex);
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); save(); }
        if (e.key === "Escape") renderTeamDetailModal(teamIndex);
      });
      input.addEventListener("blur", save);
    });
    title.appendChild(nameSpan);
    title.appendChild(editBtn);
  }
  grid.innerHTML = "";
  for (let i = 0; i < MAX_TEAM_SIZE; i++) {
    const member = team[i];
    const btn = createPokemonDetailCard(member ?? null, moveMap, { asButton: true }) as HTMLButtonElement;
    btn.dataset.slotIndex = String(i);
    if (member?.pokemon) {
      btn.draggable = true;
      btn.addEventListener("dragstart", (e) => {
        dragSourceTeamSlotIndex = i;
        btn.classList.add("is-dragging");
        e.dataTransfer?.setData("text/plain", String(i));
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      });
      btn.addEventListener("dragend", () => {
        dragSourceTeamSlotIndex = -1;
        btn.classList.remove("is-dragging");
        document.querySelectorAll(".team-detail-slot").forEach((slot) => slot.classList.remove("drag-over"));
        suppressTeamDetailSlotClickAfterDrag = true;
        window.setTimeout(() => {
          suppressTeamDetailSlotClickAfterDrag = false;
        }, 100);
      });
      btn.addEventListener("dragover", (e) => {
        if (dragSourceTeamSlotIndex < 0 || dragSourceTeamSlotIndex === i) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        btn.classList.add("drag-over");
      });
      btn.addEventListener("dragleave", () => {
        btn.classList.remove("drag-over");
      });
      btn.addEventListener("drop", (e) => {
        e.preventDefault();
        btn.classList.remove("drag-over");
        if (selectedTeamIndex === null) return;
        const sourceSlotIndex = dragSourceTeamSlotIndex;
        suppressTeamDetailSlotClickAfterDrag = true;
        reorderTeamDetailSlots(selectedTeamIndex, sourceSlotIndex, i);
      });
    }
    grid.appendChild(btn);
  }
}

function openTeamDetailModal(teamIndex: number): void {
  const modal = document.getElementById("team-detail-modal");
  selectedTeamIndex = teamIndex;
  selectedTeamSlotIndex = null;
  teamDetailPendingSlotIndex = null;
  renderTeamDetailModal(teamIndex);
  if (modal) modal.hidden = false;
}

function closeTeamDetailModal(): void {
  const modal = document.getElementById("team-detail-modal");
  if (modal) modal.hidden = true;
  selectedTeamIndex = null;
  selectedTeamSlotIndex = null;
  teamDetailPendingSlotIndex = null;
  dragSourceTeamSlotIndex = -1;
  suppressTeamDetailSlotClickAfterDrag = false;
}

function beginTeamDraftAtSlot(teamIndex: number, slotIndex: number, member: TeamMember): void {
  const team = teams[teamIndex];
  if (!team) return;
  team[slotIndex] = member;
  pendingTeamDraft = { teamIndex, slotIndex };
  selectedTeamIndex = teamIndex;
  selectedTeamSlotIndex = slotIndex;
  teamDetailPendingSlotIndex = slotIndex;
  renderTeamList();
  renderTeamDetailModal(teamIndex);
}

function openTeamEmptySlotSelection(teamIndex: number, slotIndex: number): void {
  selectedTeamIndex = teamIndex;
  selectedTeamSlotIndex = slotIndex;
  teamDetailPendingSlotIndex = slotIndex;
  const teamModal = document.getElementById("team-detail-modal");
  if (teamModal) teamModal.hidden = true;
  shouldReopenTeamDetailOnPickerClose = true;
  openPokemonPicker("team-slot");
}

function renderTeamList(): void {
  const listEl = document.getElementById("team-list");
  if (!listEl) return;
  listEl.innerHTML = "";
  teams.forEach((team, teamIndex) => {
    const card = document.createElement("li");
    card.className = "team-card";
    card.dataset.teamIndex = String(teamIndex);
    const nameEl = document.createElement("div");
    nameEl.className = "team-card-name";
    nameEl.textContent = teamNames[teamIndex] ?? `チーム ${teamIndex + 1}`;
    card.appendChild(nameEl);
    const grid = document.createElement("div");
    grid.className = "team-grid";
    for (let i = 0; i < 6; i++) {
      const slot = document.createElement("div");
      slot.className = "team-slot";
      slot.dataset.teamIndex = String(teamIndex);
      slot.dataset.slotIndex = String(i);
      const member = team[i];
      const pokemon = member?.pokemon;
      if (pokemon) {
        const imgWrap = document.createElement("div");
        imgWrap.className = "team-slot-img-wrap";
        const img = document.createElement("img");
        img.alt = pokemon.name;
        img.className = "team-slot-img";
        img.onerror = () => { img.src = DUMMY_POKEMON_IMAGE; };
        img.src = DUMMY_POKEMON_IMAGE;
        const teamPicSrc = getPokemonImageSrc(pokemon);
        if (teamPicSrc !== DUMMY_POKEMON_IMAGE) img.src = teamPicSrc;
        imgWrap.appendChild(img);
        const heldItemObj = getDisplayHeldItemInfo(member.heldItem, pokemon);
        if (heldItemObj) {
          const itemImg = document.createElement("img");
          itemImg.src = heldItemObj.imageSrc;
          itemImg.alt = heldItemObj.nameJa;
          itemImg.className = "team-list-item-icon";
          itemImg.onerror = () => { itemImg.hidden = true; };
          imgWrap.appendChild(itemImg);
        }
        const name = document.createElement("span");
        name.className = "team-slot-name";
        name.textContent = pokemon.name;
        slot.appendChild(imgWrap);
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
      const deleteBadge = document.createElement("button");
      deleteBadge.type = "button";
      deleteBadge.className = "team-delete-badge";
      deleteBadge.dataset.teamIndex = String(teamIndex);
      deleteBadge.setAttribute("aria-label", "このチームを削除");
      deleteBadge.textContent = "−";
      card.appendChild(deleteBadge);
      card.draggable = true;
      card.addEventListener("dragstart", (e) => {
        dragSourceTeamIndex = teamIndex;
        card.classList.add("is-dragging");
        e.dataTransfer?.setData("text/plain", String(teamIndex));
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("is-dragging");
        document.querySelectorAll(".team-card").forEach((c) => c.classList.remove("drag-over"));
      });
      card.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (dragSourceTeamIndex !== teamIndex) card.classList.add("drag-over");
      });
      card.addEventListener("dragleave", () => {
        card.classList.remove("drag-over");
      });
      card.addEventListener("drop", (e) => {
        e.preventDefault();
        card.classList.remove("drag-over");
        const src = dragSourceTeamIndex;
        const dst = teamIndex;
        if (src === dst || src < 0) return;
        const moved = teams.splice(src, 1)[0];
        const movedName = teamNames.splice(src, 1)[0];
        teams.splice(dst, 0, moved);
        teamNames.splice(dst, 0, movedName);
        saveTeamToStorage();
        renderTeamList();
      });
    }
    listEl.appendChild(card);
  });
  renderDamageRosterSlots();
}

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function getCurrentEditingTeam(): TeamMember[] {
  return editingTeam;
}

/** ダイアログ内の「選んだチーム」プレビューを描画 */
function renderPickerTeamPreview(): void {
  const wrap = document.getElementById("pokemon-picker-team-preview");
  if (!wrap) return;
  const team = getCurrentEditingTeam();
  const activeSlotIndex = Math.min(team.length, MAX_TEAM_SIZE - 1);
  wrap.innerHTML = "";
  for (let i = 0; i < 6; i++) {
    const slot = document.createElement("div");
    slot.className = "pokemon-picker-team-slot";
    const isActiveSlot = i === activeSlotIndex && team.length < MAX_TEAM_SIZE;
    slot.classList.toggle("is-active-slot", isActiveSlot);
    slot.setAttribute("aria-selected", isActiveSlot ? "true" : "false");
    const member = team[i];
    const pokemon = member?.pokemon;
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
      if (isActiveSlot) {
        const name = document.createElement("span");
        name.className = "pokemon-picker-team-slot-name pokemon-picker-team-slot-name--active";
        name.textContent = "選択中";
        slot.appendChild(name);
      }
    }
    wrap.appendChild(slot);
  }
}

/** ダイアログ内のポケモン一覧のボタン有効/無効を更新 */
function updatePickerListButtons(): void {
  const team = getCurrentEditingTeam();
  const isFull = team.length >= MAX_TEAM_SIZE;
  document.querySelectorAll(".pokemon-picker-btn, .pokemon-picker-btn-detail-card").forEach((b) => {
    (b as HTMLButtonElement).disabled = isFull;
  });
}

type TeamPickerEntry =
  | { kind: "pokemon"; pokemon: Pokemon }
  | { kind: "box"; entry: BoxEntry; boxIndex: number };

/** タイプ絞り込み後のポケモン一覧を返す */
function getFilteredPickerEntries(): TeamPickerEntry[] {
  let list: TeamPickerEntry[] = pickerSourceMode === "box"
    ? box.map((entry, boxIndex) => ({ kind: "box", entry, boxIndex }))
    : demoPokemon.map((pokemon) => ({ kind: "pokemon", pokemon }));
  if (pickerRegulationFilter === "M-A") {
    list = list.filter((entry) => (entry.kind === "box" ? entry.entry.pokemon.regulation : entry.pokemon.regulation) === "M-A");
  }
  if (pickerShowOnlyFinalEvolution) {
    list = list.filter((entry) => (entry.kind === "box" ? entry.entry.pokemon.isFinalEvolution : entry.pokemon.isFinalEvolution) !== false);
  }
  if (pickerTypeFilter && pickerTypeFilter !== "すべて") {
    list = list.filter((entry) => (entry.kind === "box" ? entry.entry.pokemon.types : entry.pokemon.types).includes(pickerTypeFilter!));
  }
  if (pickerSortKey === "name") {
    list = [...list].sort((a, b) =>
      (a.kind === "box" ? a.entry.pokemon.name : a.pokemon.name).localeCompare(
        b.kind === "box" ? b.entry.pokemon.name : b.pokemon.name,
        "ja"
      )
    );
  }
  return list;
}

function createTeamMemberFromPickerEntry(entry: TeamPickerEntry): TeamMember {
  return entry.kind === "box"
    ? createTeamMemberFromBoxEntry(entry.entry)
    : createDefaultTeamMember(entry.pokemon);
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
  listEl.classList.toggle("pokemon-picker-list--box-cards", pickerSourceMode === "box");
  const filtered = getFilteredPickerEntries();
  const team = getCurrentEditingTeam();
  const isFull = team.length >= MAX_TEAM_SIZE;
  const moveMap = new Map(movesData.map((m) => [m.id, m]));
  if (pickerSourceMode === "box") {
    filtered.forEach((entry, index) => {
      if (entry.kind === "box") {
        const li = document.createElement("li");
        const card = createPokemonDetailCard(createTeamMemberFromBoxEntry(entry.entry), moveMap, {
          asButton: true,
          extraClassName: "box-pokemon-card pokemon-picker-btn-detail-card",
        }) as HTMLButtonElement;
        card.dataset.pickerIndex = String(index);
        if (isFull && pokemonPickerMode === "create-team") card.disabled = true;
        li.appendChild(card);
        listEl.appendChild(li);
      }
    });
    updatePickerListButtons();
    return;
  }
  filtered.forEach((entry, index) => {
    const pokemon = entry.kind === "box" ? entry.entry.pokemon : entry.pokemon;
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pokemon-picker-btn";
    btn.dataset.pickerIndex = String(index);
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
    if (isFull && pokemonPickerMode === "create-team") btn.disabled = true;
    li.appendChild(btn);
    listEl.appendChild(li);
  });
  updatePickerListButtons();
}

function updatePokemonPickerModeUI(): void {
  const teamWrap = document.querySelector(".pokemon-picker-team-wrap") as HTMLElement | null;
  const confirmBtn = document.getElementById("pokemon-picker-confirm") as HTMLButtonElement | null;
  const title = document.getElementById("pokemon-picker-title");
  if (teamWrap) teamWrap.hidden = pokemonPickerMode !== "create-team";
  if (confirmBtn) confirmBtn.hidden = pokemonPickerMode !== "create-team";
  if (title) {
    if (pokemonPickerMode === "create-team") title.textContent = "ポケモンを選択";
    else if (pokemonPickerMode === "change-pokemon") title.textContent = "ポケモンを変更";
    else title.textContent = "追加するポケモンを選択";
  }
}

function openPokemonPicker(mode: PokemonPickerMode = "create-team"): void {
  const modal = document.getElementById("pokemon-picker-modal");
  const listEl = document.getElementById("pokemon-picker-list");
  if (!modal || !listEl) return;
  pokemonPickerMode = mode;
  pickerTypeFilter = null;
  pickerSourceMode = "all";
  pickerSortKey = "number";
  pickerShowOnlyFinalEvolution = true;
  pickerRegulationFilter = "M-A";
  listEl.innerHTML = "";
  if (pokemonPickerMode === "create-team") {
    renderPickerTeamPreview();
  } else {
    const preview = document.getElementById("pokemon-picker-team-preview");
    if (preview) preview.innerHTML = "";
  }
  updatePokemonPickerModeUI();
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
  if (pokemonPickerMode === "create-team") editingTeam = [];
  editingTeamIndex = -1;
  pokemonPickerMode = "create-team";
  updatePokemonPickerModeUI();
  if (shouldReopenTeamDetailOnPickerClose && selectedTeamIndex !== null) {
    shouldReopenTeamDetailOnPickerClose = false;
    openTeamDetailModal(selectedTeamIndex);
  }
}

/** チーム作成をキャンセル（編集中チームを破棄してモーダルを閉じる） */
function cancelTeamCreation(): void {
  if (pokemonPickerMode === "create-team") editingTeam = [];
  closePokemonPicker();
}

/** ダイアログの作成ボタン押下：編集中チームを teams に追加してモーダルを閉じる */
function confirmTeamCreation(): void {
  teams.push([...editingTeam]);
  teamNames.push(`チーム ${teams.length}`);
  saveTeamToStorage();
  renderTeamList();
  editingTeam = [];
  closePokemonPicker();
}

function moveTeamUp(teamIndex: number): void {
  if (teamIndex <= 0) return;
  [teams[teamIndex - 1], teams[teamIndex]] = [teams[teamIndex], teams[teamIndex - 1]];
  saveTeamToStorage();
  renderTeamList();
}

function moveTeamDown(teamIndex: number): void {
  if (teamIndex >= teams.length - 1) return;
  [teams[teamIndex], teams[teamIndex + 1]] = [teams[teamIndex + 1], teams[teamIndex]];
  saveTeamToStorage();
  renderTeamList();
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
    teamNames.splice(deleteTargetTeamIndex, 1);
    saveTeamToStorage();
    renderTeamList();
  }
  closeDeleteConfirmModal();
  isEditMode = false;
  renderTeamList();
}

function addPokemonToTeam(member: TeamMember): void {
  if (editingTeam.length >= MAX_TEAM_SIZE) return;
  editingTeam.push(member);
  renderPickerTeamPreview();
  updatePickerListButtons();
}

function handlePokemonPicked(member: TeamMember): void {
  if (pokemonPickerMode === "team-slot" && selectedTeamIndex !== null && selectedTeamSlotIndex !== null) {
    const tIdx = selectedTeamIndex;
    beginTeamDraftAtSlot(selectedTeamIndex, selectedTeamSlotIndex, member);
    pendingTeamDraft = null;
    shouldReopenTeamDetailOnPickerClose = false;
    closePokemonPicker();
    openTeamDetailModal(tIdx);
    return;
  }
  if (pokemonPickerMode === "change-pokemon") {
    boxEditingPokemon = member.pokemon;
    const title = document.getElementById("box-detail-title");
    const img = document.getElementById("box-detail-img") as HTMLImageElement | null;
    const typesEl = document.getElementById("box-detail-types");
    if (title) title.textContent = member.pokemon.name;
    if (img) {
      img.src = getPokemonImageSrc(member.pokemon);
      img.onerror = () => { img.src = BALL_MONSTER_IMAGE; };
    }
    if (typesEl) typesEl.innerHTML = typeBadgesSvHtml(member.pokemon.types);
    initBoxEditForm(member.pokemon, teamMemberToBoxEntry(member));
    closePokemonPicker();
    return;
  }
  addPokemonToTeam(member);
}

// ---------- タブ1: アイテムピッカー ----------

function renderTab1ItemDisplay(slot: "attacker" | "defender"): void {
  const isMega = (slot === "attacker" && isMegaPokemonId(attackPokemon?.id))
    || (slot === "defender" && isMegaPokemonId(defendPokemon?.id));
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

function toggleAegislashForm(slot: "attacker" | "defender"): void {
  const currentPokemon = slot === "attacker" ? attackPokemon : defendPokemon;
  const alternateForm = getAegislashAlternateForm(currentPokemon);
  if (!alternateForm) return;
  if (slot === "attacker") attackerState = resetMimikyuDisguiseState({ ...attackerState, pokemon: alternateForm, abilityOverrideType: "" });
  else defenderState = resetMimikyuDisguiseState({ ...defenderState, pokemon: alternateForm, abilityOverrideType: "" });
  syncLegacyStateFromDamageStates();
  syncStatsInputsFromState();
  renderTab1DamageDisplay();
}

function toggleMegaForm(slot: "attacker" | "defender", targetPokemon?: Pokemon): void {
  const currentPokemon = slot === "attacker" ? attackPokemon : defendPokemon;
  const nextPokemon = targetPokemon ?? getMegaToggleTarget(currentPokemon);
  if (!nextPokemon) return;
  const currentState = slot === "attacker" ? attackerState : defenderState;
  const nextAbility = nextPokemon.abilities?.includes(currentState.ability)
    ? currentState.ability
    : (nextPokemon.abilities?.[0] ?? "");
  const nextState = {
    ...currentState,
    pokemon: nextPokemon,
    ability: nextAbility,
    abilityActive: true,
    abilityOverrideType: "",
    disguiseBroken: false,
  };
  if (slot === "attacker") attackerState = nextState;
  else defenderState = nextState;
  closeTab1ItemPicker(slot);
  syncLegacyStateFromDamageStates();
  syncStatsInputsFromState();
  renderTab1DamageDisplay();
}

function appendMimikyuDisguiseButton(slot: "attacker" | "defender", row: HTMLElement, pokemon: Pokemon | null): boolean {
  if (slot !== "defender" || !isMimikyu(pokemon)) return false;
  row.hidden = false;
  const isBroken = defenderState.disguiseBroken;
  const toggle = document.createElement("div");
  toggle.className = "mimikyu-disguise-toggle";
  toggle.setAttribute("role", "group");
  toggle.setAttribute("aria-label", "ばけのかわ追加ダメージ");
  toggle.addEventListener("click", () => {
    defenderState = { ...defenderState, disguiseBroken: !defenderState.disguiseBroken };
    syncLegacyStateFromDamageStates();
    renderTab1DamageDisplay();
  });

  const appendOption = (label: string, brokenValue: boolean): void => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mimikyu-disguise-toggle-btn" + (isBroken === brokenValue ? " is-active" : "");
    btn.textContent = label;
    btn.setAttribute("aria-pressed", isBroken === brokenValue ? "true" : "false");
    toggle.appendChild(btn);
  };

  appendOption("1/8無", false);
  appendOption("1/8込", true);
  row.appendChild(toggle);
  return true;
}

function renderTab1FormChangeRow(slot: "attacker" | "defender"): void {
  const row = document.getElementById(`damage-${slot}-form-change-row`);
  if (!row) return;
  row.onclick = (event) => {
    event.stopPropagation();
  };

  const pokemon = slot === "attacker" ? attackPokemon : defendPokemon;
  const megaToggleTarget = getMegaToggleTarget(pokemon);
  if (pokemon && megaToggleTarget) {
    row.hidden = false;
    row.innerHTML = "";
    const megaButtons = isMegaPokemonId(pokemon.id)
      ? [megaToggleTarget]
      : getMegaFormCandidates(pokemon);
    megaButtons.forEach((target) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = isMegaPokemonId(pokemon.id)
        ? "form-change-btn form-change-btn-mega-revert"
        : "form-change-btn form-change-btn-mega";
      btn.textContent = isMegaPokemonId(pokemon.id)
        ? "メガ解除"
        : `メガシンカ${getMegaFormSuffixLabel(target.id)}`;
      btn.setAttribute("aria-pressed", isMegaPokemonId(pokemon.id) ? "true" : "false");
      btn.addEventListener("click", () => {
        toggleMegaForm(slot, target);
      });
      row.appendChild(btn);
    });
    if (!isAegislashForm(pokemon)) return;
  }
  row.innerHTML = "";
  if (appendMimikyuDisguiseButton(slot, row, pokemon)) return;

  if (!pokemon || !isAegislashForm(pokemon)) {
    row.hidden = true;
    row.innerHTML = "";
    return;
  }

  const alternateForm = getAegislashAlternateForm(pokemon);
  if (!alternateForm) {
    row.hidden = true;
    row.innerHTML = "";
    return;
  }

  row.hidden = false;
  row.innerHTML = "";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "form-change-btn form-change-btn-revert";
  btn.textContent = "フォルムチェンジ";
  btn.addEventListener("click", () => {
    toggleAegislashForm(slot);
  });
  row.appendChild(btn);
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
    if (slot === "attacker") attackerState = { ...attackerState, heldItem: "" };
    else defenderState = { ...defenderState, heldItem: "" };
    syncLegacyStateFromDamageStates();
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
      if (slot === "attacker") attackerState = { ...attackerState, heldItem: item.id };
      else defenderState = { ...defenderState, heldItem: item.id };
      syncLegacyStateFromDamageStates();
      renderTab1ItemDisplay(slot);
      closeTab1ItemPicker(slot);
      renderTab1DamageDisplay();
    });
    gridEl.appendChild(btn);
  });
}

// ---------- タブ1: ダメージ計算 ----------

function swapAttackerDefender(): void {
  closeAbilityTypeDropdowns();
  syncDamageStatesFromLegacyState();
  [attackerState, defenderState] = [defenderState, attackerState];
  attackerState = resetMimikyuDisguiseState(attackerState);
  defenderState = resetMimikyuDisguiseState(defenderState);
  damageRostersSwapped = !damageRostersSwapped;
  syncLegacyStateFromDamageStates();
  editingMoveSlotIndex = null;
  syncStatsInputsFromState();
  renderTab1DamageDisplay();
  return;
  [attackPokemon, defendPokemon] = [defendPokemon, attackPokemon];
  [attackerAbility, defenderAbility] = [defenderAbility, attackerAbility];
  [attackerAbilityActive, defenderAbilityActive] = [defenderAbilityActive, attackerAbilityActive];
  [tab1AttackerItem, tab1DefenderItem] = [tab1DefenderItem, tab1AttackerItem];
  // EVs・性格・ランクはスロットごとに保持（リセットしない）
  syncDamageStatesFromLegacyState();
  [attackerState, defenderState] = [defenderState, attackerState];
  syncLegacyStateFromDamageStates();
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
  const burnToggleBtn = document.getElementById("damage-burn-toggle");
  const typeBoostToggleBtn = document.getElementById("damage-type-boost-toggle");

  if (burnToggleBtn) {
    burnToggleBtn.classList.toggle("is-active", attackerIsBurned);
    burnToggleBtn.setAttribute("aria-pressed", attackerIsBurned ? "true" : "false");
  }
  if (typeBoostToggleBtn) {
    typeBoostToggleBtn.classList.toggle("is-active", attackerTypeBoostActive);
    typeBoostToggleBtn.setAttribute("aria-pressed", attackerTypeBoostActive ? "true" : "false");
  }
  syncDamageConditionButtons();

  if (defenderImg) {
    if (defendPokemon) {
      defenderImg.src = BALL_MONSTER_IMAGE;
      const src = getPokemonImageSrc(defendPokemon);
      if (src !== DUMMY_POKEMON_IMAGE) defenderImg.src = src;
      defenderImg.alt = defendPokemon.name;
      defenderImg.onerror = () => { defenderImg.src = BALL_MONSTER_IMAGE; };
      if (defenderName) renderDamageSlotName(defenderName, defendPokemon);
      if (defenderTypes) defenderTypes.innerHTML = typeBadgesSvHtml(getEffectiveDamageTypes("defender"));
      const defDisplayBtn = document.getElementById("damage-defender-item-display") as HTMLButtonElement | null;
      if (defDisplayBtn) {
        const isMega = isMegaPokemonId(defendPokemon.id);
        defDisplayBtn.disabled = isMega;
        defDisplayBtn.hidden = false;
        if (isMega) {
          closeTab1ItemPicker("defender");
        }
      }
      renderTab1ItemDisplay("defender");
    } else {
      defenderImg.src = BALL_MONSTER_IMAGE;
      defenderImg.alt = "";
      if (defenderName) defenderName.textContent = "";
      const defenderBaseStats = document.getElementById("damage-defender-base-stats");
      if (defenderBaseStats) defenderBaseStats.textContent = "";
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
      if (attackerName) renderDamageSlotName(attackerName, attackPokemon);
      if (attackerTypes) attackerTypes.innerHTML = typeBadgesSvHtml(getEffectiveDamageTypes("attacker"));
      const atkDisplayBtn = document.getElementById("damage-attacker-item-display") as HTMLButtonElement | null;
      if (atkDisplayBtn) {
        const isMega = isMegaPokemonId(attackPokemon.id);
        atkDisplayBtn.disabled = isMega;
        atkDisplayBtn.hidden = false;
        if (isMega) {
          closeTab1ItemPicker("attacker");
        }
      }
      renderTab1ItemDisplay("attacker");
    } else {
      attackerImg.src = BALL_MONSTER_IMAGE;
      attackerImg.alt = "";
      if (attackerName) attackerName.textContent = "";
      const attackerBaseStats = document.getElementById("damage-attacker-base-stats");
      if (attackerBaseStats) attackerBaseStats.textContent = "";
      if (attackerTypes) attackerTypes.innerHTML = "";
      closeTab1ItemPicker("attacker");
    }
  }
  renderTab1FormChangeRow("defender");
  renderTab1FormChangeRow("attacker");
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
  syncDamageNatureToggleButtons();

  updateStatsRealValues();
  updateRankDisplays();
  syncAbilityDropdowns();
  renderDamageRosterSlots();

  renderTab1MovesArea();
}

function syncAbilityDropdowns(): void {
  attackerState = normalizeTypeOverrideForState(attackerState);
  defenderState = normalizeTypeOverrideForState(defenderState);
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
    if (abilities.length === 0) {
      renderAbilityTypeDropdown(key);
      continue;
    }

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
    renderAbilityTypeDropdown(key);
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
  syncLegacyStateFromDamageStates();
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
  syncDamageNatureToggleButtons();
  updateStatsRealValues();
}

function syncDamageNatureToggleButtons(): void {
  document.querySelectorAll<HTMLElement>(".damage-nature-toggle").forEach((wrap) => {
    const selectId = wrap.dataset.natureSelect;
    const select = selectId ? document.getElementById(selectId) as HTMLSelectElement | null : null;
    const selectedValue = select?.value ?? "1.0";
    wrap.querySelectorAll<HTMLButtonElement>(".damage-nature-btn").forEach((btn) => {
      const active = btn.dataset.natureValue === selectedValue;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
      btn.disabled = !!select?.disabled;
    });
  });
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
    const ev = clampDamageTabEv(Number(hpEv?.value) || 0);
    hpReal.textContent = String(calcHpStatWithEV(base.hp, ev));
  } else if (hpReal) hpReal.textContent = "—";

  if (defendPokemon && defReal && defEv && defNat) {
    const base = getBaseStats(defendPokemon);
    const real = calcStatWithEV(base.defense, clampDamageTabEv(Number(defEv.value) || 0), clampNature(Number(defNat.value) || 1));
    defReal.textContent = String(real);
  } else if (defReal) defReal.textContent = "—";

  if (defendPokemon && spDefReal && spDefEv && spDefNat) {
    const base = getBaseStats(defendPokemon);
    const real = calcStatWithEV(base.spDefense, clampDamageTabEv(Number(spDefEv.value) || 0), clampNature(Number(spDefNat.value) || 1));
    spDefReal.textContent = String(real);
  } else if (spDefReal) spDefReal.textContent = "—";

  if (attackPokemon && atkReal && atkEv && atkNat) {
    const base = getBaseStats(attackPokemon);
    const real = calcStatWithEV(base.attack, clampDamageTabEv(Number(atkEv.value) || 0), clampNature(Number(atkNat.value) || 1));
    atkReal.textContent = String(real);
  } else if (atkReal) atkReal.textContent = "—";

  if (attackPokemon && spatkReal && spatkEv && spatkNat) {
    const base = getBaseStats(attackPokemon);
    const real = calcStatWithEV(base.spAttack, clampDamageTabEv(Number(spatkEv.value) || 0), clampNature(Number(spatkNat.value) || 1));
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
  defenderHpEV = clampDamageTabEv(Number(hpEv?.value) || 0);
  defenderDefEV = clampDamageTabEv(Number(defEv?.value) || 0);
  defenderDefNature = clampNature(Number(defNat?.value) || 1);
  defenderSpDefEV = clampDamageTabEv(Number(spDefEv?.value) || 0);
  defenderSpDefNature = clampNature(Number(spDefNat?.value) || 1);
  attackerAtkEV = clampDamageTabEv(Number(atkEv?.value) || 0);
  attackerAtkNature = clampNature(Number(atkNat?.value) || 1);
  attackerSpAtkEV = clampDamageTabEv(Number(spatkEv?.value) || 0);
  attackerSpAtkNature = clampNature(Number(spatkNat?.value) || 1);
  syncDamageStatesFromLegacyState();
}

const DAMAGE_TAB_EV_MAX = 32;
const BOX_EV_PER_STAT_MAX = 32;
const BOX_EV_TOTAL_MAX = 66;

function clampDamageTabEv(v: number): number {
  return Math.max(0, Math.min(DAMAGE_TAB_EV_MAX, Math.floor(v)));
}

function clampBoxEv(v: number): number {
  return Math.max(0, Math.min(BOX_EV_PER_STAT_MAX, Math.floor(v)));
}

function getNextEvStep(v: number, max: number): number {
  return Math.min(max, Math.floor(v) + 1);
}

function getPrevEvStep(v: number): number {
  return Math.max(0, Math.floor(v) - 1);
}

function getCurrentBoxEvTotal(excludeId?: string): number {
  return BOX_EV_LABELS.reduce((sum, { id }) => {
    if (id === excludeId) return sum;
    const input = document.getElementById(id) as HTMLInputElement | null;
    return sum + clampBoxEv(Number(input?.value) || 0);
  }, 0);
}

function normalizeBoxEvInput(input: HTMLInputElement): number {
  const ownValue = clampBoxEv(Number(input.value) || 0);
  const remaining = Math.max(0, BOX_EV_TOTAL_MAX - getCurrentBoxEvTotal(input.id));
  const normalized = Math.min(ownValue, remaining);
  input.value = String(normalized);
  return normalized;
}

function normalizeAllBoxEvInputs(): void {
  let remaining = BOX_EV_TOTAL_MAX;
  BOX_EV_LABELS.forEach(({ id }) => {
    const input = document.getElementById(id) as HTMLInputElement | null;
    if (!input) return;
    const normalized = Math.min(clampBoxEv(Number(input.value) || 0), remaining);
    input.value = String(normalized);
    remaining -= normalized;
  });
}

function clampNature(v: number): number {
  return v === 0.9 || v === 1.1 ? v : 1.0;
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

function getTab1FilteredPokemonList(): Tab1PickerEntry[] {
  let list: Tab1PickerEntry[] = tab1SourceMode === "box"
    ? box.map((entry, boxIndex) => ({ kind: "box", entry, boxIndex }))
    : demoPokemon.map((pokemon) => ({ kind: "pokemon", pokemon }));
  if (tab1RegulationFilter === "M-A") {
    list = list.filter((item) => (item.kind === "box" ? item.entry.pokemon.regulation : item.pokemon.regulation) === "M-A");
  }
  if (tab1ShowOnlyFinalEvolution) {
    list = list.filter((item) => (item.kind === "box" ? item.entry.pokemon.isFinalEvolution : item.pokemon.isFinalEvolution) !== false);
  }
  if (tab1SelectTypeFilter && tab1SelectTypeFilter !== "すべて") {
    list = list.filter((item) => (item.kind === "box" ? item.entry.pokemon.types : item.pokemon.types).includes(tab1SelectTypeFilter!));
  }
  if (tab1NameSearchText.trim()) {
    list = list.filter((item) => {
      const name = item.kind === "box" ? item.entry.pokemon.name : item.pokemon.name;
      return toHiragana(name).includes(toHiragana(tab1NameSearchText.trim()));
    });
  }
  if (tab1SortKey === "number") {
    list = [...list].sort((a, b) => {
      const aPokemon = a.kind === "box" ? a.entry.pokemon : a.pokemon;
      const bPokemon = b.kind === "box" ? b.entry.pokemon : b.pokemon;
      const aKey = getPokemonNumberSortKey(aPokemon);
      const bKey = getPokemonNumberSortKey(bPokemon);
      if (aKey.number !== bKey.number) return aKey.number - bKey.number;
      const idCmp = aKey.id.localeCompare(bKey.id, "ja");
      if (idCmp !== 0) return idCmp;
      const nameCmp = aKey.name.localeCompare(bKey.name, "ja");
      if (nameCmp !== 0) return nameCmp;
      if (a.kind === "box" && b.kind === "box") return a.boxIndex - b.boxIndex;
      return 0;
    });
  } else if (tab1SortKey === "name") {
    list = [...list].sort((a, b) => {
      const aName = a.kind === "box" ? a.entry.pokemon.name : a.pokemon.name;
      const bName = b.kind === "box" ? b.entry.pokemon.name : b.pokemon.name;
      return aName.localeCompare(bName, "ja");
    });
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
  listEl.classList.toggle("pokemon-picker-list--box-cards", tab1SourceMode === "box");
  const filtered = getTab1FilteredPokemonList();
  const moveMap = new Map(movesData.map((m) => [m.id, m]));
  filtered.forEach((item, index) => {
    const li = document.createElement("li");
    if (item.kind === "box") {
      const card = createPokemonDetailCard(createTeamMemberFromBoxEntry(item.entry), moveMap, {
        asButton: true,
        extraClassName: "box-pokemon-card pokemon-picker-btn-detail-card",
      });
      card.dataset.tab1PickerIndex = String(index);
      li.appendChild(card);
    } else {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pokemon-picker-btn";
      btn.dataset.tab1PickerIndex = String(index);
      const img = document.createElement("img");
      img.className = "pokemon-picker-btn-img";
      img.alt = item.pokemon.name;
      img.onerror = () => { img.src = BALL_MONSTER_IMAGE; };
      img.src = BALL_MONSTER_IMAGE;
      const picSrc = getPickerPokemonImageSrc(item.pokemon);
      if (picSrc !== BALL_MONSTER_IMAGE) img.src = picSrc;
      const nameEl = document.createElement("span");
      nameEl.className = "pokemon-picker-btn-name";
      nameEl.textContent = item.pokemon.name;
      btn.appendChild(img);
      btn.appendChild(nameEl);
      li.appendChild(btn);
    }
    listEl.appendChild(li);
  });
}

function openTab1PokemonSelect(target: "attack" | "defend" | "box"): void {
  closeAbilityTypeDropdowns();
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

function applyTab1BoxEntrySelection(target: "attack" | "defend", entry: BoxEntry): void {
  const nextState = createDamageStateFromBoxEntry(entry);
  if (target === "attack") {
    attackerState = nextState;
    editingMoveSlotIndex = null;
    damageMovesTypeFilter = null;
    syncLegacyStateFromDamageStates();
    return;
  }
  defenderState = nextState;
  syncLegacyStateFromDamageStates();
}

function onTab1PokemonSelected(pokemon: Pokemon): void {
  if (tab1SelectTarget === "attack") {
    attackerState = createDamageStateForPokemon(pokemon);
    editingMoveSlotIndex = null;
    damageMovesTypeFilter = null;
  } else if (tab1SelectTarget === "defend") {
    defenderState = createDamageStateForPokemon(pokemon);
  } else if (tab1SelectTarget === "box") {
    closeTab1PokemonSelect();
    openBoxDetailModal(pokemon);
    return;
  }
  syncLegacyStateFromDamageStates();
  syncStatsInputsFromState();
  closeTab1PokemonSelect();
  renderTab1DamageDisplay();
}

/** 攻撃側ポケモンのデフォルト技4つ（②同タイプ・攻撃/特攻で物理/特殊、威力上位4つ） */
function getDefaultMoves(pokemon: Pokemon): number[] {
  const learnset = pokemon.learnset;
  const baseStats = pokemon.baseStats;
  if (!learnset || learnset.length === 0) return [];

  const candidateMoves = learnset
    .map((id) => movesDataById.get(id))
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

function renderDamageSlotName(nameEl: HTMLElement, pokemon: Pokemon | null): void {
  const statsEl = document.getElementById(nameEl.id.replace("-name", "-base-stats"));
  if (!pokemon) {
    nameEl.textContent = "";
    if (statsEl) statsEl.textContent = "";
    return;
  }
  const stats = getBaseStats(pokemon);
  const statsText = [stats.hp, stats.attack, stats.defense, stats.spAttack, stats.spDefense, stats.speed].join(" - ");
  nameEl.innerHTML = `<span class="damage-slot-name-main">${escapeHtml(pokemon.name)}</span>`;
  if (statsEl) statsEl.textContent = statsText;
}

function formatDamageResultText(result: DamageResult): string {
  return result.damageMin === result.damageMax
    ? `${result.damageMin}（${result.percentMin.toFixed(1)}%）`
    : `${result.damageMin}〜${result.damageMax}（${result.percentMin.toFixed(1)}〜${result.percentMax.toFixed(1)}%）`;
}

function formatKoBadgeHtml(result: DamageResult): string {
  const koCount = Math.round(result.koChance / 100 * 16);
  const koStr =
    result.koChance === 100 ? "確定" :
    result.koChance === 0   ? "" :
    `乱${koCount}/16`;
  const koBadgeClass = koCount === 16 ? "" : koCount >= 8 ? " damage-ko-badge--orange" : " damage-ko-badge--yellow";
  return koStr ? `<span class="damage-ko-badge${koBadgeClass}">${koStr}</span>` : "";
}

function createDamageGauge(result: DamageResult, options: { critical?: boolean; label?: string } = {}): HTMLDivElement {
  const gaugeWrap = document.createElement("div");
  gaugeWrap.className = "damage-move-result-row" + (options.critical ? " damage-move-result-row--critical" : "");
  const remainMinPct = (result.remainingHPMin / result.defenderHP) * 100;
  const remainMaxPct = (result.remainingHPMax / result.defenderHP) * 100;
  const colorFor = (pct: number) => (pct > 75 ? "is-red" : pct > 50 ? "is-yellow" : "is-green");
  const colorMin = colorFor(result.percentMin);
  const colorMax = colorFor(result.percentMax);
  const ariaLabel = options.critical ? "急所時の攻撃後の残りHP目安" : "攻撃後の残りHP目安";
  const label = options.label ?? (options.critical ? "急所" : "通常");
  gaugeWrap.innerHTML = `
    <span class="damage-move-result-text"><span class="damage-move-result-label">${label}</span><span class="damage-move-damage-text">${formatDamageResultText(result)}</span>${formatKoBadgeHtml(result)}</span>
    <div class="damage-move-gauge${options.critical ? " damage-move-gauge--critical" : ""}" role="presentation" aria-label="${ariaLabel}">
      <div class="damage-move-gauge-fill damage-move-gauge-fill-min ${colorMin}" style="width: ${Math.min(100, remainMaxPct)}%"></div>
      <div class="damage-move-gauge-fill damage-move-gauge-fill-max ${colorMax}" style="width: ${Math.min(100, remainMinPct)}%"></div>
    </div>
  `;
  return gaugeWrap;
}

function renderTab1MovesSlots(): void {
  const slotsEl = document.getElementById("damage-moves-slots");
  if (!slotsEl || !attackPokemon) return;

  slotsEl.innerHTML = "";
  const attackerStats = getBaseStats(attackPokemon);
  const defenderStats = defendPokemon ? getBaseStats(defendPokemon) : null;

  for (let i = 0; i < 4; i++) {
    const moveId = selectedMoves[i];
    const move = moveId != null ? movesDataById.get(moveId) : null;

    const slot = document.createElement("div");
    slot.className =
      "damage-move-slot" + (editingMoveSlotIndex === i ? " is-editing" : "");
    slot.dataset.slotIndex = String(i);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "damage-move-slot-btn";
    btn.addEventListener("click", () => {
      editingMoveSlotIndex = editingMoveSlotIndex === i ? null : i;
      renderTab1MovesArea();
    });

    if (move) {
      btn.innerHTML = "";
      const header = document.createElement("div");
      header.className = "damage-move-slot-header";
      const resolvedPowerForDisplay = resolveMovePower(move, defendPokemon);
      const powerStr = move.power != null
        ? String(move.power)
        : resolvedPowerForDisplay != null
          ? String(resolvedPowerForDisplay)
          : "—";
      header.innerHTML = `<img class="type-img type-img-sv damage-move-slot-type-img" src="${typeSvSrc(move.type)}" alt="${escapeHtml(move.type)}" /><span class="damage-move-slot-name">${escapeHtml(move.name)}</span><span class="damage-move-slot-meta">${escapeHtml(move.category)}</span><span class="damage-move-slot-meta">威力${powerStr}</span>`;
      btn.appendChild(header);

      let damageResult: MoveDamageResult | null = null;
      if (defendPokemon && defenderStats) {
        damageResult = calculateMoveDamageResult(move, attackerStats, defenderStats);
      }

      const body = document.createElement("div");
      body.className = "damage-move-slot-body";
      if (damageResult) {
        if (damageResult.isUnsupportedMove) {
          body.innerHTML = `<span class="damage-move-damage-text">${escapeHtml(damageResult.unsupportedReason ?? "この技は未対応です")}</span>`;
        } else if (damageResult.isStatusMove) {
          body.innerHTML = '<span class="damage-move-damage-text">—（変化技）</span>';
        } else if (damageResult.isImmune) {
          body.innerHTML = '<span class="damage-move-damage-text">効果がない</span>';
        } else {
          body.innerHTML = "";
          body.appendChild(createDamageGauge(damageResult, { label: "通常" }));
          if (damageResult.criticalResult && !damageResult.criticalResult.isStatusMove && !damageResult.criticalResult.isImmune) {
            body.appendChild(createDamageGauge(damageResult.criticalResult, { critical: true, label: "急所" }));
          }
        }
      } else {
        body.innerHTML = '<span class="damage-move-damage-text">防御側を選択するとダメージを表示</span>';
      }
      btn.appendChild(body);
    } else {
      btn.textContent = "—（クリックで技を選択）";
    }

    slot.appendChild(btn);
    if (move?.name === "トリプルアクセル") {
      slot.appendChild(createTripleAxelControl());
    }
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

  let moves = learnset
    .map((id) => movesDataById.get(id))
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
    btn.innerHTML = `<img class="type-img" src="${typeSvSrc(move.type)}" alt="${escapeHtml(move.type)}" /> ${escapeHtml(move.name)}（${escapeHtml(move.category)}・威力${powerStr}）`;
    btn.dataset.moveId = String(move.id);
    btn.addEventListener("click", () => {
      if (editingMoveSlotIndex !== null) {
        selectedMoves[editingMoveSlotIndex] = move.id;
        editingMoveSlotIndex = null;
        syncDamageStatesFromLegacyState();
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
  const activeBtn = Array.from(buttons).find((btn) => btn.classList.contains("is-active"));
  activeMainTabId = activeBtn?.getAttribute("data-tab") ?? "tab1";

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabId = btn.getAttribute("data-tab");
      if (!tabId) return;
      activeMainTabId = tabId;

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
  updateAppScale();
  window.addEventListener("resize", () => {
    updateAppScale();
    updateBattleLayoutEditorBoxes();
  });

  initTabs();
  initBattleLayoutEditor();

  // チーム編成（タブ2）
  const teamCreateBtn = document.getElementById("team-create-btn");
  const teamEditBtn = document.getElementById("team-edit-btn");
  const teamListEl = document.getElementById("team-list");
  const pokemonPickerModal = document.getElementById("pokemon-picker-modal");
  const pokemonPickerList = document.getElementById("pokemon-picker-list");
  const pokemonPickerConfirm = document.getElementById("pokemon-picker-confirm");
  const boxSortSelect = document.getElementById("box-sort-select") as HTMLSelectElement | null;
  const pokemonPickerCancel = document.getElementById("pokemon-picker-cancel");
  const teamDeleteConfirmModal = document.getElementById("team-delete-confirm-modal");
  const teamDeleteConfirmOk = document.getElementById("team-delete-confirm-ok");
  const teamDeleteConfirmCancel = document.getElementById("team-delete-confirm-cancel");
  loadTeamFromStorage();
  loadBoxFromStorage();
  if (boxSortSelect) boxSortSelect.value = boxSortMode;
  renderTeamList();
  updateTeamEditButtonLabel();
  renderTab1DamageDisplay();

  fetch("data/moves.json")
    .then((res) => (res.ok ? res.json() : []))
    .then((data: Move[]) => {
      movesData = Array.isArray(data) ? data : [];
      rebuildMovesDataIndex();
      renderTab1DamageDisplay();
    })
    .catch(() => {
      movesData = [];
      rebuildMovesDataIndex();
      renderTab1DamageDisplay();
    });

  fetch("data/abilities.json")
    .then((res) => (res.ok ? res.json() : []))
    .then((data: AbilityDef[]) => {
      abilitiesData = Array.isArray(data) ? data : [];
      renderTab1DamageDisplay();
    })
    .catch(() => {
      abilitiesData = [];
      renderTab1DamageDisplay();
    });

  fetch("data/item.json")
    .then((res) => (res.ok ? res.json() : []))
    .then((data: CompetitiveItem[]) => {
      maItems = Array.isArray(data) ? data : [];
      renderTeamList();
      if (selectedTeamIndex !== null) renderTeamDetailModal(selectedTeamIndex);
    })
    .catch(() => {
      maItems = [];
      renderTeamList();
      if (selectedTeamIndex !== null) renderTeamDetailModal(selectedTeamIndex);
    });

  document.getElementById("damage-attacker-ability-select")?.addEventListener("change", (e) => {
    attackerAbility = (e.target as HTMLSelectElement).value;
    attackerAbilityActive = true;
    syncDamageStatesFromLegacyState();
    attackerState = normalizeTypeOverrideForState(attackerState);
    closeAbilityTypeDropdowns();
    renderTab1DamageDisplay();
  });
  document.getElementById("damage-defender-ability-select")?.addEventListener("change", (e) => {
    defenderAbility = (e.target as HTMLSelectElement).value;
    defenderAbilityActive = true;
    syncDamageStatesFromLegacyState();
    defenderState = normalizeTypeOverrideForState(defenderState);
    closeAbilityTypeDropdowns();
    renderTab1DamageDisplay();
  });
  document.getElementById("damage-attacker-ability-toggle")?.addEventListener("click", () => {
    attackerAbilityActive = !attackerAbilityActive;
    syncDamageStatesFromLegacyState();
    renderTab1DamageDisplay();
  });
  document.getElementById("damage-defender-ability-toggle")?.addEventListener("click", () => {
    defenderAbilityActive = !defenderAbilityActive;
    syncDamageStatesFromLegacyState();
    renderTab1DamageDisplay();
  });
  document.addEventListener("click", closeAbilityTypeDropdowns);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAbilityTypeDropdowns();
  });

  document.getElementById("damage-defender-select")?.addEventListener("click", () => openTab1PokemonSelect("defend"));
  document.getElementById("damage-attacker-select")?.addEventListener("click", () => openTab1PokemonSelect("attack"));
  document.querySelector(".damage-slot-defender .damage-slot-img-wrap")?.addEventListener("click", () => openTab1PokemonSelect("defend"));
  document.querySelector(".damage-slot-attacker .damage-slot-img-wrap")?.addEventListener("click", () => openTab1PokemonSelect("attack"));
  document.getElementById("damage-swap-btn")?.addEventListener("click", swapAttackerDefender);
  document.getElementById("damage-defender-roster")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".damage-roster-slot");
    if (!btn || btn.disabled) return;
    const slotIndex = parseInt(btn.dataset.slotIndex ?? "", 10);
    if (!Number.isNaN(slotIndex)) applyDamageRosterSlot("defender", slotIndex);
  });
  document.getElementById("damage-attacker-roster")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".damage-roster-slot");
    if (!btn || btn.disabled) return;
    const slotIndex = parseInt(btn.dataset.slotIndex ?? "", 10);
    if (!Number.isNaN(slotIndex)) applyDamageRosterSlot("attacker", slotIndex);
  });
  document.getElementById("damage-attacker-team-select")?.addEventListener("change", (e) => {
    const next = parseInt((e.target as HTMLSelectElement).value, 10);
    selectedDamageTeamIndex = Number.isNaN(next) ? 0 : next;
    renderDamageRosterSlots();
  });
  document.getElementById("damage-defender-team-select")?.addEventListener("change", (e) => {
    const next = parseInt((e.target as HTMLSelectElement).value, 10);
    selectedDamageTeamIndex = Number.isNaN(next) ? 0 : next;
    renderDamageRosterSlots();
  });
  // インラインステータス: EVボタン・ステップボタンの委譲処理
  const damagePanel = document.querySelector(".damage-panel");
  damagePanel?.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest("button");
    if (!target) return;
    if (target.classList.contains("damage-nature-btn")) {
      const wrap = target.closest<HTMLElement>(".damage-nature-toggle");
      const selectId = wrap?.dataset.natureSelect;
      const select = selectId ? document.getElementById(selectId) as HTMLSelectElement | null : null;
      const nextValue = target.dataset.natureValue;
      if (!select || !nextValue) return;
      e.preventDefault();
      select.value = nextValue;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      syncDamageNatureToggleButtons();
      return;
    }
    const inputId = target.dataset.evInput;
    if (inputId) {
      const input = document.getElementById(inputId) as HTMLInputElement | null;
      if (!input) return;
      const val = clampDamageTabEv(Number(input.value) || 0);
      if (target.classList.contains("damage-ev-btn-0")) {
        input.value = "0";
      } else if (target.classList.contains("damage-ev-btn-252")) {
        input.value = String(DAMAGE_TAB_EV_MAX);
      } else if (target.classList.contains("damage-ev-step-up")) {
        input.value = String(getNextEvStep(val, DAMAGE_TAB_EV_MAX));
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
    syncDamageStatesFromLegacyState();
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
      if (v > DAMAGE_TAB_EV_MAX) v = DAMAGE_TAB_EV_MAX;
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
  document.getElementById("damage-weather-section")?.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-weather], [data-terrain], [data-wall]");
    if (!target) return;
    if (target.dataset.weather !== undefined) currentWeather = target.dataset.weather;
    if (target.dataset.terrain !== undefined) currentTerrain = target.dataset.terrain;
    if (target.dataset.wall !== undefined) currentWall = target.dataset.wall;
    syncDamageConditionButtons();
    renderTab1MovesSlots();
  });
  // タブ3: BOX
  document.getElementById("box-create-btn")?.addEventListener("click", openBoxCreate);
  boxSortSelect?.addEventListener("change", () => {
    boxSortMode = boxSortSelect.value === "number" ? "number" : "created";
    renderBoxGrid();
  });
  document.getElementById("box-detail-img")?.addEventListener("click", () => {
    if (!boxEditingPokemon) return;
    const editEl = document.getElementById("box-detail-edit");
    if (editEl?.hidden) return;
    openPokemonPicker("change-pokemon");
  });
  document.getElementById("box-nature-btn")?.addEventListener("click", () => {
    const wrap = document.getElementById("box-nature-grid-wrap");
    if (!wrap) return;
    if (wrap.hidden) {
      renderNatureGrid();
      wrap.hidden = false;
    } else {
      wrap.hidden = true;
    }
  });
  document.getElementById("box-detail-cancel")?.addEventListener("click", closeBoxDetailModal);
  document.getElementById("box-detail-save")?.addEventListener("click", saveBoxEntry);
  document.getElementById("box-detail-add-to-box-btn")?.addEventListener("click", addCurrentEntryToBox);
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
    const val = clampBoxEv(Number(input.value) || 0);
    if (target.classList.contains("damage-ev-btn-0")) input.value = "0";
    else if (target.classList.contains("damage-ev-btn-252")) input.value = String(BOX_EV_PER_STAT_MAX);
    else if (target.classList.contains("damage-ev-step-up")) input.value = String(getNextEvStep(val, BOX_EV_PER_STAT_MAX));
    else if (target.classList.contains("damage-ev-step-down")) input.value = String(getPrevEvStep(val));
    normalizeBoxEvInput(input);
    if (boxEditingPokemon) updateBoxEditRealStats(boxEditingPokemon);
  });
  document.getElementById("damage-burn-toggle")?.addEventListener("click", () => {
    attackerIsBurned = !attackerIsBurned;
    syncDamageStatesFromLegacyState();
    renderTab1DamageDisplay();
  });
  document.getElementById("damage-type-boost-toggle")?.addEventListener("click", () => {
    attackerTypeBoostActive = !attackerTypeBoostActive;
    renderTab1DamageDisplay();
  });
  document.getElementById("tab1-pokemon-select-list")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>(".pokemon-picker-btn, .pokemon-picker-btn-detail-card");
    if (!btn) return;
    const index = parseInt(btn.dataset.tab1PickerIndex ?? "", 10);
    const entry = Number.isNaN(index) ? null : getTab1FilteredPokemonList()[index];
    if (!entry) return;
    if (entry.kind === "box" && tab1SelectTarget && tab1SelectTarget !== "box") {
      applyTab1BoxEntrySelection(tab1SelectTarget, entry.entry);
      syncStatsInputsFromState();
      closeTab1PokemonSelect();
      renderTab1DamageDisplay();
      return;
    }
    onTab1PokemonSelected(entry.kind === "box" ? entry.entry.pokemon : entry.pokemon);
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
    installPlayerSelectionTestHelper();
    renderDamageRosterSlots();
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
    updateTeamEditButtonLabel();
    renderTeamList();
  });
  const teamResetStorageBtn = document.getElementById("team-reset-storage-btn");
  teamResetStorageBtn?.addEventListener("click", () => {
    if (!confirm("保存したチームとデバイス選択をすべて削除して初期化します。よろしいですか？")) return;
    clearLocalStorageAndResetTeams();
  });
  teamListEl?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const deleteBadge = target.closest(".team-delete-badge");
    if (deleteBadge) {
      const index = parseInt((deleteBadge as HTMLElement).dataset.teamIndex ?? "", 10);
      if (!Number.isNaN(index)) openDeleteConfirmModal(index);
      return;
    }
    if (isEditMode) return;
    const card = target.closest(".team-card");
    if (!card) return;
    const teamIndex = parseInt((card as HTMLElement).dataset.teamIndex ?? "", 10);
    if (!Number.isNaN(teamIndex)) openTeamDetailModal(teamIndex);
  });
  pokemonPickerConfirm?.addEventListener("click", () => confirmTeamCreation());
  pokemonPickerCancel?.addEventListener("click", () => cancelTeamCreation());
  pokemonPickerModal?.querySelector(".pokemon-modal-backdrop")?.addEventListener("click", () => cancelTeamCreation());
  pokemonPickerList?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest(".pokemon-picker-btn, .pokemon-picker-btn-detail-card");
    if (!btn || (btn as HTMLButtonElement).disabled) return;
    const index = parseInt((btn as HTMLElement).dataset.pickerIndex ?? "", 10);
    const filtered = getFilteredPickerEntries();
    const entry = Number.isNaN(index) ? null : filtered[index];
    if (!entry) return;
    const member = createTeamMemberFromPickerEntry(entry);
    handlePokemonPicked(member);
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
  document.getElementById("team-detail-close")?.addEventListener("click", () => closeTeamDetailModal());
  document.getElementById("team-detail-modal")?.querySelector(".pokemon-modal-backdrop")?.addEventListener("click", () => closeTeamDetailModal());
  document.getElementById("team-detail-grid")?.addEventListener("click", (e) => {
    if (suppressTeamDetailSlotClickAfterDrag) {
      suppressTeamDetailSlotClickAfterDrag = false;
      return;
    }
    const slot = (e.target as HTMLElement).closest(".team-detail-slot");
    if (!slot || selectedTeamIndex === null) return;
    const slotIndex = parseInt((slot as HTMLElement).dataset.slotIndex ?? "", 10);
    if (Number.isNaN(slotIndex)) return;
    const team = teams[selectedTeamIndex];
    if (!team) return;
    if (team[slotIndex]?.pokemon) {
      openTeamMemberDetailView(selectedTeamIndex, slotIndex, true);
      return;
    }
    openTeamEmptySlotSelection(selectedTeamIndex, slotIndex);
  });

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
