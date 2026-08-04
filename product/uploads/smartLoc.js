(function () {
  const smartLocationMAX_FETCH = 10;
  const smartLocationMAX_HISTORY = 10;

  let smartLocationFetchCount = 0;
  let smartLocationIntervalId = null;

  // ===== UTIL =====
  function smartLocationGetHistory() {
    try {
      return JSON.parse(localStorage.getItem("smartLocationHistory")) || [];
    } catch {
      return [];
    }
  }

  function smartLocationSaveHistory(smartLocationArr) {
    localStorage.setItem("smartLocationHistory", JSON.stringify(smartLocationArr));
  }

  function smartLocationSaveBest(smartLocationLat, smartLocationLng) {
    localStorage.setItem("smartLocationBest", `${smartLocationLat},${smartLocationLng}`);
  }

  // ===== SMART CALCULATION (ACCURACY + RECENCY + CLUSTER) =====
  function smartLocationCalculateBest(smartLocationHistory) {
    if (!smartLocationHistory.length) return null;

    const smartLocationNow = Date.now();

    // --- center kasar (untuk cluster)
    let smartLocationCenterLat = 0;
    let smartLocationCenterLng = 0;

    smartLocationHistory.forEach(smartLocationItem => {
      smartLocationCenterLat += smartLocationItem.lat;
      smartLocationCenterLng += smartLocationItem.lng;
    });

    smartLocationCenterLat /= smartLocationHistory.length;
    smartLocationCenterLng /= smartLocationHistory.length;

    let smartLocationBestItem = null;
    let smartLocationBestScore = -Infinity;

    smartLocationHistory.forEach(smartLocationItem => {

      // 1. ACCURACY (lebih kecil lebih bagus)
      const smartLocationAccuracyScore =
        1 / (1 + smartLocationItem.accuracy);

      // 2. RECENCY (lebih baru lebih bagus)
      const smartLocationAge =
        (smartLocationNow - smartLocationItem.time) / 1000;

      const smartLocationRecencyScore =
        1 / (1 + smartLocationAge / 10);

      // 3. CLUSTER (dekat dengan mayoritas)
      const smartLocationDistance = Math.sqrt(
        Math.pow(smartLocationItem.lat - smartLocationCenterLat, 2) +
        Math.pow(smartLocationItem.lng - smartLocationCenterLng, 2)
      );

      const smartLocationClusterScore =
        1 / (1 + smartLocationDistance * 100000);

      // FINAL SCORE (bobot bisa di-tuning)
      const smartLocationScore =
        smartLocationAccuracyScore * 0.5 +
        smartLocationRecencyScore * 0.3 +
        smartLocationClusterScore * 0.2;

      if (smartLocationScore > smartLocationBestScore) {
        smartLocationBestScore = smartLocationScore;
        smartLocationBestItem = smartLocationItem;
      }
    });

    return {
      lat: smartLocationBestItem.lat,
      lng: smartLocationBestItem.lng
    };
  }

  // ===== STORE =====
  function smartLocationStore(smartLocationPosition) {
    const smartLocationLatitude = smartLocationPosition.coords.latitude;
    const smartLocationLongitude = smartLocationPosition.coords.longitude;
    const smartLocationAccuracy = smartLocationPosition.coords.accuracy;

    let smartLocationHistory = smartLocationGetHistory();

    smartLocationHistory.push({
      lat: smartLocationLatitude,
      lng: smartLocationLongitude,
      accuracy: smartLocationAccuracy,
      time: Date.now()
    });

    // max 20 data
    if (smartLocationHistory.length > smartLocationMAX_HISTORY) {
      smartLocationHistory = smartLocationHistory.slice(-smartLocationMAX_HISTORY);
    }

    smartLocationSaveHistory(smartLocationHistory);

    const smartLocationBest =
      smartLocationCalculateBest(smartLocationHistory);

    if (smartLocationBest) {
      smartLocationSaveBest(
        smartLocationBest.lat,
        smartLocationBest.lng
      );
    }

    console.log("smartLocation best:", smartLocationBest);
  }

  // ===== FETCH LOOP =====
  function smartLocationStartFetch() {
    if (!navigator.geolocation) return;
    if (smartLocationIntervalId) return;

    smartLocationIntervalId = setInterval(() => {

      if (smartLocationFetchCount >= smartLocationMAX_FETCH) {
        clearInterval(smartLocationIntervalId);
        smartLocationIntervalId = null;
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (smartLocationPos) => {
          smartLocationStore(smartLocationPos);
        },
        (smartLocationErr) => {
          console.warn("smartLocation error:", smartLocationErr.message);
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        }
      );

      smartLocationFetchCount++;

    }, 3000);
  }

  // ===== MODAL =====
  function smartLocationShowModal() {
    if (document.getElementById("smartLocationModal")) return;

    const smartLocationModal = document.createElement("div");
    smartLocationModal.id = "smartLocationModal";

    smartLocationModal.innerHTML = `
      <div style="
        position:fixed;
        inset:0;
        background:rgba(0,0,0,0.5);
        display:flex;
        align-items:center;
        justify-content:center;
        z-index:99999;
      ">
        <div style="
          background:#fff;
          padding:20px;
          border-radius:12px;
          width:90%;
          max-width:320px;
          text-align:center;
        ">
          <h2>Aktifkan Lokasi</h2>
          <p style="font-size:24px;" >
            Kami butuh izin lokasi untuk hasil terbaik
          </p>

          <button id="smartLocationBtnAllow" class="btnPrimaryBg" 
            style="font-size:18px;margin-top:10px;padding:10px 16px;border:4px green;">
            Izinkan
          </button>

          <button id="smartLocationBtnClose"
            style="font-size:18px;margin-top:10px;padding:10px 16px;background:#eee;">
            Nanti
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(smartLocationModal);

    document.getElementById("smartLocationBtnAllow").onclick = () => {
      smartLocationModal.remove();
      smartLocationStartFetch();
    };

    document.getElementById("smartLocationBtnClose").onclick = () => {
      smartLocationModal.remove();
    };
  }

  // ===== PERMISSION =====
  function smartLocationCheckPermissionAndStart() {
    if (!navigator.permissions) {
      smartLocationShowModal();
      return;
    }

    navigator.permissions.query({ name: "geolocation" })
      .then((smartLocationResult) => {

        // auto detect perubahan permission
        smartLocationResult.onchange = () => {
          if (smartLocationResult.state === "granted") {
            const smartLocationModal =
              document.getElementById("smartLocationModal");

            if (smartLocationModal) smartLocationModal.remove();

            smartLocationStartFetch();
          }
        };

        if (smartLocationResult.state === "granted") {
          smartLocationStartFetch();
        } else {
          smartLocationShowModal();
        }
      });
  }

  // ===== INIT =====
  window.addEventListener("load", () => {
    setTimeout(() => {
      smartLocationCheckPermissionAndStart();
    }, 1500);
  });

})();