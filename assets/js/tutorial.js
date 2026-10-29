
/* ===== RAMPHONY TUTORIAL POPUP ===== */

(() => {
  "use strict";

  const STORAGE_KEY = "ramphony_tutorial_completed_v1";

  let currentStep = 0;
  let previousFocus = null;

  /* ===== TUTORIAL PAGES ===== */

  const steps = [
    {
      title: "Welcome to Ramphony!",
      description:
        "Selamat datang di Ramphony! Music player pribadi untuk menikmati koleksi musik langsung dari perangkatmu. Kami menyarankan kamu memilih satu folder berisi lagu agar seluruh musik bisa masuk sekaligus.",

      gif: "assets/images/tutorial-welcome.gif",
      alt: "Animasi musik Ramphony"
    },

    {
      title: "Your Music, Your Library",
      description:
        "Klik tombol Pilih Folder untuk memasukkan banyak lagu sekaligus, atau Tambah Lagu untuk memilih file tertentu. Lagu yang berhasil disimpan akan tetap tersedia setelah refresh di browser yang sama.",

      gif: "assets/images/tutorial-library.gif",
      alt: "Animasi folder musik"
    },

    {
      title: "Enjoy Your Music!",
      description:
        "Pilih lagu dari playlist, lalu gunakan Play, Pause, Shuffle, Repeat, dan Lyrics. Musik disimpan di browser, bukan di server. Lirik online membutuhkan internet. Menghapus data situs dapat menghapus koleksi musik yang tersimpan.",

      gif: "assets/images/tutorial-music.gif",
      alt: "Animasi pemutar musik"
    }
  ];

  /* ===== CREATE POPUP ===== */

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
        <span class="tutorial-brand">
          ♫ RAMPHONY
        </span>

        <span
          class="tutorial-counter"
          id="tutorial-counter"
        >
          1 / 3
        </span>
      </div>

      <div class="tutorial-illustration">
        <img
          id="tutorial-image"
          class="tutorial-gif"
          src=""
          alt=""
        >
      </div>

      <h2
        class="tutorial-title"
        id="tutorial-title"
      ></h2>

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
          class="tutorial-btn tutorial-btn-secondary"
          id="tutorial-skip"
          type="button"
        >
          Lewati
        </button>

        <button
          class="tutorial-btn tutorial-btn-back"
          id="tutorial-back"
          type="button"
          hidden
        >
          Kembali
        </button>

        <button
          class="tutorial-btn tutorial-btn-primary"
          id="tutorial-next"
          type="button"
        >
          Lanjut →
        </button>

      </div>

    </section>
  `;

  document.body.appendChild(overlay);

  /* ===== ELEMENTS ===== */

  const modal = overlay.querySelector(".tutorial-modal");

  const title = overlay.querySelector("#tutorial-title");

  const description = overlay.querySelector(
    "#tutorial-description"
  );

  const image = overlay.querySelector("#tutorial-image");

  const counter = overlay.querySelector(
    "#tutorial-counter"
  );

  const dots = overlay.querySelector("#tutorial-dots");

  const skipButton = overlay.querySelector(
    "#tutorial-skip"
  );

  const backButton = overlay.querySelector(
    "#tutorial-back"
  );

  const nextButton = overlay.querySelector(
    "#tutorial-next"
  );

  /* ===== RENDER TUTORIAL ===== */

  function renderStep() {
    const step = steps[currentStep];

    title.textContent = step.title;
    description.textContent = step.description;

    image.src = step.gif;
    image.alt = step.alt;

    counter.textContent =
      `${currentStep + 1} / ${steps.length}`;

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
    skipButton.hidden = currentStep !== 0;

    nextButton.textContent =
      currentStep === steps.length - 1
        ? "Mulai Musik ♫"
        : "Lanjut →";
  }

  /* ===== OPEN POPUP ===== */

  function openTutorial() {
    if (overlay.classList.contains("active")) return;

    previousFocus = document.activeElement;

    currentStep = 0;

    renderStep();

    overlay.classList.add("active");

    document.body.classList.add("tutorial-open");

    nextButton.focus();
  }

  /* ===== CLOSE POPUP ===== */

  function closeTutorial() {
    if (!overlay.classList.contains("active")) return;

    overlay.classList.remove("active");

    document.body.classList.remove("tutorial-open");

    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch (error) {
      console.warn(
        "Gagal menyimpan status tutorial:",
        error
      );
    }

    if (
      previousFocus &&
      typeof previousFocus.focus === "function"
    ) {
      previousFocus.focus();
    } else {
      document.querySelector("#pick")?.focus();
    }
  }

  /* ===== NEXT BUTTON ===== */

  nextButton.addEventListener("click", () => {
    if (currentStep < steps.length - 1) {
      currentStep++;

      renderStep();
    } else {
      closeTutorial();
    }
  });

  /* ===== BACK BUTTON ===== */

  backButton.addEventListener("click", () => {
    if (currentStep > 0) {
      currentStep--;

      renderStep();
    }
  });

  /* ===== SKIP BUTTON ===== */

  skipButton.addEventListener("click", closeTutorial);

  /* ===== KEYBOARD SUPPORT ===== */

  document.addEventListener(
    "keydown",
    event => {
      if (!overlay.classList.contains("active")) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeTutorial();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = [
        skipButton,
        backButton,
        nextButton
      ].filter(button => !button.hidden);

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (
        event.shiftKey &&
        document.activeElement === first
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === last
      ) {
        event.preventDefault();
        first.focus();
      }
    },
    true
  );

  /* ===== SETTINGS BUTTON ===== */

  function addSettingsButton() {
    const settings = document.querySelector(
      "#settings-view"
    );

    if (!settings) return;

    if (settings.querySelector("#open-tutorial")) {
      return;
    }

    const button = document.createElement("button");

    button.id = "open-tutorial";
    button.type = "button";
    button.className = "settings-tutorial-btn";

    button.textContent = "♫ Lihat Tutorial Lagi";

    button.addEventListener(
      "click",
      openTutorial
    );

    settings.appendChild(button);
  }

  /* ===== INITIALIZATION ===== */

  addSettingsButton();

  let completed = false;

  try {
    completed =
      localStorage.getItem(STORAGE_KEY) === "true";
  } catch (error) {
    console.warn(
      "Tidak dapat membaca status tutorial:",
      error
    );
  }

  if (!completed) {
    openTutorial();
  }

  /* ===== PUBLIC FUNCTION ===== */

  window.openRamphonyTutorial = openTutorial;

})();
