/**
 * ========================================================================
 *  GAS BACKEND PATCH — getAllRows() with CacheService (chunked)
 *  Phase: Performance — ลด cold call latency 25-30s → 5-10s (cache hit)
 * ========================================================================
 *
 *  ⚠️ REFERENCE สำหรับ copy ไปวางใน Apps Script editor
 *
 *  ที่มา:
 *    payload ~450KB ของ getAllRows() เกิน 100KB limit ของ CacheService.put()
 *    → ต้อง split เป็น chunks 90KB แล้วเก็บเป็น keys หลายตัว
 *
 *  สิ่งที่ทำ:
 *    ✅ Cache JSON output ของ getAllRows() ลง CacheService (TTL 60s)
 *    ✅ Chunked storage (90KB ต่อ key) — รองรับ payload ใหญ่
 *    ✅ Cache invalidate ใน addNewRow() — data เปลี่ยน → cache clear
 *    ✅ Skip cache write ถ้า payload เกิน limit รวม — graceful degrade
 *    ✅ Layer ที่ 2 ของ cache (อันแรกอยู่ที่ Netlify Function) —
 *       Netlify cold start ก็ยัง hit cache layer นี้ → 5-10s แทน 25-30s
 *
 *  สิ่งที่ "ไม่แตะ":
 *    • SHEETS config, doGet, doPost
 *    • addNewRow logic (แค่เพิ่ม cache.remove ตอนจบ)
 *    • Conflict logic stubs
 *
 *  วิธี deploy:
 *    1. เปิด Apps Script editor → Code.gs
 *    2. แทนที่ฟังก์ชัน getAllRows() เดิมด้วย version ด้านล่าง
 *    3. แก้ addNewRow() — เพิ่ม cache.removeAll(...) ก่อน return (ดูที่ "Patch addNewRow")
 *    4. Save → Deploy → Manage deployments → Edit → New version → Deploy
 * ========================================================================
 */


// ============================================================
//  Cache helpers (chunked storage — ข้าม 100KB per-key limit)
// ============================================================
const CACHE_KEY_PREFIX = 'rows_';
const CACHE_META_KEY   = 'rows_meta';
const CACHE_TTL_SEC    = 60;            // 60s — sync กับ Netlify cache TTL
const CHUNK_SIZE       = 90 * 1024;     // 90KB ต่อ chunk (เผื่อ overhead)
const MAX_CHUNKS       = 10;            // รองรับ ~900KB → เผื่อ data โต

function getCachedRows_() {
  const cache = CacheService.getScriptCache();
  const meta = cache.get(CACHE_META_KEY);
  if (!meta) return null;

  const n = parseInt(meta, 10);
  if (!n || n > MAX_CHUNKS) return null;

  // อ่านทุก chunk batch เดียวด้วย getAll — เร็วกว่า get ทีละตัว
  const keys = [];
  for (let i = 0; i < n; i++) keys.push(CACHE_KEY_PREFIX + i);
  const chunks = cache.getAll(keys);

  // ตรวจว่ามีครบทุก chunk (เผื่อบาง key หมดอายุก่อนตัวอื่น)
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
    Logger.log('[cache] skip — payload too large: ' + jsonStr.length + ' bytes (need ' + n + ' chunks > MAX ' + MAX_CHUNKS + ')');
    return;
  }

  const obj = { [CACHE_META_KEY]: String(n) };
  for (let i = 0; i < n; i++) {
    obj[CACHE_KEY_PREFIX + i] = jsonStr.substr(i * CHUNK_SIZE, CHUNK_SIZE);
  }
  cache.putAll(obj, CACHE_TTL_SEC);
  Logger.log('[cache] populated ' + n + ' chunks, total=' + jsonStr.length + ' bytes');
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
//  getAllRows — cache-first version (replace ตัวเดิม)
// ============================================================
function getAllRows() {
  // (1) ลอง cache ก่อน — ถ้ามี return JSON string ตรง ๆ
  const cached = getCachedRows_();
  if (cached) {
    Logger.log('[getAllRows] cache HIT — return ' + cached.length + ' bytes');
    return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
  }

  // (2) Cache miss — compute เหมือนเดิม
  Logger.log('[getAllRows] cache MISS — computing...');
  const t0 = Date.now();

  let output = [];

  Object.keys(SHEETS).forEach(key => {
    const ss = SpreadsheetApp.openById(SHEETS[key].id);
    ss.getSheets().forEach(sheet => {
      const tabName = sheet.getName();
      if (sheet.isSheetHidden()) return;

      const values = sheet.getDataRange().getValues();
      if (values.length < 2) return;

      const header = values[0];
      for (let i = 1; i < values.length; i++) {
        const rowValues = values[i];
        const isBlank = rowValues.every(v => v === '' || v === null || v === undefined);
        if (isBlank) continue;

        let rowObj = {};
        header.forEach((h, idx) => {
          if (h !== '' && h !== null && h !== undefined) {
            rowObj[String(h).trim()] = rowValues[idx];
          }
        });
        rowObj.source = key;
        rowObj.Tab    = tabName;
        output.push(rowObj);
      }
    });
  });

  const json = JSON.stringify(output);
  Logger.log('[getAllRows] computed in ' + (Date.now() - t0) + 'ms, rows=' + output.length + ', size=' + json.length);

  // (3) เก็บ cache สำหรับ request ถัดไป (silent fail ถ้าใหญ่เกิน)
  try { setCachedRows_(json); } catch (e) { Logger.log('[cache] write failed: ' + e); }

  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}


/**
 * ============================================================
 *  Patch addNewRow — เพิ่ม cache invalidate ก่อน return
 *  (data เปลี่ยน → ลบ cache → request ถัดไป compute ใหม่)
 * ============================================================
 *
 *  หา function addNewRow() เดิมใน Code.gs แล้ว:
 *    เพิ่ม `invalidateCachedRows_();` ก่อนบรรทัด `return { success: true, row: values };`
 *
 *  ตัวอย่าง:
 *
 *  function addNewRow(rowData) {
 *    const sheetKey = rowData.source || 'STUDIO';
 *    if (!SHEETS[sheetKey]) return { error: 'Invalid source' };
 *
 *    const sheet = SpreadsheetApp.openById(SHEETS[sheetKey].id).getSheets()[0];
 *    const lastRow = sheet.getLastRow() + 1;
 *    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
 *    const values = headers.map(h => rowData[h] || '');
 *    sheet.getRange(lastRow, 1, 1, values.length).setValues([values]);
 *
 *    invalidateCachedRows_();   // ← เพิ่มบรรทัดนี้
 *    return { success: true, row: values };
 *  }
 */
