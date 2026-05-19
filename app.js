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

  // TAB copy button — event delegation (ปุ่มถูก re-create ทุก render)
  // data-copy เก็บเป็น encodeURIComponent → ต้อง decodeURIComponent ก่อนใช้
  const tbodyEl = document.getElementById('tbody');
  if (tbodyEl) tbodyEl.addEventListener('click', function(e){
    const btn = e.target.closest('.tab-copy');
    if (!btn) return;
    const encoded = btn.getAttribute('data-copy') || '';
    if (!encoded) return;
    let value;
    try {
      value = decodeURIComponent(encoded);
    } catch (err) {
      // malformed URI sequence — fallback ใช้ raw (กัน throw)
      value = encoded;
    }

    // Visual feedback — 📋 → ✓ ชั่วคราว 800ms
    const flashCheck = () => {
      const original = btn.innerText;
      btn.innerText = '✓';
      btn.classList.add('tab-copy-done');
      setTimeout(() => {
        btn.innerText = original;
        btn.classList.remove('tab-copy-done');
      }, 800);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value)
        .then(() => {
          flashCheck();
          showToast('Copied: ' + truncate(value, 40), 'success');
        })
        .catch(err => showToast('Copy failed: ' + err.message, 'error'));
    } else {
      // fallback สำหรับ browser ที่ไม่รองรับ clipboard API
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        flashCheck();
        showToast('Copied: ' + truncate(value, 40), 'success');
      } catch (err) {
        showToast('Copy failed', 'error');
      } finally {
        document.body.removeChild(ta);
      }
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

// ===== BRAND REGISTRY =====
const BRAND_REGISTRY = {
  "dr.jill": { id: "dr_jill", name: "Dr.Jill", aliases: ["dr.jill"] },
  "myu-myu": { id: "myu_myu", name: "MYU-MYU", aliases: [] },
  "myu-nique": { id: "myu_nique", name: "MYU-NIQUE", aliases: [] },
  "lecorp": { id: "lecorp", name: "Lecorp", aliases: [] },
  "teka": { id: "teka", name: "TEKA", aliases: [] },
  "planb": { id: "planb", name: "PlanB", aliases: [] }
};

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
// BRAND ใช้ Map (key=normalized, value=canonical display) — กัน duplicate จาก case/format
function populateFilterOptions(rowsArr) {
  const brandMap  = new Map();   // norm(lowercase) → canonical(display)
  const streamers = new Set();

  rowsArr.forEach(r => {
    if (r && r.BRAND) {
      const norm    = normalizeCandidate(r.BRAND);   // key สำหรับ dedupe
      const display = canonicalBrand(r.BRAND);        // display ใน dropdown
      if (norm && !brandMap.has(norm)) brandMap.set(norm, display);
    }
    const s = r && r['คนไลฟ์'] ? String(r['คนไลฟ์']).trim() : '';
    if (s) streamers.add(s);
  });

  const brandList    = [...brandMap.values()].sort((a, b) => a.localeCompare(b, 'th'));
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

// Blacklist — ถ้า candidate brand มี keyword พวกนี้ = ไม่ใช่ brand จริง (เป็น tab content / platform / asset type)
// ใช้ substring match แบบ case-insensitive
// 'ช่อง' (general) ครอบทั้ง 'ช่องหลัก' / 'ช่องรอง' ในตัวเดียว
const INVALID_BRAND_KEYWORDS = [
  'แก้ไข',
  'ช่อง',
  'มือถือ',
  'OBS',
  'Tiktok',
  'Shopee',
  'คิว',
  'บรีฟ',
];

function isInvalidBrand(candidate) {
  if (!candidate) return false;
  const lower = String(candidate).toLowerCase();
  return INVALID_BRAND_KEYWORDS.some(k => lower.includes(String(k).toLowerCase()));
}

// Normalize candidate ก่อนเข้า validation — lowercase + trim + collapse spaces
// (กัน case variation + invisible space ปะปน ที่อาจหลุดจาก strip pipeline)
function normalizeCandidate(s) {
  return String(s ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// Canonical brand map — แก้ duplicate จาก case/format variation
// key   = normalized form (lowercase ที่ผ่าน normalizeCandidate)
// value = canonical display form (case ที่จะใช้แสดงใน UI/filter)
// เพิ่ม mapping ใหม่ภายหลังได้
const BRAND_CANONICAL = {
  'dr.jill':   'Dr.Jill',
  'myu-myu':   'MYU-MYU',
  'myu-nique': 'MYU-NIQUE',
};

// Lookup canonical form — ถ้าไม่มีใน map → ใช้ original
function canonicalBrand(s) {
  if (!s) return s;

  const matched = matchBrandFromRegistry(s);
  if (matched) return matched;

  const norm = normalizeCandidate(s);
  return BRAND_CANONICAL[norm] || s;
}

// Positive validation — brand จริงต้อง "มีตัวอักษร + ไม่ใช่ pure date/numeric/generic label"
// ใช้ month constants ร่วมกัน (DRY — ถ้าเพิ่ม month ใน constants, function นี้ update อัตโนมัติ)
function isLikelyBrand(s) {
  if (!s) return false;
  const str = String(s).trim();
  if (!str) return false;

  // 1. reject pure number — "26", "2026"
  if (/^\d+$/.test(str)) return false;

  // 2. reject date-like with separator — "05/69", "5-2026"
  if (/^\d{1,2}[\/\-]\d{2,4}$/.test(str)) return false;

  // 3. reject 4-digit year alone — "2026"
  if (/^\d{4}$/.test(str)) return false;

  // 4. reject ขึ้นต้นด้วย month name (quick fail — EN/TH formal/TH informal)
  //    Note: \b ใช้ไม่ได้กับ Thai chars — TH rules ครอบคลุมโดย rule 4b ด้านล่างอีกที
  if (new RegExp('^' + EN_MONTH + '\\b', 'i').test(str)) return false;
  if (new RegExp('^' + TH_FORMAL_MONTH + '\\b').test(str))  return false;
  if (new RegExp('^' + TH_INFORMAL_MONTH).test(str))        return false;

  // 4b. reject "month + ... + year" ทั้ง string (anchor both ends)
  //     "March 26", "March'26", "พ.ค.69", "เมษา2026" — รวมเคสที่ไม่มี separator
  if (new RegExp('^' + EN_MONTH + '.*\\d{2,4}$', 'i').test(str))     return false;
  if (new RegExp('^' + TH_FORMAL_MONTH + '.*\\d{2,4}$').test(str))   return false;
  if (new RegExp('^' + TH_INFORMAL_MONTH + '.*\\d{2,4}$').test(str)) return false;

  // 4c. reject "<word><4-digit year>" — generic label + year ไม่มี separator
  //     "performance2026", "campaign2024"
  if (/^[a-z฀-๿]+\d{4}$/i.test(str)) return false;

  // 4d. reject platform-only name (exact match) — "tiktok", "shopee", "obs"
  //     กันกรณี string เป็นชื่อ platform เดี่ยว ๆ
  if (/^(tiktok|shopee|obs)$/i.test(str)) return false;

  // 4e. reject single generic Thai word (2-10 Thai chars, no EN mix)
  //     "มือถือ", "ช่อง", "แก้ไข", "คิว" — generic word ไม่ใช่ brand name
  //     ⚠️ อาจ false-positive กับ brand ไทยล้วน ถ้ามี — adjust length cap ได้
  if (/^[ก-๙]{2,}$/.test(str) && str.length <= 10) return false;

  // 5. ต้องมี letter (EN หรือ TH) อย่างน้อย 1 ตัว
  if (!/[a-zA-Z฀-๿]/.test(str)) return false;

  return true;
}

// Month name groups — ใช้ร่วมกันทั้ง suffix/prefix rules
const TH_FORMAL_MONTH   = '(?:ม\\.ค|ก\\.พ|มี\\.ค|เม\\.ย|พ\\.ค|มิ\\.ย|ก\\.ค|ส\\.ค|ก\\.ย|ต\\.ค|พ\\.ย|ธ\\.ค)';
const TH_INFORMAL_MONTH = '(?:มกรา|กุมภา|มีนา|เมษา|พฤษภา|มิถุนา|กรกฎา|สิงหา|กันยา|ตุลา|พฤศจิกา|ธันวา)';
const EN_MONTH          = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';

// Separator ระหว่าง <month> กับ <year>:
//   apostrophe ทุก variant (', ', ', ʼ, ′, `, ´)
//   + whitespace, dot, dash, slash, underscore
// ใช้ negative class: ไม่ใช่ word char และไม่ใช่ Thai → cover ทุก separator แบบ generic
// max 5 chars กัน over-match
const SEP = '[^\\w\\u0E00-\\u0E7F]{0,5}';

const BRAND_STRIP_RULES = [
  // ============ SUFFIX rules (anchor $) ============

  // " x <anything>" — collab/team suffix (greedy รับ nested-x case)
  // ใช้ \b กัน match กลางคำ ("xanax", "X-Men" ไม่โดน)
  /\s+x\b.*$/i,

  // " <Thai formal>.<year>" — "พ.ค.69", "ก.พ. 2569", "พ.ค. 69"
  new RegExp('\\s+' + TH_FORMAL_MONTH + SEP + '\\d{2,4}\\s*$'),

  // " <Thai informal><sep><year>" — "มีนา'26", "เมษา'26", "มีนา 26", "มีนา-26"
  // SEP รองรับ apostrophe ทุก variant + whitespace/punctuation
  new RegExp('\\s+' + TH_INFORMAL_MONTH + SEP + '\\d{2,4}\\s*$'),

  // " <English month><sep><year>" — "May2026", "May'26", "May 2026"
  // ต้องมี digit — กัน "May Day Festival" โดนตัดผิด ([a-z]* รับ "May", "May" + lowercase อื่น)
  new RegExp('\\s+' + EN_MONTH + '[a-z]*' + SEP + '\\d{2,4}\\s*$', 'i'),

  // " <numeric date>" — "05/69", "5-2026", "2026-05"
  /\s+\d{1,4}[\/\-]\d{1,4}\s*$/,

  // " Q<digit>" — quarter
  /\s+Q\d+\s*$/i,

  // ============ PREFIX rules (anchor ^) ============
  // "<month><sep><year> <brand>" — ต้องมี \s+ ตามหลัง (มี brand content)

  // "<English month><sep><year> <brand>" — "May'26 Tiktok ช่องหลัก"
  new RegExp('^' + EN_MONTH + '[a-z]*' + SEP + '\\d{2,4}\\s+', 'i'),

  // "<Thai formal><sep><year> <brand>" — "พ.ค.69 Brand"
  new RegExp('^' + TH_FORMAL_MONTH + SEP + '\\d{2,4}\\s+'),

  // "<Thai informal><sep><year> <brand>" — "มีนา'26 Brand"
  new RegExp('^' + TH_INFORMAL_MONTH + SEP + '\\d{2,4}\\s+'),
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
// Flow: strip → normalizeCandidate → blacklist → positive → agent → brand
//   ทุก validation ใช้ normalized form (lowercase + trim + collapse)
//   แต่ output brand ใช้ original case จาก strip (preserve "Dr.Jill")
function parseTabBrand(tabName) {
  if (!tabName) return { brand: '', agent: '' };

  let s = normalizeSpaces(tabName);
  for (const re of BRAND_STRIP_RULES) {
    s = normalizeSpaces(s.replace(re, ''));
  }

  // Normalize ก่อน validation — กัน case/whitespace variation ที่อาจหลุดมา
  const norm = normalizeCandidate(s);

  // (1) Blacklist — ทำ post-strip เสมอ (ครอบคลุม prefix/suffix ที่ strip ไม่ตัด)
  if (isInvalidBrand(norm)) {
    return { brand: '', agent: '' };
  }

  // (2) Positive validation
  if (!isLikelyBrand(norm)) {
    return { brand: '', agent: '' };
  }

  // (3) Agent code (case-insensitive) — output UPPERCASE
  if (norm && AGENT_CODES.has(norm.toUpperCase())) {
    return { brand: '', agent: norm.toUpperCase() };
  }

  // (4) Brand — canonicalize ผ่าน BRAND_CANONICAL map
  //     ถ้ามีใน map → ใช้ canonical form (กัน duplicate)
  //     ถ้าไม่มี → ใช้ original case จาก strip ("Dr.Jill" ไม่ใช่ "dr.jill")
  return { brand: canonicalBrand(s), agent: '' };
}

// Backward-compat wrapper (เผื่อมี code อื่นเรียก deriveBrand)
function deriveBrand(tabName) {
  return parseTabBrand(tabName).brand;
}

// ============================================================
//  Debug helper — ใช้ใน Console: debugBrand() หรือ debugBrand(10)
//  ตรวจว่า normalizeRow apply ถูก + GAS ส่ง field อะไรมาบ้าง
// ============================================================
// ใช้ใน Console: testParse("Dr.Jill มีนา'26")
// → เห็น char codes ของแต่ละตัวอักษร + rule ไหน match/ไม่ match
window.testParse = function(tabName) {
  console.log('=== testParse ===');
  console.log('Input:', JSON.stringify(tabName));

  // เปิด char codes — ตรวจ apostrophe variant ที่ใช้จริง
  const chars = [...String(tabName)].map(c => {
    const cp = c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
    return `${c}(U+${cp})`;
  });
  console.log('Chars:', chars.join(' '));

  let s = normalizeSpaces(tabName);
  console.log('After normalizeSpaces:', JSON.stringify(s));

  BRAND_STRIP_RULES.forEach((re, i) => {
    const before = s;
    const after = normalizeSpaces(before.replace(re, ''));
    if (after !== before) {
      console.log(`  ✓ Rule #${i} matched ${re}\n    "${before}" → "${after}"`);
      s = after;
    }
  });

  // Normalize before validation (เห็น input ที่ validators เห็นจริง)
  const norm = normalizeCandidate(s);
  console.log('Normalized candidate:', JSON.stringify(norm));

  // Validation layer (1) — blacklist
  if (isInvalidBrand(norm)) {
    const matched = INVALID_BRAND_KEYWORDS.filter(k =>
      norm.includes(String(k).toLowerCase())
    );
    console.log(`  ✗ Rejected by isInvalidBrand — matched: ${JSON.stringify(matched)}`);
  } else if (!isLikelyBrand(norm)) {
    // Validation layer (2) — positive
    console.log(`  ✗ Rejected by isLikelyBrand — "${norm}" doesn't look like a brand`);
  }

  // Canonical lookup (เห็นว่า map hit หรือไม่)
  if (norm && BRAND_CANONICAL[norm]) {
    console.log(`  ✓ Canonical mapping: "${norm}" → "${BRAND_CANONICAL[norm]}"`);
  }

  const parsed = parseTabBrand(tabName);
  console.log('Final parseTabBrand result:', parsed);
  return parsed;
};

window.debugBrand = function(n) {
  if (typeof n !== 'number') n = 5;
  if (!Array.isArray(rows) || rows.length === 0) {
    console.warn('[debugBrand] rows empty — call loadRows() first');
    return;
  }

  const wfh = rows.filter(r => r && r.source && String(r.source).startsWith('WFH'));
  console.log('=== WFH rows analysis ===');
  console.log('Total WFH rows:', wfh.length);

  console.log('\n[1] Sample (first ' + n + ' WFH rows after normalize):');
  wfh.slice(0, n).forEach((r, i) => {
    console.log(`  #${i}`, { Tab: r.Tab, BRAND: r.BRAND, AGENT: r.AGENT, source: r.source });
  });

  const uniqTabs   = [...new Set(wfh.map(r => r.Tab).filter(Boolean))].sort();
  const uniqBrands = [...new Set(wfh.map(r => r.BRAND).filter(Boolean))].sort();
  const uniqAgents = [...new Set(wfh.map(r => r.AGENT).filter(Boolean))].sort();

  console.log('\n[2] Unique values:');
  console.log('  Tabs   (' + uniqTabs.length + '):',   uniqTabs);
  console.log('  BRANDs (' + uniqBrands.length + '):', uniqBrands);
  console.log('  AGENTs (' + uniqAgents.length + '):', uniqAgents);

  console.log('\n[3] Tab → parseTabBrand() result (with reject reason):');
  uniqTabs.forEach(t => {
    const parsed = parseTabBrand(t);
    const sample = wfh.find(r => r.Tab === t);
    const actual = sample ? sample.BRAND : '(no sample)';
    const match  = parsed.brand === actual ? '✓' : '✗ MISMATCH';

    // Compute reject reason ถ้าทั้ง brand+agent ว่าง
    let reason = '';
    if (!parsed.brand && !parsed.agent) {
      let stripped = normalizeSpaces(t);
      for (const re of BRAND_STRIP_RULES) stripped = normalizeSpaces(stripped.replace(re, ''));
      const norm = normalizeCandidate(stripped);
      if (isInvalidBrand(norm)) {
        const matched = INVALID_BRAND_KEYWORDS.filter(k => norm.includes(String(k).toLowerCase()));
        reason = ` [blacklist: ${JSON.stringify(matched)}]`;
      } else if (!isLikelyBrand(norm)) {
        reason = ` [isLikelyBrand: not brand-like "${norm}"]`;
      } else {
        reason = ` [no candidate after strip]`;
      }
    }

    console.log(`  "${t}" → ${JSON.stringify(parsed)}  actual="${actual}"  ${match}${reason}`);
  });

  console.log('\n[4] Raw keys ตัวอย่าง row แรก (เห็น keys ที่ GAS ส่งมา):');
  if (wfh[0]) console.log('  ', Object.keys(wfh[0]));

  console.log('\n→ ถ้า BRAND "MISMATCH" = GAS ส่ง BRAND มาเอง → normalizeRow skip derive (เพราะมีค่าอยู่แล้ว)');
  console.log('→ ดู keys ที่ GAS ส่งมา → ถ้ามี "BRAND"/"Brand"/"brand" = backend column นี้ override derive');
};

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

  // ถ้าเป็น WFH → force override BRAND จาก Tab name (Tab = source of truth)
  // เพราะ GAS อาจส่ง r.BRAND มาเป็นค่า raw tab name → ไม่ใช่ brand ที่ derive แล้ว
  // (ตั้งใจไม่ทำกับ STUDIO — STUDIO มี BRAND column จริงใน Sheet)
  // AGENT — preserve ถ้า backend ส่งมา (future-proof) ไม่ override
  if (typeof out.source === 'string' && out.source.startsWith('WFH') && out.Tab) {
    const parsed = parseTabBrand(out.Tab);
    out.BRAND = parsed.brand;                       // ← FORCE override
    if (!out.AGENT) out.AGENT = parsed.agent;
  }

  // Safety canonical — บังคับ canonical form ทุกครั้งหลัง assign BRAND
  // ครอบคลุม source ทุกแบบ: WFH (derive), STUDIO (column ตรง), POST payload, future backends
  // → ทุก row.BRAND ที่ออกจาก normalizeRow รับประกันเป็น canonical form
  if (out.BRAND) {
    out.BRAND = canonicalBrand(out.BRAND);
  }

  return out;
}

function render(data = rows) {
  const tbody = document.getElementById('tbody');

  if (!tbody) {
    console.error('tbody not found');
    return;
  }

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

  // 🔹 BRAND filter
  if (filters.brands && filters.brands.size > 0) {
    data = data.filter(row => filters.brands.has(String(row.BRAND || '').trim()));
  }

  // 🔹 streamer filter
  if (filters.streamers && filters.streamers.size > 0) {
    data = data.filter(row => filters.streamers.has(String(row['คนไลฟ์'] || '').trim()));
  }

  // 🔹 date filter
  const fromStr = document.getElementById('dateFrom')?.value;
  const toStr   = document.getElementById('dateTo')?.value;

  if (fromStr) {
    try {
      const fromDate = parseThaiDate(fromStr);
      data = data.filter(row => (+new Date(row.Date) || 0) >= +fromDate);
    } catch {}
  }

  if (toStr) {
    try {
      const toDate = parseThaiDate(toStr);
      toDate.setHours(23, 59, 59, 999);
      data = data.filter(row => (+new Date(row.Date) || 0) <= +toDate);
    } catch {}
  }

  // 🔹 sort
  data.sort((a, b) => {
    const aDate  = +new Date(a.Date) || 0;
    const bDate  = +new Date(b.Date) || 0;
    const aStart = +new Date(a['Start Time']) || 0;
    const bStart = +new Date(b['Start Time']) || 0;
    return (bDate - aDate) || (bStart - aStart);
  });

  // ✅ 🔥 analytics hook (สำคัญ)
  const filteredRows = [...data];

  updateDashboard(filteredRows);
  updateTopBrand(filteredRows);
  renderBrandRanking(filteredRows);

  // 🔹 pagination
  const totalPages = pageSize === Infinity ? 1 : Math.max(1, Math.ceil(data.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * pageSize;
  const end   = pageSize === Infinity ? data.length : start + pageSize;

  const pageData = data.slice(start, end);

  if (pageData.length === 0 && Array.isArray(rows) && rows.length > 0) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#888;padding:24px">No rows match current filters</td></tr>';
    renderPagination(0, 1);
    return;
  }

  const cell = v => (v === null || v === undefined || v === '') ? '-' : escapeHtml(String(v));

  const brandCell = r => {
    if (r.BRAND) return escapeHtml(String(r.BRAND));
    if (r.AGENT) return `(agent: ${escapeHtml(String(r.AGENT))})`;
    return '-';
  };

  // tab cell — truncate 30 chars + tooltip + copy button
  // hover เห็นเต็ม, กดปุ่ม 📋 → copy ค่าเต็มลง clipboard + toast feedback
  // data-copy ใช้ encodeURIComponent → safe สำหรับ HTML attribute ทุก char (รวม quote/newline)
  const tabCell = v => {
    if (v === null || v === undefined || v === '') return '-';
    const full        = String(v);
    const trunc       = truncate(full, 30);
    const safeTitle   = escapeHtml(full);                // tooltip — ต้อง escape สำหรับ HTML
    const safeTrunc   = escapeHtml(trunc);               // visible text — ต้อง escape
    const encodedCopy = encodeURIComponent(full);        // attr payload — encodeURIComponent ปลอดภัยกว่า
    return `<span class="tab-cell" title="${safeTitle}">` +
             `<span class="tab-text">${safeTrunc}</span>` +
             `<button type="button" class="tab-copy" data-copy="${encodedCopy}" title="Copy">📋</button>` +
           `</span>`;
  };

  pageData.forEach(row => {
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
        <td>${cell(row.source)}</td>
        <td>${tabCell(row.Tab)}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

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

function normalizeKey(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9\u0E00-\u0E7F]/g, '');
}

function matchBrandFromRegistry(input) {
  const norm = normalizeKey(input);

  for (const key in BRAND_REGISTRY) {
    const b = BRAND_REGISTRY[key];

    if (normalizeKey(key) === norm) return b.name;

    for (const alias of b.aliases) {
      if (normalizeKey(alias) === norm) return b.name;
    }
  }

  return null;
}

function getBrandStats(rows) {
  const groups = groupBy(rows, r => r.BRAND);
  
  return Object.entries(groups).map(([brand, items]) => ({
    brand,
    hours: sum(items, 'Hours'),
    count: items.length
  })).sort((a, b) => b.hours - a.hours);
}

function getStreamerStats(rows) {
  const groups = groupBy(rows, r => r['คนไลฟ์']);
  
  return Object.entries(groups).map(([name, items]) => ({
    name,
    hours: sum(items, 'Hours'),
    count: items.length
  })).sort((a, b) => b.hours - a.hours);
}

function getSourceStats(rows) {
  const groups = groupBy(rows, r => r.source);
  
  return Object.entries(groups).map(([source, items]) => ({
    source,
    hours: sum(items, 'Hours')
  }));
}

function updateDashboard(rows) {
  // NaN guards — กัน sum() คืน NaN ทำให้ UI โชว์ "NaN"
  const total  = Number(sum(rows, 'Hours')) || 0;
  const studio = Number(sum(rows.filter(r => r.source === 'STUDIO'), 'Hours')) || 0;
  const wfh    = Number(sum(rows.filter(r => r.source !== 'STUDIO'), 'Hours')) || 0;

  document.getElementById('totalHours').textContent  = total.toFixed(1);
  document.getElementById('studioHours').textContent = studio.toFixed(1);
  document.getElementById('wfhHours').textContent    = wfh.toFixed(1);
}

function updateTopBrand(rows) {
  const stats = getBrandStats(rows);
  const top = stats[0];

  document.getElementById('topBrand').textContent =
    top ? `${top.brand} (${(Number(top.hours) || 0).toFixed(1)}h)` : '-';
}

function renderBrandRanking(rows) {
  const stats = getBrandStats(rows).slice(0, 5);

  const html = stats.map(s => `
    <div style="display:flex; justify-content:space-between; padding:4px 0;">
      <span>${s.brand}</span>
      <span>${(Number(s.hours) || 0).toFixed(1)}h</span>
    </div>
  `).join('');

  document.getElementById('brandRanking').innerHTML = html;
}