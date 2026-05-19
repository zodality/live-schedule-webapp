/**
 * ========================================================================
 *  GAS BACKEND PATCH — Multi-format parser (FLAT + BLOCK) + cache
 *
 *  ⚠️ REFERENCE สำหรับ paste ใน Apps Script editor — ไม่ใช่ frontend file
 *
 *  สิ่งที่ทำใน patch นี้:
 *   1. เพิ่ม detectFormat_(values) — detect FLAT vs BLOCK ต่อ sheet
 *   2. parseFlatFormat_(values, key, tabName) — logic เดิม (extracted)
 *   3. parseBlockFormat_(values, key, tabName) — NEW state machine สำหรับ
 *      sheet ที่มีหลาย brand ใน sheet เดียว (เช่น WFH_09)
 *   4. getAllRows() — route ตาม format, output shape เดียวกัน
 *   5. Cache helpers — เดิม (CacheService chunked storage)
 *
 *  สิ่งที่ "ไม่แตะ":
 *   • SHEETS config
 *   • doGet / doPost
 *   • addNewRow / conflict logic
 *   • frontend / normalizeRow / dashboard / filter
 *
 *  Output shape: เหมือนเดิมทุก field (Date, Start Time, End Time, Hours,
 *  ห้องสตู, คนไลฟ์, BRAND, Platform, source, Tab) → frontend ไม่ต้องแก้
 *
 *  📝 NOTE (Phase ถัดไป — analytics by date):
 *    BLOCK sheet ปัจจุบัน: ถ้า header ไม่มี "Date" column → Date = empty
 *    → frontend แสดง "-" ตามปกติ (graceful)
 *    → analytics ที่ group by date จะรวม BLOCK rows ที่ Date ว่างเข้าด้วยกัน
 *
 *    ถ้าอนาคตต้อง derive Date จาก context ให้พิจารณา option ต่อไปนี้:
 *     (a) Tab name มี date pattern → parse จาก tabName
 *     (b) Date marker row (e.g. "15/05/26") ก่อน brand label → state machine
 *         เก็บเป็น currentDate (เหมือน currentBrand/currentHeader)
 *     (c) ระบุ sheet → month manually ใน SHEETS config
 *    ตอนนี้ยังไม่ implement — เก็บไว้สำหรับ requirement จริง
 * ========================================================================
 */


// ============================================================
//  Cache helpers — chunked storage (รองรับ payload > 100KB)
// ============================================================
const CACHE_KEY_PREFIX = 'rows_';
const CACHE_META_KEY   = 'rows_meta';
const CACHE_TTL_SEC    = 60;
const CHUNK_SIZE       = 90 * 1024;
const MAX_CHUNKS       = 10;

function getCachedRows_() {
  const cache = CacheService.getScriptCache();
  const meta  = cache.get(CACHE_META_KEY);
  if (!meta) return null;
  const n = parseInt(meta, 10);
  if (!n || n > MAX_CHUNKS) return null;

  const keys = [];
  for (let i = 0; i < n; i++) keys.push(CACHE_KEY_PREFIX + i);
  const chunks = cache.getAll(keys);

  for (let i = 0; i < n; i++) {
    if (chunks[CACHE_KEY_PREFIX + i] == null) return null;
  }
  let combined = '';
  for (let i = 0; i < n; i++) combined += chunks[CACHE_KEY_PREFIX + i];
  return combined;
}

function setCachedRows_(jsonStr) {
  const cache = CacheService.getScriptCache();
  const n = Math.ceil(jsonStr.length / CHUNK_SIZE);
  if (n > MAX_CHUNKS) {
    Logger.log('[cache] skip — too large: ' + jsonStr.length + ' bytes');
    return;
  }
  const obj = { [CACHE_META_KEY]: String(n) };
  for (let i = 0; i < n; i++) {
    obj[CACHE_KEY_PREFIX + i] = jsonStr.substr(i * CHUNK_SIZE, CHUNK_SIZE);
  }
  cache.putAll(obj, CACHE_TTL_SEC);
  Logger.log('[cache] populated ' + n + ' chunks, total=' + jsonStr.length);
}

function invalidateCachedRows_() {
  const cache = CacheService.getScriptCache();
  const meta = cache.get(CACHE_META_KEY);
  if (!meta) return;
  const n = parseInt(meta, 10) || 0;
  const keys = [CACHE_META_KEY];
  for (let i = 0; i < n; i++) keys.push(CACHE_KEY_PREFIX + i);
  cache.removeAll(keys);
  Logger.log('[cache] invalidated ' + n + ' chunks');
}


// ============================================================
//  Format detection — FLAT vs BLOCK
// ============================================================

// header tokens ที่ใช้บอกว่า sheet เป็น FLAT
const FLAT_HEADER_TOKENS = [
  'Date', 'Start Time', 'Start', 'End Time', 'End', 'Hours',
  'ห้องสตู', 'คนไลฟ์', 'BRAND', 'Brand', 'Platform'
];

// header tokens สำหรับ BLOCK format (header row ภายในแต่ละ brand block)
const BLOCK_HEADER_TOKENS = [
  'Start', 'End', 'Hours', 'Time', 'Date',
  'คนไลฟ์', 'Streamer', 'Platform', 'ห้องสตู'
];

// row content ที่ควร skip (พัก/บรีฟ/หยุด)
const SKIP_ROW_TOKENS = [
  'พัก', 'บรีฟ', 'หยุด', 'OFF', 'off', 'Off'
];

function detectFormat_(values) {
  if (!values || values.length < 2) return 'FLAT';

  const row0 = values[0].map(v => String(v == null ? '' : v).trim());

  // ถ้า row 0 มี cell ตรงกับ flat header → FLAT
  for (let i = 0; i < row0.length; i++) {
    if (FLAT_HEADER_TOKENS.indexOf(row0[i]) >= 0) return 'FLAT';
  }

  // ถ้า row 0 มี cell เดียว (brand label อยู่บนสุด) → BLOCK
  const nonEmpty = row0.filter(c => c !== '');
  if (nonEmpty.length === 1) return 'BLOCK';

  // Default fallback — safe: FLAT (กัน break sheet เดิมถ้า detect ผิด)
  return 'FLAT';
}


// ============================================================
//  parseFlatFormat_ — logic เดิม (extracted สำหรับ clarity)
// ============================================================
function parseFlatFormat_(values, sourceKey, tabName) {
  const out = [];
  const header = values[0];

  for (let i = 1; i < values.length; i++) {
    const rowValues = values[i];
    const isBlank = rowValues.every(v => v === '' || v === null || v === undefined);
    if (isBlank) continue;

    const rowObj = {};
    header.forEach((h, idx) => {
      if (h !== '' && h !== null && h !== undefined) {
        rowObj[String(h).trim()] = rowValues[idx];
      }
    });
    rowObj.source = sourceKey;
    rowObj.Tab    = tabName;
    out.push(rowObj);
  }
  return out;
}


// ============================================================
//  parseBlockFormat_ — state machine
//
//  State variables:
//    currentBrand  — brand context ปัจจุบัน (set จาก single-cell row)
//    currentHeader — header context ปัจจุบัน (set จาก row ที่มี header token)
//
//  Row classification:
//    blank          → skip
//    skip-keyword   → skip (พัก/บรีฟ/หยุด)
//    single cell    → brand label (set currentBrand, reset header)
//    header tokens  → set currentHeader
//    data row       → map ผ่าน currentHeader + assign currentBrand
// ============================================================
function parseBlockFormat_(values, sourceKey, tabName) {
  const out = [];
  let currentBrand  = '';
  let currentHeader = null;

  for (let i = 0; i < values.length; i++) {
    const rowVals = values[i];
    const cells = rowVals.map(v => String(v == null ? '' : v).trim());
    const nonEmpty = cells.filter(c => c !== '');

    // (1) Blank row — skip (เก็บ context ไว้สำหรับ block ถัดไป)
    if (nonEmpty.length === 0) continue;

    // (2) Skip keyword row (พัก/บรีฟ/หยุด)
    const joined = nonEmpty.join(' ');
    let isSkip = false;
    for (let k = 0; k < SKIP_ROW_TOKENS.length; k++) {
      if (joined.indexOf(SKIP_ROW_TOKENS[k]) >= 0) { isSkip = true; break; }
    }
    if (isSkip) continue;

    // (3) Single cell row → brand label
    //     (skip if it matches a header token — กัน single-cell header row)
    if (nonEmpty.length === 1) {
      const candidate = nonEmpty[0];
      let isHeaderToken = false;
      for (let k = 0; k < BLOCK_HEADER_TOKENS.length; k++) {
        if (candidate === BLOCK_HEADER_TOKENS[k]) { isHeaderToken = true; break; }
      }
      if (isHeaderToken) continue;

      currentBrand = candidate;
      currentHeader = null;
      continue;
    }

    // (4) Header row — มี header token อย่างน้อย 1 ตัว
    let isHeader = false;
    for (let c = 0; c < cells.length; c++) {
      if (BLOCK_HEADER_TOKENS.indexOf(cells[c]) >= 0) { isHeader = true; break; }
    }
    if (isHeader) {
      currentHeader = cells;
      continue;
    }

    // (5) Data row — ต้องมี currentHeader + currentBrand
    if (!currentHeader || !currentBrand) continue;

    const rowObj = {};
    currentHeader.forEach((h, idx) => {
      if (h) rowObj[h] = rowVals[idx];
    });

    // Split "19:00-21:00" → Start Time + End Time
    // รองรับ separator: - (ASCII hyphen), – (en dash)
    Object.keys(rowObj).forEach(k => {
      const v = rowObj[k];
      if (typeof v === 'string') {
        const m = v.match(/^(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})$/);
        if (m) {
          if (!rowObj['Start Time']) rowObj['Start Time'] = m[1] + ':' + m[2];
          if (!rowObj['End Time'])   rowObj['End Time']   = m[3] + ':' + m[4];
        }
      }
    });

    // Normalize alt header names → canonical
    // (block sheet อาจใช้ "Start"/"End" แทน "Start Time"/"End Time")
    if (rowObj.Start && !rowObj['Start Time']) rowObj['Start Time'] = rowObj.Start;
    if (rowObj.End   && !rowObj['End Time'])   rowObj['End Time']   = rowObj.End;
    if (rowObj.Streamer && !rowObj['คนไลฟ์']) rowObj['คนไลฟ์']  = rowObj.Streamer;

    // Skip row ที่ไม่มี data หลัก (start/end/streamer ว่างหมด)
    const hasStart    = rowObj['Start Time'] != null && rowObj['Start Time'] !== '';
    const hasEnd      = rowObj['End Time']   != null && rowObj['End Time']   !== '';
    const hasStreamer = rowObj['คนไลฟ์']    != null && rowObj['คนไลฟ์']    !== '';
    if (!hasStart && !hasEnd && !hasStreamer) continue;

    rowObj.BRAND  = currentBrand;
    rowObj.source = sourceKey;
    rowObj.Tab    = tabName;
    out.push(rowObj);
  }

  return out;
}


// ============================================================
//  getAllRows — cache-first + format-aware parsing
// ============================================================
function getAllRows() {
  const cached = getCachedRows_();
  if (cached) {
    Logger.log('[getAllRows] cache HIT — return ' + cached.length + ' bytes');
    return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
  }

  Logger.log('[getAllRows] cache MISS — computing...');
  const t0 = Date.now();

  let output = [];

  Object.keys(SHEETS).forEach(function (key) {
    const ss = SpreadsheetApp.openById(SHEETS[key].id);
    ss.getSheets().forEach(function (sheet) {
      const tabName = sheet.getName();
      if (sheet.isSheetHidden()) return;

      const values = sheet.getDataRange().getValues();
      if (values.length < 2) return;

      const format = detectFormat_(values);
      let rows;
      try {
        if (format === 'BLOCK') {
          rows = parseBlockFormat_(values, key, tabName);
          Logger.log('[' + key + ' / ' + tabName + '] BLOCK → ' + rows.length + ' rows');
        } else {
          rows = parseFlatFormat_(values, key, tabName);
        }
      } catch (e) {
        Logger.log('[' + key + ' / ' + tabName + '] parse error: ' + e);
        rows = [];
      }
      output = output.concat(rows);
    });
  });

  const json = JSON.stringify(output);
  Logger.log('[getAllRows] computed in ' + (Date.now() - t0) + 'ms, rows=' + output.length + ', size=' + json.length);

  try { setCachedRows_(json); } catch (e) { Logger.log('[cache] write failed: ' + e); }

  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}


/**
 * ============================================================
 *  Patch addNewRow — cache invalidate (เดิม)
 * ============================================================
 *  หา addNewRow() เดิม → เพิ่ม `invalidateCachedRows_();` ก่อน return
 *  ตัวอย่าง:
 *    function addNewRow(rowData) {
 *      ...
 *      sheet.getRange(lastRow, 1, 1, values.length).setValues([values]);
 *      invalidateCachedRows_();        // ← เพิ่มบรรทัดนี้
 *      return { success: true, row: values };
 *    }
 */
