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
  function initFirebase() {
    if (FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId && typeof window.firebase !== "undefined") {
      try {
        if (!window.firebase.apps.length) {
          firebaseApp = window.firebase.initializeApp(FIREBASE_CONFIG);
        } else {
          firebaseApp = window.firebase.app();
        }
        firebaseAuth = window.firebase.auth();
        isFirebaseReady = true;
        console.log("⚡ Ramphony Firebase Auth connected successfully.");

        // Listen for real Firebase auth state changes
        firebaseAuth.onAuthStateChanged(user => {
          if (user) {
            const mapped = {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || user.email.split("@")[0],
              username: (user.displayName || user.email.split("@")[0]).toLowerCase().replace(/[^a-z0-9_]/g, ""),
              avatar: user.photoURL || "",
              provider: "firebase"
            };
            saveSession(mapped);
          } else {
            // Logged out in Firebase
            if (getCurrentUser()?.provider === "firebase") {
              clearSession();
            }
          }
          updateAllUI();
        });
      } catch (err) {
        console.warn("Firebase Auth init warning:", err);
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
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
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
    localStorage.removeItem(SESSION_USER_KEY);
    // Reset profile back to Guest
    try {
      const guestProfile = {
        displayName: "Guest Listener",
        username: "guest",
        bio: "Login to save playlists and chat with friends.",
        avatar: ""
      };
      localStorage.setItem(PROFILE_KEY, JSON.stringify(guestProfile));
    } catch (e) {}

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
      await firebaseAuth.signOut();
    }
    clearSession();
    showToast("Berhasil keluar dari akun.");
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

  function updateAllUI() {
    const user = getCurrentUser();

    // 1. Sidebar Account Strip
    const saName = document.getElementById("sa-name");
    const saSub = document.getElementById("sa-sub");
    const saAvatarLetter = document.getElementById("sa-avatar-letter");
    const saAvatarImg = document.getElementById("sa-avatar-img");
    const saActionBtn = document.getElementById("sa-action-btn");

    if (user) {
      if (saName) saName.textContent = user.displayName;
      if (saSub) saSub.textContent = `@${user.username}`;
      if (saAvatarLetter && saAvatarImg) {
        if (user.avatar) {
          saAvatarImg.src = user.avatar;
          saAvatarImg.hidden = false;
          saAvatarLetter.hidden = true;
        } else {
          saAvatarImg.hidden = true;
          saAvatarLetter.hidden = false;
          saAvatarLetter.textContent = user.displayName.charAt(0).toUpperCase();
        }
      }
      if (saActionBtn) {
        saActionBtn.textContent = "Keluar";
        saActionBtn.className = "sa-action-btn sa-logout-btn";
        saActionBtn.onclick = (e) => {
          e.preventDefault();
          logoutAccount();
        };
      }
    } else {
      if (saName) saName.textContent = "Guest";
      if (saSub) saSub.textContent = "Mode Tamu";
      if (saAvatarLetter) {
        saAvatarLetter.textContent = "G";
        saAvatarLetter.hidden = false;
      }
      if (saAvatarImg) saAvatarImg.hidden = true;
      if (saActionBtn) {
        saActionBtn.textContent = "Masuk / Daftar";
        saActionBtn.className = "sa-action-btn";
        saActionBtn.onclick = (e) => {
          e.preventDefault();
          openAuthModal("login");
        };
      }
    }

    // 2. Topbar Login/Register indicator
    const topbarAuthBtn = document.getElementById("topbar-auth-btn");
    if (topbarAuthBtn) {
      topbarAuthBtn.textContent = user ? user.displayName : "Masuk / Daftar";
      topbarAuthBtn.title = user ? `Akun: ${user.displayName} (@${user.username})` : "Masuk atau buat akun";
    }

    // 3. Update Chat and Profile if functions available
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

    // Topbar Auth Trigger
    document.getElementById("topbar-auth-btn")?.addEventListener("click", () => {
      const u = getCurrentUser();
      if (u) {
        window.location.href = "pages/profile.html";
      } else {
        openAuthModal("login");
      }
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
    openModal: openAuthModal,
    closeModal: closeAuthModal,
    getCurrentUser: getCurrentUser,
    logout: logoutAccount,
    updateUI: updateAllUI
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

