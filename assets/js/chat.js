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

  function showToast(msg) {
    try {
      let toast = document.getElementById("ramphony-toast");
      if (!toast) {
        toast = document.createElement("div");
        toast.id = "ramphony-toast";
        toast.className = "ramphony-toast";
        document.body.appendChild(toast);
      }
      toast.textContent = msg;
      toast.classList.add("show");
      if (showToast._timer) clearTimeout(showToast._timer);
      showToast._timer = setTimeout(() => toast.classList.remove("show"), 3200);
    } catch (e) {
      console.log("[Toast]:", msg);
    }
  }
  window.showToast = showToast;
  window.openChatWithUser = function(uname) {
    openChat();
    if (uname) {
      setTimeout(() => openConversation(uname), 80);
    }
  };


  // Global helper to clean all test accounts from Firestore database
  window.clearAllTesterAccounts = async function() {
    if (!firestoreDb && window.firebase && window.firebase.firestore) {
      firestoreDb = window.firebase.firestore();
    }
    const me = getCurrentUser();
    let count = 0;
    if (firestoreDb) {
      try {
        const snap = await firestoreDb.collection("users").get();
        for (const doc of snap.docs) {
          const d = doc.data();
          const isMe = (me.uid && (doc.id === me.uid || d.uid === me.uid)) ||
                       (me.email && d.email && d.email.toLowerCase() === me.email.toLowerCase()) ||
                       (me.username && d.username && d.username.toLowerCase() === me.username.toLowerCase());
          if (!isMe) {
            await firestoreDb.collection("users").doc(doc.id).delete();
            count++;
          }
        }
      } catch (err) {
        console.warn("Gagal menghapus dari firestore:", err);
      }
    }
    // Clean local cache
    localStorage.setItem(REGISTERED_DB_KEY, JSON.stringify(me.username ? [me] : []));
    localStorage.removeItem(THREADS_KEY);
    alert(`Selesai! ${count} akun tester berhasil dihapus dari Cloud Firestore & memori lokal. Halaman akan dimuat ulang.`);
    location.reload();
  };


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

      if (data.type === "RAMPHONY_AUTH_CHANGE" && !data.user) {

        activeRecipientUsername = null;

        closeChat();

      }

      const me = getCurrentUser();

      if (firestoreDb && me && (me.uid || me.email)) {

        const docId = me.uid || (me.email ? me.email.replace(/[^a-zA-Z0-9]/g, "_") : me.username);

        firestoreDb.collection("users").doc(docId).set(me, { merge: true }).catch(() => {});

      }

      updateGreeting();

      renderInbox();

      if (activeRecipientUsername) {

        openConversation(activeRecipientUsername);

      }

    }

  });

  /* ========================================================

     2. REAL USER & CONTACT MANAGERS

     ======================================================== */

  function getCurrentUser() {
    let user = {
      uid: "",
      email: "",
      username: "",
      displayName: "User",
      avatar: ""
    };

    try {
      const s = localStorage.getItem(SESSION_USER_KEY);
      if (s) {
        const u = JSON.parse(s);
        if (u) {
          if (u.uid) user.uid = u.uid;
          if (u.email) user.email = String(u.email).toLowerCase().trim();
          if (u.username) user.username = String(u.username).toLowerCase().trim();
          if (u.displayName) user.displayName = String(u.displayName).trim();
          if (u.avatar) user.avatar = u.avatar;
        }
      }
    } catch (e) {}

    // SELALU prioritaskan nama terbaru dari PROFILE_KEY (ramphony_profile) jika sudah diedit!
    try {
      const p = localStorage.getItem(PROFILE_KEY);
      if (p) {
        const parsed = JSON.parse(p);
        if (parsed) {
          if (parsed.displayName) user.displayName = String(parsed.displayName).trim();
          if (parsed.username) user.username = String(parsed.username).toLowerCase().trim();
          if (parsed.avatar) user.avatar = parsed.avatar;
          if (parsed.bio) user.bio = parsed.bio;
          if (parsed.favoriteArtist) user.favoriteArtist = parsed.favoriteArtist;
          if (parsed.email && !user.email) user.email = String(parsed.email).toLowerCase().trim();
        }
      }
    } catch (e) {}

    return user;
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

      if (me.username && u.username && me.username.toLowerCase() === String(u.username).toLowerCase()) return false;

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

      const hasAvatar = user.avatar && (user.avatar.startsWith("data:") || user.avatar.startsWith("http"));

      const avatarMarkup = hasAvatar
        ? `<img src="${user.avatar}" alt="${escapeHtml(user.displayName || user.username)}" class="chat-item-avatar-img">`
        : escapeHtml(initial);

      let snippet = "Mulai obrolan dengan user ini...";

      let timeText = "";

      if (lastMsg) {

        const isMe = lastMsg.sender.toLowerCase() === me.username.toLowerCase();

        snippet = (isMe ? "Kamu: " : "") + lastMsg.text;

        timeText = lastMsg.time || "";

      }

      item.innerHTML = `

        <div class="chat-item-avatar-wrap" data-profile-user="${escapeHtml(user.username)}" title="Lihat Profil">

          <div class="chat-item-avatar">${avatarMarkup}</div>

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
     USER PROFILE PREVIEW MODAL / SHEET
     ======================================================== */
  function showUserProfile(targetUsername) {
    if (!targetUsername) return;

    const allUsers = getRegisteredUsers();
    let target = allUsers.find(u => u && u.username && u.username.toLowerCase() === String(targetUsername).toLowerCase().trim());

    const me = getCurrentUser();
    if (!target && me && me.username && me.username.toLowerCase() === String(targetUsername).toLowerCase().trim()) {
      target = me;
    }

    try {
      const p = localStorage.getItem(PROFILE_KEY);
      if (p) {
        const parsed = JSON.parse(p);
        if (parsed && target && (
          (parsed.username && parsed.username.toLowerCase() === target.username?.toLowerCase()) ||
          (parsed.email && parsed.email.toLowerCase() === target.email?.toLowerCase())
        )) {
          target = { ...target, ...parsed };
        }
      }
    } catch (e) {}

    if (!target) {
      target = {
        username: targetUsername,
        displayName: targetUsername,
        online: true
      };
    }

    const sheet = document.getElementById("chat-user-profile-sheet");
    if (!sheet) return;

    const nameEl = document.getElementById("cps-name");
    const unameEl = document.getElementById("cps-username");
    const avatarEl = document.getElementById("cps-avatar");
    const onlineDot = document.getElementById("cps-online-dot");
    const statusPill = document.getElementById("cps-status-pill");
    const bioEl = document.getElementById("cps-bio");
    const artistEl = document.getElementById("cps-artist");
    const emailEl = document.getElementById("cps-email");
    const chatBtn = document.getElementById("cps-chat-btn");

    const displayName = target.displayName || target.username || "Pengguna";
    const username = target.username || targetUsername;
    const isOnline = target.online !== false;

    if (nameEl) nameEl.textContent = displayName;
    if (unameEl) unameEl.textContent = `@${username}`;

    function renderSheetAvatar(src, name) {
      if (!avatarEl) return;
      if (src && (src.startsWith("data:") || src.startsWith("http"))) {
        avatarEl.innerHTML = `<img src="${src}" alt="${escapeHtml(name || displayName)}" class="chat-item-avatar-img">`;
      } else {
        avatarEl.textContent = (name || displayName || "?").charAt(0).toUpperCase();
      }
    }

    renderSheetAvatar(target.avatar, displayName);

    // Live sync from Firestore: immediately grab the latest uploaded photo from the other user!
    if (firestoreDb && username) {
      firestoreDb.collection("users").get().then(snap => {
        snap.forEach(doc => {
          const d = doc.data();
          if (d && d.username && d.username.toLowerCase() === username.toLowerCase()) {
            if (d.avatar) {
              renderSheetAvatar(d.avatar, d.displayName || displayName);
            }
            if (d.bio && bioEl) bioEl.textContent = d.bio;
            if (d.favoriteArtist && artistEl) artistEl.textContent = d.favoriteArtist;
            if (d.displayName && nameEl) nameEl.textContent = d.displayName;
          }
        });
      }).catch(() => {});
    }

    if (onlineDot) {
      onlineDot.style.background = isOnline ? "#2ed573" : "#6c757d";
      onlineDot.style.boxShadow = isOnline ? "0 0 8px #2ed573" : "none";
    }

    if (statusPill) {
      statusPill.className = `cps-status-pill ${isOnline ? "online" : "offline"}`;
      statusPill.textContent = isOnline ? "User Online" : "User Offline";
    }

    if (bioEl) {
      bioEl.textContent = target.bio && target.bio.trim() ? target.bio.trim() : "Belum menambahkan bio.";
    }

    if (artistEl) {
      artistEl.textContent = target.favoriteArtist || target.artist || "-";
    }

    if (emailEl) {
      emailEl.textContent = target.email || "-";
    }

    if (chatBtn) {
      // If viewing your own profile, change button text or hide chat button
      if (me && me.username && me.username.toLowerCase() === username.toLowerCase()) {
        chatBtn.textContent = "👤 Profil Saya";
        chatBtn.onclick = () => {
          sheet.hidden = true;
        };
      } else {
        chatBtn.textContent = "💬 Kirim Pesan";
        chatBtn.onclick = () => {
          sheet.hidden = true;
          openConversation(username);
        };
      }
    }

        const fullProfileBtn = document.getElementById("cps-full-profile-btn");
    if (fullProfileBtn) {
      fullProfileBtn.onclick = () => {
        sheet.hidden = true;
        closeChat();
        if (typeof window.openUserProfile === "function") {
          window.openUserProfile(username);
        }
      };
    }

    const deleteContactBtn = document.getElementById("cps-delete-btn");
    if (deleteContactBtn) {
      if (me && me.username && me.username.toLowerCase() === username.toLowerCase()) {
        deleteContactBtn.hidden = true;
      } else {
        deleteContactBtn.hidden = false;
        deleteContactBtn.onclick = () => {
          if (!confirm(`Hapus kontak / akun tester "${displayName} (@${username})" dari daftar chat dan Firestore?`)) return;

          // 1. Delete user from Firestore so it disappears from all devices
          if (firestoreDb) {
            firestoreDb.collection("users").get().then(snap => {
              snap.forEach(doc => {
                const d = doc.data();
                if (d && (
                  (d.username && d.username.toLowerCase() === username.toLowerCase()) ||
                  (target.uid && doc.id === target.uid) ||
                  (d.email && target.email && d.email.toLowerCase() === target.email.toLowerCase())
                )) {
                  firestoreDb.collection("users").doc(doc.id).delete().catch(err => {
                    console.warn("Firestore delete user error:", err);
                  });
                }
              });
            }).catch(() => {});
          }

          // 2. Remove user from local registered cache
          try {
            const regList = getRegisteredUsers();
            const filtered = regList.filter(u => u && u.username && u.username.toLowerCase() !== username.toLowerCase());
            localStorage.setItem(REGISTERED_DB_KEY, JSON.stringify(filtered));
          } catch (e) {}

          // 3. Remove thread messages with this user
          try {
            const allT = getAllThreads();
            const threadKey = getThreadKey(me.username, username);
            delete allT[threadKey];
            localStorage.setItem(THREADS_KEY, JSON.stringify(allT));
          } catch (e) {}

          hideUserProfile();
          renderInbox();
          showToast(`🗑️ Akun @${username} berhasil dihapus dari kontak!`);
        };
      }
    }

    sheet.hidden = false;
  }

  function hideUserProfile() {
    const sheet = document.getElementById("chat-user-profile-sheet");
    if (sheet) sheet.hidden = true;
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

    if (avatarEl) {
      if (user.avatar && (user.avatar.startsWith("data:") || user.avatar.startsWith("http"))) {
        avatarEl.innerHTML = `<img src="${user.avatar}" alt="${escapeHtml(user.displayName || user.username)}" class="chat-item-avatar-img">`;
      } else {
        avatarEl.textContent = initial;
      }
    }

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

            <!-- VOICE NOTE STYLE AUDIO CONTROLLER -->
            <div class="chat-vn-player" data-track='${encodeURIComponent(JSON.stringify(s))}'>
              <button type="button" class="chat-vn-toggle-btn" title="Putar / Jeda Lagu">
                <svg class="chat-vn-icon-play" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
                <svg class="chat-vn-icon-pause" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="display:none;">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                </svg>
              </button>
              <div class="chat-vn-track-wrap">
                <div class="chat-vn-slider-wrap">
                  <input type="range" class="chat-vn-slider" min="0" max="100" value="0" step="0.1" />
                </div>
                <div class="chat-vn-time-row">
                  <span class="chat-vn-cur-time">0:00</span>
                  <span class="chat-vn-dur-time">--:--</span>
                </div>
              </div>
            </div>

            <!-- ACTIONS: Open in Main Player & Download -->
            <div class="chat-song-actions-row">
              <button type="button" class="chat-song-main-player-btn" title="Buka dan Putar di Player Utama">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>
                </svg>
                <span>Buka di Player</span>
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

      // 1. Coba ambil dari blob URL atau local path langsung
      if (trackData.src && (trackData.src.startsWith("blob:") || !trackData.src.startsWith("http"))) {
        try {
          const res = await fetch(trackData.src);
          if (res.ok) {
            fileBlob = await res.blob();
          }
        } catch (e) {
          console.warn("fetch src error, mencoba IndexedDB...", e);
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
          "Content-Type": fileBlob.type || "audio/mpeg",
          "x-upsert": "true"
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

    updateGreeting();
    renderInbox();

    // Fetch latest users & avatars from Firestore immediately on open
    if (firestoreDb) {
      firestoreDb.collection("users").get().then(snap => {
        const remoteUsers = [];
        snap.forEach(doc => {
          const u = doc.data();
          if (u && (u.uid || u.email || u.username)) remoteUsers.push(u);
        });
        if (remoteUsers.length > 0) {
          localStorage.setItem(REGISTERED_DB_KEY, JSON.stringify(remoteUsers));
          renderInbox();
        }
      }).catch(() => {});
    }

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

      // Realtime users & avatar listener: sync new profile photos across devices immediately
      firestoreDb
        .collection("users")
        .onSnapshot(snap => {
          const remoteUsers = [];
          snap.forEach(doc => {
            const u = doc.data();
            if (u && (u.uid || u.email || u.username)) remoteUsers.push(u);
          });
          if (remoteUsers.length > 0) {
            localStorage.setItem(REGISTERED_DB_KEY, JSON.stringify(remoteUsers));
            renderInbox();
            if (activeRecipientUsername) {
              const activeUser = remoteUsers.find(u => u.username && u.username.toLowerCase() === activeRecipientUsername.toLowerCase());
              if (activeUser && activeUser.avatar) {
                const headerAvatar = document.getElementById("chat-convo-avatar");
                if (headerAvatar) {
                  headerAvatar.innerHTML = `<img src="${activeUser.avatar}" alt="Avatar" class="chat-item-avatar-img">`;
                }
              }
            }
          }
        }, err => console.warn("Realtime users listener warning:", err));

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


  /* ========================================================
     VOICE-NOTE AUDIO SYNC & CONTROLS IN CHAT BUBBLES
     ======================================================== */
  function formatChatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }

  function syncChatVoiceNotes() {
    const audioEl = document.getElementById("a");
    if (!audioEl) return;

    const vnPlayers = document.querySelectorAll(".chat-vn-player");
    vnPlayers.forEach(container => {
      const raw = container.getAttribute("data-track");
      if (!raw) return;

      let track = null;
      try { track = JSON.parse(decodeURIComponent(raw)); } catch (e) { return; }

      const toggleBtn = container.querySelector(".chat-vn-toggle-btn");
      const iconPlay = container.querySelector(".chat-vn-icon-play");
      const iconPause = container.querySelector(".chat-vn-icon-pause");
      const slider = container.querySelector(".chat-vn-slider");
      const curTimeEl = container.querySelector(".chat-vn-cur-time");
      const durTimeEl = container.querySelector(".chat-vn-dur-time");

      const isCurrentAudio = audioEl.src && track.src && (
        audioEl.src === track.src || 
        audioEl.src.endsWith(encodeURI(track.src)) ||
        (track.name && window.RamphonyPlayer?.getCurrentTrack()?.name === track.name)
      );

      const isPlaying = isCurrentAudio && !audioEl.paused;

      if (toggleBtn) {
        toggleBtn.classList.toggle("playing", Boolean(isPlaying));
      }
      if (iconPlay && iconPause) {
        iconPlay.style.display = isPlaying ? "none" : "block";
        iconPause.style.display = isPlaying ? "block" : "none";
      }

      if (isCurrentAudio) {
        const cur = audioEl.currentTime || 0;
        const dur = audioEl.duration || 0;
        if (slider && document.activeElement !== slider) {
          slider.value = dur > 0 ? (cur / dur) * 100 : 0;
        }
        if (curTimeEl) curTimeEl.textContent = formatChatTime(cur);
        if (durTimeEl && Number.isFinite(dur) && dur > 0) durTimeEl.textContent = formatChatTime(dur);
      } else {
        if (!isPlaying && toggleBtn) toggleBtn.classList.remove("playing");
      }
    });
  }

  function init() {

    // Topbar Open Button

    const openBtn = document.getElementById("open-chat-btn");

    openBtn?.addEventListener("click", openChat);

    // Close buttons (Inbox close & Convo close)

        // Refresh contacts button

    document.getElementById("chat-inbox-refresh")?.addEventListener("click", () => {

      const btn = document.getElementById("chat-inbox-refresh");

      if (btn) {
        btn.classList.add("spinning");
        setTimeout(() => btn.classList.remove("spinning"), 700);
      }

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

    // Delegate Voice-Note style audio playback and controls in chat
    document.getElementById("chat-messages-list")?.addEventListener("click", e => {
      // 1. Play / Pause button
      const vnBtn = e.target.closest(".chat-vn-toggle-btn");
      if (vnBtn) {
        const container = vnBtn.closest(".chat-vn-player");
        const raw = container?.getAttribute("data-track");
        if (!raw) return;

        try {
          const track = JSON.parse(decodeURIComponent(raw));
          const audioEl = document.getElementById("a");

          const isCurrentAudio = audioEl && audioEl.src && track.src && (
            audioEl.src === track.src ||
            audioEl.src.endsWith(encodeURI(track.src)) ||
            (track.name && window.RamphonyPlayer?.getCurrentTrack()?.name === track.name)
          );

          if (isCurrentAudio && audioEl) {
            if (audioEl.paused) {
              audioEl.play().catch(err => console.warn("Play error:", err));
            } else {
              audioEl.pause();
            }
          } else {
            if (typeof window.playFromExternal === "function") {
              window.playFromExternal(track, false);
            } else if (window.RamphonyPlayer?.playTrack) {
              window.RamphonyPlayer.playTrack(track);
            }
          }
          setTimeout(syncChatVoiceNotes, 60);
        } catch (err) {
          console.error("Failed to toggle voice-note audio:", err);
        }
        return;
      }

      // 2. Open in Main Player button
      const mainPlayerBtn = e.target.closest(".chat-song-main-player-btn");
      if (mainPlayerBtn) {
        const container = mainPlayerBtn.closest(".chat-bubble-song")?.querySelector(".chat-vn-player");
        const raw = container?.getAttribute("data-track");
        if (raw) {
          try {
            const track = JSON.parse(decodeURIComponent(raw));
            if (typeof window.playFromExternal === "function") {
              window.playFromExternal(track, true);
            }
            closeChat();
          } catch (err) {
            console.error("Failed to open track in player:", err);
          }
        }
        return;
      }
    });

    // Seek scrubber inside chat bubble
    document.getElementById("chat-messages-list")?.addEventListener("input", e => {
      const slider = e.target.closest(".chat-vn-slider");
      if (slider) {
        const audioEl = document.getElementById("a");
        if (audioEl && Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
          audioEl.currentTime = (Number(slider.value) / 100) * audioEl.duration;
          syncChatVoiceNotes();
        }
      }
    });

    // Listen to main audio element to sync voice notes in chat
    const mainAudio = document.getElementById("a");
    if (mainAudio) {
      mainAudio.addEventListener("timeupdate", syncChatVoiceNotes);
      mainAudio.addEventListener("play", syncChatVoiceNotes);
      mainAudio.addEventListener("pause", syncChatVoiceNotes);
      mainAudio.addEventListener("ended", syncChatVoiceNotes);
    }
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

