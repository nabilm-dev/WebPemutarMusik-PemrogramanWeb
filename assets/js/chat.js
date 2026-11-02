/**

 * RAMPHONY CHAT MODULE - REAL USER-TO-USER MESSAGING

 * - Strictly real registered users (NO bots, NO simulated auto-replies)

 * - Dynamic contact list from registered accounts (ramphony_registered_accounts / Firebase)

 * - Pair-based threads: messages sync between real user accounts across tabs/devices

 * - Theme: Dark-Mint Glassmorphism (matching Ramphony Hi-Fi palette)

 * - Music playback in background is completely untouched and uninterrupted

 */

(() => {

  "use strict";

  /* ========================================================

     1. STORAGE KEYS & BROADCAST

     ======================================================== */

  const SESSION_USER_KEY = "ramphony_user";

  const REGISTERED_DB_KEY = "ramphony_registered_accounts";

  const PROFILE_KEY = "ramphony_profile";

  const THREADS_KEY = "ramphony_user_chat_threads_v3";

  // Supabase Storage for Free Real Cloud MP3 Sharing
  const SUPABASE_CONFIG = {
    url: "https://tiwrxzyqrlmikufxhbmi.supabase.co",
    key: "sb_publishable_-W-KpVS2oO8ZheUkIfxbig_JRv7RHWT",
    bucket: "ramphony-audio"
  };

  // Optional Firebase config

  const FIREBASE_CONFIG = {

    apiKey: "AIzaSyCFTIWsLvADZL-xWH3hkElZ7YfdBiHbl7Y",

    authDomain: "ramphony-c5922.firebaseapp.com",

    projectId: "ramphony-c5922",

    storageBucket: "ramphony-c5922.firebasestorage.app",

    messagingSenderId: "1042827368179",

    appId: "1:1042827368179:web:a7c98dc4f198a091c48986",

    measurementId: "G-BPLC15NSH0"

  };

  let broadcastChannel = null;

  let firestoreDb = null;

  let activeRecipientUsername = null;

  let currentFilter = "all";

  let currentSearch = "";

  try {

    if ("BroadcastChannel" in window) {

      broadcastChannel = new BroadcastChannel("ramphony_chat_sync");

      broadcastChannel.onmessage = event => {

        handleIncomingBroadcast(event.data);

      };

    }

  } catch (err) {

    console.warn("BroadcastChannel not available:", err);

  }

  /* Listen to storage changes across tabs / login events */

  window.addEventListener("storage", event => {

    if (event.key === THREADS_KEY) {

      if (activeRecipientUsername) {

        renderMessages(activeRecipientUsername);

      }

      renderInbox();

      checkUnreadNotification();

    }

    if (event.key === REGISTERED_DB_KEY || event.key === SESSION_USER_KEY || event.key === PROFILE_KEY) {

      updateGreeting();

      renderInbox();

    }

  });

  /* Listen to internal auth changes */

  window.addEventListener("message", event => {

    const data = event.data;

    if (data && (data.type === "RAMPHONY_AUTH_LOGIN" || data.type === "RAMPHONY_PROFILE_UPDATED" || data.type === "RAMPHONY_AUTH_CHANGE")) {

      if (!data.user) {

        activeRecipientUsername = null;

        closeChat();

      }

      updateGreeting();

      renderInbox();

    }

  });

  /* ========================================================

     2. REAL USER & CONTACT MANAGERS

     ======================================================== */

  function getCurrentUser() {

    try {

      const s = localStorage.getItem(SESSION_USER_KEY);

      if (s) {

        const u = JSON.parse(s);

        if (u && (u.username || u.displayName || u.email)) {

          return {

            uid: u.uid || "",

            email: String(u.email || "").toLowerCase().trim(),

            username: String(u.username || "").toLowerCase().trim(),

            displayName: String(u.displayName || u.username || (u.email ? u.email.split("@")[0] : "User")).trim(),

            avatar: u.avatar || ""

          };

        }

      }

    } catch (e) {}

    try {

      const p = localStorage.getItem(PROFILE_KEY);

      if (p) {

        const parsed = JSON.parse(p);

        if (parsed && (parsed.username || parsed.displayName)) {

          return {

            uid: "",

            email: String(parsed.email || "").toLowerCase().trim(),

            username: String(parsed.username || "").toLowerCase().trim(),

            displayName: String(parsed.displayName || parsed.username || "User").trim(),

            avatar: parsed.avatar || ""

          };

        }

      }

    } catch (e) {}

    return {

      uid: "",

      email: "",

      username: "",

      displayName: "User",

      avatar: ""

    };

  }

  function getRegisteredUsers() {

    let list = [];

    try {

      const s = localStorage.getItem(REGISTERED_DB_KEY);

      if (s) {

        const parsed = JSON.parse(s);

        if (Array.isArray(parsed)) {

          // Strictly real registered users (must have valid email or uid, filter out dummy mock accounts)

          list = parsed.filter(u => {

            if (!u || !u.username) return false;

            const uname = String(u.username).toLowerCase().trim();

            if (["teman", "budi", "fajar", "guest"].includes(uname)) return false;

            if (String(u.id || "").startsWith("usr_")) return false;

            // Must have email or uid (real accounts only)

            if (!u.email && !u.uid) return false;

            return true;

          });

        }

      }

    } catch (e) {}

    return list;

  }

  /* ========================================================

     3. THREAD STORAGE (PAIR BASED KEY: [userA, userB].sort())

     ======================================================== */

  function getThreadKey(userA, userB) {

    const a = String(userA || "").toLowerCase().trim();

    const b = String(userB || "").toLowerCase().trim();

    return [a, b].sort().join("__thread__");

  }

  function getAllThreads() {

    try {

      const s = localStorage.getItem(THREADS_KEY);

      if (s) {

        const data = JSON.parse(s);

        if (data && typeof data === "object") return data;

      }

    } catch (e) {}

    return {};

  }

  function saveAllThreads(threads) {

    try {

      localStorage.setItem(THREADS_KEY, JSON.stringify(threads));

    } catch (e) {}

  }

  function getMessagesForContact(targetUsername) {

    const me = getCurrentUser();

    const threads = getAllThreads();

    const key = getThreadKey(me.username, targetUsername);

    return threads[key] || [];

  }

  /* ========================================================

     4. SCREEN 1: INBOX / REAL USER SELECTOR

     ======================================================== */

  function updateGreeting() {

    const me = getCurrentUser();

    const greetingEl = document.getElementById("chat-inbox-my-name");

    if (greetingEl) {

      greetingEl.textContent = me.displayName;

    }

  }

  function renderInbox() {

    updateGreeting();

    const container = document.getElementById("chat-contacts-list");

    if (!container) return;

    const me = getCurrentUser();

    const allUsers = getRegisteredUsers();

    const threads = getAllThreads();

    // Filter out yourself: you chat strictly with OTHER real users!

    let otherUsers = allUsers.filter(u => {

      if (!u) return false;

      // Strictly match current user by unique uid or email

      if (me.uid && u.uid && me.uid === u.uid) return false;

      if (me.email && u.email && me.email.toLowerCase() === String(u.email).toLowerCase()) return false;

      return true;

    });

    // Apply search filter

    if (currentSearch) {

      const q = currentSearch.toLowerCase();

      otherUsers = otherUsers.filter(u =>

        (u.displayName && u.displayName.toLowerCase().includes(q)) ||

        (u.username && u.username.toLowerCase().includes(q)) ||

        (u.email && u.email.toLowerCase().includes(q))

      );

    }

    // Apply online filter

    if (currentFilter === "online") {

      otherUsers = otherUsers.filter(u => u.online !== false);

    }

    if (otherUsers.length === 0) {

      container.innerHTML = `

        <div style="text-align: center; color: #8fa899; padding: 40px 16px; font-size: 13px; line-height: 1.6;">

          ${currentSearch ? "Tidak ada user yang cocok dengan pencarian." : "Belum ada user lain yang terdaftar.<br>Daftar akun baru lewat menu Masuk/Daftar untuk mencoba multi-user!"}

        </div>

      `;

      return;

    }

    container.innerHTML = "";

    otherUsers.forEach(user => {

      const threadKey = getThreadKey(me.username, user.username);

      const msgs = threads[threadKey] || [];

      const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;

      const item = document.createElement("div");

      item.className = `chat-contact-item ${user.username.toLowerCase() === (activeRecipientUsername || "").toLowerCase() ? "active" : ""}`;

      item.onclick = () => openConversation(user.username);

      const initial = (user.displayName || user.username).charAt(0).toUpperCase();

      const isOnline = user.online !== false;

      let snippet = "Mulai obrolan dengan user ini...";

      let timeText = "";

      if (lastMsg) {

        const isMe = lastMsg.sender.toLowerCase() === me.username.toLowerCase();

        snippet = (isMe ? "Kamu: " : "") + lastMsg.text;

        timeText = lastMsg.time || "";

      }

      item.innerHTML = `

        <div class="chat-item-avatar-wrap">

          <div class="chat-item-avatar">${escapeHtml(initial)}</div>

          <span class="chat-item-dot ${isOnline ? "" : "offline"}" title="${isOnline ? 'Online' : 'Offline'}"></span>

        </div>

        <div class="chat-item-info">

          <div class="chat-item-top">

            <span class="chat-item-name">${escapeHtml(user.displayName || user.username)}</span>

            <span class="chat-item-time">${escapeHtml(timeText)}</span>

          </div>

          <div class="chat-item-bottom">

            <span class="chat-item-snippet">${escapeHtml(snippet)}</span>

          </div>

        </div>

      `;

      container.appendChild(item);

    });

  }

  /* ========================================================

     5. SCREEN 2: ACTIVE CONVERSATION (REAL USER TO USER)

     ======================================================== */

  function openConversation(targetUsername) {

    const allUsers = getRegisteredUsers();

    const user = allUsers.find(u => u.username.toLowerCase() === targetUsername.toLowerCase());

    if (!user) return;

    activeRecipientUsername = user.username.toLowerCase();

    // Switch view: Hide Inbox, Show Conversation

    const inboxView = document.getElementById("chat-view-inbox");

    const convoView = document.getElementById("chat-view-convo");

    if (inboxView && convoView) {

      inboxView.hidden = true;

      convoView.hidden = false;

    }

    // Populate Convo Header

    const avatarEl = document.getElementById("chat-convo-avatar");

    const nameEl = document.getElementById("chat-convo-name");

    const statusEl = document.getElementById("chat-convo-status");

    const dotEl = document.getElementById("chat-convo-online-dot");

    const initial = (user.displayName || user.username).charAt(0).toUpperCase();

    const isOnline = user.online !== false;

    if (avatarEl) avatarEl.textContent = initial;

    if (nameEl) nameEl.textContent = `${user.displayName} (@${user.username})`;

    if (statusEl) statusEl.textContent = isOnline ? "User Online" : "User Offline";

    if (dotEl) {

      dotEl.style.background = isOnline ? "#2ed573" : "#6c757d";

      dotEl.style.boxShadow = isOnline ? "0 0 6px #2ed573" : "none";

    }

    renderMessages(activeRecipientUsername);

    // Mobile UX: autofocus dimatikan agar keyboard HP tidak otomatis pop-up

  }

  function backToInbox() {

    activeRecipientUsername = null;

    const inboxView = document.getElementById("chat-view-inbox");

    const convoView = document.getElementById("chat-view-convo");

    if (inboxView && convoView) {

      convoView.hidden = true;

      inboxView.hidden = false;

    }

    renderInbox();

  }

  function renderMessages(targetUsername) {

    const list = document.getElementById("chat-messages-list");

    if (!list) return;

    const me = getCurrentUser();

    const messages = getMessagesForContact(targetUsername);

    if (messages.length === 0) {

      list.innerHTML = `

        <div class="chat-convo-empty">

          <div class="chat-convo-empty-icon">💬</div>

          <p>Belum ada pesan dengan user ini.<br>Kirim pesan pertamamu!</p>

        </div>

      `;

      return;

    }

    list.innerHTML = "";

    messages.forEach(msg => {

      const isMe = msg.sender.toLowerCase() === me.username.toLowerCase();

      const row = document.createElement("div");

      row.className = `chat-msg-row ${isMe ? "me" : "them"}`;

      if (msg.isSongShare && msg.songData) {

        const s = msg.songData;

        const initial = (s.title || s.name || "♪").charAt(0).toUpperCase();

        const artHtml = s.artwork

          ? `<img src="${escapeHtml(s.artwork)}" class="chat-song-cover-img" alt="Cover" />`

          : `<div class="chat-song-cover-placeholder">${escapeHtml(initial)}</div>`;

        row.innerHTML = `

          <div class="chat-bubble chat-bubble-song">

            <div class="chat-song-topbar">

              <span class="chat-song-badge">🎵 Musik Dibagikan</span>

              <span class="chat-song-tag">${escapeHtml(s.tag || 'Audio')}</span>

            </div>

            <div class="chat-song-body">

              <div class="chat-song-art">

                ${artHtml}

              </div>

              <div class="chat-song-info">

                <strong class="chat-song-title">${escapeHtml(s.title || s.name)}</strong>

                <span class="chat-song-artist">${escapeHtml(s.artist || 'Ramphony Audio')}</span>

              </div>

            </div>

            <div class="chat-song-actions-row">
              <button
                type="button"
                class="chat-song-play-action-btn"
                data-track='${encodeURIComponent(JSON.stringify(s))}'
                title="Dengarkan Lagu Ini di Player Ramphony"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
                <span>Dengarkan</span>
              </button>
              ${
                s.src && s.src.startsWith("http") && !s.src.startsWith("blob:")
                  ? `<a href="${escapeHtml(s.src)}" download="${escapeHtml((s.name || s.title) + '.mp3')}" target="_blank" rel="noopener" class="chat-song-dl-btn" title="Unduh File MP3">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                      </svg>
                      <span>Unduh</span>
                    </a>`
                  : ""
              }
            </div>

            <span class="chat-msg-time">${escapeHtml(msg.time || "")}</span>

          </div>

        `;

      } else {

        row.innerHTML = `

          <div class="chat-bubble">

            <div class="chat-msg-text">${escapeHtml(msg.text)}</div>

            <span class="chat-msg-time">${escapeHtml(msg.time || "")}</span>

          </div>

        `;

      }

      list.appendChild(row);

    });

    scrollChatToBottom();

  }

  function scrollChatToBottom() {

    const list = document.getElementById("chat-messages-list");

    if (list) {

      list.scrollTop = list.scrollHeight;

    }

  }

  

  /* ========================================================

     MUSIC SHARING ("SHARE IT" FEATURE)

     ======================================================== */

  /* ========================================================
     SUPABASE CLOUD AUDIO UPLOAD (REAL MP3 SHARING)
     ======================================================== */
  async function uploadTrackToSupabase(trackData) {
    if (!trackData) return null;

    // Jika sudah berupa URL online
    if (
      trackData.src &&
      (trackData.src.startsWith("http://") || trackData.src.startsWith("https://")) &&
      !trackData.src.startsWith("blob:")
    ) {
      return trackData.src;
    }

    try {
      let fileBlob = null;

      // 1. Coba ambil dari blob URL langsung
      if (trackData.src && trackData.src.startsWith("blob:")) {
        try {
          const res = await fetch(trackData.src);
          if (res.ok) {
            fileBlob = await res.blob();
          }
        } catch (e) {
          console.warn("fetch blob URL error, mencoba IndexedDB...", e);
        }
      }

      // 2. Coba dari trackData.file jika ada
      if (!fileBlob && trackData.file instanceof Blob) {
        fileBlob = trackData.file;
      }

      // 3. Fallback: cari file asli di IndexedDB (ramphony-music-v1)
      if (!fileBlob && typeof indexedDB !== "undefined") {
        try {
          fileBlob = await new Promise((resolve) => {
            const req = indexedDB.open("ramphony-music-v1", 1);
            req.onsuccess = () => {
              const db = req.result;
              if (!db.objectStoreNames.contains("songs")) return resolve(null);
              const tx = db.transaction("songs", "readonly");
              const store = tx.objectStore("songs");
              const allReq = store.getAll();
              allReq.onsuccess = () => {
                const songs = allReq.result || [];
                const tName = (trackData.name || trackData.title || "").toLowerCase().trim();
                const match = songs.find(s => {
                  const sName = (s.name || "").toLowerCase().trim();
                  return sName === tName || (trackData.localId && s.id === trackData.localId) || sName.includes(tName) || tName.includes(sName);
                });
                resolve(match ? match.file : null);
              };
              allReq.onerror = () => resolve(null);
            };
            req.onerror = () => resolve(null);
          });
        } catch (e) {
          console.warn("IndexedDB read error:", e);
        }
      }

      if (!fileBlob || fileBlob.size === 0) {
        console.warn("Tidak ada file audio yang bisa diunggah.");
        return null;
      }

      const rawTitle = trackData.title || trackData.name || "track";
      const cleanTitle = rawTitle.replace(/[^a-zA-Z0-9_\-]/g, "_").toLowerCase().slice(0, 35);
      const fileName = `audio_${Date.now()}_${cleanTitle}.mp3`;

      const uploadUrl = `${SUPABASE_CONFIG.url}/storage/v1/object/${SUPABASE_CONFIG.bucket}/${encodeURIComponent(fileName)}`;

      console.log("Mengunggah audio ke Supabase Storage:", fileName, "Ukuran:", fileBlob.size);

      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_CONFIG.key,
          "Authorization": `Bearer ${SUPABASE_CONFIG.key}`,
          "Content-Type": fileBlob.type || "audio/mpeg"
        },
        body: fileBlob
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn("Supabase upload error:", res.status, errText);
        return null;
      }

      const publicUrl = `${SUPABASE_CONFIG.url}/storage/v1/object/public/${SUPABASE_CONFIG.bucket}/${encodeURIComponent(fileName)}`;
      console.log("Upload berhasil! Public URL:", publicUrl);
      return publicUrl;
    } catch (err) {
      console.warn("Error uploading to Supabase:", err);
      return null;
    }
  }

  async function sendSongMessage(trackData) {
    if (!trackData || !activeRecipientUsername) return;
    const me = getCurrentUser();

    // Tutup drawer segera
    const drawer = document.getElementById("chat-music-drawer");
    if (drawer) drawer.hidden = true;

    let finalSrc = trackData.src || "";
    // Jika lagu berasal dari file lokal (blob URL), unggah otomatis ke Supabase Storage!
    const isCloudUrl = finalSrc.includes("supabase.co") || (finalSrc.startsWith("http") && !finalSrc.startsWith("blob:"));
    if (!isCloudUrl) {
      showToast("⏳ Mengunggah audio ke Cloud Storage...");
      const cloudUrl = await uploadTrackToSupabase(trackData);
      if (cloudUrl) {
        finalSrc = cloudUrl;
        showToast("✅ Audio berhasil di-upload ke Cloud!");
      } else {
        showToast("⚠️ Gagal upload audio, membagikan info lagu...");
      }
    }

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const newMsg = {

      id: "msg_song_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),

      sender: me.username,

      recipient: activeRecipientUsername,

      text: "🎵 Membagikan lagu: " + (trackData.name || trackData.title),

      isSongShare: true,

      songData: {

        name: trackData.name || trackData.title || "Lagu Ramphony",

        title: trackData.title || trackData.name || "Lagu Ramphony",

        artist: trackData.artist || (trackData.tag === "Demo" ? "Demo Track" : "Ramphony Music"),

        src: finalSrc,

        previewSrc: trackData.previewSrc || "",

        artwork: trackData.artwork || "",

        videoId: trackData.videoId || "",

        isYouTube: Boolean(trackData.isYouTube),

        tag: finalSrc.includes("supabase.co") ? "Cloud MP3" : (trackData.tag || "Shared")

      },

      time: timeStr,

      timestamp: Date.now()

    };

    // Save to pair thread

    const threads = getAllThreads();

    const threadKey = getThreadKey(me.username, activeRecipientUsername);

    if (!threads[threadKey]) threads[threadKey] = [];

    threads[threadKey].push(newMsg);

    saveAllThreads(threads);

    renderMessages(activeRecipientUsername);

    // Broadcast message to other tabs / devices (Real User Sync)

    if (broadcastChannel) {

      try {

        broadcastChannel.postMessage({

          type: "RAMPHONY_REAL_USER_MSG",

          threadKey: threadKey,

          message: newMsg

        });

      } catch (e) {}

    }

    // Sync to Firestore if Firebase is ready

    if (firestoreDb) {

      firestoreDb

        .collection("chat_messages")

        .add(newMsg)

        .catch(err => console.warn("Firestore sync error:", err));

    }

    // Drawer sudah ditutup di awal
    if (drawer) drawer.hidden = true;

    showToast(`🎵 Lagu "${trackData.name || trackData.title}" berhasil dibagikan!`);

  }

  function toggleMusicDrawer() {

    const drawer = document.getElementById("chat-music-drawer");

    if (!drawer) return;

    if (drawer.hidden) {

      populateMusicDrawer();

      drawer.hidden = false;

    } else {

      drawer.hidden = true;

    }

  }

  function populateMusicDrawer() {

    const currentTitleEl = document.getElementById("cmd-current-title");

    const sendCurrentBtn = document.getElementById("cmd-send-current-btn");

    const playlistContainer = document.getElementById("cmd-playlist-list");

    // 1. Check currently playing track in Ramphony

    let curTrack = null;

    if (window.RamphonyPlayer && typeof window.RamphonyPlayer.getCurrentTrack === "function") {

      curTrack = window.RamphonyPlayer.getCurrentTrack();

    }

    if (curTrack && curTrack.name) {

      if (currentTitleEl) currentTitleEl.textContent = curTrack.name;

      if (sendCurrentBtn) {

        sendCurrentBtn.disabled = false;

        sendCurrentBtn.style.opacity = "1";

        sendCurrentBtn.onclick = () => sendSongMessage(curTrack);

      }

    } else {

      if (currentTitleEl) currentTitleEl.textContent = "Belum ada lagu diputar di player";

      if (sendCurrentBtn) {

        sendCurrentBtn.disabled = true;

        sendCurrentBtn.style.opacity = "0.5";

      }

    }

    // 2. Populate available playlist tracks

    if (!playlistContainer) return;

    playlistContainer.innerHTML = "";

    let allTracks = [];

    if (window.RamphonyPlayer && typeof window.RamphonyPlayer.getAllTracks === "function") {

      allTracks = window.RamphonyPlayer.getAllTracks();

    }

    // Default demo tracks if playlist is empty

    if (!allTracks || allTracks.length === 0) {

      allTracks = [

        {

          name: "Rex Orange County - Best Friend",

          title: "Best Friend",

          artist: "Rex Orange County",

          src: encodeURI("demolagu/Rex Orange County - Best Friend.mp3"),

          tag: "Demo"

        },

        {

          name: "Rex Orange County - Hannah Montana",

          title: "Hannah Montana",

          artist: "Rex Orange County",

          src: encodeURI("demolagu/Rex Orange County - Hannah Montana.mp3"),

          tag: "Demo"

        }

      ];

    }

    allTracks.forEach(t => {

      const item = document.createElement("div");

      item.className = "cmd-track-item";

      const songTitle = t.title || t.name || "Lagu Ramphony";

      const songArtist = t.artist || (t.tag === "Demo" ? "Demo Artist" : "Ramphony Music");

      item.innerHTML = `

        <div class="cmd-track-left">

          <div class="cmd-track-disc">♪</div>

          <div class="cmd-track-meta">

            <span class="cmd-track-name" title="${escapeHtml(songTitle)}">${escapeHtml(songTitle)}</span>

            <small class="cmd-track-artist">${escapeHtml(songArtist)}</small>

          </div>

        </div>

        <button type="button" class="cmd-track-share-btn">Bagikan</button>

      `;

      item.querySelector(".cmd-track-share-btn").onclick = () => {

        sendSongMessage(t);

      };

      playlistContainer.appendChild(item);

    });

  }

  function sendMessage(text) {

    const cleanText = (text || "").trim();

    if (!cleanText || !activeRecipientUsername) return;

    const me = getCurrentUser();

    const now = new Date();

    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const newMsg = {

      id: "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),

      sender: me.username,

      recipient: activeRecipientUsername,

      text: cleanText,

      time: timeStr,

      timestamp: Date.now()

    };

    // Save to pair thread

    const threads = getAllThreads();

    const threadKey = getThreadKey(me.username, activeRecipientUsername);

    if (!threads[threadKey]) threads[threadKey] = [];

    threads[threadKey].push(newMsg);

    saveAllThreads(threads);

    renderMessages(activeRecipientUsername);

    // Broadcast message to other tabs / devices (Real User Sync)

    if (broadcastChannel) {

      try {

        broadcastChannel.postMessage({

          type: "RAMPHONY_REAL_USER_MSG",

          threadKey: threadKey,

          message: newMsg

        });

      } catch (e) {}

    }

    // Sync to Firestore if Firebase project is connected

    if (firestoreDb) {

      firestoreDb

        .collection("chat_messages")

        .add(newMsg)

        .catch(err => console.warn("Firestore sync error:", err));

    }

    // STRICTLY REAL USER: NO BOTS, NO FAKE DELAYED REPLIES!

  }

  function handleIncomingBroadcast(data) {

    if (!data) return;

    // A. Real-time message sync across tabs

    if (data.type === "RAMPHONY_REAL_USER_MSG") {

      const { threadKey, message } = data;

      if (threadKey && message) {

        const threads = getAllThreads();

        if (!threads[threadKey]) threads[threadKey] = [];

        if (!threads[threadKey].some(m => m.id === message.id)) {

          threads[threadKey].push(message);

          saveAllThreads(threads);

          if (activeRecipientUsername) {

            const me = getCurrentUser();

            const currentKey = getThreadKey(me.username, activeRecipientUsername);

            if (currentKey === threadKey) {

              renderMessages(activeRecipientUsername);

            }

          }

          renderInbox();

          checkUnreadNotification();

        }

      }

      return;

    }

    // B. Automatic user discovery across tabs

    if (data.type === "RAMPHONY_DISCOVER_USERS" && data.user) {

      const me = getCurrentUser();

      const currentList = getRegisteredUsers();

      if (data.user.username && data.user.username.toLowerCase() !== me.username.toLowerCase()) {

        const idx = currentList.findIndex(x => x.username.toLowerCase() === data.user.username.toLowerCase());

        if (idx < 0) {

          currentList.push(data.user);

          localStorage.setItem(REGISTERED_DB_KEY, JSON.stringify(currentList));

          renderInbox();

        }

        // Reply with our own identity so the other tab also discovers us

        if (me.username && broadcastChannel) {

          broadcastChannel.postMessage({ type: "RAMPHONY_ANNOUNCE_USER", user: me });

        }

      }

      return;

    }

    if (data.type === "RAMPHONY_ANNOUNCE_USER" && data.user) {

      const me = getCurrentUser();

      const currentList = getRegisteredUsers();

      if (data.user.username && data.user.username.toLowerCase() !== me.username.toLowerCase()) {

        const idx = currentList.findIndex(x => x.username.toLowerCase() === data.user.username.toLowerCase());

        if (idx < 0) {

          currentList.push(data.user);

          localStorage.setItem(REGISTERED_DB_KEY, JSON.stringify(currentList));

          renderInbox();

        }

      }

      return;

    }

  }

  function checkUnreadNotification() {

    const unreadDot = document.getElementById("chat-unread-dot");

    if (!unreadDot) return;

    // Keep dot clean or active if new real messages exist

    unreadDot.hidden = true;

  }

  /* ========================================================

     6. MODAL CONTROLLERS (AUDIO PLAYBACK IS NEVER PAUSED!)

     ======================================================== */

  function openChat() {

    // CHAT REQUIRES AUTHENTICATED USER

    let user = null;

    try {

      const s = localStorage.getItem("ramphony_user");

      if (s) user = JSON.parse(s);

    } catch (e) {}

    if (!user || !user.email) {

      sessionStorage.setItem("ramphony_open_chat_after_auth", "1");

      if (typeof window.openAuthModal === "function") {

        window.openAuthModal("login", "Silakan Masuk atau Buat Akun terlebih dahulu untuk menggunakan Chat Room.");

      } else {

        const topbarAuth = document.getElementById("topbar-auth-btn");

        topbarAuth?.click();

      }

      return;

    }

    const modal = document.getElementById("chat-modal");

    if (!modal) return;

    modal.hidden = false;

    document.body.classList.add("modal-open");

    // Publish current user to Firestore so other devices see us immediately

    try {

      const me = getCurrentUser();

      if (firestoreDb && me && me.uid) {

        firestoreDb.collection("users").doc(me.uid).set(me, { merge: true }).catch(err => {

          console.warn("Firestore collection('users') write hint:", err);

        });

      }

    } catch (e) {}

    // Refresh data and open inbox

    if (!activeRecipientUsername) {

      backToInbox();

    } else {

      openConversation(activeRecipientUsername);

    }

  }

  function closeChat() {

    const modal = document.getElementById("chat-modal");

    if (!modal) return;

    modal.hidden = true;

    document.body.classList.remove("modal-open");

  }

  /* ========================================================

     7. FIREBASE FIRESTORE SYNC (OPSIONAL)

     ======================================================== */

  function initFirebase() {

    if (!FIREBASE_CONFIG.projectId || typeof window.firebase === "undefined") return;

    try {

      if (!window.firebase.apps.length) {

        window.firebase.initializeApp(FIREBASE_CONFIG);

      }

      firestoreDb = window.firebase.firestore();

      firestoreDb

        .collection("chat_messages")

        .orderBy("timestamp", "asc")

        .limit(80)

        .onSnapshot(snapshot => {

          let updated = false;

          const threads = getAllThreads();

          snapshot.docChanges().forEach(change => {

            if (change.type === "added") {

              const remote = change.doc.data();

              if (remote && remote.sender && remote.recipient) {

                const key = getThreadKey(remote.sender, remote.recipient);

                if (!threads[key]) threads[key] = [];

                if (!threads[key].some(m => m.id === remote.id)) {

                  threads[key].push(remote);

                  updated = true;

                }

              }

            }

          });

          if (updated) {

            saveAllThreads(threads);

            if (activeRecipientUsername) {

              renderMessages(activeRecipientUsername);

            }

            renderInbox();

          }

        });

      // Automatic user discovery: sync all registered users from Firestore in real-time

      firestoreDb

        .collection("users")

        .limit(150)

        .onSnapshot(snapshot => {

          const list = getRegisteredUsers();

          let changed = false;

          snapshot.forEach(doc => {

            const u = doc.data();

            if (u && (u.username || u.displayName || u.email)) {

              const idx = list.findIndex(x =>

                (x.uid && u.uid && x.uid === u.uid) ||

                (x.email && u.email && x.email.toLowerCase() === u.email.toLowerCase()) ||

                (x.username && u.username && x.username.toLowerCase() === u.username.toLowerCase())

              );

              if (idx >= 0) {

                list[idx] = { ...list[idx], ...u };

                changed = true;

              } else {

                list.push(u);

                changed = true;

              }

            }

          });

          if (list.length > 0) {

            localStorage.setItem(REGISTERED_DB_KEY, JSON.stringify(list));

            renderInbox();

          }

        }, err => {

          console.warn("Firestore users sync warning:", err);

        });

    } catch (err) {

      console.warn("Firebase Init Error:", err);

    }

  }

  function escapeHtml(str) {

    if (!str) return "";

    return String(str)

      .replace(/&/g, "&amp;")

      .replace(/</g, "&lt;")

      .replace(/>/g, "&gt;")

      .replace(/"/g, "&quot;")

      .replace(/'/g, "&#039;");

  }

  /* ========================================================

     8. INITIALIZATION & LISTENERS

     ======================================================== */

  

  // Purge any legacy dummy accounts & dummy threads from localStorage

  try {

    const me = getCurrentUser();

    const s = localStorage.getItem(REGISTERED_DB_KEY);

    if (s) {

      const parsed = JSON.parse(s);

      if (Array.isArray(parsed)) {

        const cleaned = parsed.filter(u => {

          if (!u || !u.username) return false;

          const uname = String(u.username).toLowerCase().trim();

          if (["teman", "budi", "fajar", "guest"].includes(uname)) return false;

          if (String(u.id || "").startsWith("usr_")) return false;

          // If account has no email and no uid, it is an old mock account -> purge it

          if (!u.email && !u.uid) return false;

          // If it matches current user, keep in registered but don't duplicate

          return true;

        });

        localStorage.setItem(REGISTERED_DB_KEY, JSON.stringify(cleaned));

      }

    }

    // Clean mock threads from earlier test sessions

    const t = localStorage.getItem(THREADS_KEY);

    if (t) {

      const threads = JSON.parse(t);

      let changed = false;

      Object.keys(threads).forEach(key => {

        if (

          key.includes("teman") ||

          key.includes("budi") ||

          key.includes("fajar") ||

          key === "nabil__thread__nabil" ||

          key.includes("__thread__teman")

        ) {

          delete threads[key];

          changed = true;

        }

      });

      if (changed) {

        localStorage.setItem(THREADS_KEY, JSON.stringify(threads));

      }

    }

  } catch (e) {}

  function init() {

    // Topbar Open Button

    const openBtn = document.getElementById("open-chat-btn");

    openBtn?.addEventListener("click", openChat);

    // Close buttons (Inbox close & Convo close)

        // Refresh contacts button

    document.getElementById("chat-inbox-refresh")?.addEventListener("click", () => {

      const btn = document.getElementById("chat-inbox-refresh");

      if (btn) btn.style.transform = "rotate(360deg)";

      setTimeout(() => { if (btn) btn.style.transform = "none"; }, 400);

      const me = getCurrentUser();

      if (firestoreDb && me && me.uid) {

        firestoreDb.collection("users").doc(me.uid).set(me, { merge: true }).catch(() => {});

        firestoreDb.collection("users").get().then(snap => {

          const remoteUsers = [];

          snap.forEach(d => {

            const u = d.data();

            if (u && (u.uid || u.email || u.username)) remoteUsers.push(u);

          });

          if (remoteUsers.length > 0) {

            localStorage.setItem(REGISTERED_DB_KEY, JSON.stringify(remoteUsers));

          }

          renderInbox();

          showToast("Daftar kontak diperbarui!");

        }).catch(err => {

          console.warn("Manual refresh err:", err);

          renderInbox();

        });

      } else {

        renderInbox();

        showToast("Daftar kontak diperbarui!");

      }

    });

    document.getElementById("chat-inbox-close")?.addEventListener("click", closeChat);

    document.getElementById("chat-convo-close")?.addEventListener("click", closeChat);

    // Back to Inbox button

    document.getElementById("chat-back-to-inbox")?.addEventListener("click", backToInbox);

    // Filter pills (Semua / Online)

    const filterPills = document.querySelectorAll(".chat-filter-pill");

    filterPills.forEach(pill => {

      pill.addEventListener("click", () => {

        filterPills.forEach(p => p.classList.remove("active"));

        pill.classList.add("active");

        currentFilter = pill.dataset.filter || "all";

        renderInbox();

      });

    });

    // Contact Search input

    const searchInput = document.getElementById("chat-contact-search");

    searchInput?.addEventListener("input", e => {

      currentSearch = (e.target.value || "").trim();

      renderInbox();

    });

    // Send Form

    const sendForm = document.getElementById("chat-send-form");

    const inputField = document.getElementById("chat-input-text");

    sendForm?.addEventListener("submit", e => {

      e.preventDefault();

      if (!inputField) return;

      const val = inputField.value.trim();

      if (val) {

        sendMessage(val);

        inputField.value = "";

      }

    });

    // Close on backdrop click

    const modal = document.getElementById("chat-modal");

    modal?.addEventListener("click", e => {

      if (e.target === modal) closeChat();

    });

    // Close on Escape

    document.addEventListener("keydown", e => {

      if (e.key === "Escape" && modal && !modal.hidden) {

        closeChat();

      }

    });

    

    // Music Sharing Drawer triggers

    document.getElementById("chat-share-music-btn")?.addEventListener("click", toggleMusicDrawer);

    document.getElementById("cmd-close-btn")?.addEventListener("click", () => {

      const drawer = document.getElementById("chat-music-drawer");

      if (drawer) drawer.hidden = true;

    });

    // Delegate play shared song in chat list

    document.getElementById("chat-messages-list")?.addEventListener("click", e => {

      const playBtn = e.target.closest(".chat-song-play-action-btn");

      if (playBtn) {

        const raw = playBtn.getAttribute("data-track");

        if (raw) {

          try {

            const track = JSON.parse(decodeURIComponent(raw));

            if (typeof window.playFromExternal === "function") {

              window.playFromExternal(track, false);

            } else if (window.RamphonyPlayer && typeof window.RamphonyPlayer.playTrack === "function") {

              window.RamphonyPlayer.playTrack(track);

            }

            showToast(`🎵 Memutar lagu: ${track.title || track.name}`);

            playBtn.classList.add("playing-pulse");

            setTimeout(() => playBtn.classList.remove("playing-pulse"), 1500);

          } catch (err) {

            console.error("Failed to play shared track:", err);

          }

        }

      }

    });

    // Broadcast discovery when chat opens

    if (broadcastChannel) {

      const me = getCurrentUser();

      if (me.username) {

        broadcastChannel.postMessage({ type: "RAMPHONY_DISCOVER_USERS", user: me });

      }

    }

    initFirebase();

    renderInbox();

    checkUnreadNotification();

    // Listen for auth state to immediately re-sync when logged in

    if (window.firebase && window.firebase.auth) {

      try {

        window.firebase.auth().onAuthStateChanged(fbUser => {

          if (fbUser) {

            initFirebase();

            const me = getCurrentUser();

            if (firestoreDb && me && (me.uid || me.email)) {

              const docId = me.uid || (me.email ? me.email.replace(/[^a-zA-Z0-9]/g, "_") : me.username);

              firestoreDb.collection("users").doc(docId).set(me, { merge: true }).catch(() => {});

            }

          }

        });

      } catch (e) {}

    }

  }

  if (document.readyState === "loading") {

    document.addEventListener("DOMContentLoaded", init);

  } else {

    init();

  }

})();

