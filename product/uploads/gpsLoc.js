 
(function () {
    if (document.getElementById("locationPicker_style_pulse_css")) return;

    const locationPicker_style_pulse_element = document.createElement("style");
    locationPicker_style_pulse_element.id = "locationPicker_style_pulse_css";

    locationPicker_style_pulse_element.textContent = `
        .locationPicker_style-pulse {
            animation: locationPicker_style_pulse_anim 2s infinite;
        }

        @keyframes locationPicker_style_pulse_anim {
    0%   { box-shadow: 0 0 0 0 rgba(120,120,120, 0.6); }
    70%  { box-shadow: 0 0 0 12px rgba(120,120,120, 0); }
    100% { box-shadow: 0 0 0 0 rgba(120,120,120, 0); }
}
    `;

    document.head.appendChild(locationPicker_style_pulse_element);
})();
(function () {
    'use strict';

    /* ================= GLOBAL ================= */

    let locationPicker_map = null;
    let locationPicker_marker = null;
    let locationPicker_targetInput = null;
    let locationPicker_modal = null;
    let locationPicker_leafletReady = false;
    let locationPicker_loadingLeaflet = false;
    let locationPicker_searchTimer = null;
    let locationPicker_manualTimeout = null;
    let locationPicker_hintMarkers = [];
    let locationPicker_hintData = [];
    let locationPicker_hintIndex = 0;
    let locationPicker_routeLine = null;
    /* ================= MAIN ================= */
    let locationPicker_toastTimeout = null;
    let locationPicker_toastEl = null;

    // GLOBAL VARIABLE
let locationPicker_cacheMarker = null;



// STORE DATA TO GLOBAL CACHE
window.locationPicker_setMarker = function(locationToCache){
    locationPicker_cacheMarker = locationToCache;
}


// EXECUTE / READ CACHE
window.locationPicker_execMarker = function(){

    if(!locationPicker_cacheMarker){
       // alert("locationPicker_cacheMarker is null");
        return;
    }

    if(!locationPicker_map){
        console.log("Map not ready yet");
        return;
    }

    locationPicker_addHintMarkers(locationPicker_cacheMarker);
}

window.locationPicker_updateLivePosition = function(lat, lng, shouldCenter = true){

    lat = parseFloat(lat);
    lng = parseFloat(lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return false;
    }

    if (!locationPicker_map || !locationPicker_marker) {
        return false;
    }

    if (shouldCenter) {
        locationPicker_map.setView([lat, lng], 17);
    }

    locationPicker_marker.setLatLng([lat, lng]);
    locationPicker_updateInput(lat, lng);

    if (locationPicker_targetInput) {
        locationPicker_targetInput.value = lat.toFixed(6) + "," + lng.toFixed(6);
        locationPicker_targetInput.dispatchEvent(new Event("change"));
    }

    return true;
}

    /* ===============================
       CENTER TOAST HELPER
    ================================ */
    function locationPicker_toast(message, type = "success") {

        if (!locationPicker_toastEl) {

            locationPicker_toastEl = document.createElement("div");
            locationPicker_toastEl.style.position = "fixed";
            locationPicker_toastEl.style.top = "50%";
            locationPicker_toastEl.style.left = "50%";
            locationPicker_toastEl.style.transform = "translate(-50%, -50%) scale(0.9)";
            locationPicker_toastEl.style.padding = "14px 20px";
            locationPicker_toastEl.style.borderRadius = "12px";
            locationPicker_toastEl.style.fontSize = "15px";
            locationPicker_toastEl.style.fontWeight = "bold";
            locationPicker_toastEl.style.color = "#fff";
            locationPicker_toastEl.style.zIndex = "9999999";
            locationPicker_toastEl.style.opacity = "0";
            locationPicker_toastEl.style.transition = "all 0.25s ease";
            locationPicker_toastEl.style.boxShadow = "0 10px 30px rgba(0,0,0,0.3)";
            locationPicker_toastEl.style.textAlign = "center";
            locationPicker_toastEl.style.minWidth = "200px";
            locationPicker_toastEl.style.maxWidth = "80%";

            document.body.appendChild(locationPicker_toastEl);
        }

        // Color by type
        if (type === "error") {
            locationPicker_toastEl.style.background = "#e53935";
        } else if (type === "info") {
            locationPicker_toastEl.style.background = "#1e88e5";
        } else {
            locationPicker_toastEl.style.background = "#43a047";
        }

        locationPicker_toastEl.textContent = message;

        // Animate in
        locationPicker_toastEl.style.opacity = "1";
        locationPicker_toastEl.style.transform = "translate(-50%, -50%) scale(1)";

        clearTimeout(locationPicker_toastTimeout);

        locationPicker_toastTimeout = setTimeout(() => {

            locationPicker_toastEl.style.opacity = "0";
            locationPicker_toastEl.style.transform = "translate(-50%, -50%) scale(0.9)";

        }, 2000);
    }
    window.locationPicker = function (targetInputId, defLocationLatLang = null) {

        const input = document.getElementById(targetInputId);
        if (!input) return alert("Input not found: " + targetInputId);

        input.readOnly = true;

        input.onclick = function () {
            locationPicker_targetInput = input;
            locationPicker_openModal(defLocationLatLang);
        };
        
    };
    /* ===============================
       ADD MULTI HINT MARKERS (BLUE)
    ================================ */
    /* ===============================
       ADD MULTI HINT MARKERS SAFE
    ================================ */

    function locationPicker_createHintNavigator() {

    if (document.getElementById("locationPicker_hintNav")) return;

    const nav = document.createElement("div");
    nav.id = "locationPicker_hintNav";

    nav.style.setProperty("position", "absolute", "important");
    nav.style.setProperty("bottom", "10px", "important");
    nav.style.setProperty("left", "10px", "important");
    nav.style.setProperty("z-index", "99999", "important");
    nav.style.setProperty("max-width", "calc(100% - 20px)", "important");
    nav.style.setProperty("font-family", "Arial, sans-serif", "important");

    nav.innerHTML = `
<button id="locationPicker_hintToggle"
    style="
        display:inline-block !important;
        width:auto !important;
        min-width:42px !important;
        padding:8px 12px !important;
        background:#1e88e5 !important;
        color:#ffffff !important;
        border:none !important;
        border-radius:12px !important;
        cursor:pointer !important;
        font-size:14px !important;
        font-weight:bold !important;
        box-shadow:0 6px 20px rgba(0,0,0,0.25) !important;
    ">
    ^
</button>

        <!-- Collapsible content (hidden by default) -->
        <div id="locationPicker_hintContent"
            style="
                display:none !important;
                margin-top:6px !important;
                background:#ffffff !important;
                padding:8px !important;
                border-radius:12px !important;
                box-shadow:0 6px 20px rgba(0,0,0,0.25) !important;
                display:none;
                flex-wrap:wrap !important;
                gap:6px !important;
                align-items:center !important;
                max-width:100% !important;
            ">

            <select id="hintSelect"
                style="
                    padding:6px !important;
                    border:1px solid #ccc !important;
                    border-radius:6px !important;
                    max-width:100% !important;
                ">
            </select>

            <select id="hintSort"
                style="
                    padding:6px !important;
                    border:1px solid #ccc !important;
                    border-radius:6px !important;
                ">
                <option value="route">Route</option>
                <option value="distance">Nearest</option>
                <option value="name">Name</option>
            </select>

            <button id="hintPrev"
                style="
                    padding:6px 10px !important;
                    border:none !important;
                    border-radius:6px !important;
                    background:#e5e7eb !important;
                    cursor:pointer !important;
                ">
                ◀
            </button>

            <button id="hintNext"
                style="
                    padding:6px 10px !important;
                    border:none !important;
                    border-radius:6px !important;
                    background:#e5e7eb !important;
                    cursor:pointer !important;
                ">
                ▶
            </button>

            <button id="hintTrack"
                style="
                    padding:6px 10px !important;
                    background:#1e88e5 !important;
                    color:#ffffff !important;
                    border:none !important;
                    border-radius:6px !important;
                    cursor:pointer !important;
                    font-size:12px !important;
                ">
                Track
            </button>

            <button id="hintMapBatch"
                style="
                    padding:6px 10px !important;
                    background:#0f766e !important;
                    color:#ffffff !important;
                    border:none !important;
                    border-radius:6px !important;
                    cursor:pointer !important;
                    font-size:12px !important;
                    font-weight:bold !important;
                ">
                Map Batch
            </button>

            <button id="hintFocus"
                style="
                    padding:6px 10px !important;
                    background:#22c55e !important;
                    color:#000000 !important;
                    border:none !important;
                    border-radius:6px !important;
                    cursor:pointer !important;
                    font-size:12px !important;
                    font-weight:bold !important;
                ">
                Focus
            </button>

            <button id="hintGmaps"
                style="
                    padding:6px 10px !important;
                    background:#ea4335 !important;
                    color:#ffffff !important;
                    border:none !important;
                    border-radius:6px !important;
                    cursor:pointer !important;
                    font-size:12px !important;
                    font-weight:bold !important;
                ">
                GMaps
            </button>

            <button id="hintGRoute"
                style="
                    padding:6px 10px !important;
                    background:#2563eb !important;
                    color:#ffffff !important;
                    border:none !important;
                    border-radius:6px !important;
                    cursor:pointer !important;
                    font-size:12px !important;
                    font-weight:bold !important;
                ">
                GRoute
            </button>
<button id="hintPrintBatch"
    style="
        padding:6px 10px !important;
        background:#7c3aed !important;
        color:#ffffff !important;
        border:none !important;
        border-radius:6px !important;
        cursor:pointer !important;
        font-size:12px !important;
        font-weight:bold !important;
    ">
    🖨 
</button>
        </div>
    `;

    // Prevent clicks from reaching the map below
    nav.addEventListener("mousedown", e => e.stopPropagation());
    nav.addEventListener("click", e => e.stopPropagation());
    nav.addEventListener("touchstart", e => e.stopPropagation());
    nav.addEventListener("wheel", e => e.stopPropagation());
    

    document.getElementById("locationPicker_map").appendChild(nav);

    // Toggle collapse/expand
    const toggleBtn = document.getElementById("locationPicker_hintToggle");
    const content = document.getElementById("locationPicker_hintContent");

    toggleBtn.onclick = function () {
        const isHidden =
            content.style.display === "none" ||
            getComputedStyle(content).display === "none";

        if (isHidden) {
            content.style.setProperty("display", "block", "important");
            toggleBtn.textContent = "v";
        } else {
            content.style.setProperty("display", "none", "important");
            toggleBtn.textContent = "^";
        }
    };

    // Existing button actions
    document.getElementById("hintPrev").onclick = () => locationPicker_hintMove(-1);
    document.getElementById("hintNext").onclick = () => locationPicker_hintMove(1);
    document.getElementById("hintTrack").onclick = locationPicker_trackCurrent;
    document.getElementById("hintMapBatch").onclick = locationPicker_mapBatch;
    document.getElementById("hintGmaps").onclick = locationPicker_openGmaps;
    document.getElementById("hintGRoute").onclick = locationPicker_openGoogleRoute;
    document.getElementById("hintFocus").onclick = locationPicker_focusCurrent;

    document.getElementById("hintSort").onclick = (e) =>
        locationPicker_sortHints(e.target.value);

    document.getElementById("hintSort").onchange = (e) =>
        locationPicker_sortHints(e.target.value);
/*
    // Optional: enable direct selection
    document.getElementById("hintSelect").onchange = (e) =>
        locationPicker_selectHint(parseInt(e.target.value));
*/
    locationPicker_updateHintDropdown();
    document.getElementById("hintPrintBatch").onclick = locationPicker_printBatch;
    
}
    function locationPicker_addHintMarkers(list) {

        locationPicker_hintData = list;

        locationPicker_renderHintMarkers();
    }
    function locationPicker_renderHintMarkers() {

        if (!locationPicker_map || !locationPicker_hintData.length) return;

        locationPicker_hintMarkers.forEach(m => {
            locationPicker_map.removeLayer(m);
        });

        locationPicker_hintMarkers = [];

        locationPicker_hintData.forEach((item, index) => {

            const isActive = index === locationPicker_hintIndex;

            const marker = L.circleMarker(
                [item.lat, item.lng],
                {
                    radius: isActive ? 16 : 14,
                    color: isActive ? "#ff9800" : "#1976d2",
                    fillColor: isActive ? "#ffb74d" : "#2196f3",
                    fillOpacity: 0.9,
                    weight: 2
                }
            ).addTo(locationPicker_map);

            marker.bindPopup(`
<div style="min-width:140px">
    <div><b>${item.name || "No Name"}</b></div>

    <button 
        onclick="locationPicker_track('${item.name}')"
        style="
            margin-top:6px;
            padding:4px 8px;
            background:#1e88e5;
            color:white;
            border:none;
            border-radius:6px;
            cursor:pointer;
            font-size:12px;
        ">
        Track
    </button>

    <button 
        onclick="locationPicker_deleteHint(${index})"
        style="
            margin-top:6px;
            padding:4px 8px;
            background:#e53935;
            color:white;
            border:none;
            border-radius:6px;
            cursor:pointer;
            font-size:12px;
        ">
        Delete
    </button>
</div>
`);
            locationPicker_hintMarkers.push(marker);
        });

        locationPicker_createHintNavigator();
        locationPicker_updateHintDropdown();
        locationPicker_drawRouteLine();
        locationPicker_createShareCorner();
    }

    function locationPicker_createShareCorner() {

        if (document.getElementById("locationPicker_shareCorner")) return;

        const share = document.createElement("div");
        share.id = "locationPicker_shareCorner";

        share.style.cssText = `
        position:absolute;
        bottom:6px;
        right:6px;
        background:rgba(0,0,0,0);
        padding:4px 4px;
        border-radius:14px;
        box-shadow:0 6px 20px rgba(0,0,0,0.25);
        z-index:9999;
        cursor:pointer;
        font-size:10px;
        font-weight:600;
        user-select:none;
    `;

        share.innerHTML = "🔗";

        // Prevent map interaction under button
        share.addEventListener("mousedown", e => e.stopPropagation());
        share.addEventListener("click", e => e.stopPropagation());
        share.addEventListener("touchstart", e => e.stopPropagation());
        share.addEventListener("wheel", e => e.stopPropagation());

        share.onclick = (e) => {

            e.stopPropagation();

            if (!window.locationPicker_map) {
                alert("Map not ready");
                return;
            }

            let center = locationPicker_map.getCenter();

            let lat = typeof center.lat === "function" ? center.lat() : center.lat;
            let lng = typeof center.lng === "function" ? center.lng() : center.lng;

            if (!lat || !lng) {
                alert("Invalid coordinates");
                return;
            }

            const url = `https://www.google.com/maps?q=${lat},${lng}`;

            if (navigator.share && window.isSecureContext) {
                navigator.share({
                    title: "Shared Location",
                    text: "Here is the location",
                    url: url
                }).catch(err => {
                    console.log("Share cancelled", err);
                });
            } else {
                window.open(url, "_blank");
            }
        };

        document.getElementById("locationPicker_map").appendChild(share);
    }
    function locationPicker_deleteHint(index) {

        if (!locationPicker_hintData[index]) return;

        // Hapus dari data
        locationPicker_hintData.splice(index, 1);

        // Reset index aman
        if (locationPicker_hintIndex >= locationPicker_hintData.length) {
            locationPicker_hintIndex = 0;
        }

        // Recalculate route dari posisi sekarang
        locationPicker_renderHintMarkers();
        locationPicker_recalculateFromCurrentStart();
    }
    function locationPicker_selectHint(index) {

        if (!locationPicker_hintData[index]) return;

        locationPicker_hintIndex = index;

        const item = locationPicker_hintData[index];

        locationPicker_map.setView([item.lat, item.lng], 17);

        locationPicker_renderHintMarkers();
    }
    function locationPicker_hintMove(step) {

        if (!locationPicker_hintData.length) return;

        locationPicker_hintIndex += step;

        if (locationPicker_hintIndex < 0)
            locationPicker_hintIndex = locationPicker_hintData.length - 1;

        if (locationPicker_hintIndex >= locationPicker_hintData.length)
            locationPicker_hintIndex = 0;

        const item = locationPicker_hintData[locationPicker_hintIndex];

        locationPicker_map.setView([item.lat, item.lng], 17);

        locationPicker_renderHintMarkers();
    }
    function locationPicker_drawRouteLine() {

        if (!locationPicker_map || !locationPicker_hintData.length)
            return;

        // Hapus route lama
        if (locationPicker_routeLine) {
            locationPicker_map.removeLayer(locationPicker_routeLine);
            locationPicker_routeLine = null;
        }

        const main = locationPicker_marker.getLatLng();

        const points = [
            [main.lat, main.lng]
        ];

        locationPicker_hintData.forEach(item => {
            points.push([item.lat, item.lng]);
        });

        locationPicker_routeLine = L.polyline(points, {
            color: "#ff5722",
            weight: 4,
            opacity: 0.8
        }).addTo(locationPicker_map);
    }
    function locationPicker_updateHintDropdown() {

        const select = document.getElementById("hintSelect");
        if (!select) return;

        select.innerHTML = "";

        const main = locationPicker_marker.getLatLng();

        locationPicker_hintData.forEach((item, index) => {

            const distance = locationPicker_getDistance(
                main.lat, main.lng,
                item.lat, item.lng
            );

            const option = document.createElement("option");
            option.value = index;
            option.textContent =
                (item.name || "No Name") +
                " (" + Math.round(distance) + " m)";

            if (index === locationPicker_hintIndex)
                option.selected = true;

            select.appendChild(option);
        });
    }
    function locationPicker_getDistance(lat1, lng1, lat2, lng2) {

        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;

        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) *
            Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);

        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    function locationPicker_sortHints(mode) {

        if (!locationPicker_hintData.length) return;

        const main = locationPicker_marker.getLatLng();

        if (mode === "name") {

            locationPicker_hintData.sort((a, b) =>
                (a.name || "").localeCompare(b.name || "")
            );

        } else if (mode === "distance") {

            locationPicker_hintData.sort((a, b) => {

                const d1 = locationPicker_getDistance(main.lat, main.lng, a.lat, a.lng);
                const d2 = locationPicker_getDistance(main.lat, main.lng, b.lat, b.lng);

                return d1 - d2;
            });

        } else if (mode === "route") {

            // Greedy nearest route algorithm
            const remaining = [...locationPicker_hintData];
            const sorted = [];
            let current = { lat: main.lat, lng: main.lng };

            while (remaining.length) {

                remaining.sort((a, b) =>
                    locationPicker_getDistance(current.lat, current.lng, a.lat, a.lng) -
                    locationPicker_getDistance(current.lat, current.lng, b.lat, b.lng)
                );

                const next = remaining.shift();
                sorted.push(next);
                current = next;
            }

            locationPicker_hintData = sorted;
        }

        locationPicker_hintIndex = 0;
        locationPicker_renderHintMarkers();

    }

    /* ================= LOAD LEAFLET SAFE ================= */

    function locationPicker_loadLeaflet(callback) {

        if (locationPicker_leafletReady) return callback();

        if (locationPicker_loadingLeaflet) {
            const wait = setInterval(() => {
                if (locationPicker_leafletReady) {
                    clearInterval(wait);
                    callback();
                }
            }, 100);
            return;
        }

        locationPicker_loadingLeaflet = true;

        const css = document.createElement("link");
        css.rel = "stylesheet";
        css.href = "assets/leaflet.css";
        document.head.appendChild(css);

        const script = document.createElement("script");
        script.src = "assets/leaflet.js";

        script.onload = function () {
            locationPicker_leafletReady = true;
            callback();
        };

        document.head.appendChild(script);
    }

    /* ================= OPEN MODAL ================= */

    function locationPicker_openModal(defLocationLatLang) {

        if (!locationPicker_modal) locationPicker_createModal();

        locationPicker_modal.style.display = "flex";

        locationPicker_loadLeaflet(() => {
            setTimeout(() => {
                locationPicker_initMap(defLocationLatLang);
            }, 300);
        });
    }

    /* ================= CREATE MODAL ================= */

    function locationPicker_createModal() {

        locationPicker_modal = document.createElement("div");
        locationPicker_modal.style.cssText =
            "position:fixed;inset:0;background:rgba(0,0,0,0.6);display:none;justify-content:center;align-items:center;z-index:999999;";

        locationPicker_modal.innerHTML = `
<div id="locationPicker_box" style="
    width:92vw;
    max-width:600px;
    aspect-ratio:1 / 1;
    background:#fff;
    border-radius:14px;
    display:flex;
    flex-direction:column;
    overflow:hidden;
">

        <div style="padding:10px;background:#f5f5f5;display:flex;flex-direction:column;gap:8px;">

            <div style="display:flex;justify-content:space-between;align-items:center;">
                <b>Pilih Lokasi</b>
                <div>
                  <button id="locationPicker_save" class="locationPicker_style-pulse btnPrimaryBg"  style="
    padding:8px 14px;
    font-size:14px;
    
    color:#fff;
    border:none;
    border-radius:8px;
    cursor:pointer;
    font-weight:bold;
">
    ✔ Simpan Lokasi
</button>
                    <button id="locationPicker_close">✕</button>
                </div>
            </div>

            <button id="locationPicker_gps" class="locationPicker_style-pulse btnPrimaryBg" 
                style="width:100%;padding:12px;font-size:16px;color:#fff;border:none;border-radius:8px;">
                📍Gunakan lokasi GPS secara otomatis
            </button>

            <div style="position:relative;display:flex;gap:5px;">
                <input id="locationPicker_searchInput" placeholder="Cari nama lokasi..." style="flex:1;">
                <button id="locationPicker_searchBtn">Cari</button>
                <div id="locationPicker_suggestBox"
                    style="position:absolute;top:35px;left:0;right:80px;background:#fff;border:1px solid #ddd;max-height:200px;overflow:auto;display:none;"></div>
            </div>

            <input id="locationPicker_manualLatLng" placeholder="lat,lng">

        </div>

        <div id="locationPicker_map" style="flex:1;"></div>
    </div>
    `;

        document.body.appendChild(locationPicker_modal);

        document.getElementById("locationPicker_close").onclick =
            () => locationPicker_modal.style.display = "none";

        document.getElementById("locationPicker_save").onclick =
            () => locationPicker_save();

        document.getElementById("locationPicker_gps").onclick =
            () => locationPicker_useGPS();

        document.getElementById("locationPicker_searchBtn").onclick =
            () => locationPicker_searchManual();

        setTimeout(() => {

            const box = document.getElementById("locationPicker_box");

            if (!CSS.supports("aspect-ratio: 1 / 1")) {

                const size = Math.min(window.innerWidth * 0.92, 600);
                box.style.width = size + "px";
                box.style.height = size + "px";
            }

        }, 50);

        // Close when click outside box
        locationPicker_modal.addEventListener("click", function (e) {
            if (e.target === locationPicker_modal) {
                locationPicker_modal.style.display = "none";
                locationPicker_tryAuto();
            }
        });
        locationPicker_initManualAutoUpdate();
        locationPicker_initAutocomplete();




    }
    //try auto
    function locationPicker_tryAuto() {
        // Auto GPS if no existing value and no default
        if (
            (!locationPicker_targetInput?.value ||
                !locationPicker_targetInput.value.includes(","))

        ) {

            setTimeout(() => {
                locationPicker_save()
            }, 4000);
        }
    }
    //try auto
    /* ================= INIT MAP ================= */

    function locationPicker_initMap(defLocationLatLang) {

        // 1️⃣ Ambil dari input target dulu
        let coords = null;

        if (locationPicker_targetInput &&
            locationPicker_targetInput.value &&
            locationPicker_targetInput.value.includes(",")) {

            const parts = locationPicker_targetInput.value.split(",");
            const lat = parseFloat(parts[0]);
            const lng = parseFloat(parts[1]);

            if (!isNaN(lat) && !isNaN(lng)) {
                coords = [lat, lng];
            }
        }

        // 2️⃣ Jika tidak ada, pakai default
        if (!coords) {
            coords = locationPicker_parseLatLng(null, defLocationLatLang);
        }

        // 3️⃣ Destroy map lama
        if (locationPicker_map) {
            locationPicker_map.remove();
            locationPicker_map = null;
        }

        // 4️⃣ Create map
        locationPicker_map = L.map("locationPicker_map").setView(coords, 15);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png")
            .addTo(locationPicker_map);

        locationPicker_marker = L.circleMarker(coords, {
            radius: 8,
            color: "#ffffff",
            weight: 2,
            fillColor: "#ff0000",
            fillOpacity: 1
        }).addTo(locationPicker_map);
        locationPicker_map.attributionControl.setPrefix(false);

        // 5️⃣ Update manual input
        locationPicker_updateInput(coords[0], coords[1]);

        // 6️⃣ Drag update
        locationPicker_marker.on("drag", function (e) {
            const p = e.target.getLatLng();
            locationPicker_updateInput(p.lat, p.lng);
        });

        // 7️⃣ Click update
        locationPicker_map.on("click", function (e) {
            locationPicker_marker.setLatLng(e.latlng);
            locationPicker_updateInput(e.latlng.lat, e.latlng.lng);
        });

        setTimeout(() => locationPicker_map.invalidateSize(), 400);

        // Auto GPS if no existing value and no default
        if (
            (!locationPicker_targetInput?.value ||
                !locationPicker_targetInput.value.includes(","))

        ) {
            setTimeout(() => {
                locationPicker_useGPS();
            }, 500);
            locationPicker_toast("Pilih lokasi! Mencoba otomatis...");
            locationPicker_execMarker();

        }
        setGpsLocTextFromApi();

    }



    /* ===============================
       AUTO UPDATE FROM MANUAL INPUT
    ================================ */
    function locationPicker_initManualAutoUpdate() {

        const input = document.getElementById("locationPicker_manualLatLng");
        if (!input) return;

        input.addEventListener("input", function () {

            clearTimeout(locationPicker_manualTimeout);

            locationPicker_manualTimeout = setTimeout(() => {

                const val = input.value.trim();
                if (!val.includes(",")) return;

                const parts = val.split(",");
                if (parts.length !== 2) return;

                const lat = parseFloat(parts[0]);
                const lng = parseFloat(parts[1]);

                if (isNaN(lat) || isNaN(lng)) return;

                if (!locationPicker_map || !locationPicker_marker) return;

                locationPicker_marker.setLatLng([lat, lng]);
                locationPicker_map.setView([lat, lng], 17);

            }, 600); // ⏳ delay 600ms
        });
    }
    /* ================= UPDATE LATLNG ================= */

    function locationPicker_updateInput(lat, lng) {

        const input = document.getElementById("locationPicker_manualLatLng");
        input.value = lat.toFixed(6) + "," + lng.toFixed(6);
        locationPicker_renderHintMarkers();
        locationPicker_sortHints("route");
    }

    /* ================= GPS ================= */

    function locationPicker_useGPS() {

        if (!navigator.geolocation) return alert("GPS not supported");

        navigator.geolocation.getCurrentPosition(pos => {

            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;

            locationPicker_map.setView([lat, lng], 17);
            locationPicker_marker.setLatLng([lat, lng]);

            locationPicker_toast("Lokasi GPS ditemukan " + lat + "," + lng + " ✔");

            locationPicker_updateInput(lat, lng);

        }, () => locationPicker_toast("Ijinkan lokasi GPS!"));
    }

    /* ================= SEARCH ================= */

    function locationPicker_searchManual() {

        const query = document.getElementById("locationPicker_searchInput").value;
        if (!query) return;

        fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`, {
            headers: { "Accept-Language": "en" }
        })
            .then(r => r.json())
            .then(data => {

                if (!data.length) return alert("Not found");

                const lat = parseFloat(data[0].lat);
                const lng = parseFloat(data[0].lon);

                locationPicker_map.setView([lat, lng], 17);
                locationPicker_marker.setLatLng([lat, lng]);

                locationPicker_updateInput(lat, lng);
            });
    }

    /* ================= AUTOCOMPLETE ================= */

    function locationPicker_initAutocomplete() {

        const input = document.getElementById("locationPicker_searchInput");
        const box = document.getElementById("locationPicker_suggestBox");

        input.oninput = function () {

            const query = this.value.trim();
            if (query.length < 3) return box.style.display = "none";

            clearTimeout(locationPicker_searchTimer);

            locationPicker_searchTimer = setTimeout(() => {

                fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`)
                    .then(r => r.json())
                    .then(data => {

                        box.innerHTML = "";
                        if (!data.length) return box.style.display = "none";

                        data.forEach(place => {

                            const div = document.createElement("div");
                            div.textContent = place.display_name;
                            div.style.padding = "6px";
                            div.style.cursor = "pointer";

                            div.onclick = function () {

                                const lat = parseFloat(place.lat);
                                const lng = parseFloat(place.lon);

                                locationPicker_map.setView([lat, lng], 17);
                                locationPicker_marker.setLatLng([lat, lng]);
                                locationPicker_updateInput(lat, lng);

                                input.value = place.display_name;
                                box.style.display = "none";
                            };

                            box.appendChild(div);
                        });

                        box.style.display = "block";
                    });

            }, 500);
        };

        document.addEventListener("click", e => {
            if (!box.contains(e.target) && e.target !== input)
                box.style.display = "none";
        });
    }

    /* ================= PARSE ================= */

    function locationPicker_parseLatLng(inputValue, defLocationLatLang) {

        if (inputValue && inputValue.includes(",")) {
            const p = inputValue.split(",");
            return [parseFloat(p[0]), parseFloat(p[1])];
        }

        if (typeof defLocationLatLang === "string" && defLocationLatLang.includes(",")) {
            const p = defLocationLatLang.split(",");
            return [parseFloat(p[0]), parseFloat(p[1])];
        }

        return [-6.200000, 106.816666];
    }

    /* ================= SAVE ================= */

    function locationPicker_save() {
    	

        const val = document.getElementById("locationPicker_manualLatLng").value;
        locationPicker_toast("Lokasi disimpan " + val+ " ✔");

        locationPicker_targetInput.value = val;
        locationPicker_targetInput.dispatchEvent(new Event("change"));

        locationPicker_modal.style.display = "none";
        setGpsLocTextFromApi();
    }
    
    window.setGpsLocTextFromApi =  function() {
    const latlng = locationPicker_targetInput?.value;
    const gpsLocText = document.getElementById("gpsLocText");

    if (!latlng || !gpsLocText) return;

    const [lat, lng] = latlng.split(",");

    // Fetch alamat dari koordinat
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
        .then(res => res.json())
        .then(data => {
            const address = data.display_name || `${lat}, ${lng}`;
            gpsLocText.innerText = address;
        })
        .catch(err => {
            console.error("Gagal ambil alamat:", err);
            gpsLocText.innerText = latlng; // fallback
        });
}

function locationPicker_openGmaps(){

    const select = document.getElementById("hintSelect");
    if(!select) return;

    const index = parseInt(select.value);

    if(!locationPicker_hintData[index]) return;

    const item = locationPicker_hintData[index];

    const lat = item.lat;
    const lng = item.lng;

    const url = `https://www.google.com/maps?q=${lat},${lng}`;

    if (navigator.share && window.isSecureContext) {

        navigator.share({
            title: "Location",
            text: "Open in Google Maps",
            url: url
        }).catch(err => {
            console.log("Share cancelled", err);
        });

    } else {

        window.open(url, "_blank");

    }
}

function locationPicker_openGoogleRoute(){

    if (!locationPicker_map || !locationPicker_marker) {
        alert("Map not ready.");
        return;
    }

    if (!locationPicker_hintData || !locationPicker_hintData.length) {
        alert("No route points found.");
        return;
    }

    const main = locationPicker_marker.getLatLng();

    const points = locationPicker_hintData
        .map(item => ({
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lng)
        }))
        .filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng));

    if (!points.length) {
        alert("No valid route points found.");
        return;
    }

    const origin = main.lat + "," + main.lng;
    const destinationPoint = points[points.length - 1];
    const destination = destinationPoint.lat + "," + destinationPoint.lng;

    // Google Maps URL has practical length/waypoint limits.
    // Keep the route usable by sending the first route points as waypoints.
    const maxWaypoints = 23;
    const waypointPoints = points.slice(0, -1).slice(0, maxWaypoints);
    const waypoints = waypointPoints
        .map(item => item.lat + "," + item.lng)
        .join("|");

    let url =
        "https://www.google.com/maps/dir/?api=1" +
        "&origin=" + encodeURIComponent(origin) +
        "&destination=" + encodeURIComponent(destination) +
        "&travelmode=driving";

    if (waypoints) {
        url += "&waypoints=" + encodeURIComponent(waypoints);
    }

    const routeWin = window.open(url, "_blank");

    if (!routeWin) {
        alert("Popup blocked.");
        return;
    }

    if (typeof locationPicker_toast === "function") {
        let msg = "Open Google route: " + points.length + " point(s)";
        if (points.length - 1 > maxWaypoints) {
            msg += " (limited waypoints)";
        }
        locationPicker_toast(msg, "info");
    }
}

function locationPicker_extractCodesFromHintDropdown(){

    const select = document.getElementById("hintSelect");
    if (!select) return [];

    const codes = [];
    const seen = {};

    Array.from(select.options).forEach(option => {

        const text = (option.textContent || "").trim();
        if (!text) return;

        let code = text;

        // Remove distance suffix: " (... m)"
        code = code.replace(/\s*\([^)]*\)\s*$/, "");

        // Take last part after underscore:
        // Customer_Area_P26050615391311H2TQ => P26050615391311H2TQ
        const parts = code.split("_");
        code = parts[parts.length - 1].trim();

        // Accept standard order code format
        if (!/^P[A-Z0-9]{10,}$/.test(code)) {
            return;
        }

        if (!seen[code]) {
            seen[code] = true;
            codes.push(code);
        }
    });

    return codes;
}

function locationPicker_openMapBatch(codes){

    if (!codes || !codes.length) {
        alert("No valid codes found.");
        return;
    }

    const reviewWin = window.open("", "_blank");
    if (!reviewWin) {
        alert("Popup blocked.");
        return;
    }

    const textareaValue = codes.join("\n")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    reviewWin.document.write(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Review Map Batch</title>
<style>
body{
    font-family:Arial,sans-serif;
    padding:15px;
    background:#f8fafc;
}
textarea{
    width:100%;
    height:60vh;
    box-sizing:border-box;
    font-family:monospace;
    font-size:14px;
    padding:10px;
    border:1px solid #ccc;
    border-radius:8px;
    background:#ffffff;
}
button{
    margin-top:10px;
    padding:12px 18px;
    border:none;
    border-radius:8px;
    font-size:16px;
    font-weight:bold;
    cursor:pointer;
    background:#0f766e;
    color:#fff;
}
.info{
    margin-top:8px;
    color:#555;
    font-size:13px;
    line-height:1.5;
}
</style>
</head>
<body>

<h2>🗺 Review Map Batch</h2>

<textarea id="codeArea">${textareaValue}</textarea>

<div class="info">
Edit before proceed. One code per line, comma, or space. Empty values are ignored.
</div>

<button id="mapBatchBtn">Proceed Map Batch</button>

<script>
function collectCodes(raw){
    const codes = [];
    const seen = {};

    raw.split(/[\\r\\n,\\s]+/).forEach(item => {
        const code = item.trim();
        if (!code) return;

        if (!seen[code]) {
            seen[code] = true;
            codes.push(code);
        }
    });

    return codes;
}

function openMapBatch(codes){
    if (!codes.length) {
        alert('No valid codes.');
        return;
    }

    const csv = codes.join(',');

    if (csv.length <= 1200) {
        window.location.href = 'map_batch.php?code=' + encodeURIComponent(csv);
        return;
    }

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'map_batch.php';

    const input = document.createElement('textarea');
    input.name = 'code';
    input.value = csv;

    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
}

document.getElementById('mapBatchBtn').onclick = function () {
    const raw = document.getElementById('codeArea').value;
    openMapBatch(collectCodes(raw));
};
</script>

</body>
</html>
    `);

    reviewWin.document.close();
}

function locationPicker_mapBatch(){

    const codes = locationPicker_extractCodesFromHintDropdown();

    if (!codes.length) {
        alert("No valid codes found.");
        return;
    }

    locationPicker_openMapBatch(codes);

    if (typeof locationPicker_toast === "function") {
        locationPicker_toast(
            "Review " + codes.length + " code(s) before map batch"
        );
    }
}

function locationPicker_focusCurrent(){

    const select = document.getElementById("hintSelect");
    if(!select) return;

    const index = parseInt(select.value);

    if(!locationPicker_hintData[index]) return;

    const item = locationPicker_hintData[index];

    locationPicker_hintIndex = index;

    locationPicker_map.setView([item.lat, item.lng], 18, {
        animate:true
    });

    locationPicker_renderHintMarkers();

}

function locationPicker_printBatch() {

    const select = document.getElementById("hintSelect");
    if (!select) {
        alert("hintSelect not found");
        return;
    }

    const codes = [];
    const seen = {};

    // Extract code from each option separately.
    // Uses the LAST underscore-separated part if available.
    // Example:
    //   Customer_Area_P26050615391311H2TQ
    // becomes:
    //   P26050615391311H2TQ
    Array.from(select.options).forEach(option => {

        const text = (option.textContent || "").trim();
        if (!text) return;

        let code = text;

        // Remove distance text: " (... m)"
        code = code.replace(/\s*\([^)]*\)\s*$/, "");

        // Take last part after underscore
        const parts = code.split("_");
        code = parts[parts.length - 1].trim();

        // Validate format like P26050615391311H2TQ
        if (!/^P[A-Z0-9]{10,}$/.test(code)) {
            return;
        }

        // Unique only
        if (!seen[code]) {
            seen[code] = true;
            codes.push(code);
        }
    });

    if (!codes.length) {
        alert("No valid codes found.");
        return;
    }

    // Open review window
    const reviewWin = window.open("", "_blank");
    if (!reviewWin) {
        alert("Popup blocked.");
        return;
    }

    // One code per line for editing
    const textareaValue = codes.join("\n");

    reviewWin.document.write(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Review Print Batch</title>
<style>
body{
    font-family:Arial,sans-serif;
    padding:15px;
    background:#f8fafc;
}
textarea{
    width:100%;
    height:60vh;
    box-sizing:border-box;
    font-family:monospace;
    font-size:14px;
    padding:10px;
    border:1px solid #ccc;
    border-radius:8px;
}
button{
    margin-top:10px;
    padding:12px 18px;
    border:none;
    border-radius:8px;
    font-size:16px;
    font-weight:bold;
    cursor:pointer;
    background:#7c3aed;
    color:#fff;
}
.info{
    margin-top:8px;
    color:#555;
    font-size:13px;
}
</style>
</head>
<body>

<h2>🖨 Review Print Batch</h2>

<textarea id="codeArea">${textareaValue}</textarea>

<div class="info">
One code per line. Empty lines are ignored.
</div>

<button id="printBtn">🖨 Print Batch</button>

<script>
document.getElementById('printBtn').onclick = function () {

    const raw = document.getElementById('codeArea').value;

    const codes = [];
    const seen = {};

    raw.split(/\\r?\\n/).forEach(line => {

        const code = line.trim();
        if (!code) return;

        if (!seen[code]) {
            seen[code] = true;
            codes.push(code);
        }
    });

    if (!codes.length) {
        alert('No valid codes.');
        return;
    }

    // Convert newline-separated list to comma-separated string
    const csv = codes.join(',');

    // POST to print.php in new tab
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'printbatch.php';
    form.target = '_blank';

    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'code';
    input.value = csv;

    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
};
</script>

</body>
</html>
    `);

    reviewWin.document.close();

    if (typeof locationPicker_toast === "function") {
        locationPicker_toast(
            "Review " + codes.length + " code(s) before printing"
        );
    }
}

function locationPicker_trackCurrent(){

    const select = document.getElementById("hintSelect");
    if(!select) return;

    const index = parseInt(select.value);

    if(!locationPicker_hintData[index]) return;

    const name = locationPicker_hintData[index].name || "";

    const parts = name.split("_");

    const code = parts[parts.length - 1];

    const url = "Track.php?code=" + encodeURIComponent(code);

    window.open(url, "_blank");
}

})();

window.locationPicker_track = function(name){

    if(!name) return;

    // split by _
    const parts = name.split("_");

    // take last element
    const code = parts[parts.length - 1];

    // open track page
    window.open("Track.php?code=" + encodeURIComponent(code), "_blank");
}

window.addEventListener("load", function () {
	
   // locationPicker("gpsLoc", "-7.378010,108.618438");

/*
	locationPicker_setMarker([
    { lat: -7.382151, lng: 108.612670, name: "Point 1" },
    { lat: -7.383751, lng: 108.611200, name: "Point 2" },
    { lat: -7.380551, lng: 108.614100, name: "Point 3" },
    { lat: -7.384051, lng: 108.613500, name: "Point 4" },
    { lat: -7.380251, lng: 108.610900, name: "Point 5" },
    { lat: -7.383251, lng: 108.615200, name: "Point 6" },
    { lat: -7.384351, lng: 108.610700, name: "Point 7" },
    { lat: -7.379951, lng: 108.613100, name: "Point 8" },
    { lat: -7.382951, lng: 108.615500, name: "Point 9" },
    { lat: -7.380151, lng: 108.611100, name: "Point 10" },
    { lat: -7.383951, lng: 108.614700, name: "Point 11" },
    { lat: -7.379751, lng: 108.612400, name: "Point 12" },
    { lat: -7.384551, lng: 108.613900, name: "Point 13" },
    { lat: -7.381151, lng: 108.610500, name: "Point 14" },
    { lat: -7.383451, lng: 108.615800, name: "Point 15" },
    { lat: -7.379551, lng: 108.611700, name: "Point 16" },
    { lat: -7.384851, lng: 108.612800, name: "Point 17" },
    { lat: -7.380851, lng: 108.614900, name: "Point 18" },
    { lat: -7.383151, lng: 108.610300, name: "Point 19" },
    { lat: -7.381551, lng: 108.615300, name: "Point 20" }
]);
    */


});
 
