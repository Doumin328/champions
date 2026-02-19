// レンダラープロセス用: 映像ソースをプルダウンで選択して表示

/** ポケモン情報（data/pokemon.json と同期） */
interface Pokemon {
  id: string;
  name: string;
  types: string[];
}

/** デモポケモン一覧（起動時に data/pokemon.json から読み込み） */
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

/** 空きマス用ダミー画像 */
const DUMMY_EMPTY_IMAGE =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">' +
      '<rect width="80" height="80" rx="8" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2" stroke-dasharray="4"/>' +
      "</svg>"
  );

const videoEl = document.getElementById("video") as HTMLVideoElement;
const deviceSelect = document.getElementById("device-select") as HTMLSelectElement;
const audioSelect = document.getElementById("audio-select") as HTMLSelectElement;
const refreshBtn = document.getElementById("refresh-devices");
const volumeSlider = document.getElementById("volume-slider") as HTMLInputElement;
const statusEl = document.getElementById("video-status");

let currentStream: MediaStream | null = null;

/** 複数チーム（各チームは最大6匹） */
let teams: Pokemon[][] = [];

/** 編集中のチームのインデックス（ピッカーで追加する先） */
let editingTeamIndex: number = -1;

/** チーム一覧の編集モード（true のとき各チームに削除ボタン表示） */
let isEditMode: boolean = false;

/** 削除確認モーダルで削除対象のチームインデックス */
let deleteTargetTeamIndex: number = -1;

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
        img.src = DUMMY_POKEMON_IMAGE;
        img.alt = "";
        img.className = "team-slot-img";
        const name = document.createElement("span");
        name.className = "team-slot-name";
        name.textContent = pokemon.name;
        slot.appendChild(img);
        slot.appendChild(name);
      } else {
        const img = document.createElement("img");
        img.src = DUMMY_EMPTY_IMAGE;
        img.alt = "";
        img.className = "team-slot-img team-slot-img--empty";
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

function openPokemonPicker(): void {
  const modal = document.getElementById("pokemon-picker-modal");
  const listEl = document.getElementById("pokemon-picker-list");
  if (!modal || !listEl) return;
  listEl.innerHTML = "";
  if (demoPokemon.length === 0) {
    const li = document.createElement("li");
    li.textContent = "読み込み中…";
    li.style.color = "rgba(255,255,255,0.6)";
    li.style.padding = "1rem";
    listEl.appendChild(li);
    modal.hidden = false;
    return;
  }
  const currentTeam = editingTeamIndex >= 0 && editingTeamIndex < teams.length ? teams[editingTeamIndex] : [];
  const isFull = currentTeam.length >= MAX_TEAM_SIZE;
  demoPokemon.forEach((pokemon) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pokemon-picker-btn";
    btn.dataset.pokemonId = pokemon.id;
    btn.textContent = pokemon.name;
    if (pokemon.types.length > 0) {
      const typesSpan = document.createElement("span");
      typesSpan.className = "pokemon-types";
      typesSpan.textContent = `（${pokemon.types.join("・")}）`;
      btn.appendChild(typesSpan);
    }
    if (isFull) btn.disabled = true;
    li.appendChild(btn);
    listEl.appendChild(li);
  });
  modal.hidden = false;
}

function closePokemonPicker(): void {
  const modal = document.getElementById("pokemon-picker-modal");
  if (modal) modal.hidden = true;
  editingTeamIndex = -1;
}

/** チーム作成をキャンセル（追加したチームを削除してモーダルを閉じる） */
function cancelTeamCreation(): void {
  if (editingTeamIndex >= 0 && editingTeamIndex < teams.length) {
    teams.splice(editingTeamIndex, 1);
    saveTeamToStorage();
    renderTeamList();
  }
  editingTeamIndex = -1;
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
  if (editingTeamIndex < 0 || editingTeamIndex >= teams.length) return;
  const team = teams[editingTeamIndex];
  if (team.length >= MAX_TEAM_SIZE) return;
  team.push(pokemon);
  saveTeamToStorage();
  renderTeamList();
  if (team.length >= MAX_TEAM_SIZE) {
    document.querySelectorAll(".pokemon-picker-btn").forEach((b) => ((b as HTMLButtonElement).disabled = true));
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
  fetch("data/pokemon.json")
    .then((res) => (res.ok ? res.json() : []))
    .then((data: Pokemon[]) => { demoPokemon = Array.isArray(data) ? data : []; })
    .catch(() => { demoPokemon = []; });
  teamCreateBtn?.addEventListener("click", () => {
    teams.push([]);
    editingTeamIndex = teams.length - 1;
    saveTeamToStorage();
    renderTeamList();
    openPokemonPicker();
  });
  teamEditBtn?.addEventListener("click", () => {
    isEditMode = !isEditMode;
    renderTeamList();
  });
  teamListEl?.addEventListener("click", (e) => {
    const deleteBtn = (e.target as HTMLElement).closest(".team-delete-btn");
    if (!deleteBtn) return;
    const index = parseInt((deleteBtn as HTMLElement).dataset.teamIndex ?? "", 10);
    if (!Number.isNaN(index)) openDeleteConfirmModal(index);
  });
  pokemonPickerConfirm?.addEventListener("click", () => closePokemonPicker());
  pokemonPickerCancel?.addEventListener("click", () => cancelTeamCreation());
  pokemonPickerModal?.querySelector(".pokemon-modal-backdrop")?.addEventListener("click", () => cancelTeamCreation());
  pokemonPickerList?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest(".pokemon-picker-btn");
    if (!btn || (btn as HTMLButtonElement).disabled) return;
    const id = (btn as HTMLElement).dataset.pokemonId;
    const pokemon = demoPokemon.find((p) => p.id === id);
    if (pokemon) addPokemonToTeam(pokemon);
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
