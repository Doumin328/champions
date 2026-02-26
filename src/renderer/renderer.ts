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
  /** ステータス調整時: 攻撃側の実数値オーバーライド */
  attackerStatOverride?: { attack?: number; spAttack?: number };
  /** ステータス調整時: 防御側の実数値オーバーライド */
  defenderStatOverride?: { defense?: number; spDefense?: number };
}): DamageResult {
  const { movePower, moveType, moveCategory, attackerTypes, attackerBaseStats, defenderTypes, defenderBaseStats, attackerStatOverride, defenderStatOverride } = input;
  const defenderHP = calcStat(defenderBaseStats.hp, true);
  if (moveCategory === "変化" || movePower == null || movePower <= 0) {
    return { damageMin: 0, damageMax: 0, percentMin: 0, percentMax: 0, defenderHP, remainingHPMin: defenderHP, remainingHPMax: defenderHP, isStatusMove: true, isImmune: false };
  }
  const typeEff = getTypeEff(moveType, defenderTypes);
  if (typeEff === 0) {
    return { damageMin: 0, damageMax: 0, percentMin: 0, percentMax: 0, defenderHP, remainingHPMin: defenderHP, remainingHPMax: defenderHP, isStatusMove: false, isImmune: true };
  }
  const stab = attackerTypes.includes(moveType) ? 1.5 : 1;
  const atkStat = moveCategory === "物理"
    ? (attackerStatOverride?.attack ?? calcStat(attackerBaseStats.attack, false))
    : (attackerStatOverride?.spAttack ?? calcStat(attackerBaseStats.spAttack, false));
  const defStat = moveCategory === "物理"
    ? (defenderStatOverride?.defense ?? calcStat(defenderBaseStats.defense, false))
    : (defenderStatOverride?.spDefense ?? calcStat(defenderBaseStats.spDefense, false));
  const base = Math.floor((Math.floor((2 * DMG_LEVEL) / 5 + 2) * movePower * atkStat) / defStat / 50) + 2;
  const modifier = stab * typeEff;
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

/** ポケモン画像のパス（img/pokemon/ 配下の {id}.png に統一。id がなければ DUMMY） */
function getPokemonImageSrc(pokemon: Pokemon): string {
  return pokemon.id ? `img/pokemon/${pokemon.id}.png` : DUMMY_POKEMON_IMAGE;
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

/** タブ1: 単体選択モーダルで選択対象（'attack' | 'defend'） */
let tab1SelectTarget: "attack" | "defend" | null = null;

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

/** タブ1: ステータス調整エリアの表示状態 */
let statsAdjustmentVisible = false;

/** タブ1: ステータス調整を一度でも決定したか（保存済みならダメージ計算に反映） */
let hasStatsAdjustmentSaved = false;

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
    btn.textContent = typeName;
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
  return pokemon.id ? `img/pokemon/${pokemon.id}.png` : BALL_MONSTER_IMAGE;
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
      if (defenderTypes) defenderTypes.textContent = defendPokemon.types.join("・");
    } else {
      defenderImg.src = BALL_MONSTER_IMAGE;
      defenderImg.alt = "";
      if (defenderName) defenderName.textContent = "";
      if (defenderTypes) defenderTypes.textContent = "";
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
      if (attackerTypes) attackerTypes.textContent = attackPokemon.types.join("・");
    } else {
      attackerImg.src = BALL_MONSTER_IMAGE;
      attackerImg.alt = "";
      if (attackerName) attackerName.textContent = "";
      if (attackerTypes) attackerTypes.textContent = "";
    }
  }
  const defenderStatsBtn = document.getElementById("damage-defender-stats-btn") as HTMLButtonElement | null;
  const attackerStatsBtn = document.getElementById("damage-attacker-stats-btn") as HTMLButtonElement | null;
  if (defenderStatsBtn) defenderStatsBtn.disabled = !defendPokemon;
  if (attackerStatsBtn) attackerStatsBtn.disabled = !attackPokemon;

  const statsSection = document.getElementById("damage-stats-adjust-section");
  if (statsSection) statsSection.hidden = !statsAdjustmentVisible;

  const defenderBlock = document.getElementById("damage-stats-defender-block");
  const attackerBlock = document.getElementById("damage-stats-attacker-block");
  if (defenderBlock) {
    defenderBlock.querySelectorAll("input, select, button").forEach((el) => {
      (el as HTMLInputElement).disabled = !defendPokemon;
    });
  }
  if (attackerBlock) {
    attackerBlock.querySelectorAll("input, select, button").forEach((el) => {
      (el as HTMLInputElement).disabled = !attackPokemon;
    });
  }

  if (statsAdjustmentVisible) {
    updateStatsRealValues();
  }

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

function openStatsAdjustment(): void {
  statsAdjustmentVisible = true;
  syncStatsInputsFromState();
  renderTab1DamageDisplay();
}

function applyStatsFromInputsAndRecalc(): void {
  readStatsInputsToState();
  renderTab1DamageDisplay();
}

function confirmStatsAndClose(): void {
  readStatsInputsToState();
  hasStatsAdjustmentSaved = true;
  statsAdjustmentVisible = false;
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
    btn.textContent = typeName;
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

function openTab1PokemonSelect(target: "attack" | "defend"): void {
  tab1SelectTarget = target;
  tab1SelectTypeFilter = null;
  const modal = document.getElementById("tab1-pokemon-select-modal");
  const titleEl = document.getElementById("tab1-pokemon-select-title");
  if (titleEl) titleEl.textContent = target === "attack" ? "攻撃側のポケモンを選択" : "防御側のポケモンを選択";
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
  } else if (tab1SelectTarget === "defend") {
    defendPokemon = pokemon;
    defenderDefEV = 0;
    defenderDefNature = 1.0;
    defenderSpDefEV = 0;
    defenderSpDefNature = 1.0;
  }
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
      header.innerHTML = `<span class="damage-move-slot-name">${escapeHtml(move.name)}</span> <span class="damage-move-slot-meta">${escapeHtml(move.type)}・${escapeHtml(move.category)}・威力${powerStr}</span>`;
      btn.appendChild(header);

      let damageResult: DamageResult | null = null;
      if (defendPokemon && defenderStats) {
        const useStatsOverride = statsAdjustmentVisible || hasStatsAdjustmentSaved;
        const atkOverride = useStatsOverride
          ? { attack: calcStatWithEV(attackerStats.attack, attackerAtkEV, attackerAtkNature), spAttack: calcStatWithEV(attackerStats.spAttack, attackerSpAtkEV, attackerSpAtkNature) }
          : undefined;
        const defOverride = useStatsOverride
          ? { defense: calcStatWithEV(defenderStats.defense, defenderDefEV, defenderDefNature), spDefense: calcStatWithEV(defenderStats.spDefense, defenderSpDefEV, defenderSpDefNature) }
          : undefined;
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
  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "damage-move-type-btn" + (!damageMovesTypeFilter || damageMovesTypeFilter === "すべて" ? " is-active" : "");
  allBtn.textContent = "すべて";
  allBtn.dataset.typeFilter = "すべて";
  allBtn.addEventListener("click", () => {
    damageMovesTypeFilter = null;
    renderTab1MovesListTypeButtons();
    renderTab1MovesList();
  });
  wrap.appendChild(allBtn);
  getTab1MovesUniqueTypes().forEach((typeName) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "damage-move-type-btn" + (damageMovesTypeFilter === typeName ? " is-active" : "");
    btn.textContent = typeName;
    btn.dataset.typeFilter = typeName;
    btn.addEventListener("click", () => {
      damageMovesTypeFilter = typeName;
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

  if (damageMovesTypeFilter && damageMovesTypeFilter !== "すべて") {
    moves = moves.filter((m) => m.type === damageMovesTypeFilter);
  }
  if (damageMovesCategoryFilter) {
    moves = moves.filter((m) => m.category === damageMovesCategoryFilter);
  }

  moves.forEach((move) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "damage-move-btn";
    const powerStr = move.power != null ? String(move.power) : "—";
    btn.textContent = `${move.name}（${move.type}・${move.category}・威力${powerStr}）`;
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
  document.getElementById("damage-defender-stats-btn")?.addEventListener("click", () => openStatsAdjustment());
  document.getElementById("damage-attacker-stats-btn")?.addEventListener("click", () => openStatsAdjustment());
  document.getElementById("damage-stats-calc-btn")?.addEventListener("click", () => applyStatsFromInputsAndRecalc());
  document.getElementById("damage-stats-confirm-btn")?.addEventListener("click", () => confirmStatsAndClose());

  const statsSection = document.getElementById("damage-stats-adjust-section");
  statsSection?.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest("button");
    if (!target) return;
    const inputId = target.dataset.evInput;
    if (!inputId) return;
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
  });

  statsSection?.addEventListener("input", (e) => {
    const el = e.target as HTMLElement;
    if (el.classList.contains("damage-ev-input") || el.matches("select[id^='stats-']")) {
      updateStatsRealValues();
    }
  });
  statsSection?.addEventListener("change", (e) => {
    const el = e.target as HTMLElement;
    if (el.classList.contains("damage-ev-input") || el.matches("select[id^='stats-']")) {
      updateStatsRealValues();
    }
  });

  document.querySelectorAll(".damage-ev-input").forEach((input) => {
    input.addEventListener("input", () => {
      const el = input as HTMLInputElement;
      let v = Number(el.value);
      if (Number.isNaN(v) || v < 0) v = 0;
      if (v > 255) v = 255;
      el.value = String(Math.floor(v));
    });
    input.addEventListener("change", () => {
      const el = input as HTMLInputElement;
      let v = Number(el.value);
      if (Number.isNaN(v) || v < 0) v = 0;
      if (v > 255) v = 255;
      el.value = String(Math.floor(v));
    });
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
