
/* ==========================================
   RAMPHONY - FULLSCREEN SYNCED LYRICS
   Online Lyrics: LRCLIB
   ========================================== */

const songTitle = document.querySelector("#song-title");
const lyricsText = document.querySelector("#lyrics-text");
const lyricsFile = document.querySelector("#lyrics-file");
const lyricsContent = document.querySelector("#lyrics-content");
const deleteButton = document.querySelector("#delete-lyrics");
const closeButton = document.querySelector("#close-lyrics");

const API_URL = "https://lrclib.net/api/search";

let currentSong = "";
let currentAudioUrl = "";
let syncedLines = [];
let activeLine = -1;
let currentRequest = 0;
let controller = null;
let animationId = null;
let currentMode = "plain";

const cache = new Map();

/* ===== FULLSCREEN STYLING ===== */

function installFullscreenStyles() {
  const style = document.createElement("style");

  style.textContent = `
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: #101010;
    }

    .lyrics-app {
      width: 100%;
      height: 100dvh;
      max-width: none !important;
      min-height: 0;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      border-radius: 0 !important;
      display: flex;
      flex-direction: column;
      background: #101010;
    }

    .lyrics-header {
      flex-shrink: 0;
      padding: 22px 32px;
      background: #181818;
      border-bottom: 1px solid #303030;
    }

    .lyrics-screen {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      padding: 24px 7vw !important;
      overflow: hidden;
    }

    #song-title {
      flex-shrink: 0;
      color: #b5e4bf;
      font-size: clamp(18px, 3vw, 28px);
      margin-bottom: 20px;
      overflow-wrap: anywhere;
    }

    #lyrics-content {
      flex: 1;
      min-height: 0;
      overflow-y: auto !important;
      scroll-behavior: smooth;
      scrollbar-width: thin;
      scrollbar-color: #45634c transparent;
      padding: 12vh 0 35vh !important;
    }

    #lyrics-text {
      white-space: pre-wrap;
      font-family: "Segoe UI", sans-serif;
      font-size: clamp(23px, 3.5vw, 42px);
      font-weight: 700;
      line-height: 1.65;
      color: #b5e4bf;
      text-align: center;
    }

    #lyrics-text.synced-mode {
      white-space: normal;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 22px;
      text-align: center;
    }

    .lyric-line {
      width: 100%;
      max-width: 1000px;
      color: #737b76;
      opacity: .45;
      font-size: clamp(24px, 4vw, 52px);
      font-weight: 800;
      line-height: 1.35;
      letter-spacing: -.5px;
      transition:
        color .25s,
        opacity .25s,
        transform .25s;
      cursor: pointer;
      overflow-wrap: anywhere;
    }

    .lyric-line.active {
      color: #b5e4bf;
      opacity: 1;
      transform: scale(1.035);
    }

    .lyric-line.past {
      color: #b5e4bf;
      opacity: .5;
    }

    .lyric-line:hover {
      opacity: .85;
    }

    .lyrics-sync-label {
      position: fixed;
      right: 22px;
      bottom: 20px;
      z-index: 20;
      padding: 9px 14px;
      border-radius: 20px;
      background: #26382b;
      color: #b5e4bf;
      font: 12px "Segoe UI", sans-serif;
      letter-spacing: 1px;
      pointer-events: none;
    }

    @media (max-width: 600px) {
      .lyrics-header {
        padding: 16px;
      }

      .lyrics-screen {
        padding: 20px 18px !important;
      }

      #lyrics-content {
        padding-top: 14vh !important;
      }

      .lyric-line {
        font-size: clamp(23px, 7vw, 34px);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .lyric-line {
        transition: none;
      }

      #lyrics-content {
        scroll-behavior: auto;
      }
    }
  `;

  document.head.appendChild(style);

  // Perbesar popup pada halaman utama.
  try {
    const parentDoc = window.parent.document;

    if (parentDoc !== document) {
      const parentStyle = parentDoc.createElement("style");
      parentStyle.id = "ramphony-fullscreen-lyrics";

      parentStyle.textContent = `
        #lyrics-overlay.active {
          position: fixed !important;
          inset: 0 !important;
          z-index: 9999 !important;
          display: flex !important;
          padding: 0 !important;
          margin: 0 !important;
          background: #101010 !important;
        }

        #lyrics-overlay .lyrics-popup {
          width: 100vw !important;
          max-width: none !important;
          height: 100vh !important;
          height: 100dvh !important;
          max-height: none !important;
          margin: 0 !important;
          padding: 0 !important;
          border: 0 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
        }

        #lyrics-overlay .lyrics-popup iframe {
          display: block !important;
          width: 100% !important;
          height: 100% !important;
          border: 0 !important;
        }
      `;

      if (!parentDoc.getElementById(parentStyle.id)) {
        parentDoc.head.appendChild(parentStyle);
      }
    }
  } catch (error) {
    console.warn("Fullscreen parent tidak tersedia:", error);
  }
}

installFullscreenStyles();

/* ===== BADGE ===== */

const syncBadge = document.createElement("div");
syncBadge.className = "lyrics-sync-label";
syncBadge.textContent = "RAMPHONY LYRICS";
document.body.appendChild(syncBadge);

function setBadge(text) {
  syncBadge.textContent = text;
}

/* ===== HELPERS ===== */

function storageKey(song) {
  return "ramphony_lyrics_" + song.trim().toLowerCase();
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanSongName(filename) {
  return String(filename || "")
    .replace(/\.(mp3|m4a|wav|ogg|flac|aac)$/i, "")
    .replace(/^\d{1,3}[\s._-]+/, "")
    .replace(/\([^)]*(official|lyric|audio|video|visualizer)[^)]*\)/gi, "")
    .replace(/\[[^\]]*(official|lyric|audio|video|visualizer)[^\]]*\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSongName(filename) {
  const name = cleanSongName(filename);
  const parts = name.split(/\s[-–—]\s/);

  if (parts.length >= 2) {
    return {
      artist: parts[0].trim(),
      title: parts.slice(1).join(" - ").trim()
    };
  }

  return {
    artist: "",
    title: name
  };
}

function getAudio() {
  try {
    return window.parent.document.querySelector("#a");
  } catch {
    return null;
  }
}

function getDuration() {
  const audio = getAudio();

  return audio && Number.isFinite(audio.duration)
    ? audio.duration
    : 0;
}

function showMessage(message) {
  currentMode = "plain";
  syncedLines = [];
  activeLine = -1;

  lyricsText.classList.remove("synced-mode");
  lyricsText.replaceChildren();
  lyricsText.textContent = message;

  lyricsContent.scrollTop = 0;
}

/* ===== PARSE LRC ===== */

function parseLRC(lrc) {
  const lines = [];
  let offset = 0;

  for (const rawLine of String(lrc || "").split(/\r?\n/)) {
    const offsetMatch = rawLine.match(
      /^\[offset:([+-]?\d+)\]/i
    );

    if (offsetMatch) {
      offset = Number(offsetMatch[1]) / 1000;
      continue;
    }

    const stamps = [
      ...rawLine.matchAll(
        /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g
      )
    ];

    if (!stamps.length) continue;

    const text = rawLine
      .replace(/\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g, "")
      .trim();

    for (const stamp of stamps) {
      const minutes = Number(stamp[1]);
      const seconds = Number(stamp[2]);
      const fraction = stamp[3]
        ? Number("0." + stamp[3])
        : 0;

      const time = Math.max(
        0,
        minutes * 60 + seconds + fraction + offset
      );

      lines.push({
        time,
        text: text || "♪"
      });
    }
  }

  return lines.sort((a, b) => a.time - b.time);
}

/* ===== SYNCED LYRICS ===== */

function showSyncedLyrics(lrc) {
  const parsed = parseLRC(lrc);

  if (!parsed.length) {
    showMessage("NO SYNCED LYRICS");
    return;
  }

  currentMode = "synced";
  syncedLines = parsed;
  activeLine = -1;

  lyricsText.replaceChildren();
  lyricsText.classList.add("synced-mode");

  const fragment = document.createDocumentFragment();

  parsed.forEach((line, index) => {
    const element = document.createElement("div");

    element.className = "lyric-line";
    element.textContent = line.text;
    element.dataset.index = String(index);

    element.addEventListener("click", () => {
      const audio = getAudio();

      if (audio && Number.isFinite(audio.duration)) {
        audio.currentTime = line.time;
        updateSyncedLyrics(true);
      }
    });

    fragment.appendChild(element);
  });

  lyricsText.appendChild(fragment);

  setBadge("● SYNCED LYRICS");
  updateSyncedLyrics(true);
}

function findActiveLine(time) {
  let low = 0;
  let high = syncedLines.length - 1;
  let result = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);

    if (syncedLines[middle].time <= time) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return result;
}

function updateSyncedLyrics(force = false) {
  if (currentMode !== "synced") return;

  const audio = getAudio();
  if (!audio) return;

  const time = audio.currentTime || 0;
  const index = findActiveLine(time);

  if (index === activeLine && !force) return;

  activeLine = index;

  const elements = lyricsText.querySelectorAll(".lyric-line");

  elements.forEach((element, i) => {
    element.classList.toggle("active", i === index);
    element.classList.toggle("past", i < index);
  });

  if (index >= 0 && elements[index]) {
    const element = elements[index];

    const target =
      element.offsetTop -
      lyricsContent.offsetTop -
      lyricsContent.clientHeight * 0.4 +
      element.clientHeight / 2;

    lyricsContent.scrollTo({
      top: Math.max(0, target),
      behavior: force ? "auto" : "smooth"
    });
  } else if (force) {
    lyricsContent.scrollTop = 0;
  }
}

function syncLoop() {
  updateSyncedLyrics();
  animationId = requestAnimationFrame(syncLoop);
}

function startSyncLoop() {
  if (animationId !== null) return;
  animationId = requestAnimationFrame(syncLoop);
}

startSyncLoop();

/* ===== SEARCH RESULTS ===== */

function scoreResult(record, info, duration) {
  const title = normalize(record.trackName || record.name);
  const artist = normalize(record.artistName);

  const wantedTitle = normalize(info.title);
  const wantedArtist = normalize(info.artist);

  if (!title || !wantedTitle) return -100;

  let score = 0;

  if (title === wantedTitle) {
    score += 100;
  } else if (
    title.includes(wantedTitle) ||
    wantedTitle.includes(title)
  ) {
    score += 35;
  } else {
    return -100;
  }

  if (wantedArtist) {
    if (artist === wantedArtist) {
      score += 80;
    } else if (
      artist.includes(wantedArtist) ||
      wantedArtist.includes(artist)
    ) {
      score += 30;
    } else {
      return -100;
    }
  }

  if (duration > 0 && Number(record.duration) > 0) {
    const difference = Math.abs(
      Number(record.duration) - duration
    );

    if (difference <= 3) score += 30;
    else if (difference <= 12) score += 10;
    else if (difference > 45) score -= 30;
  }

  if (record.syncedLyrics) score += 25;
  if (record.plainLyrics) score += 10;

  return score;
}

function chooseBestResult(records, info, duration) {
  if (!Array.isArray(records)) return null;

  return records
    .map(record => ({
      record,
      score: scoreResult(record, info, duration)
    }))
    .filter(item => item.score >= (info.artist ? 100 : 90))
    .sort((a, b) => b.score - a.score)[0]?.record || null;
}

/* ===== DISPLAY RESULT ===== */

function showRecord(record) {
  if (record.instrumental) {
    setBadge("INSTRUMENTAL");
    showMessage("♪\n\nINSTRUMENTAL");
    return;
  }

  if (record.syncedLyrics?.trim()) {
    showSyncedLyrics(record.syncedLyrics);
    return;
  }

  if (record.plainLyrics?.trim()) {
    setBadge("STATIC LYRICS");
    showMessage(record.plainLyrics.trim());
    return;
  }

  setBadge("NO LYRICS");
  showMessage("NO LYRICS AVAILABLE");
}

/* ===== SEARCH API ===== */

async function searchLyrics(info, signal) {
  const params = new URLSearchParams({
    track_name: info.title
  });

  if (info.artist) {
    params.set("artist_name", info.artist);
  }

  const response = await fetch(
    `${API_URL}?${params.toString()}`,
    {
      signal,
      headers: {
        Accept: "application/json"
      }
    }
  );

  if (!response.ok) {
    throw new Error(`LRCLIB API: ${response.status}`);
  }

  return response.json();
}

/* ===== LOAD LYRICS ===== */

async function loadLyrics() {
  const requestId = ++currentRequest;

  if (controller) controller.abort();
  controller = new AbortController();

  if (!currentSong) {
    setBadge("NO TRACK");
    showMessage("Pilih lagu dulu, bro.");
    return;
  }

  let manualLyrics = "";

  try {
    manualLyrics =
      localStorage.getItem(storageKey(currentSong)) || "";
  } catch (error) {
    console.warn(error);
  }

  const key = currentSong.toLowerCase();

  if (cache.has(key)) {
    showRecord(cache.get(key));
    return;
  }

  if (!navigator.onLine) {
    setBadge("OFFLINE");
    showMessage(
      manualLyrics ||
      "OFFLINE\n\nButuh internet untuk mencari lirik."
    );
    return;
  }

  setBadge("SEARCHING...");
  showMessage("SEARCHING LYRICS...");

  const cleanedName = cleanSongName(currentSong);
  const parsed = parseSongName(currentSong);
  const parts = cleanedName.split(/\s[-–—]\s/);

  const attempts = [
    parsed
  ];

  // Alternatif untuk file "Judul - Artis".
  if (parts.length === 2) {
    attempts.push({
      title: parts[0].trim(),
      artist: parts[1].trim()
    });
  }

  // Alternatif tanpa nama artis.
  attempts.push({
    title: cleanedName,
    artist: ""
  });

  try {
    let bestRecord = null;

    for (const info of attempts) {
      const records = await searchLyrics(
        info,
        controller.signal
      );

      if (requestId !== currentRequest) return;

      const record = chooseBestResult(
        records,
        info,
        getDuration()
      );

      if (record) {
        bestRecord = record;
        break;
      }
    }

    if (requestId !== currentRequest) return;

    if (bestRecord) {
      cache.set(key, bestRecord);
      showRecord(bestRecord);
    } else {
      setBadge("NOT FOUND");
      showMessage(
        manualLyrics ||
        "NO LYRICS FOUND\n\n" +
        "Coba gunakan nama file:\n" +
        "Artis - Judul Lagu.mp3\n\n" +
        "Atau upload file .txt / .lrc."
      );
    }
  } catch (error) {
    if (requestId !== currentRequest) return;
    if (error.name === "AbortError") return;

    console.error("Gagal mengambil lirik:", error);

    setBadge("LYRICS UNAVAILABLE");

    showMessage(
      manualLyrics ||
      "LYRICS UNAVAILABLE\n\n" +
      "Lirik belum bisa dimuat dari layanan online.\n" +
      "Coba lagi nanti atau upload file .txt / .lrc."
    );
  }
}

/* ===== RECEIVE SONG ===== */

function setSong(name, url) {
  const nextSong = String(name || "").trim();
  const nextUrl = String(url || "");

  if (
    currentSong === nextSong &&
    currentAudioUrl === nextUrl
  ) {
    return;
  }

  currentSong = nextSong;
  currentAudioUrl = nextUrl;

  songTitle.textContent =
    currentSong || "NO TRACK SELECTED";

  loadLyrics();
}

window.addEventListener("message", event => {
  if (event.origin !== window.location.origin) return;
  if (event.source !== window.parent) return;

  if (event.data?.type === "RAMPHONY_SONG") {
    setSong(event.data.song, event.data.audioUrl);
  }
});

/* ===== AUTO DETECT TRACK CHANGES ===== */

let lastAudioSrc = "";

function checkSongChange() {
  try {
    const parentDoc = window.parent.document;
    const audio = parentDoc.querySelector("#a");
    const title = parentDoc.querySelector("#title");

    if (!audio || !title) return;

    const src =
      audio.getAttribute("src") ||
      audio.currentSrc ||
      audio.src ||
      "";

    if (src && src !== lastAudioSrc) {
      lastAudioSrc = src;
      setSong(title.textContent.trim(), src);
    }
  } catch {
    // Abaikan jika akses parent tidak tersedia.
  }
}

setInterval(checkSongChange, 500);

/* ===== MANUAL TXT / LRC ===== */

lyricsFile.addEventListener("change", async event => {
  const file = event.target.files[0];

  if (!file) return;

  if (!currentSong) {
    alert("Pilih lagu dulu, bro.");
    lyricsFile.value = "";
    return;
  }

  if (!/\.(txt|lrc)$/i.test(file.name)) {
    alert("Gunakan file .txt atau .lrc");
    lyricsFile.value = "";
    return;
  }

  const songAtUpload = currentSong;

  try {
    const content = await file.text();

    if (!content.trim()) {
      alert("File lirik kosong.");
      return;
    }

    localStorage.setItem(
      storageKey(songAtUpload),
      content
    );

    if (songAtUpload === currentSong) {
      if (
        file.name.toLowerCase().endsWith(".lrc") &&
        parseLRC(content).length
      ) {
        showSyncedLyrics(content);
      } else {
        setBadge("MANUAL LYRICS");
        showMessage(content);
      }
    }
  } catch (error) {
    console.error(error);
    alert("Gagal membaca file lirik.");
  } finally {
    lyricsFile.value = "";
  }
});

/* ===== DELETE MANUAL LYRICS ===== */

deleteButton.addEventListener("click", () => {
  if (!currentSong) return;

  try {
    localStorage.removeItem(storageKey(currentSong));
    cache.delete(currentSong.toLowerCase());
    loadLyrics();
  } catch (error) {
    console.error(error);
    alert("Gagal menghapus lirik.");
  }
});

/* ===== CLOSE FULLSCREEN ===== */

closeButton.addEventListener("click", () => {
  if (window.parent !== window) {
    window.parent.postMessage(
      { type: "RAMPHONY_CLOSE_LYRICS" },
      window.location.origin
    );
  } else {
    window.location.href = "../index.html";
  }
});

/* ===== READY ===== */

if (window.parent !== window) {
  window.parent.postMessage(
    { type: "RAMPHONY_LYRICS_READY" },
    window.location.origin
  );
}
