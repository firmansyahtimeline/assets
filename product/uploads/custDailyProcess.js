'use strict';

/*
 * ==========================================================================
 * DAILY PROCESS ROUTE  (dailyprocess.php)
 * ==========================================================================
 *
 * Opened from custDaily modal "Process Daily" with MINIMAL query params:
 *
 *   ?date=YYYY-MM-DD&id=<daily_order_id>&contact_id=<id>&number=<number>
 *
 * Heavy data is NOT passed in the URL. The page is a thin shell; each
 * section is loaded lazily via JSON APIs so SQLite / filesystem work is
 * only done when that panel is needed.
 *
 * JSON API
 *   GET ?api=bootstrap&date=&id=&contact_id=&number=
 *       -> light identity + nav links (no album scan, no file list)
 *
 *   GET ?api=contact&contact_id= | &number=
 *       -> full contacts row from gps_contact.db
 *
 *   GET ?api=order&date=&id=
 *       -> daily_orders row only
 *
 *   GET ?api=files&date=&id=
 *       -> daily_files list (+ view_url for each) for that order
 *
 *   GET ?api=file&date=&id=&filename=
 *       -> stream one daily attachment (image view-on-click)
 *
 *   GET ?api=media&contact_id=
 *       -> { mainImage, album[] } from userdata filesystem
 *
 * ROLE: admin / superadmin only.
 *
 * Panel priority (UI + auto-prefetch):
 *   1. daily data (order)
 *   2. daily images (files)
 *   3. user images (media)
 *   4. user data (contact)
 * ==========================================================================
 */

const fs = require('fs/promises');
const path = require('path');
const Database = require('better-sqlite3');

const {
  appDbEnsureAll
} = require('../helpers/db');

const {
  authLoginState,
  authStateHasRole
} = require('../helpers/auth');


const USERDATA_DIR = path.join(process.cwd(), 'userdata');
const CONTACTS_DB_PATH = path.join(USERDATA_DIR, 'gps_contact.db');
const ALBUM_BASE_DIR = path.join(USERDATA_DIR, 'album');
const USERDAILY_DIR = path.join(process.cwd(), 'userdaily');


function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function parseId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return id;
}

function isValidDateStr(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function dateStrToYearMonth(value) {
  const [y, m] = String(value || '').split('-');
  return { year: y || '', month: m || '' };
}

function jsonOk(res, payload, status) {
  return res.status(status || 200).json({ ok: true, ...payload });
}

function jsonError(res, message, status) {
  return res.status(status || 400).json({ ok: false, error: message });
}


/*
 * ==========================================================================
 * DB / FILE HELPERS (opened per request, closed immediately)
 * ==========================================================================
 */

function openContactsDb() {
  try {
    const db = new Database(CONTACTS_DB_PATH, {
      readonly: true,
      fileMustExist: true
    });
    db.pragma('busy_timeout = 3000');
    return db;
  } catch {
    return null;
  }
}

function openDailyDb(year, month) {
  if (!year || !month) return null;
  const dbPath = path.join(USERDAILY_DIR, String(year), `${month}.db`);
  try {
    const db = new Database(dbPath, {
      readonly: true,
      fileMustExist: true
    });
    db.pragma('busy_timeout = 3000');
    return db;
  } catch {
    return null;
  }
}

function withDb(openFn, fn) {
  const db = openFn();
  if (!db) return null;
  try {
    return fn(db);
  } finally {
    try { db.close(); } catch {}
  }
}

function getContactById(db, contactId) {
  const id = parseId(contactId);
  if (!db || !id) return null;
  return db.prepare(`
    SELECT
      id,
      number_text AS number,
      name_text AS name,
      phonenumber_text AS phone_number,
      gpsloc_text AS gps_loc,
      otherphonenumber_text AS other_phone_numbers,
      address_text AS address
    FROM contacts
    WHERE id = ?
    LIMIT 1
  `).get(id) || null;
}

function getContactByNumber(db, number) {
  if (!db) return null;
  const clean = String(number || '').trim();
  if (!clean) return null;
  return db.prepare(`
    SELECT
      id,
      number_text AS number,
      name_text AS name,
      phonenumber_text AS phone_number,
      gpsloc_text AS gps_loc,
      otherphonenumber_text AS other_phone_numbers,
      address_text AS address
    FROM contacts
    WHERE number_text = ?
    LIMIT 1
  `).get(clean) || null;
}

function getDailyOrderById(db, id) {
  const numericId = parseId(id);
  if (!db || !numericId) return null;
  return db.prepare(`SELECT * FROM daily_orders WHERE id = ? LIMIT 1`).get(numericId) || null;
}

function getDailyFiles(db, orderId) {
  const id = parseId(orderId);
  if (!db || !id) return [];
  return db.prepare(`
    SELECT id, filename, original_name, size, created_at
    FROM daily_files
    WHERE order_id = ?
    ORDER BY id ASC
  `).all(id);
}

function getCustomerMainImageUrl(contactId) {
  const id = parseId(contactId);
  if (!id) return null;
  return `/userdata/${id}.png`;
}

async function getCustomerAlbumImages(contactId) {
  const id = parseId(contactId);
  if (!id) return [];
  const albumDir = path.join(ALBUM_BASE_DIR, String(id));
  try {
    const files = await fs.readdir(albumDir);
    return files
      .filter(file => /\.(jpg|jpeg|png|webp|gif)$/i.test(file))
      .sort()
      .map(file => `/userdata/album/${id}/${encodeURIComponent(file)}`);
  } catch {
    return [];
  }
}

async function resolveCustomerMainImage(contactId) {
  const id = parseId(contactId);
  if (!id) return null;
  const mainUrl = getCustomerMainImageUrl(id);
  const mainPath = path.join(USERDATA_DIR, `${id}.png`);
  try {
    await fs.access(mainPath);
    return mainUrl;
  } catch {
    // fall through to album
  }
  const album = await getCustomerAlbumImages(id);
  return album[0] || null;
}


/*
 * ==========================================================================
 * JSON API HANDLERS (lazy)
 * ==========================================================================
 */

async function apiBootstrap(req, res) {
  const date = isValidDateStr(req.query?.date) ? req.query.date : '';
  const id = parseId(req.query?.id);
  const contactId = parseId(req.query?.contact_id);
  const number = String(req.query?.number || '').trim();

  if (!id && !contactId && !number) {
    return jsonError(res, 'Minimal butuh id order, contact_id, atau number.');
  }

  // Light identity only — no album filesystem scan.
  let contactLite = null;
  contactLite = withDb(openContactsDb, db => {
    if (contactId) return getContactById(db, contactId);
    if (number) return getContactByNumber(db, number);
    return null;
  });

  let orderLite = null;
  if (id && date) {
    const { year, month } = dateStrToYearMonth(date);
    orderLite = withDb(
      () => openDailyDb(year, month),
      db => getDailyOrderById(db, id)
    );
  }

  const resolvedNumber = contactLite?.number || number || orderLite?.number_text || '';
  const resolvedContactId = contactLite?.id || contactId || orderLite?.contact_id || null;
  const resolvedName = contactLite?.name || orderLite?.name_text || '';

  return jsonOk(res, {
    keys: {
      date: date || null,
      id: id || null,
      contact_id: resolvedContactId,
      number: resolvedNumber || null
    },
    identity: {
      name: resolvedName,
      number: resolvedNumber,
      contact_id: resolvedContactId,
      order_id: id || orderLite?.id || null,
      order_date: orderLite?.order_date || date || null
    },
    links: {
      daily: date ? `daily.php?date=${encodeURIComponent(date)}` : 'daily.php',
      edit_customer: resolvedNumber
        ? `cust.php?number=${encodeURIComponent(resolvedNumber)}&edit=1`
        : null
    }
  });
}

async function apiContact(req, res) {
  const contactId = parseId(req.query?.contact_id);
  const number = String(req.query?.number || '').trim();

  if (!contactId && !number) {
    return jsonError(res, 'Parameter contact_id atau number wajib.');
  }

  const contact = withDb(openContactsDb, db => {
    if (contactId) return getContactById(db, contactId);
    return getContactByNumber(db, number);
  });

  if (!contact) {
    return jsonError(res, 'Customer tidak ditemukan di gps_contact.db.', 404);
  }

  return jsonOk(res, { contact });
}

async function apiOrder(req, res) {
  const date = isValidDateStr(req.query?.date) ? req.query.date : '';
  const id = parseId(req.query?.id);

  if (!date || !id) {
    return jsonError(res, 'Parameter date dan id wajib.');
  }

  const { year, month } = dateStrToYearMonth(date);
  const order = withDb(
    () => openDailyDb(year, month),
    db => getDailyOrderById(db, id)
  );

  if (!order) {
    return jsonError(res, 'Daily order tidak ditemukan.', 404);
  }

  return jsonOk(res, { order });
}

function orderFilesDir(year, month, orderId) {
  return path.join(USERDAILY_DIR, String(year), String(month), 'files', String(orderId));
}

function isImageFilename(name) {
  return /\.(jpg|jpeg|png|webp|gif)$/i.test(String(name || ''));
}

async function apiFiles(req, res) {
  const date = isValidDateStr(req.query?.date) ? req.query.date : '';
  const id = parseId(req.query?.id);

  if (!date || !id) {
    return jsonError(res, 'Parameter date dan id wajib.');
  }

  const { year, month } = dateStrToYearMonth(date);
  const files = withDb(
    () => openDailyDb(year, month),
    db => getDailyFiles(db, id)
  ) || [];

  const enriched = files.map(file => {
    const viewUrl =
      `?api=file&date=${encodeURIComponent(date)}` +
      `&id=${encodeURIComponent(String(id))}` +
      `&filename=${encodeURIComponent(file.filename)}`;

    return {
      ...file,
      is_image: isImageFilename(file.filename) || isImageFilename(file.original_name),
      view_url: viewUrl
    };
  });

  return jsonOk(res, { files: enriched, count: enriched.length });
}

async function apiFileStream(req, res) {
  const date = isValidDateStr(req.query?.date) ? req.query.date : '';
  const id = parseId(req.query?.id);
  const filename = path.basename(String(req.query?.filename || ''));

  if (!date || !id || !filename) {
    return jsonError(res, 'Parameter date, id, dan filename wajib.');
  }

  const { year, month } = dateStrToYearMonth(date);
  const dir = orderFilesDir(year, month, id);
  const filePath = path.join(dir, filename);

  const resolvedDir = path.resolve(dir);
  const resolvedFile = path.resolve(filePath);

  if (!resolvedFile.startsWith(resolvedDir + path.sep)) {
    return jsonError(res, 'Path tidak valid.');
  }

  try {
    await fs.access(filePath);
  } catch {
    return jsonError(res, 'File tidak ditemukan.', 404);
  }

  return res.sendFile(filePath);
}

async function apiMedia(req, res) {
  const contactId = parseId(req.query?.contact_id);
  if (!contactId) {
    return jsonError(res, 'Parameter contact_id wajib.');
  }

  const [mainImage, album] = await Promise.all([
    resolveCustomerMainImage(contactId),
    getCustomerAlbumImages(contactId)
  ]);

  return jsonOk(res, {
    mainImage: mainImage || null,
    album: album || [],
    count: (album || []).length
  });
}

const GET_API_HANDLERS = {
  bootstrap: apiBootstrap,
  contact: apiContact,
  order: apiOrder,
  files: apiFiles,
  media: apiMedia
  // api=file is handled outside the JSON table (binary stream)
};


/*
 * ==========================================================================
 * SHELL PAGE (lazy UI)
 * ==========================================================================
 */

function renderShellPage({ date, id, contactId, number }) {
  const initialKeys = JSON.stringify({
    date: date || '',
    id: id || null,
    contact_id: contactId || null,
    number: number || ''
  }).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Process Daily</title>
<style>
:root {
  --bg:#f4f6f9; --card:#fff; --border:#e2e8f0; --text:#1a202c;
  --muted:#64748b; --primary:#2563eb; --brand:#0a7d3a; --danger:#c0392b;
}
* { box-sizing:border-box; }
body {
  margin:0; font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  background:var(--bg); color:var(--text); line-height:1.45; font-size:14px;
}
.wrap { max-width:1100px; margin:0 auto; padding:20px 16px 48px; }
.header {
  display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between;
  gap:12px; margin-bottom:16px;
}
.header h1 { margin:0; font-size:1.3rem; }
.nav { display:flex; flex-wrap:wrap; gap:8px; }
.btn {
  display:inline-flex; align-items:center; gap:6px; padding:8px 14px;
  border-radius:8px; border:1px solid var(--border); background:#fff;
  color:var(--text); text-decoration:none; font-weight:600; font-size:13px;
  cursor:pointer; font-family:inherit;
}
.btn:hover { background:#f1f5f9; }
.btn-primary { background:var(--primary); border-color:var(--primary); color:#fff; }
.btn-primary:hover { background:#1d4ed8; }
.btn-brand { background:var(--brand); border-color:var(--brand); color:#fff; }
.btn-brand:hover { background:#065c2a; }
.btn:disabled { opacity:.5; cursor:not-allowed; }
.card {
  background:var(--card); border:1px solid var(--border); border-radius:10px;
  padding:14px 16px; margin-bottom:14px; box-shadow:0 1px 3px rgba(0,0,0,.05);
}
.card h2 {
  margin:0; font-size:.95rem; display:flex; align-items:center; justify-content:space-between; gap:10px;
}
.card-head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; }
.meta { color:var(--muted); font-size:12px; }
.table-wrap { overflow-x:auto; }
table { width:100%; border-collapse:collapse; }
th, td {
  border:1px solid var(--border); padding:7px 9px; text-align:left; vertical-align:top;
}
th {
  width:170px; background:#f8fafc; color:var(--muted); font-size:12px;
  text-transform:uppercase; letter-spacing:.03em;
}
.debug-input {
  width:100%; padding:6px 8px; border:1px solid var(--border); border-radius:6px;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:12px;
  background:#fafbfc;
}
code { font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:12px; word-break:break-all; }
.empty { color:var(--muted); font-style:italic; }
.status {
  font-size:12px; padding:6px 10px; border-radius:6px; margin-bottom:10px;
}
.status.loading { background:#eef4ff; color:#245; }
.status.error { background:#fdecea; color:var(--danger); }
.status.ok { background:#e9f9ee; color:var(--brand); }
.thumb-grid {
  display:grid; grid-template-columns:repeat(auto-fill,minmax(120px,1fr)); gap:10px;
}
.thumb-item {
  border:1px solid var(--border); border-radius:8px; overflow:hidden; background:#fafafa;
}
.thumb-item img { display:block; width:100%; height:120px; object-fit:cover; background:#eee; }
.thumb-url { padding:5px 7px; font-size:10px; border-top:1px solid var(--border); max-height:42px; overflow:hidden; }
.keys-bar {
  display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px;
}
.chip {
  border:1px solid var(--border); background:#fff; border-radius:999px;
  padding:5px 12px; font-size:12px;
}
.chip strong { color:var(--muted); font-weight:600; margin-right:4px; }
.panel-body[hidden] { display:none; }
.ai-row { display:flex; flex-direction:column; gap:10px; }
.ai-row textarea {
  width:100%; min-height:72px; padding:10px 12px; border:1px solid var(--border);
  border-radius:8px; font-family:inherit; font-size:13px; resize:vertical; background:#fafbfc;
}
.ai-actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.ai-output {
  width:100%; min-height:120px; padding:10px 12px; border:1px solid var(--border);
  border-radius:8px; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  font-size:12px; resize:vertical; background:#f8fafc; white-space:pre-wrap;
}
.ai-hint { color:var(--muted); font-size:12px; margin:0; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>Process Daily</h1>
    <div class="nav">
      <a class="btn" id="linkDaily" href="daily.php">← Pesanan Harian</a>
      <button type="button" class="btn btn-brand" id="btnSetPesanan" title="Isi localStorage pesanan dari data order/customer">Set Pesanan</button>
      <a class="btn btn-primary" id="linkEdit" href="#" target="_blank" rel="noopener" hidden>Edit Customer</a>
    </div>
  </div>

  <div class="keys-bar" id="keysBar"></div>
  <div id="bootStatus" class="status loading">Memuat identitas…</div>

  <!-- AI Command builder -->
  <section class="card" id="aiCommandCard">
    <div class="card-head">
      <h2>Create AI Command (product import URL)</h2>
    </div>
    <p class="meta">Tulis pesanan bebas (contoh: <code>kerupuk kuning 1, kerupuk jengkol 2</code>). Tombol akan buat prompt siap-copy yang berisi daftar produk dari localStorage <code>product_data</code> agar AI bisa mapping nama → id dan menghasilkan URL <code>product.php?import=id:qty,...</code>.</p>
    <div class="ai-row">
      <textarea id="aiOrderText" placeholder="Contoh: order kerupuk kuning 1, kerupuk jengkol 2"></textarea>
      <div class="ai-actions">
        <button type="button" class="btn btn-brand" id="btnCreateAiCommand">Create Ai Command</button>
        <button type="button" class="btn" id="btnCopyAiCommand" disabled>Copy</button>
        <span class="meta" id="aiCommandStatus"></span>
      </div>
      <p class="ai-hint">Output prompt (pilih semua / Copy, lalu tempel ke AI):</p>
      <textarea id="aiCommandOutput" class="ai-output" readonly placeholder="Prompt akan muncul di sini…"></textarea>
    </div>
  </section>

  <!-- 1) Keys / query debug -->
  <section class="card">
    <div class="card-head">
      <h2>1) Query keys (minimal)</h2>
    </div>
    <p class="meta">Hanya ID yang dikirim dari modal. Data berat diload lewat API terpisah.</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Variable</th><th>Value</th></tr></thead>
        <tbody id="keysTableBody"></tbody>
      </table>
    </div>
  </section>

  <!-- Priority: daily data → daily images → user images → user data -->

  <!-- 2) Daily order data -->
  <section class="card" data-panel="order">
    <div class="card-head">
      <h2>2) Daily data (daily_orders)</h2>
      <button type="button" class="btn" data-load="order">Load</button>
    </div>
    <div class="status" data-status="order" hidden></div>
    <div class="panel-body" data-body="order" hidden></div>
  </section>

  <!-- 3) Daily attachment images -->
  <section class="card" data-panel="files">
    <div class="card-head">
      <h2>3) Daily images (lampiran harian)</h2>
      <button type="button" class="btn" data-load="files">Load</button>
    </div>
    <div class="status" data-status="files" hidden></div>
    <div class="panel-body" data-body="files" hidden></div>
  </section>

  <!-- 4) User cover + album -->
  <section class="card" data-panel="media">
    <div class="card-head">
      <h2>4) User images (cover &amp; album)</h2>
      <button type="button" class="btn" data-load="media">Load</button>
    </div>
    <div class="status" data-status="media" hidden></div>
    <div class="panel-body" data-body="media" hidden></div>
  </section>

  <!-- 5) User / contact master data -->
  <section class="card" data-panel="contact">
    <div class="card-head">
      <h2>5) User data (gps_contact.db)</h2>
      <button type="button" class="btn" data-load="contact">Load</button>
    </div>
    <div class="status" data-status="contact" hidden></div>
    <div class="panel-body" data-body="contact" hidden></div>
  </section>
</div>

<script id="initialKeys" type="application/json">${initialKeys}</script>
<script>
(function () {
  'use strict';

  var keys = JSON.parse(document.getElementById('initialKeys').textContent);
  var cache = {};

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function setStatus(el, message, type) {
    if (!el) return;
    if (!message) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.className = 'status ' + (type || '');
    el.textContent = message;
  }

  function renderKeyInputs(obj) {
    var body = document.getElementById('keysTableBody');
    var rows = Object.keys(obj || {}).map(function (k) {
      return '<tr><th>' + escapeHtml(k) + '</th><td>' +
        '<input class="debug-input" type="text" readonly value="' + escapeHtml(obj[k] == null ? '' : obj[k]) +
        '" onclick="this.select()"></td></tr>';
    }).join('');
    body.innerHTML = rows || '<tr><td colspan="2" class="empty">Tidak ada key.</td></tr>';

    var bar = document.getElementById('keysBar');
    bar.innerHTML = [
      ['date', obj.date],
      ['id', obj.id],
      ['contact_id', obj.contact_id],
      ['number', obj.number]
    ].map(function (pair) {
      return '<span class="chip"><strong>' + escapeHtml(pair[0]) + '</strong>' +
        escapeHtml(pair[1] == null || pair[1] === '' ? '—' : pair[1]) + '</span>';
    }).join('');
  }

  function objectTableHtml(obj) {
    if (!obj || typeof obj !== 'object') {
      return '<p class="empty">Tidak ada data.</p>';
    }
    var entries = Object.entries(obj);
    if (!entries.length) return '<p class="empty">Objek kosong.</p>';
    return '<div class="table-wrap"><table><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>' +
      entries.map(function (pair) {
        var v = pair[1];
        if (v !== null && typeof v === 'object') v = JSON.stringify(v);
        return '<tr><th>' + escapeHtml(pair[0]) + '</th><td>' +
          '<input class="debug-input" type="text" readonly value="' + escapeHtml(v == null ? '' : v) +
          '" onclick="this.select()"></td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function filesTableHtml(files) {
    if (!files || !files.length) {
      return '<p class="empty">Tidak ada file lampiran harian.</p>';
    }

    var images = files.filter(function (f) { return f.is_image && f.view_url; });
    var others = files.filter(function (f) { return !f.is_image; });

    var html = '';

    if (images.length) {
      html += '<p class="meta">Gambar lampiran (' + images.length + ')</p>';
      html += '<div class="thumb-grid">' + images.map(function (f) {
        var label = f.original_name || f.filename || '';
        return '<div class="thumb-item">' +
          '<a href="' + escapeHtml(f.view_url) + '" target="_blank" rel="noopener" title="' + escapeHtml(label) + '">' +
          '<img src="' + escapeHtml(f.view_url) + '" alt="' + escapeHtml(label) + '" loading="lazy" ' +
          'onerror="this.style.display=\\'none\\';"></a>' +
          '<div class="thumb-url"><code>' + escapeHtml(label) + '</code></div></div>';
      }).join('') + '</div>';
    } else {
      html += '<p class="empty">Tidak ada gambar di lampiran harian.</p>';
    }

    html += '<p class="meta" style="margin-top:14px">Daftar file (' + files.length + ')</p>';
    html += '<div class="table-wrap"><table><thead><tr>' +
      '<th>id</th><th>preview</th><th>filename</th><th>original</th><th>size</th><th>created_at</th>' +
      '</tr></thead><tbody>' +
      files.map(function (f) {
        var preview = f.is_image && f.view_url
          ? '<a href="' + escapeHtml(f.view_url) + '" target="_blank" rel="noopener">' +
            '<img src="' + escapeHtml(f.view_url) + '" alt="" loading="lazy" ' +
            'style="width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0" ' +
            'onerror="this.style.display=\\'none\\';"></a>'
          : (f.view_url
            ? '<a href="' + escapeHtml(f.view_url) + '" target="_blank" rel="noopener">Buka</a>'
            : '—');
        return '<tr>' +
          '<td>' + escapeHtml(f.id) + '</td>' +
          '<td>' + preview + '</td>' +
          '<td><code>' + escapeHtml(f.filename) + '</code></td>' +
          '<td>' + escapeHtml(f.original_name || '') + '</td>' +
          '<td>' + escapeHtml(f.size) + '</td>' +
          '<td>' + escapeHtml(f.created_at || '') + '</td>' +
          '</tr>';
      }).join('') +
      '</tbody></table></div>';

    if (others.length) {
      html += '<p class="meta" style="margin-top:10px">Non-image: ' + others.length + ' file</p>';
    }

    return html;
  }

  function mediaHtml(mainImage, album) {
    var html = '';
    if (mainImage) {
      html += '<p class="meta">Main cover</p><div class="thumb-grid"><div class="thumb-item">' +
        '<a href="' + escapeHtml(mainImage) + '" target="_blank" rel="noopener">' +
        '<img src="' + escapeHtml(mainImage) + '" alt="cover" loading="lazy" onerror="this.style.display=\\'none\\'"></a>' +
        '<div class="thumb-url"><code>' + escapeHtml(mainImage) + '</code></div></div></div>';
    } else {
      html += '<p class="empty">Tidak ada main cover.</p>';
    }
    var list = album || [];
    html += '<p class="meta" style="margin-top:12px">Album (' + list.length + ')</p>';
    if (!list.length) {
      html += '<p class="empty">Album kosong.</p>';
      return html;
    }
    html += '<div class="thumb-grid">' + list.map(function (url) {
      return '<div class="thumb-item">' +
        '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' +
        '<img src="' + escapeHtml(url) + '" alt="" loading="lazy" onerror="this.parentElement.parentElement.style.display=\\'none\\'"></a>' +
        '<div class="thumb-url"><code>' + escapeHtml(url) + '</code></div></div>';
    }).join('') + '</div>';
    return html;
  }

  function apiUrl(name, extra) {
    var u = new URL(window.location.href);
    u.search = '';
    u.searchParams.set('api', name);
    var src = Object.assign({}, keys, extra || {});
    Object.keys(src).forEach(function (k) {
      if (src[k] != null && src[k] !== '') u.searchParams.set(k, String(src[k]));
    });
    return u.pathname + u.search;
  }

  function callApi(name, extra) {
    return fetch(apiUrl(name, extra), {
      credentials: 'same-origin',
      cache: 'no-store'
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || !j.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
        return j;
      });
    });
  }

  function loadPanel(name) {
    if (cache[name]) {
      showPanel(name, cache[name]);
      return Promise.resolve(cache[name]);
    }

    var statusEl = document.querySelector('[data-status="' + name + '"]');
    var btn = document.querySelector('[data-load="' + name + '"]');
    setStatus(statusEl, 'Memuat…', 'loading');
    if (btn) btn.disabled = true;

    return callApi(name).then(function (json) {
      cache[name] = json;
      setStatus(statusEl, 'OK', 'ok');
      showPanel(name, json);
      return json;
    }).catch(function (err) {
      setStatus(statusEl, err.message || String(err), 'error');
    }).finally(function () {
      if (btn) btn.disabled = false;
    });
  }

  function showPanel(name, json) {
    var body = document.querySelector('[data-body="' + name + '"]');
    if (!body) return;
    body.hidden = false;
    if (name === 'contact') body.innerHTML = objectTableHtml(json.contact);
    else if (name === 'order') body.innerHTML = objectTableHtml(json.order);
    else if (name === 'files') body.innerHTML = filesTableHtml(json.files);
    else if (name === 'media') body.innerHTML = mediaHtml(json.mainImage, json.album);
  }

  document.querySelectorAll('[data-load]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      loadPanel(btn.getAttribute('data-load'));
    });
  });

  // Phone: strip spaces/dashes/parens; leading 0 -> 62; empty -> default
  // NOTE: regex backslashes must be doubled because this script lives inside a template literal.
  function normalizePhone(raw) {
    var s = String(raw == null ? '' : raw).trim().replace(/[\\s()-]/g, '');
    if (!s) return '6289500001111';
    if (s.charAt(0) === '0') return '62' + s.slice(1);
    return s;
  }

  function normalizeAddress(raw) {
    var s = String(raw == null ? '' : raw).trim();
    return s || '-';
  }

  function setPesananFromCache() {
    var order = (cache.order && cache.order.order) || null;
    var contact = (cache.contact && cache.contact.contact) || null;

    if (!order && !contact) {
      setStatus(document.getElementById('bootStatus'),
        'Set Pesanan gagal: data order dan customer belum tersedia.', 'error');
      return false;
    }

    // alamat: contact address, empty -> "-"
    var alamat = normalizeAddress(contact && contact.address);

    // telp: contact phone_number
    var telp = normalizePhone(contact && contact.phone_number);

    // nama: order number_text + name_text, fallback contact number + name
    var nama = '';
    if (order) {
      var onum = String(order.number_text == null ? '' : order.number_text).trim();
      var oname = String(order.name_text == null ? '' : order.name_text).trim();
      nama = (onum + ' ' + oname).trim();
    }
    if (!nama && contact) {
      var cnum = String(contact.number == null ? '' : contact.number).trim();
      var cname = String(contact.name == null ? '' : contact.name).trim();
      nama = (cnum + ' ' + cname).trim();
    }

    // gps: order location_text, fallback contact gps_loc
    var gps = '';
    if (order && order.location_text != null && String(order.location_text).trim() !== '') {
      gps = String(order.location_text).trim();
    } else if (contact && contact.gps_loc != null) {
      gps = String(contact.gps_loc).trim();
    }

    try {
      localStorage.setItem('alamatPink', alamat);
      localStorage.setItem('telpPink', telp);
      localStorage.setItem('namaPink', nama);
      localStorage.setItem('gpsPink', gps);

      var parts = [];
      parts.push('nama=' + (nama || '-'));
      parts.push('telp=' + telp);
      parts.push('alamat=' + (alamat.length > 40 ? alamat.slice(0, 40) + '...' : alamat));
      parts.push('gps=' + (gps ? (gps.length > 30 ? gps.slice(0, 30) + '...' : gps) : '-'));
      setStatus(document.getElementById('bootStatus'),
        'Set Pesanan OK - ' + parts.join(' | '), 'ok');
      return true;
    } catch (err) {
      setStatus(document.getElementById('bootStatus'),
        'Set Pesanan gagal menulis localStorage: ' + (err && err.message ? err.message : String(err)), 'error');
      return false;
    }
  }

  document.getElementById('btnSetPesanan').addEventListener('click', function () {
    var btn = this;
    if (btn.disabled) return;
    btn.disabled = true;
    setStatus(document.getElementById('bootStatus'), 'Set Pesanan: memuat data...', 'loading');

    var needOrder = !!(keys.date && keys.id);
    var needContact = !!(keys.contact_id || keys.number);

    var chain = Promise.resolve();
    if (needOrder && !cache.order) {
      chain = chain.then(function () { return loadPanel('order'); });
    }
    if (needContact && !cache.contact) {
      chain = chain.then(function () { return loadPanel('contact'); });
    }

    chain.then(function () {
      setPesananFromCache();
    }).catch(function (err) {
      setStatus(document.getElementById('bootStatus'),
        'Set Pesanan gagal: ' + (err && err.message ? err.message : String(err)), 'error');
    }).finally(function () {
      btn.disabled = false;
    });
  });

  // --- Create AI Command (product_data → import URL prompt) ---
  // NOTE: backslashes doubled because this script lives inside a template literal.
  function getProductDataFromLocalStorage() {
    try {
      var raw = localStorage.getItem('product_data');
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!Array.isArray(data)) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function buildAiCommandPrompt(orderText, products) {
    var productLines = products.map(function (p) {
      var id = p && p.id != null ? p.id : '';
      var name = String((p && p.name) || '').replace(/"/g, "'");
      var cat = String((p && p.category) || '').replace(/"/g, "'");
      var price = p && p.price != null ? p.price : '';
      var status = String((p && p.status) || '');
      return '- id=' + id + ' | name="' + name + '" | category="' + cat + '" | price=' + price + ' | status=' + status;
    }).join('\\n');

    var prompt =
      'You are a helper that maps free-text product orders to product IDs.\\n\\n' +
      'PRODUCT CATALOG (from localStorage product_data):\\n' +
      productLines + '\\n\\n' +
      'USER ORDER TEXT:\\n' +
      String(orderText || '').trim() + '\\n\\n' +
      'TASK:\\n' +
      '1. Match each ordered item to the best product id by name (fuzzy / partial match OK, e.g. "kerupuk kuning" → "Kerupuk Inul Kuning").\\n' +
      '2. Extract quantity for each item (default 1 if missing).\\n' +
      '3. Build an import string in the form: id:qty,id:qty  (example: 43:1,45:2)\\n' +
      '4. URL-encode that string and produce the full path:\\n' +
      '   product.php?import=<urlencoded>\\n' +
      '   Example result: product.php?import=43%3A1%2C45%3A2\\n\\n' +
      'OUTPUT RULES:\\n' +
      '- Reply with ONLY the final URL path (no explanation, no markdown).\\n' +
      '- If something cannot be matched, still output the best-effort URL and list unmatched names in a second line starting with "UNMATCHED:".';

    return prompt;
  }

  function setAiStatus(msg, isError) {
    var el = document.getElementById('aiCommandStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = isError ? 'var(--danger)' : 'var(--brand)';
  }

  document.getElementById('btnCreateAiCommand').addEventListener('click', function () {
    var orderText = (document.getElementById('aiOrderText').value || '').trim();
    var out = document.getElementById('aiCommandOutput');
    var copyBtn = document.getElementById('btnCopyAiCommand');

    if (!orderText) {
      setAiStatus('Isi teks pesanan dulu.', true);
      out.value = '';
      copyBtn.disabled = true;
      return;
    }

    var products = getProductDataFromLocalStorage();
    if (!products || !products.length) {
      setAiStatus('localStorage product_data kosong / tidak valid.', true);
      out.value = '';
      copyBtn.disabled = true;
      return;
    }

    var prompt = buildAiCommandPrompt(orderText, products);
    out.value = prompt;
    copyBtn.disabled = false;
    setAiStatus('Prompt siap (' + products.length + ' produk). Copy & tempel ke AI.', false);
  });

  document.getElementById('btnCopyAiCommand').addEventListener('click', function () {
    var out = document.getElementById('aiCommandOutput');
    var text = out.value || '';
    if (!text) return;

    function done(ok) {
      setAiStatus(ok ? 'Copied ke clipboard.' : 'Gagal copy — pilih manual (Ctrl+A / Ctrl+C).', !ok);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }).catch(function () {
        try {
          out.focus();
          out.select();
          document.execCommand('copy');
          done(true);
        } catch (e) {
          done(false);
        }
      });
    } else {
      try {
        out.focus();
        out.select();
        document.execCommand('copy');
        done(true);
      } catch (e) {
        done(false);
      }
    }
  });

  // Bootstrap: light identity only
  renderKeyInputs(keys);

  callApi('bootstrap').then(function (json) {
    if (json.keys) {
      keys = Object.assign({}, keys, json.keys);
      renderKeyInputs(keys);
    }
    setStatus(document.getElementById('bootStatus'),
      'Siap — data detail diload on-demand per panel.', 'ok');

    if (json.links) {
      if (json.links.daily) {
        document.getElementById('linkDaily').href = json.links.daily;
      }
      if (json.links.edit_customer) {
        var edit = document.getElementById('linkEdit');
        edit.href = json.links.edit_customer;
        edit.hidden = false;
      }
    }

    // Auto-prefetch by priority (sequential-ish via chained promises so
    // UI fills in order: daily data → daily images → user images → user data).
    var chain = Promise.resolve();
    if (keys.date && keys.id) {
      chain = chain.then(function () { return loadPanel('order'); });
      chain = chain.then(function () { return loadPanel('files'); });
    }
    if (keys.contact_id) {
      chain = chain.then(function () { return loadPanel('media'); });
    }
    if (keys.contact_id || keys.number) {
      chain = chain.then(function () { return loadPanel('contact'); });
    }
    return chain;
  }).catch(function (err) {
    setStatus(document.getElementById('bootStatus'), err.message || String(err), 'error');
  });
})();
</script>
</body>
</html>`;
}


/*
 * ==========================================================================
 * MAIN ROUTE
 * ==========================================================================
 */

module.exports = async function customerDailyProcessRoute(req, res, next) {
  try {
    const method = (req.method || 'GET').toUpperCase();

    const authDb = await appDbEnsureAll(req);
    const state = await authLoginState(req, res, authDb);
    const isAdmin = authStateHasRole(state, ['admin', 'superadmin']);

    if (!isAdmin) {
      if (req.query?.api) {
        return jsonError(res, 'Akses hanya untuk admin/superadmin.', 403);
      }
      return res
        .status(403)
        .set('Content-Type', 'text/html; charset=UTF-8')
        .send(`<!DOCTYPE html><html><body style="font-family:sans-serif;margin:40px">
          <p style="color:#c00">Akses ditolak. Halaman ini hanya untuk admin/superadmin.</p>
          <p><a href="daily.php">Kembali</a></p>
          </body></html>`);
    }

    // Binary stream for daily attachment images (outside JSON handlers).
    if (method === 'GET' && req.query?.api === 'file') {
      return apiFileStream(req, res);
    }

    if (method === 'GET' && req.query?.api) {
      const handler = GET_API_HANDLERS[String(req.query.api)];
      if (!handler) {
        return jsonError(res, `Endpoint API tidak dikenali: ${req.query.api}`, 404);
      }
      return await handler(req, res);
    }

    if (method !== 'GET') {
      return jsonError(res, 'Method tidak diizinkan.', 405);
    }

    // Shell only — no DB bulk load here.
    const date = isValidDateStr(req.query?.date) ? req.query.date : '';
    const id = parseId(req.query?.id);
    const contactId = parseId(req.query?.contact_id);
    const number = String(req.query?.number || '').trim();

    return res
      .status(200)
      .set('Content-Type', 'text/html; charset=UTF-8')
      .send(renderShellPage({ date, id, contactId, number }));
  } catch (error) {
    if (req.query?.api) {
      return jsonError(res, error?.message || 'Terjadi kesalahan pada server.', 500);
    }
    next(error);
  }
};
