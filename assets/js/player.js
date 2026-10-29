
/* ===== RAMPHONY MUSIC PLAYER ===== */

const $ = (selector) => document.querySelector(selector);
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
    ? `Daftar putar (${tracks.length})`
    : "Daftar putar";

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
      if (index === cur) {
        toggle();
      } else {
        load(index, true);
      }
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

  audio.src = track.src;
  audio.load();

  $("#title").textContent = track.name;
  $("#bottom-title").textContent = track.name;
  $("#sub").textContent =
    track.tag === "Demo" ? "Lagu demo" : "Dari perangkatmu";

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

  if (autoplay) {
    playAudio();
  }
}

/* ===== PLAY / PAUSE ===== */

function playAudio() {
  initAudioAnalyser();

  audio.play().catch(error => {
    console.warn("Audio tidak dapat diputar:", error);
  });
}

function toggle() {
  if (cur < 0) {
    if (tracks.length) {
      load(0, true);
    } else {
      $("#pick").click();
    }
    return;
  }

  if (audio.paused) {
    playAudio();
  } else {
    audio.pause();
  }
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
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
  } else {
    step(-1);
  }
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

/* ===== UPLOAD SONGS ===== */

$("#pick").onclick = () => $("#file").click();
$("#demo").onclick = addDemo;

$("#file").onchange = event => {
  addFiles(event.target.files);
  event.target.value = "";
};

function addFiles(files) {
  const items = [...files]
    .filter(file =>
      file.type.startsWith("audio/") ||
      /\.(mp3|m4a|wav|ogg|flac|aac)$/i.test(file.name)
    )
    .map(file => ({
      name: file.name.replace(/\.[^.]+$/, ""),
      src: URL.createObjectURL(file),
      tag: "Berkas"
    }));

  add(items);
}

/* ===== TIME FORMAT ===== */

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";

  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  return minutes + ":" + String(secs).padStart(2, "0");
}

/* ===== FIXED PROGRESS BAR ===== */

const seek = $("#seek");
const bottomSeek = $("#bottom-progress");

// Semua progress menggunakan skala 0 sampai 100.
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
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
    return;
  }

  audio.currentTime = (Number(percent) / 100) * audio.duration;
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

audio.volume = 1;

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

  repeat:
    '<path d="M17 2l4 4-4 4V7H6a2 2 0 00-2 2v2H2V9a4 4 0 014-4h11V2zm1 15a2 2 0 002-2v-2h2v2a4 4 0 01-4 4H7v3l-4-4 4-4v3h11z"/>',

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

// Hentikan animasi CSS lama agar tidak bentrok.
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
    // Ambil rentang frekuensi rendah hingga menengah.
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

  if (playing) {
    startVisualizer();
  } else {
    stopVisualizer();
  }
}

audio.addEventListener("play", () => {
  initAudioAnalyser();
  updateState(true);
});

audio.addEventListener("pause", () => {
  updateState(false);
});

audio.addEventListener("ended", () => {
  if (repeat === 2) {
    audio.currentTime = 0;
    playAudio();
  } else if (repeat === 1 || cur < tracks.length - 1) {
    step(1);
  } else {
    updateState(false);
  }
});

audio.addEventListener("error", () => {
  console.error("File audio gagal dimuat:", audio.src);
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
  ) {
    return;
  }

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

/* ===== INITIALIZATION ===== */

render();
updateState(false);
updateSeekFill();
updateProfile();
