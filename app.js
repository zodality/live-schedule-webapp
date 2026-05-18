// app.js
// ============================================================
//  DEBUG flag — เปิดเป็น true ตอน dev/debug, false ตอน production
//  ทุก log ที่ "ไม่ใช่ error/warn" ผ่าน dbg() — ปิดได้ใน 1 จุด
// ============================================================
const DEBUG = false;
function dbg(...args) { if (DEBUG) console.log(...args); }

document.addEventListener('DOMContentLoaded', function() {
  const reloadBtn = document.getElementById('reloadBtn');
  if (reloadBtn) reloadBtn.addEventListener('click', () => {
    reloadBtn.disabled = true;
    reloadBtn.innerText = 'Loading...';
    loadRows().finally(() => {
      reloadBtn.disabled = false;
      reloadBtn.innerText = 'Reload';
    });
  });

  const addBtn = document.getElementById('addBtn');
  if (addBtn) addBtn.addEventListener('click', openAdd);

  const addCancel = document.getElementById('addCancel');
  if (addCancel) addCancel.addEventListener('click', closeAdd);

  const addSave = document.getElementById('addSave');
  if (addSave) addSave.addEventListener('click', submitAdd);

  const clearBtn = document.getElementById('clearFilters');
  if (clearBtn) clearBtn.addEventListener('click', clearFilters);

  const sourceEl = document.getElementById('sourceFilter');
  if (sourceEl) sourceEl.addEventListener('change', resetAndRender);

  const pageSizeEl = document.getElementById('pageSizeSelect');
  if (pageSizeEl) pageSizeEl.addEventListener('change', function(e){
    pageSize = e.target.value === 'all' ? Infinity : parseInt(e.target.value, 10);
    currentPage = 1;
    render(rows);
  });

  // Pagination Prev/Next — event delegation (ปุ่ม re-create ทุกครั้งใน renderPagination)
  const pgNav = document.getElementById('pgNav');
  if (pgNav) pgNav.addEventListener('click', function(e){
    const t = e.target;
    if (t.classList.contains('pg-prev') && !t.disabled) {
      currentPage = Math.max(1, currentPage - 1);
      render(rows);
    } else if (t.classList.contains('pg-next') && !t.disabled) {
      currentPage = currentPage + 1;
      render(rows);
    }
  });

  // flatpickr — date pickers
  flatpickr('#dateFrom', { dateFormat: 'd/m/Y' });
  flatpickr('#dateTo',   { dateFormat: 'd/m/Y' });
  flatpickr('#addDate',  { dateFormat: 'd/m/Y', onChange: updateAddRowState });

  // flatpickr — time pickers สำหรับ Add row (input ใน HTML readonly อยู่แล้ว)
  const tpOpts = { enableTime: true, noCalendar: true, dateFormat: 'H:i', time_24hr: true, minuteIncrement: 5, onChange: updateAddRowState };
  flatpickr('#addStart', tpOpts);
  flatpickr('#addEnd',   tpOpts);

  document.getElementById('dateFrom')?.addEventListener('change', resetAndRender);
  document.getElementById('dateTo')?.addEventListener('change',   resetAndRender);

  // Multi-select dropdowns (BRAND + คนไลฟ์) — bind listeners; options จะ populate ใน loadRows()
  setupMultiSelect('msBrand',    filters.brands);
  setupMultiSelect('msStreamer', filters.streamers);

  loadRows();
});

// ============================================================
//  Add row — validation + auto-hours
//  เรียกทุกครั้งที่ date/start/end เปลี่ยน (จาก flatpickr onChange)
// ============================================================
function updateAddRowState() {
  const date  = document.getElementById('addDate').value.trim();
  const start = document.getElementById('addStart').value.trim();
  const end   = document.getElementById('addEnd').value.trim();
  const hoursEl = document.getElementById('addHours');
  const errEl   = document.getElementById('addErr');
  const saveBtn = document.getElementById('addSave');

  // auto-calc hours
  if (start && end) {
    const h = calculateHours(start, end);
    if (hoursEl) hoursEl.value = h === '-' ? '' : h;
  } else {
    if (hoursEl) hoursEl.value = '';
  }

  // validate required fields
  const missing = [];
  if (!date)  missing.push('Date');
  if (!start) missing.push('Start');
  if (!end)   missing.push('End');

  if (errEl) errEl.innerText = missing.length ? 'Required: ' + missing.join(', ') : '';
  if (saveBtn) saveBtn.disabled = missing.length > 0;
}

function resetAndRender() {
  currentPage = 1;
  render(rows);
}

// ============================================================
//  Multi-select dropdown — wire HTML structure ที่มีอยู่ (#msBrand, #msStreamer)
//  เก็บ state ใน filters.brands / filters.streamers (Set จาก state.js)
// ============================================================
function setupMultiSelect(containerId, selectedSet) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const btn     = container.querySelector('.ms-btn');
  const panel   = container.querySelector('.ms-panel');
  const search  = container.querySelector('.ms-search');
  const list    = container.querySelector('.ms-list');
  const allBtn  = container.querySelector('.ms-all');
  const noneBtn = container.querySelector('.ms-none');
  const count   = container.querySelector('.ms-count');
  if (!btn || !panel || !list) return;

  // Toggle panel
  btn.addEventListener('click', e => {
    e.stopPropagation();
    panel.classList.toggle('show');
  });
  // Close panel เมื่อคลิกข้างนอก
  document.addEventListener('click', e => {
    if (!container.contains(e.target)) panel.classList.remove('show');
  });
  // กัน click ใน panel ปิดตัวเอง
  panel.addEventListener('click', e => e.stopPropagation());

  // Search filter (client-side filter ของ checkbox list)
  if (search) {
    search.addEventListener('input', () => {
      const q = search.value.toLowerCase();
      list.querySelectorAll('label').forEach(lb => {
        lb.style.display = lb.dataset.value.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }

  // Checkbox change → update set + re-render
  list.addEventListener('change', e => {
    if (e.target.type !== 'checkbox') return;
    if (e.target.checked) selectedSet.add(e.target.value);
    else                  selectedSet.delete(e.target.value);
    updateCount();
    currentPage = 1;
    render(rows);
  });

  // All / None
  if (allBtn) allBtn.addEventListener('click', () => {
    list.querySelectorAll('input[type=checkbox]').forEach(c => {
      if (c.parentElement.style.display === 'none') return;  // เลือกแค่ visible (หลัง search)
      c.checked = true;
      selectedSet.add(c.value);
    });
    updateCount();
    currentPage = 1;
    render(rows);
  });
  if (noneBtn) noneBtn.addEventListener('click', () => {
    list.querySelectorAll('input[type=checkbox]').forEach(c => { c.checked = false; });
    selectedSet.clear();
    updateCount();
    currentPage = 1;
    render(rows);
  });

  function updateCount() {
    if (!count) return;
    if (selectedSet.size === 0) {
      count.style.display = 'none';
    } else {
      count.style.display = '';
      count.innerText = selectedSet.size;
    }
  }

  // expose: populate options + refresh checkbox state จาก selectedSet
  container._populate = function(values) {
    list.innerHTML = values.map(v => {
      const safe = escapeHtml(v);
      const checked = selectedSet.has(v) ? 'checked' : '';
      return `<label data-value="${safe}" style="display:block;padding:4px 6px;cursor:pointer;border-radius:4px">
        <input type="checkbox" value="${safe}" ${checked} style="margin-right:6px"> ${safe}
      </label>`;
    }).join('');
    updateCount();
  };
}

// Populate options ของ BRAND + คนไลฟ์ จาก unique values ใน rows ปัจจุบัน
function populateFilterOptions(rowsArr) {
  const brands    = new Set();
  const streamers = new Set();
  rowsArr.forEach(r => {
    const b = r && r.BRAND        ? String(r.BRAND).trim()       : '';
    const s = r && r['คนไลฟ์']    ? String(r['คนไลฟ์']).trim()   : '';
    if (b) brands.add(b);
    if (s) streamers.add(s);
  });
  const brandList    = [...brands].sort((a, b) => a.localeCompare(b, 'th'));
  const streamerList = [...streamers].sort((a, b) => a.localeCompare(b, 'th'));
  document.getElementById('msBrand')?._populate?.(brandList);
  document.getElementById('msStreamer')?._populate?.(streamerList);
}

// ============================================================
//  BRAND + AGENT derivation จาก Tab name (สำหรับ WFH ที่ไม่มี column BRAND)
//
//  Pipeline ของ "strip rules" — ตัด suffix ที่เป็น metadata (ไม่ใช่ชื่อ brand) ออก
//  ลำดับ rules: เฉพาะ → กว้าง (rule #1 greedy ที่สุด — ครอบ collab + metadata หลัง)
//
//  Patterns ที่รองรับ:
//    " x TEAM"           "Puricas x JK LIVE"   → BRAND="Puricas"  AGENT=""
//    " <th-month>.<yr>"  "Hadabirei พ.ค.69"     → BRAND="Hadabirei" AGENT=""
//    " <en-month> <yr>"  "Brand May2026"        → BRAND="Brand"     AGENT=""
//    " MM/YY" numeric    "Brand 05/69"          → BRAND="Brand"     AGENT=""
//    " Q<digit>"         "Brand Q1"             → BRAND="Brand"     AGENT=""
//    + combined          "Brand x Team พ.ค.69"  → BRAND="Brand"     AGENT=""
//    Agent prefix        "PP X JK LIVE"         → BRAND=""          AGENT="PP"
//
//  Future-proof: เพิ่ม rule ใหม่ = ใส่ regex ใน array / เพิ่ม code ใน AGENT_CODES
// ============================================================

// Whitelist ของ agent codes ที่รู้จัก (extend ภายหลังได้)
// Match แบบ case-insensitive (compare via .toUpperCase())
const AGENT_CODES = new Set([
  'PP',
  // เพิ่มได้: 'XX', 'YY', ...
]);

const BRAND_STRIP_RULES = [
  // " x <anything>" — collab/team suffix (greedy รับ nested-x case)
  // ใช้ \b เพื่อกัน match กลางคำ ("xanax", "X-Men" ไม่โดน)
  /\s+x\b.*$/i,

  // " <Thai month>.<year>" — "พ.ค.69", "ก.พ. 2569"
  /\s+(?:ม\.ค|ก\.พ|มี\.ค|เม\.ย|พ\.ค|มิ\.ย|ก\.ค|ส\.ค|ก\.ย|ต\.ค|พ\.ย|ธ\.ค)\.?\s*\d{2,4}\s*$/,

  // " <English month> <year>" — "May2026", "May 2026", "May'26"
  // ต้องมี digit ตามหลัง — กัน "May Day Festival" ถูกตัดผิด
  /\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*['']?\s*\d{2,4}\s*$/i,

  // " <numeric date>" — "05/69", "5-2026", "2026-05"
  /\s+\d{1,4}[\/\-]\d{1,4}\s*$/,

  // " Q<digit>" — quarter
  /\s+Q\d+\s*$/i,
];

// Safeguard trim — handle invisible whitespace + collapse multi-space
// (NBSP  , ZWSP ​, narrow NBSP   → space → collapse → trim)
function normalizeSpaces(s) {
  return String(s ?? '')
    .replace(/[ ​ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Parse Tab name → { brand, agent }
// - ถ้า strip pipeline เหลือชื่อที่อยู่ใน AGENT_CODES → คืนเป็น agent (brand ว่าง)
// - มิฉะนั้นคืนเป็น brand
function parseTabBrand(tabName) {
  if (!tabName) return { brand: '', agent: '' };

  let s = normalizeSpaces(tabName);
  for (const re of BRAND_STRIP_RULES) {
    s = normalizeSpaces(s.replace(re, ''));
  }

  // ตรวจ agent code (case-insensitive) — normalize agent → UPPERCASE
  // กัน "pp" / "PP" / "Pp" ปะปนใน filter / report
  if (s && AGENT_CODES.has(s.toUpperCase())) {
    return { brand: '', agent: s.toUpperCase() };
  }

  return { brand: s || normalizeSpaces(tabName), agent: '' };
}

// Backward-compat wrapper (เผื่อมี code อื่นเรียก deriveBrand)
function deriveBrand(tabName) {
  return parseTabBrand(tabName).brand;
}

// 🔹 Normalize row schema — รองรับทั้ง capitalized (Sheet header) และ lowercase (submitAdd payload)
// ทำครั้งเดียวตอน loadRows() ก่อน assign global rows → render ใช้ canonical keys อย่างเดียว
// + Derive BRAND + AGENT สำหรับ WFH (ไม่มี column BRAND ใน Sheet)
function normalizeRow(r) {
  if (!r || typeof r !== 'object') return {};
  const out = {
    Date:         r.Date          ?? r.date     ?? '',
    'Start Time': r['Start Time'] ?? r.Start    ?? r.start    ?? '',
    'End Time':   r['End Time']   ?? r.End      ?? r.end      ?? '',
    Hours:        r.Hours         ?? r.hours    ?? '',
    'ห้องสตู':    r['ห้องสตู']     ?? r.Studio   ?? r.studio   ?? '',
    'คนไลฟ์':    r['คนไลฟ์']     ?? r.Streamer ?? r.streamer ?? '',
    BRAND:        r.BRAND         ?? r.Brand    ?? r.brand    ?? '',
    Platform:     r.Platform      ?? r.platform ?? '',
    source:       r.source        ?? r.Source   ?? '',
    Tab:          r.Tab           ?? '',
    AGENT:        r.AGENT         ?? r.Agent    ?? r.agent    ?? ''
  };

  // ถ้าเป็น WFH + ยังไม่มี BRAND/AGENT → derive จาก Tab name ผ่าน pipeline
  // (ตั้งใจไม่ทำกับ STUDIO — STUDIO ใช้ monthly tab name ที่ไม่เกี่ยวกับ brand)
  if (typeof out.source === 'string' && out.source.startsWith('WFH') && out.Tab && (!out.BRAND || !out.AGENT)) {
    const parsed = parseTabBrand(out.Tab);
    if (!out.BRAND) out.BRAND = parsed.brand;
    if (!out.AGENT) out.AGENT = parsed.agent;
  }

  return out;
}

function render(data = rows) {
  const tbody = document.getElementById('tbody');

  if (!tbody) {
    console.error('tbody not found');
    return;
  }

  // 🔹 Shallow copy — กัน data.sort() mutate global rows array
  data = Array.isArray(data) ? [...data] : [];

  let html = '';

  // 🔹 source filter
  const sourceFilter = document.getElementById('sourceFilter')?.value;

  if (sourceFilter && sourceFilter !== 'ALL') {
    data = data.filter(row => {
      const src = row.source || '';
      if (sourceFilter === 'WFH') return src.startsWith('WFH');
      return src === sourceFilter;
    });
  }

  // 🔹 BRAND filter (multi-select) — ใช้ normalized BRAND เป็น source of truth
  if (filters.brands && filters.brands.size > 0) {
    data = data.filter(row => filters.brands.has(String(row.BRAND || '').trim()));
  }

  // 🔹 คนไลฟ์ filter (multi-select)
  if (filters.streamers && filters.streamers.size > 0) {
    data = data.filter(row => filters.streamers.has(String(row['คนไลฟ์'] || '').trim()));
  }

  // 🔹 date filter (เติมกลับ — guard parseThaiDate throw)
  const fromStr = document.getElementById('dateFrom')?.value;
  const toStr   = document.getElementById('dateTo')?.value;
  if (fromStr) {
    try {
      const fromDate = parseThaiDate(fromStr);
      data = data.filter(row => (+new Date(row.Date) || 0) >= +fromDate);
    } catch (e) { console.warn('dateFrom skip:', e); }
  }
  if (toStr) {
    try {
      const toDate = parseThaiDate(toStr);
      toDate.setHours(23, 59, 59, 999);
      data = data.filter(row => (+new Date(row.Date) || 0) <= +toDate);
    } catch (e) { console.warn('dateTo skip:', e); }
  }

  // 🔹 sort DESC (วันใหม่อยู่บน — row ที่เพิ่ง add จะอยู่หน้า 1 ทันที)
  data.sort((a, b) => {
    const aDate  = +new Date(a.Date) || 0;
    const bDate  = +new Date(b.Date) || 0;
    const aStart = +new Date(a['Start Time']) || 0;
    const bStart = +new Date(b['Start Time']) || 0;
    return (bDate - aDate) || (bStart - aStart);
  });

  dbg('[render] total:', data.length, 'page:', currentPage, 'size:', pageSize);

  // 🔹 pagination (slice + clamp currentPage กัน overshoot)
  const totalPages = pageSize === Infinity ? 1 : Math.max(1, Math.ceil(data.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * pageSize;
  const end = pageSize === Infinity ? data.length : start + pageSize;
  const pageData = data.slice(start, end);

  // Empty filter state — แยก "data ไม่มี" จาก "filter ตัดออกหมด"
  // (rows.length > 0 หมายถึงมี data จริง แต่หลัง filter เหลือ 0)
  if (pageData.length === 0 && Array.isArray(rows) && rows.length > 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#888;padding:24px">No rows match current filters</td></tr>';
    renderPagination(0, 1);
    return;
  }

  // helper สั้น — escape + fallback "-"
  const cell = v => (v === null || v === undefined || v === '') ? '-' : escapeHtml(String(v));

  // brand cell — แสดง agent fallback ถ้า BRAND ว่างแต่มี AGENT
  // (agent rows ที่ derive จาก Tab เช่น "PP X JK LIVE" → AGENT="PP")
  const brandCell = r => {
    if (r.BRAND) return escapeHtml(String(r.BRAND));
    if (r.AGENT) return `(agent: ${escapeHtml(String(r.AGENT))})`;
    return '-';
  };

  pageData.forEach(row => {
    // ไม่ escape: displayDate/displayTime/calculateHours (control output) + renderSourceBadge (สร้าง HTML เอง)
    // escape: text fields ของ user (ห้องสตู/คนไลฟ์/BRAND/Platform) — กัน XSS
    html += `
      <tr>
        <td>${displayDate(row.Date) || '-'}</td>
        <td>${displayTime(row['Start Time']) || '-'}</td>
        <td>${displayTime(row['End Time']) || '-'}</td>
        <td>${calculateHours(row['Start Time'], row['End Time'])}</td>
        <td>${cell(row['ห้องสตู'])}</td>
        <td>${cell(row['คนไลฟ์'])}</td>
        <td>${brandCell(row)}</td>
        <td>${cell(row.Platform)}</td>
        <td>${renderSourceBadge(row.source || '') || '-'}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  // 🔹 pagination UI (info + Prev/Next)
  renderPagination(data.length, totalPages);
}

// 🔹 ใหม่: populate #pgInfo + #pgNav (ปุ่ม Prev/Next ผ่าน event delegation ใน DOMContentLoaded)
function renderPagination(total, totalPages) {
  const info = document.getElementById('pgInfo');
  const nav  = document.getElementById('pgNav');
  if (!info || !nav) return;

  if (pageSize === Infinity) {
    info.innerText = total ? `Showing all ${total} rows` : 'No rows';
    nav.innerHTML = '';
    return;
  }

  const fromIdx = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const toIdx   = Math.min(currentPage * pageSize, total);
  info.innerText = total === 0 ? 'No rows' : `Showing ${fromIdx}-${toIdx} of ${total}`;

  const prevDis = currentPage <= 1 ? 'disabled' : '';
  const nextDis = currentPage >= totalPages ? 'disabled' : '';
  nav.innerHTML =
    `<button class="btn pg-prev" ${prevDis}>‹ Prev</button>` +
    `<span class="pg-page" style="padding:0 8px">Page ${currentPage}/${totalPages}</span>` +
    `<button class="btn pg-next" ${nextDis}>Next ›</button>`;
}

async function loadRows() {
  const status = document.getElementById('status');
  const tableWrap = document.getElementById('tableWrap');

  dbg('[loadRows] start');

  try {
    const raw = await fetchRows();
    rows = Array.isArray(raw) ? raw.map(normalizeRow) : [];
    currentPage = 1;

    // Diagnostic — เฉพาะ DEBUG mode (ปิดใน production)
    if (DEBUG && Array.isArray(raw) && raw[0]) {
      dbg('[loadRows] raw sample keys:', Object.keys(raw[0]));
      dbg('[loadRows] normalized sample:', rows[0]);
      const missingCore = rows.filter(r => !r.Date && !r['Start Time']).length;
      const missingDate = rows.filter(r => !r.Date).length;
      dbg('[loadRows] integrity:', { total: rows.length, missingDate, missingDateAndStart: missingCore });
    }

    // Warn (เก็บไว้ — สำคัญ): ถ้ามี row ที่ Date หายเยอะผิดปกติ → เตือน user
    const missingDate = rows.filter(r => !r.Date).length;
    if (missingDate > rows.length * 0.1) {
      console.warn('[loadRows] high missing-Date ratio:', missingDate, '/', rows.length);
    }

    if (!rows || rows.length === 0) {
      status.style.display = '';            // ← unhide เสมอเมื่อมี message (กัน silent)
      status.innerText = 'No data';
      tableWrap.style.display = 'none';
      return;
    }

    status.style.display = 'none';
    tableWrap.style.display = 'block';

    // Populate filter options จาก rows ปัจจุบัน (unique brands + streamers)
    populateFilterOptions(rows);

    render(rows);
    showToast(`Loaded ${rows.length} rows`, 'success');

  } catch (err) {
    console.error('[loadRows] error:', err);
    status.style.display = '';              // ← unhide เสมอเมื่อมี message (กัน silent)
    status.innerText = 'Error loading data';
    tableWrap.style.display = 'none';
    showToast('Error loading data: ' + err.message, 'error');
  }
}

async function submitAdd() {
  const saveBtn = document.getElementById('addSave');
  const errEl   = document.getElementById('addErr');
  if (errEl) errEl.innerText = '';

  // Defensive: ส่งทั้ง 2 schema (canonical Sheet header + lowercase alias) เผื่อ GAS doPost ใช้ key แบบใดแบบหนึ่ง
  const _date     = document.getElementById('addDate').value.trim();
  const _start    = document.getElementById('addStart').value.trim();
  const _end      = document.getElementById('addEnd').value.trim();
  const _hours    = document.getElementById('addHours').value;

  // Final validation (safety net เผื่อ user bypass disabled state)
  const missing = [];
  if (!_date)  missing.push('Date');
  if (!_start) missing.push('Start');
  if (!_end)   missing.push('End');
  if (missing.length) {
    if (errEl) errEl.innerText = 'Required: ' + missing.join(', ');
    return;
  }
  const _studio   = document.getElementById('addStudio').value;
  const _streamer = document.getElementById('addStreamer').value;
  const _brand    = document.getElementById('addBrand').value;
  const _platform = document.getElementById('addPlatform').value;

  const row = {
    // Canonical keys (ตรง Sheet header — ถ้า GAS doPost ใช้ keys เป็น column header ตรง ๆ)
    'Date':        _date,
    'Start Time':  _start,
    'End Time':    _end,
    'Hours':       _hours,
    'ห้องสตู':     _studio,
    'คนไลฟ์':     _streamer,
    'BRAND':       _brand,
    'Platform':    _platform,
    'source':      'STUDIO',
    // Lowercase aliases (ถ้า GAS doPost map payload.date → "Date" column)
    'date':        _date,
    'start':       _start,
    'end':         _end,
    'hours':       _hours,
    'studio':      _studio,
    'streamer':    _streamer,
    'brand':       _brand,
    'platform':    _platform
  };

  dbg('[submitAdd] payload →', row);

  // กัน double-click + ให้ user เห็นว่า action กำลังทำงาน
  if (saveBtn) { saveBtn.disabled = true; saveBtn.innerText = 'Saving...'; }

  try {
    await addRow(row);
    closeAdd();
    showToast('Row saved', 'success');
    await loadRows();
  } catch (err) {
    console.error('[submitAdd] error:', err);
    if (errEl) errEl.innerText = 'Save failed: ' + err.message;
    showToast('Save failed: ' + err.message, 'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerText = 'Save'; }
  }
}

// 🔹 ใหม่: toast helper — element มีใน HTML แล้ว (#toast) แค่ไม่เคยถูกใช้
function showToast(message, kind) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.className = 'toast show' + (kind === 'error' ? ' toast-error' : kind === 'success' ? ' toast-success' : '');
  el.innerText = message;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.className = 'toast'; }, 2500);
}

// (เคย bind clearFilters listener ที่ top-level ตรงนี้ — ลบออก เพราะใน DOMContentLoaded ผูกอยู่แล้ว
//  การ bind ซ้ำทำให้ render() ถูกเรียก 2 ครั้งต่อการกด Clear filters)

function clearFilters() {
  const sourceFilter = document.getElementById('sourceFilter');
  const dateFrom = document.getElementById('dateFrom');
  const dateTo = document.getElementById('dateTo');

  if (sourceFilter) sourceFilter.value = 'ALL';

  // ใช้ flatpickr API ถ้ามี — กัน internal state ของ picker ไม่ sync กับ input.value
  if (dateFrom) { if (dateFrom._flatpickr) dateFrom._flatpickr.clear(); else dateFrom.value = ''; }
  if (dateTo)   { if (dateTo._flatpickr)   dateTo._flatpickr.clear();   else dateTo.value = ''; }

  // Clear multi-select sets + re-populate (จะ uncheck UI + reset count)
  filters.brands.clear();
  filters.streamers.clear();
  populateFilterOptions(rows);

  currentPage = 1;

  render(rows);
  showToast('Filters cleared', 'success');
}

// ============================================================
//  Hours calculation (compute จาก Start/End — ไม่พึ่ง row.Hours จาก backend)
//  Spec: รองรับ string / Date / number (Sheets serial), ข้ามวัน, format
// ============================================================

function parseTime(t) {
  if (t === '' || t === null || t === undefined) return null;

  // Google Sheets serial number — เก็บเฉพาะส่วน time (modulo 1)
  // e.g. 0.9375 = 22:30, 2.5 = พรุ่งนี้ 12:00 → เอาแค่ time part
  if (typeof t === 'number') {
    if (!isFinite(t)) return null;
    return (t - Math.floor(t)) * 24;
  }

  // Date object — เผื่อ GAS แปลงเป็น Date มาก่อน JSON
  if (t instanceof Date) {
    if (isNaN(t.getTime())) return null;
    return t.getHours() + t.getMinutes() / 60 + t.getSeconds() / 3600;
  }

  if (typeof t === 'string') {
    const s = t.trim();
    if (!s) return null;

    // ISO datetime "1899-12-30T22:30:00.000Z" หรือ "2026-05-17T08:00:00"
    // (GAS ส่งเวลาเป็น Date → JSON.stringify → ISO string)
    if (s.includes('T') || (s.includes('-') && s.length > 10)) {
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
      }
    }

    // "HH:MM" หรือ "HH:MM:SS"
    const m = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
    if (m) {
      const h   = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      const sec = parseInt(m[3] || '0', 10);
      if (h >= 0 && h < 48 && min >= 0 && min < 60) {
        return h + min / 60 + sec / 3600;
      }
    }
  }

  return null;
}

function calculateHours(start, end) {
  const s = parseTime(start);
  const e = parseTime(end);
  if (s === null || e === null) return '-';

  let diff = e - s;
  if (diff < 0) diff += 24;            // ข้ามวัน: 22:00 → 02:00 = 4 ชม.
  if (diff < 0 || diff > 24) return '-';

  // integer → เต็ม "2", decimal → 1 ตำแหน่ง "1.5"
  return diff % 1 === 0 ? String(diff) : diff.toFixed(1);
}