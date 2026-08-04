
// ==UserScript==
// @name         Fast Login Full UI (Flow Fixed)
// @namespace    fast_login
// @version      6.0
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const fast_login_API = "/verify.php";

  // ===============================
  // STATE
  // ===============================
  let fast_login_state = "login"; // login -> requested -> verified
  let fast_login_auth_callback = null;
  let fast_login_last_notified_number = null;

  // ===============================
  // STORAGE
  // ===============================
  const fast_login_KEYS = {
    logged: "fast_login_loggedin_number",
    device: "fast_login_device"
  };

  const fast_login_LS = {
    get: (k) => localStorage.getItem(fast_login_KEYS[k]),
    set: (k, v) => localStorage.setItem(fast_login_KEYS[k], v),
    del: (k) => localStorage.removeItem(fast_login_KEYS[k])
  };

  // ===============================
  // ROOT
  // ===============================
  const root = document.createElement("div");
  root.id = "fast_login_root";
  document.body.appendChild(root);

  // ===============================
  // STYLE
  // ===============================
  const style = document.createElement("style");
  style.textContent = `
#fast_login_root { all: initial; }

#fast_login_root .btn {
  position: fixed;
  top: 0px;
  right: 20px;
  width: 40px;
  height: 40px;
  background: #111;
  border-radius: 50%;
  display:flex;
  align-items:center;
  justify-content:center;
  color:#fff;
  cursor:pointer;
  z-index:9999999999;
}

#fast_login_root .modal {
  position: fixed;
  inset:0;
  background: rgba(0,0,0,0.6);
  display:none;
  align-items:center;
  justify-content:center;
  z-index:9999999999;
}

#fast_login_root .box {
  width: 340px;
  background:#fff;
  padding:20px;
  border-radius:12px;
  color:#000;
  font-family: Arial;
}

#fast_login_root input {
  width:100%;
  padding:8px;
  margin-bottom:10px;
  border:1px solid #ccc;
}

#fast_login_root button {
  width:100%;
  padding:10px;
  margin-top:5px;
  background:#111;
  color:#fff;
  border:none;
  cursor:pointer;
}

.session {
  border:1px solid #ddd;
  padding:6px;
  margin-top:5px;
  font-size:12px;
}

.current {
  border-color:green;
}

#fast_login_root .fast_login_icon {
  width: 26px;
  height: 26px;
  fill: white;
  display: block;
}

#fast_login_root .device_list {
  max-height: 180px;
  overflow-y: auto;
  margin-top: 8px;
  padding-right: 4px;
}

/* optional: nicer scroll */
#fast_login_root .device_list::-webkit-scrollbar {
  width: 6px;
}

#fast_login_root .device_list::-webkit-scrollbar-thumb {
  background: #999;
  border-radius: 4px;
}

#fast_login_root .device_list {
  max-height: 35vh; /* responsive */
}

.current {
  border-color: green;
  background: #f6fff6;
}
`;
  document.head.appendChild(style);

  // ===============================
  // HTML
  // ===============================
  root.innerHTML = `
    <div class="btn">
  <svg class="fast_login_icon" viewBox="0 0 24 24">
    <path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5z"/></div>
    <div class="modal">
      <div class="box">
        <h3>Member Area</h3>
        <div id="content"></div>
        <button id="close">Tutup</button>
      </div>
    </div>
  `;

  const btn = root.querySelector(".btn");
  const modal = root.querySelector(".modal");
  const content = root.querySelector("#content");

  // ===============================
  // API
  // ===============================
  async function api(p) {
    const r = await fetch(fast_login_API + "?" + new URLSearchParams(p));
    return r.json();
  }
  
  function whatsappIntentOpen(cqmz_number, cqmz_code){
	 const cqmz_intentUrl =
      `whatsapp://send?phone=${cqmz_number}&text=${encodeURIComponent(cqmz_code)}#Intent;scheme=smsto;package=com.whatsapp;end`;

    const cqmz_waUrl =
      `https://wa.me/${cqmz_number}?text=${encodeURIComponent(cqmz_code)}`;

    let cqmz_hasLeftPage = false;

    const cqmz_onHidden = () => {
      cqmz_hasLeftPage = true;
    };

    window.addEventListener("blur", cqmz_onHidden);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        cqmz_hasLeftPage = true;
      }
    });

    window.addEventListener("pagehide", () => {
      cqmz_hasLeftPage = true;
    });

    // buka intent
    window.location.href = cqmz_intentUrl;

    // cek 3 detik
    setTimeout(() => {

      window.removeEventListener("blur", cqmz_onHidden);

      if (!cqmz_hasLeftPage) {
        cqmz_showTempWaButton(cqmz_waUrl, "_blank");
      }else{
      	modalWa.setStepMark(0, true);
          
      	}

    }, 1000);
	}

  // ===============================
  // LOGIN VIEW (STATE BASED)
  // ===============================
  function view_login() {
    // STEP 1: request an activation code. The phone number is learned from
    // the WhatsApp sender by the server webhook, so no number input is needed.
    if (fast_login_state === "login") {
      content.innerHTML = `
        <p>Tekan tombol di bawah, lalu kirim kode melalui WhatsApp.</p>
        <button id="req">Masuk dengan WhatsApp</button>
      `;

      root.querySelector("#req").onclick = async () => {
        const r = await api({ api: "reqLink" });

        if (!r.status) {
          alert(r.msg || "Gagal membuat kode aktivasi");
          return;
        }

        whatsappIntentOpen(r.number, r.code);
        fast_login_state = "requested";
        view_login();
      };
    }

    // STEP 2: wait until the WhatsApp listener confirms sender + code.
    else if (fast_login_state === "requested") {
      content.innerHTML = `
        <p>Kirim pesan kode yang sudah disiapkan ke WhatsApp, lalu kembali ke halaman ini.</p>
        <button id="check">Cek status</button>
        <button id="resend">Kirim ulang kode</button>
        <button id="restart">Buat kode baru</button>
      `;

      root.querySelector("#check").onclick = () => render();

      root.querySelector("#resend").onclick = async () => {
        const r = await api({ api: "reqLink" });
        if (!r.status) {
          alert(r.msg || "Gagal membuat kode aktivasi");
          return;
        }
        whatsappIntentOpen(r.number, r.code);
      };

      root.querySelector("#restart").onclick = () => {
        fast_login_state = "login";
        view_login();
      };
    }
  }

  // ===============================
  // DASHBOARD
  // ===============================
  async function view_dashboard() {
    const data = await api({ api: "fullInfo" });

    if (!data) return view_login();

    let html = `
  <p><b>Masuk sebagai: ${data.current.number}</b></p>
  <b>Perangkat yang masuk:</b>
  <div class="device_list">
`;
    data.sessions.forEach(s => {
      html += `
        <div class="session ${s.isCurrent ? "current" : ""}">
          <div>${s.deviceId}</div>
          <div><b>${s.lastIp || "-"}</b> (${s.lastAccessReadable}) ${s.status || "-"}</div>
          <div> ${s.userAgent}</div>
        </div>
      `;
    });
    html += `</div>
  <button id="logout">Keluar</button>
  <button id="logoutOther">Hapus semua sesi</button>
    `;

    content.innerHTML = html;

    root.querySelector("#logout").onclick = async () => {
      await api({ api: "logout" });
      fast_login_state = "login";
      render();
    };

    root.querySelector("#logoutOther").onclick = async () => {
      await api({ api: "logoutOther" });
      view_dashboard();
    };

    root.querySelector("#logoutAll").onclick = async () => {
      await api({ api: "logoutAll" });
      fast_login_state = "login";
      render();
    };
  }

  function fast_login_notify_authenticated(number) {
    const normalized = String(number || "").replace(/[^0-9]/g, "");
    if (!normalized) return;

    if (fast_login_last_notified_number !== normalized) {
      fast_login_last_notified_number = normalized;
      window.dispatchEvent(new CustomEvent("fastlogin:authenticated", {
        detail: { number: normalized }
      }));
    }

    if (typeof fast_login_auth_callback === "function") {
      const callback = fast_login_auth_callback;
      fast_login_auth_callback = null;
      callback(normalized);
    }
  }

  window.FastLogin = {
    available: true,
    open(options = {}) {
      fast_login_auth_callback =
        typeof options.onAuthenticated === "function"
          ? options.onAuthenticated
          : null;
      modal.style.display = "flex";
      return render();
    },
    close() {
      modal.style.display = "none";
      fast_login_auth_callback = null;
    },
    async check() {
      const result = await api({ api: "checkLogin" });
      if (result && result.logged && result.number) {
        fast_login_notify_authenticated(result.number);
      }
      return result;
    }
  };

  window.dispatchEvent(new CustomEvent("fastlogin:ready"));

  // ===============================
  // MAIN RENDER
  // ===============================
  async function render() {
    try {
      const r = await api({ api: "checkLogin" });

      if (!r.logged) {
        if (fast_login_state !== "requested") {
          fast_login_state = "login";
        }
        view_login();
      } else {
        fast_login_state = "verified";
        fast_login_notify_authenticated(r.number);
        view_dashboard();
      }

    } catch {
      content.innerHTML = "API error";
    }
  }

  // ===============================
  // EVENTS
  // ===============================
  btn.onclick = () => {
    modal.style.display = "flex";
    render();
  };

  root.querySelector("#close").onclick = () => {
    modal.style.display = "none";
  };
  
// ===============================
// TAB REFOCUS AUTO CHECK (IMMEDIATE + DELAYED)
// ===============================
let fast_login_lastFocusCheck = 0;
let fast_login_focusTimer = null;

function fast_login_onFocus() {
  const now = Date.now();

  // prevent spam (1.5s cooldown)
  if (now - fast_login_lastFocusCheck < 1500) return;
  fast_login_lastFocusCheck = now;

  // only check if modal open
  if (modal.style.display !== "flex") return;

  // only useful when waiting verification
  if (fast_login_state !== "requested") return;

  // ✅ immediate check
  render();

  // ❌ clear previous delayed check (avoid stacking)
  if (fast_login_focusTimer) {
    clearTimeout(fast_login_focusTimer);
  }

  // ✅ delayed re-check (10 sec)
  fast_login_focusTimer = setTimeout(() => {
    // still in requested state & modal still open?
    if (
      fast_login_state === "requested" &&
      modal.style.display === "flex"
    ) {
      render();
    }
  }, 10000);
}

// tab visible again
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    fast_login_onFocus();
  }
});

// window focus (fallback)
window.addEventListener("focus", fast_login_onFocus);


})();

