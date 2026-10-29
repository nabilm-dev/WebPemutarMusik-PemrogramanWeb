
/* ===== RAMPHONY TUTORIAL ===== */

(() => {
  "use strict";

  const STORAGE_KEY = "ramphony_tutorial_completed_v1";

  const steps = [
    {
      tab: "Welcome",
      title: "Welcome to Ramphony!",
      description:
        "Selamat datang di Ramphony! Music player pribadi untuk menikmati koleksi musik langsung dari perangkatmu.",
      gif: "assets/images/tutorial-welcome.gif",
      alt: "Animasi musik Ramphony"
    },
    {
      tab: "Library",
      title: "Your Music, Your Library",
      description:
        "Klik Pilih Folder untuk membuat playlist otomatis berdasarkan folder. Lagu yang ditambahkan satu per satu masuk ke Ungrouped Songs. Koleksi tersimpan di browser ini.",
      gif: "assets/images/tutorial-library.gif",
      alt: "Animasi folder musik"
    },
    {
      tab: "Player",
      title: "Enjoy Your Music!",
      description:
        "Pilih playlist dan lagu, lalu gunakan Play, Pause, Shuffle, Repeat, dan Lyrics. Lirik online membutuhkan internet. Menghapus data situs dapat menghapus koleksi musik.",
      gif: "assets/images/tutorial-music.gif",
      alt: "Animasi pemutar musik"
    }
  ];

  let currentStep = 0;
  let previousFocus = null;

  /* ===== CREATE MODAL ===== */

  const overlay = document.createElement("div");
  overlay.id = "tutorial-overlay";
  overlay.className = "tutorial-overlay";

  overlay.innerHTML = `
    <section
      class="tutorial-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-title"
      aria-describedby="tutorial-description"
      tabindex="-1"
    >
      <div class="tutorial-header">
        <span class="tutorial-brand">♫ RAMPHONY GUIDE</span>
        <span class="tutorial-counter" id="tutorial-counter">
          1 / 3
        </span>
      </div>

      <nav class="tutorial-tabs" aria-label="Navigasi tutorial">
        <button type="button" class="tutorial-tab" data-step="0">
          Welcome
        </button>
        <button type="button" class="tutorial-tab" data-step="1">
          Library
        </button>
        <button type="button" class="tutorial-tab" data-step="2">
          Player
        </button>
      </nav>

      <div class="tutorial-illustration">
        <img
          id="tutorial-image"
          class="tutorial-gif"
          src=""
          alt=""
        >
      </div>

      <h2 class="tutorial-title" id="tutorial-title"></h2>

      <p
        class="tutorial-description"
        id="tutorial-description"
      ></p>

      <div
        class="tutorial-dots"
        id="tutorial-dots"
        aria-hidden="true"
      ></div>

      <div class="tutorial-actions">
        <button
          type="button"
          class="tutorial-btn tutorial-btn-secondary"
          id="tutorial-skip"
        >
          Tutup
        </button>

        <button
          type="button"
          class="tutorial-btn tutorial-btn-back"
          id="tutorial-back"
        >
          Kembali
        </button>

        <button
          type="button"
          class="tutorial-btn tutorial-btn-primary"
          id="tutorial-next"
        >
          Lanjut →
        </button>
      </div>
    </section>
  `;

  document.body.appendChild(overlay);

  const modal = overlay.querySelector(".tutorial-modal");
  const title = overlay.querySelector("#tutorial-title");
  const description = overlay.querySelector("#tutorial-description");
  const image = overlay.querySelector("#tutorial-image");
  const counter = overlay.querySelector("#tutorial-counter");
  const dots = overlay.querySelector("#tutorial-dots");
  const skipButton = overlay.querySelector("#tutorial-skip");
  const backButton = overlay.querySelector("#tutorial-back");
  const nextButton = overlay.querySelector("#tutorial-next");
  const tabs = [...overlay.querySelectorAll(".tutorial-tab")];

  /* ===== RENDER ===== */

  function renderStep() {
    const step = steps[currentStep];

    title.textContent = step.title;
    description.textContent = step.description;
    image.src = step.gif;
    image.alt = step.alt;

    counter.textContent = `${currentStep + 1} / ${steps.length}`;

    tabs.forEach((tab, index) => {
      const active = index === currentStep;

      tab.classList.toggle("active", active);
      tab.setAttribute("aria-current", active ? "step" : "false");
    });

    dots.innerHTML = "";

    steps.forEach((_, index) => {
      const dot = document.createElement("span");
      dot.className = "tutorial-dot";

      if (index === currentStep) {
        dot.classList.add("active");
      }

      dots.appendChild(dot);
    });

    backButton.hidden = currentStep === 0;

    nextButton.textContent =
      currentStep === steps.length - 1
        ? "Mulai Musik ♫"
        : "Lanjut →";
  }

  /* ===== OPEN / CLOSE ===== */

  function openTutorial() {
    if (overlay.classList.contains("active")) return;

    previousFocus = document.activeElement;
    currentStep = 0;

    renderStep();

    overlay.classList.add("active");
    document.body.classList.add("tutorial-open");

    nextButton.focus();
  }

  function closeTutorial() {
    if (!overlay.classList.contains("active")) return;

    overlay.classList.remove("active");
    document.body.classList.remove("tutorial-open");

    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch (error) {
      console.warn("Status tutorial tidak tersimpan:", error);
    }

    if (
      previousFocus &&
      previousFocus.isConnected &&
      typeof previousFocus.focus === "function"
    ) {
      previousFocus.focus();
    } else {
      document.querySelector("#pick")?.focus();
    }
  }

  /* ===== NAVIGATION ===== */

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => {
      currentStep = index;
      renderStep();
    });
  });

  nextButton.addEventListener("click", () => {
    if (currentStep < steps.length - 1) {
      currentStep++;
      renderStep();
    } else {
      closeTutorial();
    }
  });

  backButton.addEventListener("click", () => {
    if (currentStep > 0) {
      currentStep--;
      renderStep();
    }
  });

  skipButton.addEventListener("click", closeTutorial);

  /* ===== SIDEBAR BUTTON ===== */

  function addSidebarButton() {
    const nav = document.querySelector("#sidebar .side-nav");
    if (!nav || document.querySelector("#sidebar-tutorial")) return;

    const link = document.createElement("a");

    link.href = "#";
    link.id = "sidebar-tutorial";
    link.className = "nav-link";
    link.innerHTML = "<span>?</span> Tutorial";

    link.addEventListener("click", event => {
      event.preventDefault();

      document.querySelector("#sidebar")?.classList.remove("open");
      document.querySelector("#menu-overlay")?.classList.remove("open");

      const menuToggle = document.querySelector("#menu-toggle");

      if (menuToggle) {
        menuToggle.setAttribute("aria-expanded", "false");
      }

      openTutorial();
    });

    const settingsLink = nav.querySelector('[data-page="settings"]');

    if (settingsLink) {
      settingsLink.insertAdjacentElement("beforebegin", link);
    } else {
      nav.appendChild(link);
    }
  }

  /* ===== SETTINGS BUTTON ===== */

  function addSettingsButton() {
    const settings = document.querySelector("#settings-view");
    if (!settings || document.querySelector("#open-tutorial")) return;

    const button = document.createElement("button");

    button.id = "open-tutorial";
    button.type = "button";
    button.className = "settings-tutorial-btn";
    button.textContent = "♫ Lihat Tutorial Lagi";
    button.addEventListener("click", openTutorial);

    settings.appendChild(button);
  }

  /* ===== KEYBOARD ===== */

  document.addEventListener("keydown", event => {
    if (!overlay.classList.contains("active")) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeTutorial();
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = [
      ...tabs,
      backButton,
      skipButton,
      nextButton
    ].filter(element => !element.hidden);

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      document.activeElement === last
    ) {
      event.preventDefault();
      first.focus();
    }
  }, true);

  /* ===== INITIALIZATION ===== */

  addSidebarButton();
  addSettingsButton();

  window.openRamphonyTutorial = openTutorial;

  let completed = false;

  try {
    completed = localStorage.getItem(STORAGE_KEY) === "true";
  } catch (error) {
    console.warn("Status tutorial tidak terbaca:", error);
  }

  if (!completed) {
    openTutorial();
  }
})();
