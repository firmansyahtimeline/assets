(function (global) {

  const cqmz_customQuest = global.customQuest || {};

  cqmz_customQuest.showModalStep = function (config) {

    const cqmz_steps = config.steps || [];
    config = {
      blockCheckManual: false,
      canClickOutside: true,
      ...config
    };
    // ===== IDENTIFIER =====
const cqmz_id =
  config.questIdentifier ||
  ("quest_" + Math.random().toString(36).slice(2));

config.questIdentifier = cqmz_id;

// ===== SAVE FULL CONFIG =====
try {
  localStorage.setItem(
    "cqmz_init_" + cqmz_id,
    JSON.stringify(config)
  );
} catch (e) {} 

    let cqmz_current =
      typeof config.initialStep === "number"
        ? Math.max(-1, Math.min(config.initialStep, cqmz_steps.length - 1))
        : (config.startEmpty ? -1 : 0);

    let cqmz_completed = new Array(cqmz_steps.length).fill(false);

    const cqmz_listeners = config || {};
    const cqmz_emit = (name, payload) => cqmz_listeners[name]?.(payload);

    const cqmz_buildPayload = (index = cqmz_current) => ({
      index,
      step: cqmz_steps[index],
      steps: cqmz_steps,
      completed: [...cqmz_completed],
      isCompleted: cqmz_completed[index],
      current: cqmz_current
    });

    // ===== STYLE =====
    if (!document.getElementById("modal-step-style")) {
      const cqmz_style = document.createElement("style");
      cqmz_style.id = "modal-step-style";
      cqmz_style.innerHTML = `/* style unchanged */


.cqmz-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.cqmz-modal {
  width: 90%;
  max-width: 420px;
  background: #fff;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.2);
  font-family: sans-serif;
}

/* ===== HEADER ===== */
.cqmz-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.cqmz-header-title {
  font-size: 26px;
  font-weight: 600;
}

.cqmz-close {
  width: 24px;
  height: 24px;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.2s, transform 0.15s;
}

.cqmz-close:hover {
  opacity: 1;
}

.cqmz-close:active {
  transform: scale(0.9);
}

/* ===== STEP BUTTON STYLE ===== */
.cqmz-step {
  display: flex;
  gap: 12px;
  padding: 12px;
  align-items: center;
  cursor: pointer;

  border-radius: 12px;
  border: 1px solid #e0e0e0;
  background: #fff;

  box-shadow: 0 2px 6px rgba(0,0,0,0.06);

  transition:
    background 0.2s,
    transform 0.08s,
    box-shadow 0.2s,
    border-color 0.2s;

  position: relative;
  overflow: hidden; /* for ripple */
}

/* hover */
.cqmz-step:hover {
  background: #f9f9f9;
  box-shadow: 0 4px 10px rgba(0,0,0,0.08);
}

/* press */
.cqmz-step:active {
  transform: scale(0.97);
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

/* active step */
.cqmz-step.active {
  border-color: #4CAF50;
  background: #f1fff3;
}

/* completed */
.cqmz-step.done {
  background: #f6fff7;
}

/* ===== CIRCLE ===== */
.cqmz-circle {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid #ccc;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  flex-shrink: 0;
  background: white;
  transition: all 0.2s;
}

.cqmz-step.active .cqmz-circle {
  border-color: #4CAF50;
}

.cqmz-step.done .cqmz-circle {
  background: #4CAF50;
  border-color: #4CAF50;
}

/* check icon */
.cqmz-check {
  width: 16px;
  height: 16px;
  stroke: white;
  stroke-width: 3;
  fill: none;
}

/* ===== TEXT ===== */
.cqmz-text {
  flex: 1;
}

.cqmz-title {
  font-weight: 600;
  font-size: 22px;
  line-height: 1.2;
}

.cqmz-sub {
  font-size: 18px;
  color: #777;
  margin-top: 2px;
}

/* ===== ACTION BUTTONS ===== */
.cqmz-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 16px;
  font-size: 18px;
}

.cqmz-btn {
  padding: 10px 14px;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  font-size: 18px;

  transition: all 0.15s;
}

.cqmz-btn.primary {
  background: #4CAF50;
  color: white;
}

.cqmz-btn.primary:active {
  transform: scale(0.96);
}

.cqmz-btn.ghost {
  background: #eee;
}

.cqmz-btn.ghost:active {
  transform: scale(0.96);
}

/* ===== RIPPLE EFFECT ===== */
.cqmz-step span {
  position: absolute;
  border-radius: 50%;
  transform: scale(0);
  background: rgba(0,0,0,0.1);
  animation: cqmz-ripple 0.4s linear;
  pointer-events: none;
}

@keyframes cqmz-ripple {
  to {
    transform: scale(2.5);
    opacity: 0;
  }
}


`;
      document.head.appendChild(cqmz_style);
    }

    const cqmz_overlay = document.createElement("div");
    cqmz_overlay.className = "cqmz-overlay";

    const cqmz_modal = document.createElement("div");
    cqmz_modal.className = "cqmz-modal";

    cqmz_overlay.appendChild(cqmz_modal);

    let cqmz_isVisible = false;
    let cqmz_finishTimer = null;

    function cqmz_show() {
      if (!cqmz_isVisible) {
        document.body.appendChild(cqmz_overlay);
        cqmz_isVisible = true;
      }
    }

    function cqmz_hide() {
      if (cqmz_isVisible) {
        cqmz_overlay.remove();
        cqmz_isVisible = false;
        cqmz_emit("onClose", {
          completed: [...cqmz_completed],
          current: cqmz_current,
          steps: cqmz_steps
        });
      }
    }

    function cqmz_toggle() {
      cqmz_isVisible ? cqmz_hide() : cqmz_show();
    }

    const cqmz_checkSVG = () => `
      <svg viewBox="0 0 24 24" class="cqmz-check">
        <path d="M5 13l4 4L19 7"/>
      </svg>
    `;

    const cqmz_closeSVG = () => `Tutup
      <svg viewBox="0 0 24 24" class="cqmz-close">
        <path d="M6 6L18 18M6 18L18 6" stroke="black" stroke-width="2"/>
      </svg>
    `;

    function cqmz_closeModal() {

  // cancel finish timer
  if (cqmz_finishTimer) {
    clearInterval(cqmz_finishTimer);
    cqmz_finishTimer = null;
  }

  cqmz_hide();
}

    function cqmz_render() {
      cqmz_modal.innerHTML = "";

      const cqmz_header = document.createElement("div");
      cqmz_header.className = "cqmz-header";

      const cqmz_title = document.createElement("div");
      cqmz_title.className = "cqmz-header-title";
      cqmz_title.textContent = config.title || "Langkah";

      const cqmz_closeBtn = document.createElement("div");
      cqmz_closeBtn.innerHTML = cqmz_closeSVG();
      cqmz_closeBtn.onclick = cqmz_closeModal;

      cqmz_header.appendChild(cqmz_title);
      cqmz_header.appendChild(cqmz_closeBtn);
      cqmz_modal.appendChild(cqmz_header);

      cqmz_steps.forEach((s, i) => {
        const cqmz_stepEl = document.createElement("div");
        cqmz_stepEl.className = "cqmz-step";

        if (cqmz_completed[i]) cqmz_stepEl.classList.add("done");
        if (cqmz_current >= 0 && i === cqmz_current) {
          cqmz_stepEl.classList.add("active");
        }

        cqmz_stepEl.innerHTML = `
          <div class="cqmz-circle">
            ${cqmz_completed[i] ? cqmz_checkSVG() : (i + 1)}
          </div>
          <div class="cqmz-text">
            <div class="cqmz-title">${s.title || ""}</div>
            ${s.subtitle ? `<div class="cqmz-sub">${s.subtitle}</div>` : ""}
          </div>
        `;

        cqmz_stepEl.onclick = () => {

          if (config.blockCheckManual) {
            if (cqmz_current !== i) {
              cqmz_current = i;
              cqmz_render();
              cqmz_emit("onStepChange", cqmz_buildPayload(i));
            }
            return;
          }

          const was = cqmz_completed[i];
          cqmz_completed[i] = !cqmz_completed[i];

          if (cqmz_current !== i) {
            cqmz_current = i;
            cqmz_emit("onStepChange", cqmz_buildPayload(i));
          }

          cqmz_render();

          cqmz_emit("onToggle", cqmz_buildPayload(i));
          if (!was) cqmz_emit("onCheck", cqmz_buildPayload(i));
          else cqmz_emit("onUncheck", cqmz_buildPayload(i));

          cqmz_emit("onChecklistChange", {
            completed: [...cqmz_completed],
            changedIndex: i
          });
        };

        cqmz_modal.appendChild(cqmz_stepEl);
      });

      const cqmz_actions = document.createElement("div");
      cqmz_actions.className = "cqmz-actions";

      if (!config.disableBack) {
        const cqmz_back = document.createElement("button");
        cqmz_back.className = "cqmz-btn ghost";
        cqmz_back.textContent = "Kembali";
        cqmz_back.disabled = cqmz_current <= 0;

        cqmz_back.onclick = () => {
          cqmz_current--;
          cqmz_render();
          cqmz_emit("onStepChange", cqmz_buildPayload(cqmz_current));
        };

        cqmz_actions.appendChild(cqmz_back);
      }

      if (!config.disableNext) {
        const cqmz_next = document.createElement("button");
        cqmz_next.className = "cqmz-btn primary";

        cqmz_next.textContent =
          cqmz_current === -1
            ? (config.startLabel || "Mulai")
            : cqmz_current === cqmz_steps.length - 1
              ? "Selesai"
              : "Lanjut";

        cqmz_next.onclick = () => {

          if (cqmz_current === -1) {
            cqmz_current = 0;
            cqmz_render();
            cqmz_emit("onStepChange", cqmz_buildPayload(cqmz_current));
            return;
          }

          if (cqmz_current < cqmz_steps.length - 1) {
            cqmz_current++;
            cqmz_render();
            cqmz_emit("onStepChange", cqmz_buildPayload(cqmz_current));
       } else {

  // ===== MARK FINISHED =====
  try {
    localStorage.setItem(
      "cqmz_finished_" + cqmz_id,
      "1"
    );
  } catch (e) {}

  // ===== FINISH SCREEN =====
  let cqmz_countdown = 5;

  cqmz_modal.innerHTML = `
    <div style="
      text-align:center;
      padding:20px 10px;
    ">
      <div style="
        font-size:70px;
        margin-bottom:10px;
      ">
        ✓
      </div>

      <div style="
        font-size:28px;
        font-weight:700;
        margin-bottom:12px;
      ">
        Langkah Telah Selesai
      </div>

      <button class="cqmz-btn primary" id="cqmz-repeat-btn">
        Ulangi Langkah
      </button>

      <div id="cqmz-countdown" style="
        margin-top:18px;
        color:#777;
        font-size:16px;
      ">
        Otomatis menutup dalam 5 detik..
      </div>
    </div>
  `;

  // ===== REPEAT BUTTON =====
  const cqmz_repeatBtn =
    cqmz_modal.querySelector("#cqmz-repeat-btn");

  cqmz_repeatBtn.onclick = () => {

    // cancel timer
    if (cqmz_finishTimer) {
      clearInterval(cqmz_finishTimer);
      cqmz_finishTimer = null;
    }

    try {
      localStorage.removeItem(
        "cqmz_finished_" + cqmz_id
      );
    } catch (e) {}

    cqmz_completed =
      new Array(cqmz_steps.length).fill(false);

    cqmz_current =
      config.startEmpty ? -1 : 0;

    cqmz_render();
  };

  // ===== COUNTDOWN =====
  const cqmz_countdownText =
    cqmz_modal.querySelector("#cqmz-countdown");

  // cancel old timer
  if (cqmz_finishTimer) {
    clearInterval(cqmz_finishTimer);
    cqmz_finishTimer = null;
  }

  cqmz_finishTimer = setInterval(() => {

    cqmz_countdown--;

    if (cqmz_countdown <= 0) {

      clearInterval(cqmz_finishTimer);
      cqmz_finishTimer = null;

      cqmz_closeModal();

      cqmz_emit("onFinish", {
        completed: [...cqmz_completed],
        steps: cqmz_steps
      });

      return;
    }

    cqmz_countdownText.textContent =
      "Otomatis menutup dalam " +
      cqmz_countdown +
      " detik..";

  }, 1000);
}
        };

        cqmz_actions.appendChild(cqmz_next);
      }

      if (cqmz_actions.children.length > 0) {
        cqmz_actions.style.justifyContent =
          cqmz_actions.children.length === 1 ? "flex-end" : "space-between";
        cqmz_modal.appendChild(cqmz_actions);
      }
    }

    function cqmz_setStep(i) {
      if (i >= 0 && i < cqmz_steps.length) {
        cqmz_current = i;
        cqmz_render();
        cqmz_emit("onStepChange", cqmz_buildPayload(i));
      }
    }

    function cqmz_getState() {
      return {
        current: cqmz_current,
        completed: [...cqmz_completed],
        steps: cqmz_steps,
        visible: cqmz_isVisible
      };
    }

    function cqmz_setStepMark(index, value) {
      if (index < 0 || index >= cqmz_steps.length) return;

      const prev = cqmz_completed[index];

      cqmz_completed[index] =
        typeof value === "boolean" ? value : !cqmz_completed[index];

      if (prev === cqmz_completed[index]) return;

      cqmz_render();

      const payload = cqmz_buildPayload(index);

      cqmz_emit("onToggle", payload);

      if (cqmz_completed[index]) {
        cqmz_emit("onCheck", payload);
      } else {
        cqmz_emit("onUncheck", payload);
      }

      cqmz_emit("onChecklistChange", {
        completed: [...cqmz_completed],
        changedIndex: index
      });
    }

    cqmz_render();

    cqmz_emit("onInit", {
      current: cqmz_current,
      completed: [...cqmz_completed],
      steps: cqmz_steps
    });

    if (cqmz_current >= 0) {
      cqmz_emit("onStepChange", cqmz_buildPayload(cqmz_current));
    }

    cqmz_overlay.onclick = (e) => {
  // default true kalau tidak diset
  const cqmz_canClickOutside =
    typeof config.canClickOutside === "boolean"
      ? config.canClickOutside
      : true;

  if (!cqmz_canClickOutside) return;

  if (e.target === cqmz_overlay) {
    cqmz_closeModal();
  }
};

    return {
      show: cqmz_show,
      hide: cqmz_hide,
      toggle: cqmz_toggle,
      setStep: cqmz_setStep,
      getState: cqmz_getState,
      setStepMark: cqmz_setStepMark
    };
  };

  global.customQuest = cqmz_customQuest;

})(window);
window.customQuest.reshow = function (id, extra = {}) {
  try {
    const raw = localStorage.getItem("cqmz_init_" + id);
    if (!raw) return false;

    const base = JSON.parse(raw);

    const modal = window.customQuest.showModalStep({
      ...base,
      ...extra // inject functions here
    });

    modal.show();
    return modal;
  } catch (e) {
    return false;
  }
};


/*
const modal = customQuest.showModalStep({
  title: "Selesaikan Langkah Terakhir!",
  steps: [
    { title: "Login", subtitle: "Masuk akun dulu" },
    { title: "Alamat", subtitle: "Isi alamat lengkap" },
    { title: "Bayar", subtitle: "Pilih metode pembayaran" }
  ],
  blockCheckManual: false,
  startEmpty: true,
  disableNext: false,
  disableBack: false,
  onClose: (e) => console.log("Closed", e), 
  onCheck: (e) => alert("Checked "+ e.index), 
  onFinish: (e) => console.log("Finished", e)
});

// ⭐ CONTROL FROM ANYWHERE
window.modalStep = modal;
modalStep.show();

*/


