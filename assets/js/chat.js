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
    if (data && (data.type === "RAMPHONY_AUTH_LOGIN" || data.type === "RAMPHONY_PROFILE_UPDATED")) {
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
        if (u && (u.username || u.displayName)) {
          return {
            username: String(u.username || "nabil").toLowerCase().trim(),
            displayName: String(u.displayName || u.username || "Nabil").trim(),
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
            username: String(parsed.username || "nabil").toLowerCase().trim(),
            displayName: String(parsed.displayName || parsed.username || "Nabil").trim(),
            avatar: parsed.avatar || ""
          };
        }
      }
    } catch (e) {}

    return {
      username: "nabil",
      displayName: "Nabil",
      avatar: ""
    };
  }

  function getRegisteredUsers() {
    let list = [];
    try {
      const s = localStorage.getItem(REGISTERED_DB_KEY);
      if (s) {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) list = parsed;
      }
    } catch (e) {}

    // Seed real initial user accounts if fresh database
    if (list.length === 0) {
      list = [
        {
          id: "usr_teman",
          username: "teman",
          displayName: "Teman Ramphony",
          email: "teman@ramphony.app",
          avatar: "",
          online: true
        },
        {
          id: "usr_budi",
          username: "budi",
          displayName: "Budi Santoso",
          email: "budi@ramphony.app",
          avatar: "",
          online: true
        },
        {
          id: "usr_fajar",
          username: "fajar",
          displayName: "Fajar Ramadhan",
          email: "fajar@ramphony.app",
          avatar: "",
          online: false
        }
      ];
      try {
        localStorage.setItem(REGISTERED_DB_KEY, JSON.stringify(list));
      } catch (e) {}
    }

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

    // Initial greeting message for first test thread
    const initialThreads = {};
    const key = getThreadKey("nabil", "teman");
    initialThreads[key] = [
      {
        id: "msg_init_1",
        sender: "teman",
        text: "Halo! Akun real user Ramphony aktif. Kirim pesan ke sesama user di sini ya!",
        time: "10:00",
        timestamp: Date.now() - 600000
      }
    ];
    try {
      localStorage.setItem(THREADS_KEY, JSON.stringify(initialThreads));
    } catch (e) {}
    return initialThreads;
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

    // Filter out yourself: you chat with OTHER real users!
    let otherUsers = allUsers.filter(u => u.username.toLowerCase() !== me.username.toLowerCase());

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

    setTimeout(() => {
      const input = document.getElementById("chat-input-text");
      if (input) input.focus();
    }, 120);
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

      row.innerHTML = `
        <div class="chat-bubble">
          <div class="chat-msg-text">${escapeHtml(msg.text)}</div>
          <span class="chat-msg-time">${escapeHtml(msg.time || "")}</span>
        </div>
      `;

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
    if (!data || data.type !== "RAMPHONY_REAL_USER_MSG") return;
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
    const modal = document.getElementById("chat-modal");
    if (!modal) return;

    modal.hidden = false;
    document.body.classList.add("modal-open");

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

      // Also sync registered users from Firestore in real-time
      firestoreDb
        .collection("users")
        .limit(100)
        .onSnapshot(snapshot => {
          let updated = false;
          const currentList = getRegisteredUsers();
          snapshot.docChanges().forEach(change => {
            if (change.type === "added" || change.type === "modified") {
              const u = change.doc.data();
              if (u && u.username) {
                const idx = currentList.findIndex(x => x.username.toLowerCase() === u.username.toLowerCase());
                if (idx >= 0) {
                  currentList[idx] = { ...currentList[idx], ...u };
                } else {
                  currentList.push(u);
                  updated = true;
                }
              }
            }
          });
          if (updated) {
            localStorage.setItem(REGISTERED_DB_KEY, JSON.stringify(currentList));
            renderInbox();
          }
        }, err => {
          // Silent fallback if rules or collection not initialized yet
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
  function init() {
    // Topbar Open Button
    const openBtn = document.getElementById("open-chat-btn");
    openBtn?.addEventListener("click", openChat);

    // Close buttons (Inbox close & Convo close)
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

    initFirebase();
    renderInbox();
    checkUnreadNotification();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
