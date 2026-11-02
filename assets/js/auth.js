/**
 * RAMPHONY AUTHENTICATION & FIREBASE CONNECTOR
 * ============================================================================
 * Panduan Menghubungkan ke Firebase:
 * 1. Buka Firebase Console (https://console.firebase.google.com/)
 * 2. Buat Project baru atau pilih yang sudah ada.
 * 3. Buka menu 'Authentication' -> 'Sign-in method' -> Aktifkan 'Email/Password'.
 * 4. Salin objek konfigurasi Firebase ke konstanta FIREBASE_CONFIG di bawah.
 * 5. Script otomatis mendeteksi Firebase SDK dan mengalihkan login/register
 *    dari Local Mock ke Firebase Authentication resmi secara otomatis!
 * ============================================================================
 */

(() => {
  "use strict";

  /* ========================================================
     1. FIREBASE CONFIGURATION (Paste config kamu di sini)
     ======================================================== */
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCFTIWsLvADZL-xWH3hkElZ7YfdBiHbl7Y",
    authDomain: "ramphony-c5922.firebaseapp.com",
    projectId: "ramphony-c5922",
    storageBucket: "ramphony-c5922.firebasestorage.app",
    messagingSenderId: "1042827368179",
    appId: "1:1042827368179:web:a7c98dc4f198a091c48986",
    measurementId: "G-BPLC15NSH0"
  };

  const SESSION_USER_KEY = "ramphony_user";
  const REGISTERED_DB_KEY = "ramphony_registered_accounts";
  const PROFILE_KEY = "ramphony_profile";

  let firebaseApp = null;
  let firebaseAuth = null;
  let isFirebaseReady = false;

  /* ========================================================
     2. CHECK & INITIALIZE FIREBASE
     ======================================================== */
  function ensureFirebase() {
    if (isFirebaseReady && firebaseAuth) return true;
    if (FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId && typeof window.firebase !== "undefined") {
      try {
        if (!window.firebase.apps.length) {
          firebaseApp = window.firebase.initializeApp(FIREBASE_CONFIG);
        } else {
          firebaseApp = window.firebase.app();
        }
        firebaseAuth = window.firebase.auth();
        isFirebaseReady = true;
        return true;
      } catch (err) {
        console.warn("Firebase Auth init warning:", err);
      }
    }
    return false;
  }

  function initFirebase() {
    if (ensureFirebase()) {
      console.log("⚡ Ramphony Firebase Auth connected successfully.");

      // Listen for real Firebase auth state changes
      try {
        firebaseAuth.onAuthStateChanged(user => {
          if (user) {
            const existing = getCurrentUser();
            const photo = user.photoURL || existing?.avatar || "";
            const cleanName = user.displayName || (user.email ? user.email.split("@")[0] : "User");
            const cleanUser = (user.email ? user.email.split("@")[0] : (user.displayName || "user")).toLowerCase().replace(/[^a-z0-9_]/g, "");

            const mapped = {
              uid: user.uid,
              email: user.email || "",
              displayName: cleanName,
              username: cleanUser,
              avatar: photo,
              provider: "firebase"
            };
            saveRegisteredAccount(mapped);
            saveSession(mapped);

            // Always sync active user to Firestore
            try {
              if (window.firebase && window.firebase.firestore) {
                window.firebase.firestore().collection("users").doc(user.uid).set(mapped, { merge: true }).catch(err => {
                  console.warn("Firestore sync hint: Pastikan Cloud Firestore sudah dibuat di Firebase Console! Error:", err);
                });
              }
            } catch (e) {}
          } else {
            const cur = getCurrentUser();
            if (cur && (cur.provider === "firebase" || cur.provider === "google")) {
              clearSession();
            }
          }
          updateAllUI();
        });
      } catch (e) {
        console.warn("onAuthStateChanged setup error:", e);
      }
    }
  }

  /* ========================================================
     3. LOCAL STORAGE MOCK DATABASE (Bisa langsung dicoba)
     ======================================================== */
  function getRegisteredAccounts() {
    try {
      const data = localStorage.getItem(REGISTERED_DB_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  function saveRegisteredAccount(acc) {
    const list = getRegisteredAccounts();
    const existingIdx = list.findIndex(a => a.email.toLowerCase() === acc.email.toLowerCase());
    if (existingIdx >= 0) {
      list[existingIdx] = acc;
    } else {
      list.push(acc);
    }
    localStorage.setItem(REGISTERED_DB_KEY, JSON.stringify(list));
  }

  /* ========================================================
     4. SESSION MANAGEMENT
     ======================================================== */
  function getCurrentUser() {
    try {
      const s = localStorage.getItem(SESSION_USER_KEY);
      if (s) {
        const u = JSON.parse(s);
        if (u && (u.username || u.displayName)) return u;
      }
    } catch (e) {}

    // Check local profile as fallback
    try {
      const p = localStorage.getItem(PROFILE_KEY);
      if (p) {
        const prof = JSON.parse(p);
        if (prof && (prof.displayName || prof.username || prof.avatar)) {
          return {
            displayName: prof.displayName || prof.username || "Guest",
            username: (prof.username || "guest").toLowerCase(),
            avatar: prof.avatar || "",
            isProfileOnly: true
          };
        }
      }
    } catch (e) {}

    return null;
  }

  function saveSession(user) {
    localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    // Sync with ramphony_profile so Profile and Chat see the user
    try {
      const curProfile = JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}");
      const updatedProfile = {
        ...curProfile,
        displayName: user.displayName,
        username: user.username,
        email: user.email,
        avatar: user.avatar || curProfile.avatar || ""
      };
      localStorage.setItem(PROFILE_KEY, JSON.stringify(updatedProfile));
    } catch (e) {}

    // Broadcast change
    window.postMessage({ type: "RAMPHONY_AUTH_CHANGE", user }, "*");
    updateAllUI();
  }

  function clearSession() {
    // Wipe all session & account cache for clean account switching
    localStorage.removeItem(SESSION_USER_KEY);
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(REGISTERED_DB_KEY);
    localStorage.removeItem("ramphony_user_chat_threads_v3");
    sessionStorage.clear();

    window.postMessage({ type: "RAMPHONY_AUTH_CHANGE", user: null }, "*");
    updateAllUI();
  }

  /* ========================================================
     5. AUTH ACTIONS: REGISTER, LOGIN, LOGOUT
     ======================================================== */
  async function registerAccount(name, username, email, password) {
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    const cleanName = name.trim();

    if (!cleanName) throw new Error("Nama lengkap wajib diisi.");
    if (!cleanUsername) throw new Error("Username wajib diisi (hanya huruf, angka, _).");
    if (!cleanEmail || !cleanEmail.includes("@")) throw new Error("Format email tidak valid.");
    if (!password || password.length < 6) throw new Error("Password minimal 6 karakter.");

    // If Firebase is configured and active
    if (isFirebaseReady && firebaseAuth) {
      try {
        const cred = await firebaseAuth.createUserWithEmailAndPassword(cleanEmail, password);
        await cred.user.updateProfile({ displayName: cleanName });
        const user = {
          uid: cred.user.uid,
          email: cred.user.email,
          displayName: cleanName,
          username: cleanUsername,
          avatar: "",
          provider: "firebase"
        };
        saveRegisteredAccount(user);
        saveSession(user);
        try { if (window.firebase && window.firebase.firestore) { window.firebase.firestore().collection("users").doc(user.uid).set(user, { merge: true }); } } catch (e) {}
        return user;
      } catch (fbErr) {
        if (fbErr.code === "auth/configuration-not-found" || fbErr.message?.includes("configuration-not-found")) {
          throw new Error("Fitur Authentication belum aktif di Firebase Console! Buka menu Build > Authentication > klik 'Get Started' > aktifkan 'Email/Password'.");
        }
        if (fbErr.code === "auth/email-already-in-use") {
          throw new Error("Email ini sudah terdaftar di Firebase. Silakan Masuk.");
        }
        if (fbErr.code === "auth/weak-password") {
          throw new Error("Password terlalu lemah (minimal 6 karakter).");
        }
        throw fbErr;
      }
    }

    // Local Mock DB Fallback
    const accounts = getRegisteredAccounts();
    if (accounts.some(a => a.email.toLowerCase() === cleanEmail)) {
      throw new Error("Email ini sudah terdaftar. Silakan Masuk.");
    }
    if (accounts.some(a => a.username.toLowerCase() === cleanUsername)) {
      throw new Error("Username sudah dipakai oleh pengguna lain.");
    }

    const newUser = {
      uid: "user_" + Date.now(),
      displayName: cleanName,
      username: cleanUsername,
      email: cleanEmail,
      password: password, // Note: In Firebase, password is kept securely on Google server
      avatar: "",
      provider: "local",
      createdAt: new Date().toISOString()
    };

    saveRegisteredAccount(newUser);
    saveSession(newUser);
    return newUser;
  }

  async function loginAccount(emailOrUsername, password) {
    const term = emailOrUsername.trim().toLowerCase();
    if (!term) throw new Error("Email atau username wajib diisi.");
    if (!password) throw new Error("Password wajib diisi.");

    // If Firebase is configured
    if (isFirebaseReady && firebaseAuth) {
      try {
        const cred = await firebaseAuth.signInWithEmailAndPassword(term, password);
        const user = {
          uid: cred.user.uid,
          email: cred.user.email,
          displayName: cred.user.displayName || cred.user.email.split("@")[0],
          username: (cred.user.displayName || cred.user.email.split("@")[0]).toLowerCase().replace(/[^a-z0-9_]/g, ""),
          avatar: cred.user.photoURL || "",
          provider: "firebase"
        };
        saveRegisteredAccount(user);
        saveSession(user);
        try { if (window.firebase && window.firebase.firestore) { window.firebase.firestore().collection("users").doc(user.uid).set(user, { merge: true }); } } catch (e) {}
        return user;
      } catch (fbErr) {
        if (fbErr.code === "auth/configuration-not-found" || fbErr.message?.includes("configuration-not-found")) {
          throw new Error("Fitur Authentication belum aktif di Firebase Console! Buka menu Build > Authentication > klik 'Get Started' > aktifkan 'Email/Password'.");
        }
        if (fbErr.code === "auth/user-not-found" || fbErr.code === "auth/wrong-password" || fbErr.code === "auth/invalid-credential") {
          throw new Error("Email atau password salah.");
        }
        throw fbErr;
      }
    }

    // Local Mock DB Fallback
    const accounts = getRegisteredAccounts();
    const user = accounts.find(
      a => (a.email.toLowerCase() === term || a.username.toLowerCase() === term) && a.password === password
    );

    if (!user) {
      throw new Error("Email/username atau password salah.");
    }

    saveSession(user);
    return user;
  }

  async function logoutAccount() {
    if (isFirebaseReady && firebaseAuth) {
      try {
        await firebaseAuth.signOut();
      } catch (e) {}
    }
    clearSession();
    showToast("Berhasil keluar dari akun.");
  }
  async function loginWithGoogle() {
    ensureFirebase();
    if (!window.firebase || !window.firebase.auth) {
      throw new Error("SDK Firebase belum dimuat oleh browser. Periksa koneksi internet Anda atau refresh halaman.");
    }
    if (!firebaseAuth) {
      throw new Error("Firebase Auth belum berhasil terhubung. Periksa konfigurasi Firebase.");
    }

    try {
      const provider = new window.firebase.auth.GoogleAuthProvider();
      provider.addScope("profile");
      provider.addScope("email");
      provider.setCustomParameters({ prompt: "select_account" });

      const result = await firebaseAuth.signInWithPopup(provider);
      const user = result.user;

      const cleanName = user.displayName || (user.email ? user.email.split("@")[0] : "Google User");
      const cleanUsername = (user.email ? user.email.split("@")[0] : cleanName).toLowerCase().replace(/[^a-z0-9_]/g, "") || ("user_" + user.uid.slice(0, 5));

      const mappedUser = {
        uid: user.uid,
        email: user.email || "",
        displayName: cleanName,
        username: cleanUsername,
        avatar: user.photoURL || "",
        provider: "firebase",
        lastLogin: new Date().toISOString()
      };

      saveRegisteredAccount(mappedUser);
      saveSession(mappedUser);

      // Sinkronisasi data user ke Firestore jika Firestore aktif
      try {
        if (window.firebase && window.firebase.firestore) {
          await window.firebase.firestore().collection("users").doc(user.uid).set(mappedUser, { merge: true });
        }
      } catch (dbErr) {
        console.warn("Firestore user sync warning:", dbErr);
      }

      return mappedUser;
    } catch (fbErr) {
      console.error("Google Sign-In Error:", fbErr);
      if (fbErr.code === "auth/popup-closed-by-user") {
        throw new Error("Jendela login Google ditutup sebelum selesai.");
      }
      if (fbErr.code === "auth/cancelled-popup-request") {
        throw new Error("Permintaan login Google sebelumnya dibatalkan.");
      }
      if (fbErr.code === "auth/popup-blocked") {
        throw new Error("Pop-up login Google diblokir browser! Izinkan pop-up untuk situs ini lalu coba lagi.");
      }
      if (fbErr.code === "auth/unauthorized-domain") {
        throw new Error("Domain ini belum diotorisasi di Firebase! Buka Firebase Console > Authentication > Settings > Authorized domains > Tambahkan localhost.");
      }
      if (fbErr.code === "auth/operation-not-allowed" || fbErr.code === "auth/configuration-not-found" || fbErr.message?.includes("configuration-not-found")) {
        throw new Error("Provider Google belum diaktifkan di Firebase Console! Buka Firebase Console > Authentication > Sign-in method > aktifkan 'Google' dan simpan.");
      }
      throw new Error(fbErr.message || "Gagal masuk dengan Google.");
    }
  }


  /* ========================================================
     6. UI CONTROLLER (MODAL, SIDEBAR, TOPBAR)
     ======================================================== */
  function openAuthModal(tab = "login") {
    const modal = document.getElementById("auth-modal");
    if (!modal) return;
    modal.hidden = false;
    switchAuthTab(tab);
    clearAlerts();
  }

  function closeAuthModal() {
    const modal = document.getElementById("auth-modal");
    if (modal) modal.hidden = true;
    clearAlerts();
  }

  function switchAuthTab(tab) {
    const loginForm = document.getElementById("auth-login-form");
    const regForm = document.getElementById("auth-reg-form");
    const tabLogin = document.getElementById("auth-tab-login");
    const tabReg = document.getElementById("auth-tab-register");

    if (tab === "register") {
      loginForm?.setAttribute("hidden", "");
      regForm?.removeAttribute("hidden");
      tabLogin?.classList.remove("active");
      tabReg?.classList.add("active");
      setTimeout(() => document.getElementById("auth-reg-name")?.focus(), 100);
    } else {
      regForm?.setAttribute("hidden", "");
      loginForm?.removeAttribute("hidden");
      tabReg?.classList.remove("active");
      tabLogin?.classList.add("active");
      setTimeout(() => document.getElementById("auth-login-email")?.focus(), 100);
    }
    clearAlerts();
  }

  function showAlert(msg, isError = true) {
    const alertEl = document.getElementById("auth-alert");
    if (!alertEl) return;
    alertEl.textContent = msg;
    alertEl.className = `auth-alert ${isError ? "error" : "success"}`;
    alertEl.style.display = "block";
  }

  function clearAlerts() {
    const alertEl = document.getElementById("auth-alert");
    if (alertEl) {
      alertEl.style.display = "none";
      alertEl.textContent = "";
    }
  }

  function isRealUserLoggedIn() {
    try {
      const s = localStorage.getItem(SESSION_USER_KEY);
      if (s) {
        const u = JSON.parse(s);
        if (u && (u.email || u.uid)) return u;
      }
    } catch (e) {}
    return null;
  }

  function updateAllUI() {
    const user = isRealUserLoggedIn();

    // Elements
    const loginTrigger = document.getElementById("sidebar-login-trigger");
    const userCard = document.getElementById("sidebar-user-info");
    const saName = document.getElementById("sa-name");
    const saSub = document.getElementById("sa-sub");
    const saAvatarLetter = document.getElementById("sa-avatar-letter");
    const saAvatarImg = document.getElementById("sa-avatar-img");
    const saLogoutBtn = document.getElementById("sa-logout-btn");
    const topbarAuthBtn = document.getElementById("topbar-auth-btn");
    const topbarProfileBtn = document.getElementById("topbar-profile-btn") || document.querySelector(".profile-button");

    if (user) {
      // 1. USER SUDAH LOGIN:
      // Tampilkan Profil, Sembunyikan Tombol Masuk/Daftar
      if (loginTrigger) loginTrigger.hidden = true;
      if (userCard) userCard.hidden = false;

      // Di Topbar: Sembunyikan tombol "Masuk/Daftar", Tampilkan icon Profil
      if (topbarAuthBtn) {
        topbarAuthBtn.hidden = true;
        topbarAuthBtn.style.display = "none";
      }
      if (topbarProfileBtn) {
        topbarProfileBtn.hidden = false;
        topbarProfileBtn.style.display = "flex";
      }

      if (saName) saName.textContent = user.displayName || "Pengguna";
      if (saSub) saSub.textContent = `@${user.username || "user"}`;

      if (saAvatarLetter && saAvatarImg) {
        if (user.avatar) {
          saAvatarImg.src = user.avatar;
          saAvatarImg.style.display = "block";
          saAvatarImg.removeAttribute("hidden");
          saAvatarLetter.style.display = "none";
          saAvatarLetter.setAttribute("hidden", "");
          saAvatarLetter.textContent = "";
        } else {
          saAvatarImg.style.display = "none";
          saAvatarImg.setAttribute("hidden", "");
          saAvatarImg.src = "";
          saAvatarLetter.style.display = "flex";
          saAvatarLetter.removeAttribute("hidden");
          saAvatarLetter.textContent = (user.displayName || "N").charAt(0).toUpperCase();
        }
      }

      if (saLogoutBtn) {
        saLogoutBtn.onclick = (e) => {
          e.preventDefault();
          logoutAccount();
        };
      }
    } else {
      // 2. USER BELUM LOGIN:
      // Di Sidebar: Tampilkan tombol "Masuk/Daftar"
      if (loginTrigger) {
        loginTrigger.hidden = false;
        loginTrigger.onclick = (e) => {
          e.preventDefault();
          openAuthModal("login");
        };
      }
      if (userCard) userCard.hidden = true;

      // Di Topbar: Tampilkan tombol "Masuk/Daftar", Sembunyikan icon Profil
      if (topbarAuthBtn) {
        topbarAuthBtn.hidden = false;
        topbarAuthBtn.style.display = "inline-flex";
        topbarAuthBtn.textContent = "Masuk / Daftar";
      }
      if (topbarProfileBtn) {
        topbarProfileBtn.hidden = true;
        topbarProfileBtn.style.display = "none";
      }
    }

    if (typeof window.updateChatUI === "function") {
      window.updateChatUI();
    }
  }

  function showToast(msg) {
    let toast = document.getElementById("ramphony-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "ramphony-toast";
      toast.className = "ramphony-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3200);
  }

  /* ========================================================
     7. ATTACH LISTENERS & INITIALIZATION
     ======================================================== */
  // Clean cache on startup: purge stale mock accounts if logged out or without uid
  try {
    const s = localStorage.getItem(SESSION_USER_KEY);
    if (!s) {
      localStorage.removeItem(REGISTERED_DB_KEY);
      localStorage.removeItem("ramphony_user_chat_threads_v3");
    } else {
      const reg = localStorage.getItem(REGISTERED_DB_KEY);
      if (reg) {
        const list = JSON.parse(reg);
        if (Array.isArray(list)) {
          const cleaned = list.filter(u => u && u.uid && u.email);
          localStorage.setItem(REGISTERED_DB_KEY, JSON.stringify(cleaned));
        }
      }
    }
  } catch (e) {}

  
  // Listen for logout triggers from iframe pages (profile.html)
  window.addEventListener("message", event => {
    const data = event.data;
    if (data && data.type === "RAMPHONY_TRIGGER_LOGOUT") {
      logoutAccount();
    }
  });

  function init() {
    initFirebase();

    // Modal close & backdrop
    const closeBtn = document.getElementById("auth-close-btn");
    const modal = document.getElementById("auth-modal");
    closeBtn?.addEventListener("click", closeAuthModal);
    modal?.addEventListener("click", e => {
      if (e.target === modal) closeAuthModal();
    });

    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && modal && !modal.hidden) {
        closeAuthModal();
      }
    });

    // Tab buttons
    document.getElementById("auth-tab-login")?.addEventListener("click", () => switchAuthTab("login"));
    document.getElementById("auth-tab-register")?.addEventListener("click", () => switchAuthTab("register"));
    document.getElementById("auth-switch-to-reg")?.addEventListener("click", (e) => {
      e.preventDefault();
      switchAuthTab("register");
    });
    document.getElementById("auth-switch-to-login")?.addEventListener("click", (e) => {
      e.preventDefault();
      switchAuthTab("login");
    });

    // Topbar Auth Trigger: ALWAYS opens Auth Modal
    document.getElementById("topbar-auth-btn")?.addEventListener("click", (e) => {
      e.preventDefault();
      openAuthModal("login");
    });

    // Password visibility toggles
    document.querySelectorAll(".auth-toggle-pwd").forEach(btn => {
      btn.addEventListener("click", () => {
        const inputId = btn.getAttribute("data-for");
        const input = document.getElementById(inputId);
        if (input) {
          const isPwd = input.type === "password";
          input.type = isPwd ? "text" : "password";
          btn.innerHTML = isPwd
            ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`
            : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
        }
      });
    });

    // Google Auth Button
    const googleBtn = document.getElementById("auth-google-btn");
    const googleDefaultHtml = googleBtn ? googleBtn.innerHTML : "";
    googleBtn?.addEventListener("click", async () => {
      clearAlerts();
      try {
        googleBtn.disabled = true;
        googleBtn.innerHTML = "<span>Menghubungkan ke Google...</span>";
        const user = await loginWithGoogle();
        showAlert(`Berhasil masuk dengan Google sebagai ${user.displayName}!`, false);
        showToast(`Selamat datang, ${user.displayName}!`);
        setTimeout(() => {
          closeAuthModal();
          googleBtn.disabled = false;
          googleBtn.innerHTML = googleDefaultHtml;
          if (sessionStorage.getItem("ramphony_open_chat_after_auth") === "1") {
            sessionStorage.removeItem("ramphony_open_chat_after_auth");
            setTimeout(() => {
              document.getElementById("open-chat-btn")?.click();
            }, 300);
          }
        }, 900);
      } catch (err) {
        showAlert(err.message, true);
        googleBtn.disabled = false;
        googleBtn.innerHTML = googleDefaultHtml;
      }
    });

    // Login Form Submit
    const loginForm = document.getElementById("auth-login-form");
    loginForm?.addEventListener("submit", async e => {
      e.preventDefault();
      clearAlerts();
      const email = document.getElementById("auth-login-email").value;
      const pwd = document.getElementById("auth-login-password").value;
      const submitBtn = document.getElementById("auth-login-submit");

      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = "Memverifikasi...";
        }
        const user = await loginAccount(email, pwd);
        showAlert(`Selamat datang kembali, ${user.displayName}!`, false);
        showToast(`Berhasil masuk sebagai ${user.displayName}`);
        setTimeout(() => {
          closeAuthModal();
          if (sessionStorage.getItem("ramphony_open_chat_after_auth") === "1") {
            sessionStorage.removeItem("ramphony_open_chat_after_auth");
            setTimeout(() => {
              const chatBtn = document.getElementById("open-chat-btn");
              chatBtn?.click();
            }, 300);
          }
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Masuk ke Ramphony";
          }
        }, 900);
      } catch (err) {
        showAlert(err.message, true);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Masuk ke Ramphony";
        }
      }
    });

    // Register Form Submit
    const regForm = document.getElementById("auth-reg-form");
    regForm?.addEventListener("submit", async e => {
      e.preventDefault();
      clearAlerts();
      const name = document.getElementById("auth-reg-name").value;
      const username = document.getElementById("auth-reg-username").value;
      const email = document.getElementById("auth-reg-email").value;
      const pwd = document.getElementById("auth-reg-password").value;
      const pwdConfirm = document.getElementById("auth-reg-confirm").value;
      const submitBtn = document.getElementById("auth-reg-submit");

      if (pwd !== pwdConfirm) {
        showAlert("Konfirmasi password tidak cocok.", true);
        return;
      }

      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = "Mendaftarkan...";
        }
        const user = await registerAccount(name, username, email, pwd);
        showAlert("Akun berhasil dibuat! Mengalihkan...", false);
        showToast(`Akun ${user.displayName} berhasil didaftarkan!`);
        setTimeout(() => {
          closeAuthModal();
          if (sessionStorage.getItem("ramphony_open_chat_after_auth") === "1") {
            sessionStorage.removeItem("ramphony_open_chat_after_auth");
            setTimeout(() => {
              const chatBtn = document.getElementById("open-chat-btn");
              chatBtn?.click();
            }, 300);
          }
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Buat Akun Ramphony";
          }
        }, 900);
      } catch (err) {
        showAlert(err.message, true);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Buat Akun Ramphony";
        }
      }
    });

    // Update UI on start
    updateAllUI();
  }

  // Expose to global window
  window.RamphonyAuth = {
    isReady: () => isFirebaseReady,
    getCurrentUser: getCurrentUser,
    register: registerAccount,
    login: loginAccount,
    loginWithGoogle: loginWithGoogle,
    logout: logoutAccount,
    openModal: openAuthModal,
    closeModal: closeAuthModal,
    updateUI: updateAllUI
  };

  window.loginWithGoogle = loginWithGoogle;
  window.openAuthModal = openAuthModal;
  window.isUserLoggedIn = () => !!localStorage.getItem(SESSION_USER_KEY);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

