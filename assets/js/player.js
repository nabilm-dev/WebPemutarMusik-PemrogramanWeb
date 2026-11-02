
/* ===== RAMPHONY MUSIC PLAYER ===== */

const $ = selector => document.querySelector(selector);
const audio = $("#a");

let tracks = [];
let cur = -1;

let shuffle = false;
let repeat = 0;

/* ===== DEMO SONGS ===== */

function addDemo() {
  const demo = [
    {
      name: "Rex Orange County - Best Friend",
      src: encodeURI("demolagu/Rex Orange County - Best Friend.mp3"),
      tag: "Demo"
    },
    {
      name: "Rex Orange County - Hannah Montana",
      src: encodeURI("demolagu/Rex Orange County - Hannah Montana.mp3"),
      tag: "Demo"
    }
  ];

  const existing = new Set(tracks.map(track => track.src));
  add(demo.filter(track => !existing.has(track.src)));
}

/* ===== PLAYLIST ===== */

function add(items) {
  if (!items.length) return;

  const first = tracks.length;
  tracks.push(...items);
  render();

  if (cur < 0) load(first, false);
}

function render() {
  const ul = $("#ul");
  const search = $("#search-track")?.value.toLowerCase().trim() || "";

  $("#count").textContent = tracks.length
    ? `${tracks.length} lagu tersimpan`
    : "Belum ada lagu";

  ul.innerHTML = "";

  const filtered = tracks
    .map((track, index) => ({ track, index }))
    .filter(item => item.track.name.toLowerCase().includes(search));

  if (!filtered.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = tracks.length
      ? "Lagu tidak ditemukan."
      : "Belum ada lagu. Klik Tambah atau Demo.";
    li.style.padding = "20px";
    li.style.color = "#aaa";
    ul.appendChild(li);
    return;
  }

  filtered.forEach(({ track, index }) => {
    const li = document.createElement("li");
    if (index === cur) li.classList.add("cur");

    const button = document.createElement("button");
    button.type = "button";

    const number = document.createElement("span");
    number.className = "n";
    number.textContent =
      index === cur && !audio.paused ? "▶" : index + 1;

    const title = document.createElement("span");
    title.className = "t";
    title.textContent = track.name;

    const tag = document.createElement("span");
    tag.className = "s";
    tag.textContent = track.tag;

    button.append(number, title, tag);

    button.onclick = () => {
      if (index === cur) toggle();
      else load(index, true);
    };

    li.appendChild(button);
    ul.appendChild(li);
  });
}

/* ===== LOAD SONG ===== */

function load(index, autoplay = false) {
  if (index < 0 || index >= tracks.length) return;

  cur = index;
  const track = tracks[index];

  if (track.src && track.src.startsWith("http")) {
    audio.crossOrigin = "anonymous";
  } else {
    audio.removeAttribute("crossorigin");
  }

  audio.src = track.src;
  audio.load();

  $("#title").textContent = track.name;
  $("#bottom-title").textContent = track.name;

  $("#sub").textContent =
    track.tag === "Demo"
      ? "Lagu demo"
      : "Dari perangkatmu";

  $("#ini").textContent =
    track.name.trim().charAt(0).toUpperCase() || "♪";

  document.title = track.name + " - Ramphony";

  $("#cur").textContent = "0:00";
  $("#dur").textContent = "0:00";
  $("#bottom-cur").textContent = "0:00";
  $("#bottom-dur").textContent = "0:00";

  $("#seek").value = 0;
  $("#bottom-progress").value = 0;

  updateSeekFill();
  render();
  updateHeartStatus();
  updateBottomPlayer();

  if (autoplay) {
    playAudio();
    addToHistory(track);
  } else {
    updateState(false);
  }
}

/* ===== PLAY / PAUSE ===== */

function playAudio() {
  initAudioAnalyser();
  if (cur >= 0 && tracks[cur]) {
    addToHistory(tracks[cur]);
  }

  if (audioContext && audioContext.state === "suspended") {
    audioContext.resume().catch(e => console.warn("AudioContext resume:", e));
  }

  if (audio.muted) audio.muted = false;

  const playPromise = audio.play();
  if (playPromise !== undefined) {
    playPromise.catch(error => {
      console.warn("Audio play rejected:", error);
      // Fallback: If blocked due to crossOrigin header, retry without crossOrigin
      if (audio.crossOrigin) {
        audio.removeAttribute("crossorigin");
        audio.load();
        audio.play().catch(e => console.warn("Audio fallback retry failed:", e));
      }
    });
  }
}

function toggle() {
  if (audio.paused) playAudio();
  else audio.pause();
}

/* ===== NEXT / PREVIOUS ===== */

function step(direction) {
  if (!tracks.length) return;

  let index;

  if (shuffle && tracks.length > 1) {
    do {
      index = Math.floor(Math.random() * tracks.length);
    } while (index === cur);
  } else {
    index = (cur + direction + tracks.length) % tracks.length;
  }

  load(index, true);
}

function previous() {
  if (audio.currentTime > 3) audio.currentTime = 0;
  else step(-1);
}

/* ===== SHUFFLE ===== */

function toggleShuffle() {
  shuffle = !shuffle;

  ["#shuf", "#mobile-shuf"].forEach(selector => {
    const button = $(selector);
    if (!button) return;

    button.classList.toggle("act", shuffle);
    button.setAttribute("aria-pressed", String(shuffle));
    button.title = shuffle ? "Acak: nyala" : "Acak: mati";
  });
}

/* ===== REPEAT ===== */

function toggleRepeat() {
  // 0 = mati, 1 = semua, 2 = satu lagu
  repeat = (repeat + 1) % 3;

  const labels = ["Mati", "Semua", "Satu lagu"];

  ["#rep", "#mobile-rep"].forEach(selector => {
    const button = $(selector);
    if (!button) return;

    button.classList.toggle("act", repeat > 0);
    button.title = "Ulangi: " + labels[repeat];
    button.setAttribute("aria-label", button.title);
    button.setAttribute("aria-pressed", String(repeat > 0));
  });

  refreshControlIcons();
}

/* ===== BUTTON EVENTS ===== */

$("#play").onclick = toggle;
$("#next").onclick = () => step(1);
$("#prev").onclick = previous;
$("#shuf").onclick = toggleShuffle;
$("#rep").onclick = toggleRepeat;

$("#mobile-play").onclick = toggle;
$("#mobile-next").onclick = () => step(1);
$("#mobile-prev").onclick = previous;
$("#mobile-shuf").onclick = toggleShuffle;
$("#mobile-rep").onclick = toggleRepeat;

/* ===== INDEXEDDB ===== */

const DB_NAME = "ramphony-music-v1";
const STORE_NAME = "songs";
const AUDIO_EXTENSION = /\.(mp3|m4a|wav|ogg|flac|aac)$/i;

let dbPromise = null;
const knownSongs = new Set();

function getSongKey(file) {
  const path = file.webkitRelativePath || file.name;
  return `${path}::${file.size}::${file.lastModified}`;
}

function openDatabase() {
  if (!("indexedDB" in window)) {
    return Promise.reject(
      new Error("Browser tidak mendukung IndexedDB.")
    );
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: "id"
        });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };

    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Database sedang dipakai tab lain."));
  }).catch(error => {
    dbPromise = null;
    throw error;
  });

  return dbPromise;
}

async function getSavedSongs() {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_NAME,
      "readonly"
    );

    const request = transaction
      .objectStore(STORE_NAME)
      .getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function saveSong(record) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_NAME,
      "readwrite"
    );

    transaction.objectStore(STORE_NAME).put(record);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error("Gagal menyimpan"));
    transaction.onabort = () =>
      reject(transaction.error || new Error("Penyimpanan dibatalkan"));
  });
}

function addStoredSong(record) {
  if (knownSongs.has(record.id)) return false;

  knownSongs.add(record.id);

  tracks.push({
    name: record.name,
    src: URL.createObjectURL(record.file),
    tag: "Berkas",
    localId: record.id
  });

  return true;
}

/* ===== STORAGE NOTIFICATION ===== */

function showStorageNotice(message) {
  let notice = $("#storage-notice");

  if (!notice) {
    notice = document.createElement("p");
    notice.id = "storage-notice";
    notice.setAttribute("role", "status");

    notice.style.cssText = `
      font-size: 12px;
      color: #b5e4bf;
      margin: 8px 0;
      line-height: 1.5;
    `;

    const actions = $(".playlist-actions");
    const container = $("#tracks-view") || $("#playlist") || document.body;

    (actions?.parentElement || container).appendChild(notice);
  }

  notice.textContent = message;
}

/* ===== FOLDER UPLOAD ===== */

const folderInput = document.createElement("input");

folderInput.type = "file";
folderInput.id = "music-folder-input";
folderInput.multiple = true;
folderInput.setAttribute("webkitdirectory", "");
folderInput.hidden = true;

const tracksContainer = $("#tracks-view") || $("#playlist") || document.body;
if (tracksContainer) {
  tracksContainer.appendChild(folderInput);
}

const folderButton = document.createElement("button");

folderButton.type = "button";
folderButton.id = "pick-folder";
folderButton.className = "btn-add";
folderButton.textContent = "📁 Pilih Folder";
folderButton.title = "Tambahkan semua lagu dari satu folder";

const actions = $(".playlist-actions");

if (actions) {
  actions.appendChild(folderButton);
} else if ($("#pick")) {
  $("#pick").insertAdjacentElement("afterend", folderButton);
}

$("#pick").onclick = () => $("#file").click();
folderButton.onclick = () => folderInput.click();
$("#demo").onclick = addDemo;

$("#file").onchange = async event => {
  const files = [...event.target.files];
  event.target.value = "";
  await addFiles(files);
};

folderInput.onchange = async event => {
  const files = [...event.target.files];
  event.target.value = "";
  await addFiles(files);
};

/* ===== RESTORE SONGS ===== */

const restorePromise = (async () => {
  try {
    const saved = await getSavedSongs();

    saved.sort(
      (a, b) => (a.addedAt || 0) - (b.addedAt || 0)
    );

    const first = tracks.length;
    let restored = 0;

    for (const record of saved) {
      if (
        record.file instanceof Blob &&
        addStoredSong(record)
      ) {
        restored++;
      }
    }

    if (restored) {
      render();

      if (cur < 0) load(first, false);

      showStorageNotice(
        `${restored} lagu dipulihkan dari browser.`
      );
    }
  } catch (error) {
    console.warn("IndexedDB gagal dibuka:", error);

    showStorageNotice(
      "Penyimpanan otomatis tidak tersedia. Lagu tetap bisa diputar sementara."
    );
  }
})();

/* ===== ADD FILES ===== */

async function addFiles(files) {
  const selected = Array.from(files || []).filter(file =>
    file instanceof File &&
    (
      file.type.startsWith("audio/") ||
      AUDIO_EXTENSION.test(file.name)
    )
  );

  if (!selected.length) {
    showStorageNotice(
      "Folder atau berkas tidak berisi audio yang didukung."
    );
    return;
  }

  await restorePromise;

  let added = 0;
  let saved = 0;
  let failed = 0;

  const first = tracks.length;

  showStorageNotice(`Memproses ${selected.length} lagu...`);

  for (const file of selected) {
    const id = getSongKey(file);

    if (knownSongs.has(id)) continue;

    const record = {
      id,
      name: file.name.replace(/\.[^.]+$/, ""),
      file,
      addedAt: Date.now() + added
    };

    if (addStoredSong(record)) added++;

    try {
      await saveSong(record);
      saved++;
    } catch (error) {
      failed++;
      console.warn("Gagal menyimpan:", file.name, error);
    }
  }

  if (added) {
    render();
    if (cur < 0) load(first, false);
  }

  if (failed) {
    showStorageNotice(
      `${added} lagu masuk playlist. ${saved} tersimpan, ${failed} gagal disimpan.`
    );
  } else {
    showStorageNotice(
      `${added} lagu baru ditambahkan. ${saved} tersimpan di browser.`
    );
  }
}

/* ===== TIME FORMAT ===== */

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";

  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  return minutes + ":" + String(secs).padStart(2, "0");
}

/* ===== PROGRESS BAR ===== */

const seek = $("#seek");
const bottomSeek = $("#bottom-progress");

seek.min = 0;
seek.max = 100;
seek.step = 0.1;

bottomSeek.min = 0;
bottomSeek.max = 100;
bottomSeek.step = 0.1;

function updateSeekFill() {
  const percent = Number(seek.value) || 0;

  seek.style.background = `linear-gradient(
    to right,
    #071b12 0%,
    #071b12 ${percent}%,
    rgba(7, 27, 18, 0.22) ${percent}%,
    rgba(7, 27, 18, 0.22) 100%
  )`;
}

function seekTo(percent) {
  if (
    !Number.isFinite(audio.duration) ||
    audio.duration <= 0
  ) return;

  audio.currentTime =
    (Number(percent) / 100) * audio.duration;

  updateProgress();
}

seek.oninput = () => {
  seekTo(seek.value);
  updateSeekFill();
};

bottomSeek.oninput = () => {
  seekTo(bottomSeek.value);
};

function updateProgress() {
  const current = audio.currentTime;
  const duration = audio.duration;

  $("#cur").textContent = formatTime(current);
  $("#bottom-cur").textContent = formatTime(current);

  if (Number.isFinite(duration) && duration > 0) {
    const percent = Math.min(
      100,
      Math.max(0, (current / duration) * 100)
    );

    if (document.activeElement !== seek) {
      seek.value = percent;
    }

    if (document.activeElement !== bottomSeek) {
      bottomSeek.value = percent;
    }

    updateSeekFill();
  }

  const spdCur = document.getElementById("spd-cur-time");
  const spdDur = document.getElementById("spd-dur-time");
  const spdSeek = document.getElementById("spd-seek");

  if (spdCur) spdCur.textContent = formatTime(current);
  if (spdDur) spdDur.textContent = formatTime(duration || 0);

  if (spdSeek && document.activeElement !== spdSeek) {
    if (Number.isFinite(duration) && duration > 0) {
      spdSeek.value = Math.min(100, Math.max(0, (current / duration) * 100));
    } else {
      spdSeek.value = 0;
    }
  }

  broadcastPlayerState();
}

audio.addEventListener("timeupdate", updateProgress);

audio.addEventListener("loadedmetadata", () => {
  const duration = formatTime(audio.duration);

  $("#dur").textContent = duration;
  $("#bottom-dur").textContent = duration;

  updateProgress();
});

audio.addEventListener("durationchange", updateProgress);

/* ===== VOLUME ===== */

const volume = $("#vol");

function updateVolume() {
  audio.volume = Number(volume.value) / 100;

  const number = $("#volume-number");
  if (number) number.textContent = volume.value;
}

volume.oninput = updateVolume;
updateVolume();

/* ===== SVG CONTROL ICONS ===== */

const icons = {
  shuffle:
    '<path d="M16 3h5v5h-2V6.4l-3.6 3.6-1.4-1.4L17.6 5H16V3zM3 6h3c2 0 3 1 4 2.5l7 9.1V16h2v5h-5v-2h1.6L8.4 9.7C7.5 8.5 7 8 6 8H3V6zm0 12h3c1.2 0 2-.5 2.8-1.6l1.4-1.8 1.4 1.5-1.2 1.6C9.2 19.4 8 20 6 20H3v-2z"/>',

  previous:
    '<path d="M6 5h2v14H6zM19 5v14L9 12z"/>',

  next:
    '<path d="M16 5h2v14h-2zM5 5v14l10-7z"/>',

  // REPEAT ICON BARU: GARIS HALUS, PANAH NYAMBUNG
  repeat:
    '<path d="M17 2l4 4-4 4M21 6H7a4 4 0 0 0-4 4v1M7 22l-4-4 4-4M3 18h14a4 4 0 0 0 4-4v-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',

  play:
    '<path d="M8 5v14l11-7z"/>',

  pause:
    '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>'
};

function setIcon(selector, name) {
  const button = $(selector);
  if (!button) return;

  button.innerHTML =
    `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
}

function refreshControlIcons() {
  setIcon("#shuf", "shuffle");
  setIcon("#prev", "previous");
  setIcon("#next", "next");
  setIcon("#rep", "repeat");

  setIcon("#mobile-shuf", "shuffle");
  setIcon("#mobile-prev", "previous");
  setIcon("#mobile-next", "next");
  setIcon("#mobile-rep", "repeat");

  const playbackIcon = audio.paused ? "play" : "pause";

  setIcon("#play", playbackIcon);
  setIcon("#mobile-play", playbackIcon);
}

/* ===== REAL AUDIO VISUALIZER ===== */

let audioContext = null;
let analyser = null;
let audioSource = null;
let frequencyData = null;
let animationId = null;

const visualizer = $("#visualizer");
const bars = [...visualizer.querySelectorAll("span")];

bars.forEach(bar => {
  bar.style.animation = "none";
  bar.style.transition = "height 80ms linear";
  bar.style.height = "4px";
});

function initAudioAnalyser() {
  const AudioContextClass =
    window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) return;

  try {
    if (!audioContext) {
      audioContext = new AudioContextClass();

      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;

      audioSource = audioContext.createMediaElementSource(audio);
      audioSource.connect(analyser);
      analyser.connect(audioContext.destination);

      frequencyData = new Uint8Array(
        analyser.frequencyBinCount
      );
    }

    if (audioContext.state === "suspended") {
      audioContext.resume().catch(error => {
        console.warn("AudioContext belum aktif:", error);
      });
    }
  } catch (error) {
    console.warn("Visualizer audio tidak tersedia:", error);
  }
}

function resetVisualizer() {
  bars.forEach(bar => {
    bar.style.height = "4px";
  });
}

function animateVisualizer() {
  if (audio.paused || !analyser) {
    resetVisualizer();
    animationId = null;
    return;
  }

  analyser.getByteFrequencyData(frequencyData);

  const maxHeight = 34;
  const binCount = frequencyData.length;

  bars.forEach((bar, index) => {
    const start = Math.floor(
      (index / bars.length) * binCount * 0.65
    );

    const end = Math.max(
      start + 1,
      Math.floor(
        ((index + 1) / bars.length) * binCount * 0.65
      )
    );

    let total = 0;

    for (let i = start; i < end; i++) {
      total += frequencyData[i];
    }

    const average = total / (end - start);
    const height = 4 + (average / 255) * maxHeight;

    bar.style.height = `${height}px`;
  });

  animationId = requestAnimationFrame(animateVisualizer);
}

function startVisualizer() {
  if (!analyser) return;

  if (animationId !== null) {
    cancelAnimationFrame(animationId);
  }

  animationId = requestAnimationFrame(animateVisualizer);
}

function stopVisualizer() {
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  resetVisualizer();
}

/* ===== PLAYBACK STATE ===== */

function updateState(playing) {
  const lcdState = $("#lcd-play-state");

  if (lcdState) {
    lcdState.textContent = playing ? "PLAYING" : "PAUSED";
  }

  $("#play").setAttribute(
    "aria-label",
    playing ? "Jeda" : "Putar"
  );

  $("#mobile-play").setAttribute(
    "aria-label",
    playing ? "Jeda" : "Putar"
  );

  visualizer.classList.toggle("playing", playing);

  refreshControlIcons();
  render();
  updateBottomPlayer();

  if (playing) startVisualizer();
  else stopVisualizer();
}

audio.addEventListener("play", () => {
  initAudioAnalyser();
  updateState(true);
  broadcastPlayerState();
});

audio.addEventListener("pause", () => {
  updateState(false);
  broadcastPlayerState();
});

audio.addEventListener("ended", () => {
  const playlistFrame = document.getElementById("playlist-frame");
  if (playlistFrame && playlistFrame.contentWindow) {
    try {
      playlistFrame.contentWindow.postMessage({ type: "RAMPHONY_AUDIO_ENDED" }, "*");
    } catch (e) {}
  }

  const settings = getSettings();
  if (repeat === 2) {
    audio.currentTime = 0;
    playAudio();
  } else if (repeat === 1 || (settings.autoplay && cur < tracks.length - 1)) {
    step(1);
  } else {
    updateState(false);
  }
});

audio.addEventListener("error", () => {
  console.warn("File audio gagal dimuat:", audio.src);
  if (audio.crossOrigin) {
    console.warn("Retrying audio playback without crossOrigin attribute...");
    audio.removeAttribute("crossorigin");
    audio.src = tracks[cur]?.src || "";
    audio.load();
    audio.play().catch(err => console.warn("Retry failed:", err));
    return;
  }
  if (audio.src && !audio.src.includes("demolagu/")) {
    console.log("Cross-device fallback: memutar audio demo...");
    audio.removeAttribute("crossorigin");
    audio.src = encodeURI("demolagu/Rex Orange County - Best Friend.mp3");
    audio.load();
    audio.play().catch(err => console.warn("Demo fallback failed:", err));
    return;
  }
  updateState(false);
});

/* ===== KEYBOARD SHORTCUTS ===== */

document.addEventListener("keydown", event => {
  const tag = event.target.tagName;

  if (
    tag === "INPUT" ||
    tag === "BUTTON" ||
    tag === "TEXTAREA" ||
    event.target.isContentEditable
  ) return;

  if (event.code === "Space") {
    event.preventDefault();
    toggle();
  }

  if (event.code === "ArrowRight" && cur >= 0) {
    event.preventDefault();

    audio.currentTime = Math.min(
      audio.currentTime + 5,
      audio.duration || 0
    );
  }

  if (event.code === "ArrowLeft" && cur >= 0) {
    event.preventDefault();

    audio.currentTime = Math.max(
      audio.currentTime - 5,
      0
    );
  }
});

/* ===== DRAG & DROP ===== */

document.addEventListener("dragover", event => {
  event.preventDefault();
  document.body.classList.add("drop");
});

document.addEventListener("dragleave", event => {
  if (!event.relatedTarget) {
    document.body.classList.remove("drop");
  }
});

document.addEventListener("drop", event => {
  event.preventDefault();
  document.body.classList.remove("drop");

  if (event.dataTransfer?.files?.length) {
    addFiles(event.dataTransfer.files);
  }
});

/* ===== SIDEBAR ===== */

const menuToggle = $("#menu-toggle");
const sidebar = $("#sidebar");
const menuOverlay = $("#menu-overlay");

function closeMenu() {
  sidebar.classList.remove("open");
  menuOverlay.classList.remove("open");

  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Buka menu");
}

menuToggle.addEventListener("click", () => {
  const isOpen = sidebar.classList.toggle("open");

  menuOverlay.classList.toggle("open", isOpen);

  menuToggle.setAttribute(
    "aria-expanded",
    String(isOpen)
  );

  menuToggle.setAttribute(
    "aria-label",
    isOpen ? "Tutup menu" : "Buka menu"
  );
});

menuOverlay.addEventListener("click", closeMenu);

sidebar.querySelectorAll("a").forEach(link => {
  link.addEventListener("click", closeMenu);
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeMenu();
});

/* ===== SEARCH ===== */

$("#search-track")?.addEventListener("input", render);

/* ===== PROFILE ===== */

function updateProfile() {
  try {
    const saved = localStorage.getItem("ramphony_profile");
    if (!saved) return;

    const profile = JSON.parse(saved);
    const name = profile.displayName || profile.username;

    if (!name) return;

    const account = $(".sidebar-account");

    if (account) {
      const spans = account.querySelectorAll("span");

      if (spans.length > 1) {
        spans[1].textContent = name;
      }

      const link = account.querySelector("a");

      if (link) {
        link.textContent = "Edit Profile";
      }
    }

    const profileButton = $(".profile-button");

    if (profileButton) {
      profileButton.title = "Edit Profile";
      profileButton.setAttribute(
        "aria-label",
        "Edit Profile"
      );
    }
  } catch (error) {
    console.warn("Profil tidak dapat dibaca:", error);
  }
}


/* ===== FAVORITES ===== */

function getFavorites() {
  try {
    const data = JSON.parse(localStorage.getItem("ramphony_favorites") || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveFavorites(favs) {
  localStorage.setItem("ramphony_favorites", JSON.stringify(favs));
}

function isFavorite(name) {
  if (!name) return false;
  return getFavorites().some(f => f.name === name);
}

function toggleFavorite(track) {
  if (!track || !track.name) return;
  const favs = getFavorites();
  const idx = favs.findIndex(f => f.name === track.name);
  if (idx >= 0) {
    favs.splice(idx, 1);
  } else {
    favs.unshift({
      name: track.name,
      src: track.src,
      tag: track.tag || "Song"
    });
  }
  saveFavorites(favs);
  updateHeartStatus();
  render();
  renderFavorites();
  renderHistory();
}

function updateHeartStatus() {
  const mobileFavBtn = $("#mobile-fav");
  const track = cur >= 0 ? tracks[cur] : null;
  const favorited = track && isFavorite(track.name);

  if (mobileFavBtn) {
    mobileFavBtn.classList.toggle("active", Boolean(favorited));
    const path = mobileFavBtn.querySelector(".fav-heart-path");
    if (path) {
      path.setAttribute("fill", favorited ? "currentColor" : "none");
    }
  }
}

$("#mobile-fav")?.addEventListener("click", () => {
  if (cur >= 0 && tracks[cur]) {
    toggleFavorite(tracks[cur]);
  }
});

function renderFavorites() {
  const favs = getFavorites();
  const list = $("#favorites-list");
  const empty = $("#favorites-empty");
  const badge = $("#fav-count-badge");
  const playAll = $("#play-all-favs");

  if (badge) badge.textContent = favs.length;

  if (list && empty) {
    if (!favs.length) {
      list.innerHTML = "";
      empty.hidden = false;
      if (playAll) playAll.style.display = "none";
      return;
    }

    empty.hidden = true;
    if (playAll) playAll.style.display = "inline-block";
    list.innerHTML = "";

    favs.forEach((fav, i) => {
      const li = document.createElement("li");
      li.className = "view-track-item";

      const playBtn = document.createElement("button");
      playBtn.type = "button";
      playBtn.className = "view-track-play";
      playBtn.title = "Putar lagu";
      playBtn.innerHTML = "▶";
      playBtn.onclick = () => playFromExternal(fav);

      const info = document.createElement("div");
      info.className = "view-track-info";

      const title = document.createElement("div");
      title.className = "view-track-title";
      title.textContent = fav.name;

      const meta = document.createElement("div");
      meta.className = "view-track-meta";
      meta.textContent = fav.tag || "Favorite Track";

      info.append(title, meta);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "view-track-btn is-fav";
      removeBtn.title = "Hapus dari favorit";
      removeBtn.textContent = "♥";
      removeBtn.onclick = () => {
        toggleFavorite(fav);
        renderFavorites();
      };

      li.append(playBtn, info, removeBtn);
      list.appendChild(li);
    });
  }
}

/* ===== RECENTLY PLAYED (HISTORY) ===== */

function getHistory() {
  try {
    const data = JSON.parse(localStorage.getItem("ramphony_history") || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function addToHistory(track) {
  if (!track || !track.name) return;
  let history = getHistory();
  history = history.filter(h => h.name !== track.name);
  history.unshift({
    name: track.name,
    src: track.src,
    tag: track.tag || "Song",
    playedAt: Date.now()
  });
  if (history.length > 30) history = history.slice(0, 30);
  localStorage.setItem("ramphony_history", JSON.stringify(history));
  renderHistory();
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return "Baru saja";
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return "Baru saja";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} menit yang lalu`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} jam yang lalu`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay} hari yang lalu`;
}

function renderHistory() {
  const history = getHistory();
  const list = $("#history-list");
  const empty = $("#history-empty");
  const badge = $("#hist-count-badge");
  const clearBtn = $("#clear-history");

  if (badge) badge.textContent = history.length;

  if (list && empty) {
    if (!history.length) {
      list.innerHTML = "";
      empty.hidden = false;
      if (clearBtn) clearBtn.style.display = "none";
      return;
    }

    empty.hidden = true;
    if (clearBtn) clearBtn.style.display = "inline-block";
    list.innerHTML = "";

    history.forEach(item => {
      const li = document.createElement("li");
      li.className = "view-track-item";

      const playBtn = document.createElement("button");
      playBtn.type = "button";
      playBtn.className = "view-track-play";
      playBtn.title = "Putar lagu";
      playBtn.innerHTML = "▶";
      playBtn.onclick = () => playFromExternal(item);

      const info = document.createElement("div");
      info.className = "view-track-info";

      const title = document.createElement("div");
      title.className = "view-track-title";
      title.textContent = item.name;

      const meta = document.createElement("div");
      meta.className = "view-track-meta";
      meta.textContent = formatTimeAgo(item.playedAt);

      info.append(title, meta);

      const favBtn = document.createElement("button");
      favBtn.type = "button";
      const fav = isFavorite(item.name);
      favBtn.className = "view-track-btn" + (fav ? " is-fav" : "");
      favBtn.title = fav ? "Hapus dari favorit" : "Tambah ke favorit";
      favBtn.textContent = fav ? "♥" : "♡";
      favBtn.onclick = () => {
        toggleFavorite(item);
        renderHistory();
      };

      li.append(playBtn, info, favBtn);
      list.appendChild(li);
    });
  }
}

/* ===== PLAY FROM EXTERNAL VIEW ===== */

function playFromExternal(item, switchHome = false) {
  if (!item || !item.name) return;

  // Cross-device safety: if src is a blob from another device or missing, fallback to demo audio
  if (item.src && item.src.startsWith("blob:") && !item.src.includes(location.host)) {
    item.src = encodeURI("demolagu/Rex Orange County - Best Friend.mp3");
  }

  const existingIdx = tracks.findIndex(t => t.name === item.name);
  let targetIdx;

  if (existingIdx >= 0) {
    if (item.src) tracks[existingIdx].src = item.src;
    if (item.tag) tracks[existingIdx].tag = item.tag;
    if (item.artwork) tracks[existingIdx].artwork = item.artwork;
    if (item.videoId) tracks[existingIdx].videoId = item.videoId;
    if (item.isYouTube !== undefined) tracks[existingIdx].isYouTube = item.isYouTube;
    if (item.previewSrc) tracks[existingIdx].previewSrc = item.previewSrc;
    targetIdx = existingIdx;
  } else {
    tracks.push({
      name: item.name,
      title: item.title || item.name,
      artist: item.artist || "",
      src: item.src || "",
      tag: item.tag || "Online HQ",
      artwork: item.artwork || null,
      videoId: item.videoId || null,
      isYouTube: item.isYouTube !== undefined ? item.isYouTube : Boolean(item.videoId || !item.src),
      previewSrc: item.previewSrc || null
    });
    render();
    targetIdx = tracks.length - 1;
  }

  load(targetIdx, true);
  if (switchHome) {
    switchView("home");
  }
}

window.playFromExternal = playFromExternal;
window.RamphonyPlayer = {
  getCurrentTrack: () => (cur >= 0 && tracks[cur] ? tracks[cur] : null),
  getAllTracks: () => tracks || [],
  playTrack: (item) => playFromExternal(item, false)
};
window.saveExternalToPlaylist = function(item) {
  if (!item || !item.name) return;
  const existing = tracks.some(t => t.name === item.name);
  if (!existing) {
    tracks.push({
      name: item.name,
      src: item.src,
      tag: item.tag || "Online"
    });
    render();
  }
};

/* ===== SETTINGS ===== */

const DEFAULT_SETTINGS = {
  autoplay: true,
  visualizer: true,
  volume: 80
};

function getSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("ramphony_settings") || "{}");
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  localStorage.setItem("ramphony_settings", JSON.stringify(settings));
}

function initSettings() {
  const settings = getSettings();
  const autoplayInput = $("#setting-autoplay");
  const visualizerInput = $("#setting-visualizer");
  const volRange = $("#setting-vol-range");
  const volDisplay = $("#setting-vol-display");

  if (autoplayInput) autoplayInput.checked = Boolean(settings.autoplay);
  if (visualizerInput) visualizerInput.checked = Boolean(settings.visualizer);
  if (volRange) {
    volRange.value = settings.volume ?? 80;
    if (volDisplay) volDisplay.textContent = `${volRange.value}%`;
  }

  autoplayInput?.addEventListener("change", e => {
    const s = getSettings();
    s.autoplay = e.target.checked;
    saveSettings(s);
  });

  visualizerInput?.addEventListener("change", e => {
    const s = getSettings();
    s.visualizer = e.target.checked;
    saveSettings(s);
    if (!s.visualizer) stopVisualizer();
    else if (!audio.paused) startVisualizer();
  });

  volRange?.addEventListener("input", e => {
    const val = Number(e.target.value);
    if (volDisplay) volDisplay.textContent = `${val}%`;
    const s = getSettings();
    s.volume = val;
    saveSettings(s);
    audio.volume = val / 100;
    if ($("#vol")) $("#vol").value = val;
    if ($("#volume-number")) $("#volume-number").textContent = val;
  });

  $("#btn-clear-hist-setting")?.addEventListener("click", () => {
    if (confirm("Hapus seluruh riwayat pemutaran?")) {
      localStorage.removeItem("ramphony_history");
      renderHistory();
      alert("Riwayat berhasil dihapus!");
    }
  });

  $("#btn-clear-favs-setting")?.addEventListener("click", () => {
    if (confirm("Kosongkan semua lagu favorit?")) {
      localStorage.removeItem("ramphony_favorites");
      renderFavorites();
      updateHeartStatus();
      render();
      alert("Daftar favorit berhasil dikosongkan!");
    }
  });

  $("#btn-reset-all-setting")?.addEventListener("click", () => {
    if (confirm("Reset seluruh data lokal (pengaturan, riwayat, favorit, profil)?")) {
      localStorage.removeItem("ramphony_settings");
      localStorage.removeItem("ramphony_history");
      localStorage.removeItem("ramphony_favorites");
      localStorage.removeItem("ramphony_profile");
      location.reload();
    }
  });
}

/* ===== VIEW NAVIGATION ===== */

function switchView(page) {
  const workspace = $(".workspace");
  const tracksView = $("#tracks-view");
  const favsView = $("#favorites-view");
  const histView = $("#history-view");
  const settingsView = $("#settings-view");
  const links = document.querySelectorAll(".side-nav .nav-link");
  const playlistOverlay = document.getElementById("playlist-overlay");
  const profileOverlay = document.getElementById("profile-overlay");
  const bottomPlayer = document.getElementById("bottom-player");

  if (page === "playlist") {
    if (playlistOverlay) {
      playlistOverlay.removeAttribute("hidden");
      document.body.classList.add("page-overlay-open");
      const frame = document.getElementById("playlist-frame");
      if (frame && (!frame.src || frame.src === "about:blank" || frame.src.endsWith("about:blank"))) {
        frame.src = "pages/playlist.html";
      }
      setTimeout(() => {
        window.postMessage({ type: "RAMPHONY_TRIGGER_BROADCAST" }, "*");
      }, 150);
    }
    closeMenu();
  } else {
    if (playlistOverlay) playlistOverlay.setAttribute("hidden", "");
    if (profileOverlay) profileOverlay.setAttribute("hidden", "");
    document.body.classList.remove("page-overlay-open");
  }

  links.forEach(l => {
    l.classList.toggle("active", l.getAttribute("data-page") === page);
  });

  if (page !== "playlist") {
    if (workspace) workspace.hidden = page !== "home";
    if (tracksView) tracksView.hidden = page !== "tracks";
    if (favsView) favsView.hidden = page !== "favorites";
    if (histView) histView.hidden = page !== "history";
    if (settingsView) settingsView.hidden = page !== "settings";

    // Bottom seek player is hidden on home, visible on all other pages
    if (bottomPlayer) {
      bottomPlayer.hidden = (page === "home");
    }

    if (page === "tracks") render();
    if (page === "favorites") renderFavorites();
    if (page === "history") renderHistory();
  }
}

function initNavigation() {
  const links = document.querySelectorAll(".side-nav .nav-link[data-page]");
  links.forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      const page = link.getAttribute("data-page");
      switchView(page);
      closeMenu();
    });
  });

  // Side nav chat room click
  $("#side-nav-chat")?.addEventListener("click", e => {
    e.preventDefault();
    document.getElementById("open-chat-btn")?.click();
    closeMenu();
  });

  // Logo click to go to Home
  $("#logo-home-btn")?.addEventListener("click", e => {
    e.preventDefault();
    switchView("home");
    closeMenu();
  });



  $("#clear-history")?.addEventListener("click", () => {
    if (confirm("Hapus seluruh riwayat pemutaran?")) {
      localStorage.removeItem("ramphony_history");
      renderHistory();
    }
  });

  $("#play-all-favs")?.addEventListener("click", () => {
    const favs = getFavorites();
    if (!favs.length) return;
    favs.forEach(f => {
      if (!tracks.some(t => t.name === f.name)) {
        tracks.push(f);
      }
    });
    render();
    const firstFavIdx = tracks.findIndex(t => t.name === favs[0].name);
    if (firstFavIdx >= 0) load(firstFavIdx, true);
  });
}


/* ===== BROADCAST STATE TO EMBEDDED FRAMES ===== */

function broadcastPlayerState() {
  const currentTrack = cur >= 0 && tracks[cur] ? tracks[cur] : null;
  const stateMessage = {
    type: "RAMPHONY_PLAYER_STATE",
    playing: !audio.paused && !audio.ended && (audio.currentTime > 0 || audio.readyState > 0),
    paused: audio.paused,
    currentTime: audio.currentTime || 0,
    duration: audio.duration || 0,
    trackName: currentTrack ? currentTrack.name : "",
    trackTag: currentTrack ? currentTrack.tag : "",
    isFav: currentTrack ? isFavorite(currentTrack.name) : false
  };

  const playlistFrame = document.getElementById("playlist-frame");
  if (playlistFrame && playlistFrame.contentWindow) {
    try {
      playlistFrame.contentWindow.postMessage(stateMessage, "*");
    } catch (e) {}
  }
}
window.addEventListener("message", event => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "RAMPHONY_PLAY_TRACK") {
    if (data.track) {
      playFromExternal(data.track, false);
    }
  }

  if (data.type === "RAMPHONY_PLAYER_TOGGLE") {
    toggle();
  }

  if (data.type === "RAMPHONY_PLAYER_SEEK_RATIO") {
    if (typeof data.ratio === "number" && Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = data.ratio * audio.duration;
      updateSeekFill();
      broadcastPlayerState();
    }
  }

  if (data.type === "RAMPHONY_PLAYER_VOLUME") {
    if (typeof data.volume === "number") {
      audio.volume = Math.max(0, Math.min(1, data.volume));
    }
  }

  if (data.type === "RAMPHONY_REQUEST_STATE" || data.type === "RAMPHONY_TRIGGER_BROADCAST") {
    broadcastPlayerState();
  }
});



/* ===== BOTTOM PLAYER CONTROLLER ===== */

function updateBottomPlayer() {
  const titleEl = document.getElementById("bottom-title");
  const subEl = document.getElementById("sub");
  const artImg = document.getElementById("bottom-art");
  const iniEl = document.getElementById("ini");
  const favBtn = document.getElementById("bottom-fav");

  const currentTrack = cur >= 0 && tracks[cur] ? tracks[cur] : null;

  if (currentTrack) {
    if (titleEl) titleEl.textContent = currentTrack.name;
    if (subEl) subEl.textContent = currentTrack.tag === "Demo" ? "Lagu demo" : "Dari perangkatmu";

    if (artImg && iniEl) {
      if (currentTrack.artwork) {
        artImg.src = currentTrack.artwork;
        artImg.hidden = false;
        iniEl.hidden = true;
      } else {
        artImg.hidden = true;
        iniEl.hidden = false;
        iniEl.textContent = currentTrack.name.trim().charAt(0).toUpperCase() || "♪";
      }
    }

    if (favBtn) {
      favBtn.classList.toggle("active", isFavorite(currentTrack.name));
    }
  } else {
    if (titleEl) titleEl.textContent = "No track selected";
    if (subEl) subEl.textContent = "Offline player";
    if (artImg) artImg.hidden = true;
    if (iniEl) {
      iniEl.hidden = false;
      iniEl.textContent = "♪";
    }
    if (favBtn) favBtn.classList.remove("active");
  }
}

function initBottomPlayer() {
  const favBtn = document.getElementById("bottom-fav");
  const homeBtn = document.getElementById("bottom-go-home");

  favBtn?.addEventListener("click", () => {
    toggleFav();
    updateBottomPlayer();
  });

  homeBtn?.addEventListener("click", () => {
    switchView("home");
  });

  updateBottomPlayer();
}

/* ===== INITIALIZATION ===== */

render();
updateState(false);
updateSeekFill();
updateProfile();
updateHeartStatus();
initSettings();
initNavigation();
initBottomPlayer();
renderFavorites();
renderHistory();
