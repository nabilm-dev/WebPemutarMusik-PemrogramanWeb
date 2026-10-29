
/* ==========================================
   RAMPHONY
   PLAYLIST MANAGER + PLAYER
   SHARED FULLSCREEN LYRICS
   ========================================== */

(() => {
  "use strict";

  const STORAGE_KEY = "ramphony_custom_playlists_v1";
  const DB_NAME = "ramphony-music-v1";
  const STORE_NAME = "songs";

  const $ = selector => document.querySelector(selector);

  let playlists = [];
  let songs = [];
  let activeId = null;
  let dialogMode = "create";
  let pendingKeys = new Set();

  let queue = [];
  let queueIndex = -1;
  let playingPlaylistId = null;

  let shuffle = false;
  let repeat = 0;
  let currentUrl = null;

  const audio = $("#playlist-audio");

  if (!audio) {
    console.error("Audio #playlist-audio tidak ditemukan.");
    return;
  }

  audio.volume = 0.8;

  /* ==========================================
     STORAGE
     ========================================== */

  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "[]"
    );

    if (Array.isArray(saved)) {
      playlists = saved.map(item => ({
        id: String(item.id),
        name: String(item.name),
        songs: Array.isArray(item.songs)
          ? item.songs
          : []
      }));
    }
  } catch (error) {
    console.error("Playlist storage error:", error);
  }

  function persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(playlists)
      );

      return true;
    } catch (error) {
      console.error(error);
      alert("Gagal menyimpan playlist.");
      return false;
    }
  }

  function activePlaylist() {
    return playlists.find(item => item.id === activeId);
  }

  function songKey(song) {
    return "local:" + song.id;
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) {
      return "0:00";
    }

    const minutes = Math.floor(seconds / 60);
    const remaining = Math.floor(seconds % 60);

    return (
      minutes +
      ":" +
      String(remaining).padStart(2, "0")
    );
  }

  /* ==========================================
     INDEXEDDB MUSIC LIBRARY
     ========================================== */

  function loadLibrary() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB tidak tersedia."));
        return;
      }

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

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.close();
          reject(new Error("Store songs tidak ditemukan."));
          return;
        }

        const transaction = db.transaction(
          STORE_NAME,
          "readonly"
        );

        const getRequest = transaction
          .objectStore(STORE_NAME)
          .getAll();

        getRequest.onsuccess = () => {
          const records = getRequest.result || [];

          db.close();

          resolve(
            records
              .filter(song => song.file instanceof Blob)
              .sort(
                (a, b) =>
                  (a.addedAt || 0) -
                  (b.addedAt || 0)
              )
          );
        };

        getRequest.onerror = () => {
          db.close();
          reject(getRequest.error);
        };
      };

      request.onerror = () => reject(request.error);

      request.onblocked = () => {
        reject(new Error("Database sedang digunakan."));
      };
    });
  }

  /* ==========================================
     VIEWS
     ========================================== */

  function showLibrary() {
    activeId = null;

    $("#library-view").hidden = false;
    $("#detail-view").hidden = true;

    renderCards();
  }

  function showDetail(id) {
    activeId = id;

    $("#library-view").hidden = true;
    $("#detail-view").hidden = false;

    renderDetail();
  }

  function renderCards() {
    const grid = $("#playlist-grid");

    grid.replaceChildren();

    const empty = $("#empty-playlists");

    if (empty) {
      empty.hidden = playlists.length > 0;
    }

    playlists.forEach(playlist => {
      const card = document.createElement("button");

      card.type = "button";
      card.className = "playlist-card";

      const art = document.createElement("div");
      art.className = "playlist-art";
      art.textContent = "♫";

      const title = document.createElement("h3");
      title.textContent = playlist.name;

      const count = document.createElement("p");
      count.textContent =
        playlist.songs.length + " songs";

      card.append(art, title, count);

      card.addEventListener("click", () => {
        showDetail(playlist.id);
      });

      grid.appendChild(card);
    });
  }

  function buildQueue(playlist) {
    return playlist.songs
      .map(key =>
        songs.find(song => songKey(song) === key)
      )
      .filter(Boolean);
  }

  function renderDetail() {
    const playlist = activePlaylist();

    if (!playlist) {
      showLibrary();
      return;
    }

    $("#detail-title").textContent = playlist.name;

    $("#detail-count").textContent =
      playlist.songs.length + " songs";

    const container = $("#playlist-tracks");

    container.replaceChildren();

    const playlistSongs = buildQueue(playlist);

    if (!playlistSongs.length) {
      const empty = document.createElement("div");

      empty.className = "empty-tracks";
      empty.textContent =
        "Playlist masih kosong. Klik Add / Remove Songs untuk menambahkan lagu.";

      container.appendChild(empty);
      return;
    }

    playlistSongs.forEach((song, index) => {
      const row = document.createElement("div");

      row.className = "track-row";

      if (
        playingPlaylistId === playlist.id &&
        queue[queueIndex] &&
        songKey(queue[queueIndex]) === songKey(song)
      ) {
        row.classList.add("playing");
      }

      const number = document.createElement("span");
      number.className = "track-number";
      number.textContent = index + 1;

      const title = document.createElement("span");
      title.className = "track-title";
      title.textContent = song.name;

      const button = document.createElement("button");

      button.type = "button";
      button.className = "track-play";
      button.textContent = "▶";
      button.title = "Play song";

      button.addEventListener("click", () => {
        playPlaylist(songKey(song));
      });

      row.append(number, title, button);

      row.addEventListener("dblclick", () => {
        playPlaylist(songKey(song));
      });

      container.appendChild(row);
    });
  }

  /* ==========================================
     CREATE / RENAME PLAYLIST
     ========================================== */

  function openNameModal(mode) {
    dialogMode = mode;

    const playlist = activePlaylist();

    $("#name-modal-title").textContent =
      mode === "create"
        ? "Create Playlist"
        : "Rename Playlist";

    $("#playlist-name").value =
      mode === "rename" && playlist
        ? playlist.name
        : "";

    $("#name-modal").hidden = false;
    $("#playlist-name").focus();
  }

  function closeNameModal() {
    $("#name-modal").hidden = true;
  }

  function saveName() {
    const name = $("#playlist-name").value.trim();

    if (!name) {
      alert("Nama playlist nggak boleh kosong, bro.");
      return;
    }

    if (dialogMode === "create") {
      const id =
        "playlist-" +
        Date.now() +
        "-" +
        Math.random().toString(36).slice(2, 8);

      const playlist = {
        id,
        name,
        songs: []
      };

      playlists.push(playlist);

      if (!persist()) {
        playlists.pop();
        return;
      }

      closeNameModal();
      showDetail(id);
    } else {
      const playlist = activePlaylist();

      if (!playlist) return;

      const previousName = playlist.name;

      playlist.name = name;

      if (!persist()) {
        playlist.name = previousName;
        return;
      }

      closeNameModal();
      renderDetail();

      if (playingPlaylistId === playlist.id) {
        $("#playing-playlist").textContent = name;
      }
    }
  }

  /* ==========================================
     ADD / REMOVE SONGS
     ========================================== */

  function openSongsModal() {
    const playlist = activePlaylist();

    if (!playlist) return;

    pendingKeys = new Set(playlist.songs);

    $("#song-search").value = "";
    $("#songs-modal").hidden = false;

    renderManageSongs();

    // Refresh daftar lagu jika ada upload terbaru.
    loadLibrary()
      .then(records => {
        songs = records;

        if (!$("#songs-modal").hidden) {
          renderManageSongs();
        }
      })
      .catch(console.error);
  }

  function closeSongsModal() {
    $("#songs-modal").hidden = true;
  }

  function renderManageSongs() {
    const container = $("#manage-song-list");

    container.replaceChildren();

    const search = $("#song-search")
      .value
      .trim()
      .toLowerCase();

    if (!songs.length) {
      const message = document.createElement("div");

      message.className = "empty-tracks";
      message.textContent =
        "Belum ada lagu lokal. Upload MP3 dari Home terlebih dahulu.";

      container.appendChild(message);
      return;
    }

    const filtered = songs.filter(song =>
      song.name.toLowerCase().includes(search)
    );

    if (!filtered.length) {
      const message = document.createElement("div");

      message.className = "empty-tracks";
      message.textContent = "Lagu tidak ditemukan.";

      container.appendChild(message);
      return;
    }

    filtered.forEach(song => {
      const row = document.createElement("label");

      row.className = "manage-song-row";

      const checkbox = document.createElement("input");

      checkbox.type = "checkbox";
      checkbox.checked = pendingKeys.has(songKey(song));

      checkbox.addEventListener("change", () => {
        const key = songKey(song);

        if (checkbox.checked) {
          pendingKeys.add(key);
        } else {
          pendingKeys.delete(key);
        }
      });

      const name = document.createElement("span");
      name.textContent = song.name;

      row.append(checkbox, name);
      container.appendChild(row);
    });
  }

  function saveSongs() {
    const playlist = activePlaylist();

    if (!playlist) return;

    const previous = playlist.songs;

    playlist.songs = [...pendingKeys];

    if (!persist()) {
      playlist.songs = previous;
      return;
    }

    closeSongsModal();

    if (playingPlaylistId === playlist.id) {
      const currentSong = queue[queueIndex];

      const currentKey = currentSong
        ? songKey(currentSong)
        : null;

      const updatedQueue = buildQueue(playlist);

      if (!updatedQueue.length) {
        stopPlayer();
      } else if (currentKey) {
        const newIndex = updatedQueue.findIndex(
          song => songKey(song) === currentKey
        );

        if (newIndex !== -1) {
          queue = updatedQueue;
          queueIndex = newIndex;
        } else {
          stopPlayer();
        }
      }
    }

    renderDetail();
  }

  /* ==========================================
     DELETE PLAYLIST
     ========================================== */

  function deletePlaylist() {
    const playlist = activePlaylist();

    if (!playlist) return;

    if (!confirm(`Hapus playlist "${playlist.name}"?`)) {
      return;
    }

    const previous = playlists;

    playlists = playlists.filter(
      item => item.id !== playlist.id
    );

    if (!persist()) {
      playlists = previous;
      return;
    }

    if (playingPlaylistId === playlist.id) {
      stopPlayer();
    }

    showLibrary();
  }

  /* ==========================================
     SHARED FULLSCREEN LYRICS
     ========================================== */

  const lyricsOverlay = $("#lyrics-overlay");
  const lyricsFrame = $("#playlist-lyrics-frame");

  function sendSongToLyrics() {
    if (!lyricsFrame || !lyricsFrame.contentWindow) {
      return;
    }

    const song = queue[queueIndex];

    if (!song) return;

    lyricsFrame.contentWindow.postMessage(
      {
        type: "RAMPHONY_SONG",
        song: song.name,
        audioUrl: audio.currentSrc || audio.src || ""
      },
      window.location.origin
    );
  }

  function openLyrics() {
    if (!queue[queueIndex]) {
      alert("Putar lagu dulu buat lihat lyrics, bro.");
      return;
    }

    if (!lyricsOverlay || !lyricsFrame) {
      alert(
        "Iframe Lyrics belum ada di playlist.html."
      );
      return;
    }

    lyricsOverlay.hidden = false;

    if (
      lyricsFrame.getAttribute("src") === "about:blank" ||
      !lyricsFrame.getAttribute("src")
    ) {
      lyricsFrame.src = "lyrics.html";
    } else {
      sendSongToLyrics();
    }
  }

  function closeLyrics() {
    if (lyricsOverlay) {
      lyricsOverlay.hidden = true;
    }
  }

  window.addEventListener("message", event => {
    if (event.origin !== window.location.origin) {
      return;
    }

    if (
      !lyricsFrame ||
      event.source !== lyricsFrame.contentWindow
    ) {
      return;
    }

    if (event.data?.type === "RAMPHONY_LYRICS_READY") {
      sendSongToLyrics();
    }

    if (
      event.data?.type === "RAMPHONY_CLOSE_LYRICS"
    ) {
      closeLyrics();
    }
  });

  /* ==========================================
     MUSIC PLAYER
     ========================================== */

  function playPlaylist(startKey = null) {
    const playlist = activePlaylist();

    if (!playlist) return;

    const newQueue = buildQueue(playlist);

    if (!newQueue.length) {
      alert(
        "Playlist kosong. Tambahin lagu lewat Add / Remove Songs dulu, bro."
      );
      return;
    }

    queue = newQueue;
    playingPlaylistId = playlist.id;

    let index = 0;

    if (startKey) {
      const found = queue.findIndex(
        song => songKey(song) === startKey
      );

      if (found >= 0) {
        index = found;
      }
    }

    loadTrack(index);
  }

  function loadTrack(index) {
    if (index < 0 || index >= queue.length) {
      return;
    }

    const song = queue[index];

    queueIndex = index;

    audio.pause();

    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
      currentUrl = null;
    }

    currentUrl = URL.createObjectURL(song.file);

    audio.src = currentUrl;
    audio.load();

    const playlist = playlists.find(
      item => item.id === playingPlaylistId
    );

    $("#playing-title").textContent = song.name;

    $("#playing-playlist").textContent =
      playlist ? playlist.name : "Ramphony";

    $("#playlist-player").hidden = false;

    $("#player-current").textContent = "0:00";
    $("#player-duration").textContent = "0:00";
    $("#player-seek").value = 0;

    sendSongToLyrics();

    if (activeId === playingPlaylistId) {
      renderDetail();
    }

    audio.play().catch(error => {
      console.warn("Gagal memutar lagu:", error);
    });
  }

  function togglePlay() {
    if (!audio.src) {
      playPlaylist();
      return;
    }

    if (audio.paused) {
      audio.play().catch(console.warn);
    } else {
      audio.pause();
    }
  }

  function step(direction) {
    if (!queue.length) return;

    if (
      shuffle &&
      direction > 0 &&
      queue.length > 1
    ) {
      let nextIndex;

      do {
        nextIndex = Math.floor(
          Math.random() * queue.length
        );
      } while (nextIndex === queueIndex);

      loadTrack(nextIndex);
      return;
    }

    let nextIndex = queueIndex + direction;

    if (nextIndex >= queue.length) {
      if (repeat === 1) {
        nextIndex = 0;
      } else {
        audio.pause();
        audio.currentTime = 0;
        return;
      }
    }

    if (nextIndex < 0) {
      nextIndex =
        repeat === 1 ? queue.length - 1 : 0;
    }

    loadTrack(nextIndex);
  }

  function stopPlayer() {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();

    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
      currentUrl = null;
    }

    queue = [];
    queueIndex = -1;
    playingPlaylistId = null;

    closeLyrics();

    $("#playlist-player").hidden = true;
    $("#player-play").textContent = "▶";
  }

  /* ==========================================
     PLAYER EVENTS
     ========================================== */

  audio.addEventListener("play", () => {
    $("#player-play").textContent = "❚❚";
  });

  audio.addEventListener("pause", () => {
    $("#player-play").textContent = "▶";
  });

  audio.addEventListener("loadedmetadata", () => {
    $("#player-duration").textContent =
      formatTime(audio.duration);
  });

  audio.addEventListener("timeupdate", () => {
    $("#player-current").textContent =
      formatTime(audio.currentTime);

    if (
      Number.isFinite(audio.duration) &&
      audio.duration > 0
    ) {
      $("#player-seek").value = Math.round(
        (audio.currentTime / audio.duration) * 1000
      );
    }
  });

  audio.addEventListener("ended", () => {
    if (repeat === 2) {
      audio.currentTime = 0;
      audio.play().catch(console.warn);
    } else {
      step(1);
    }
  });

  /* ==========================================
     SAFE EVENT BINDING
     ========================================== */

  function bindClick(selector, callback) {
    const element = $(selector);

    if (!element) {
      console.warn("Elemen tidak ditemukan:", selector);
      return;
    }

    element.addEventListener("click", callback);
  }

  bindClick("#player-play", togglePlay);
  bindClick("#player-prev", () => step(-1));
  bindClick("#player-next", () => step(1));

  bindClick("#player-lyrics", openLyrics);

  const seek = $("#player-seek");

  if (seek) {
    seek.addEventListener("input", event => {
      if (!Number.isFinite(audio.duration)) {
        return;
      }

      audio.currentTime =
        (Number(event.target.value) / 1000) *
        audio.duration;
    });
  }

  const volume = $("#player-volume");

  if (volume) {
    volume.value = 80;

    volume.addEventListener("input", event => {
      audio.volume =
        Number(event.target.value) / 100;
    });
  }

  bindClick("#player-shuffle", () => {
    shuffle = !shuffle;

    $("#player-shuffle").classList.toggle(
      "active",
      shuffle
    );
  });

  bindClick("#player-repeat", () => {
    repeat = (repeat + 1) % 3;

    const button = $("#player-repeat");

    button.classList.toggle(
      "active",
      repeat !== 0
    );

    button.title = [
      "Repeat Off",
      "Repeat All",
      "Repeat One"
    ][repeat];

    button.textContent =
      repeat === 2 ? "↻¹" : "↻";
  });

  /* ==========================================
     PLAYLIST PAGE EVENTS
     ========================================== */

  bindClick("#create-btn", () => {
    openNameModal("create");
  });

  bindClick("#empty-create", () => {
    openNameModal("create");
  });

  bindClick("#back-playlists", showLibrary);

  bindClick("#play-playlist", () => {
    playPlaylist();
  });

  bindClick("#manage-songs", openSongsModal);

  bindClick("#rename-btn", () => {
    openNameModal("rename");
  });

  bindClick("#delete-btn", deletePlaylist);

  bindClick("#cancel-name", closeNameModal);
  bindClick("#save-name", saveName);

  const nameInput = $("#playlist-name");

  if (nameInput) {
    nameInput.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        saveName();
      }
    });
  }

  const nameModal = $("#name-modal");

  if (nameModal) {
    nameModal.addEventListener("click", event => {
      if (event.target === nameModal) {
        closeNameModal();
      }
    });
  }

  bindClick("#close-songs", closeSongsModal);
  bindClick("#cancel-songs", closeSongsModal);
  bindClick("#save-songs", saveSongs);

  const songsModal = $("#songs-modal");

  if (songsModal) {
    songsModal.addEventListener("click", event => {
      if (event.target === songsModal) {
        closeSongsModal();
      }
    });
  }

  const songSearch = $("#song-search");

  if (songSearch) {
    songSearch.addEventListener(
      "input",
      renderManageSongs
    );
  }

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeNameModal();
      closeSongsModal();
      closeLyrics();
    }
  });

  /* ==========================================
     INITIALIZE
     ========================================== */

  showLibrary();

  loadLibrary()
    .then(records => {
      songs = records;

      if (activeId) {
        renderDetail();
      }

      console.log(
        "Ramphony Playlist siap:",
        songs.length,
        "lagu lokal"
      );
    })
    .catch(error => {
      console.error(
        "Gagal membaca library musik:",
        error
      );
    });

})();
