
"use strict";

/* ==========================================
   RAMPHONY - SHARED LYRICS
   HOME + MY PLAYLIST
========================================== */

const songTitle = document.querySelector("#song-title");
const lyricsText = document.querySelector("#lyrics-text");
const lyricsFile = document.querySelector("#lyrics-file");
const lyricsContent = document.querySelector("#lyrics-content");
const deleteButton = document.querySelector("#delete-lyrics");
const closeButton = document.querySelector("#close-lyrics");

const playButton = document.querySelector("#lyrics-play");
const prevButton = document.querySelector("#lyrics-prev");
const nextButton = document.querySelector("#lyrics-next");

const progress = document.querySelector("#lyrics-progress");
const currentLabel = document.querySelector("#lyrics-current");
const durationLabel = document.querySelector("#lyrics-duration");

const API_URL = "https://lrclib.net/api/search";

let currentSong = "";
let currentAudioUrl = "";
let syncedLines = [];
let activeLine = -1;
let currentRequest = 0;
let controller = null;
let currentMode = "plain";
let lastAudioSrc = "";
let isDragging = false;

const cache = new Map();

/* ===== FULLSCREEN ===== */

function installFullscreenStyles() {
  const style = document.createElement("style");

  style.textContent = `
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
    }

    .lyrics-app {
      width: 100%;
      height: 100dvh;
      max-width: none !important;
      margin: 0 !important;
      border: none !important;
      border-radius: 0 !important;
    }

    /* Hapus semua badge status lama */
    .lyrics-sync-label {
      display: none !important;
    }
  `;

  document.head.appendChild(style);
}

installFullscreenStyles();

/*
  Tidak ada lagi pembuatan badge
  "SYNCED LYRICS".
*/

/* ===== AUDIO HOME / PLAYLIST ===== */

function getParentDocument() {
  try {
    return window.parent.document;
  } catch {
    return null;
  }
}

function getAudio() {
  const doc = getParentDocument();

  if (!doc) return null;

  return doc.querySelector(
    "#playlist-audio, #a"
  );
}

function getDuration() {
  const audio = getAudio();

  return audio && Number.isFinite(audio.duration)
    ? audio.duration
    : 0;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);

  return minutes + ":" + String(remaining).padStart(2, "0");
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
    .replace(
      /\([^)]*(official|lyric|audio|video|visualizer)[^)]*\)/gi,
      ""
    )
    .replace(
      /\[[^\]]*(official|lyric|audio|video|visualizer)[^\]]*\]/gi,
      ""
    )
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

function showMessage(message) {
  currentMode = "plain";
  syncedLines = [];
  activeLine = -1;

  lyricsText.classList.remove("synced-mode");
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

      lines.push({
        time: Math.max(
          0,
          minutes * 60 + seconds + fraction + offset
        ),
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

  const index = findActiveLine(audio.currentTime || 0);

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

/* ===== LRCLIB MATCHING ===== */

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

function showRecord(record) {
  if (record.instrumental) {
    showMessage("♪\n\nINSTRUMENTAL");
    return;
  }

  if (record.syncedLyrics?.trim()) {
    showSyncedLyrics(record.syncedLyrics);
    return;
  }

  if (record.plainLyrics?.trim()) {
    showMessage(record.plainLyrics.trim());
    return;
  }

  showMessage("NO LYRICS AVAILABLE");
}

/* ===== SEARCH LYRICS ===== */

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

  if (manualLyrics.trim()) {
    if (parseLRC(manualLyrics).length) {
      showSyncedLyrics(manualLyrics);
    } else {
      showMessage(manualLyrics);
    }
    return;
  }

  const key = currentSong.toLowerCase();

  if (cache.has(key)) {
    showRecord(cache.get(key));
    return;
  }

  if (!navigator.onLine) {
    showMessage(
      "OFFLINE\n\nButuh internet untuk mencari lirik."
    );
    return;
  }

  showMessage("SEARCHING LYRICS...");

  const cleanedName = cleanSongName(currentSong);
  const parsed = parseSongName(currentSong);
  const parts = cleanedName.split(/\s[-–—]\s/);

  const attempts = [parsed];

  if (parts.length === 2) {
    attempts.push({
      title: parts[0].trim(),
      artist: parts[1].trim()
    });
  }

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
      showMessage(
        "NO LYRICS FOUND\n\n" +
        "Coba gunakan nama file:\n" +
        "Artis - Judul Lagu.mp3"
      );
    }
  } catch (error) {
    if (requestId !== currentRequest) return;
    if (error.name === "AbortError") return;

    console.error("Gagal mengambil lirik:", error);

    showMessage(
      "LYRICS UNAVAILABLE\n\n" +
      "Lirik belum bisa dimuat dari layanan online."
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

/* ===== AUTO DETECT TRACK ===== */

function checkSongChange() {
  const parentDoc = getParentDocument();
  if (!parentDoc) return;

  const audio = getAudio();

  const title = parentDoc.querySelector(
    "#playing-title, #title"
  );

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
}

setInterval(checkSongChange, 500);

/* ===== UPLOAD TXT / LRC ===== */

lyricsFile?.addEventListener("change", async event => {
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
      if (parseLRC(content).length) {
        showSyncedLyrics(content);
      } else {
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

deleteButton?.addEventListener("click", () => {
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

/* ===== PLAY / PAUSE ===== */

playButton?.addEventListener("click", () => {
  const audio = getAudio();
  if (!audio) return;

  if (audio.paused) {
    audio.play().catch(error => {
      console.warn("Gagal memutar lagu:", error);
    });
  } else {
    audio.pause();
  }
});

/* ===== PREVIOUS / NEXT ===== */

function clickParentControl(...selectors) {
  const parentDoc = getParentDocument();
  if (!parentDoc) return;

  for (const selector of selectors) {
    const button = parentDoc.querySelector(selector);

    if (button) {
      button.click();
      return;
    }
  }
}

prevButton?.addEventListener("click", () => {
  clickParentControl(
    "#player-prev",
    "#mobile-prev",
    "#prev"
  );
});

nextButton?.addEventListener("click", () => {
  clickParentControl(
    "#player-next",
    "#mobile-next",
    "#next"
  );
});

/* ===== SEEK HOME + PLAYLIST ===== */

function seekTo(percent) {
  const audio = getAudio();

  if (
    !audio ||
    !Number.isFinite(audio.duration) ||
    audio.duration <= 0
  ) {
    return;
  }

  const value = Math.max(
    0,
    Math.min(100, Number(percent) || 0)
  );

  audio.currentTime = (value / 100) * audio.duration;

  if (currentLabel) {
    currentLabel.textContent = formatTime(audio.currentTime);
  }
}

progress?.addEventListener("pointerdown", () => {
  isDragging = true;
});

progress?.addEventListener(
  "input",
  event => {
    isDragging = true;
    seekTo(progress.value);
    progress.style.setProperty(
      "--progress",
      progress.value + "%"
    );

    // Cegah handler seek lama menimpa kontrol Playlist.
    event.stopImmediatePropagation();
  },
  true
);

function stopDragging() {
  isDragging = false;
}

progress?.addEventListener("pointerup", stopDragging);
progress?.addEventListener("pointercancel", stopDragging);
progress?.addEventListener("change", stopDragging);

/* ===== UPDATE CONTROLS ===== */

function updatePlayerControls() {
  const audio = getAudio();

  if (playButton) {
    playButton.textContent =
      audio && !audio.paused ? "⏸" : "▶";

    playButton.setAttribute(
      "aria-label",
      audio && !audio.paused ? "Pause" : "Play"
    );
  }

  if (audio) {
    const duration = Number.isFinite(audio.duration)
      ? audio.duration
      : 0;

    const current = audio.currentTime || 0;

    if (durationLabel) {
      durationLabel.textContent = formatTime(duration);
    }

    if (!isDragging) {
      if (currentLabel) {
        currentLabel.textContent = formatTime(current);
      }

      if (progress) {
        progress.value = duration > 0
          ? (current / duration) * 100
          : 0;

        progress.style.setProperty(
          "--progress",
          progress.value + "%"
        );
      }
    }
  }

  updateSyncedLyrics();
  requestAnimationFrame(updatePlayerControls);
}

requestAnimationFrame(updatePlayerControls);

/* ===== CLOSE LYRICS ===== */

closeButton?.addEventListener("click", () => {
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
