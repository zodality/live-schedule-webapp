// netlify/functions/gas.js

const GAS_URL = 'https://script.google.com/macros/s/AKfycbzWOV0oIy2p1tsBhSQNtABhBWKQ1o3TS09JTX7p1IBNCoLqoQ9SptE6jZ8joN0zRPAi/exec';

// ===== CONFIG =====
const MAX_RETRY          = 2;
const RATE_LIMIT_WINDOW  = 10000;   // 10 วิ
const RATE_LIMIT_MAX     = 20;      // ต่อ IP
const CACHE_TTL_MS       = 60000;   // 60s — fresh
const STALE_TTL_MS       = 300000;  // 5 นาที — fallback ถ้า GAS down
const GAS_WAIT_MS        = 25000;   // 25s — wait GAS reply (ใต้ Netlify 30s function timeout)
const UPSTREAM_TIMEOUT   = 28000;   // 28s — safety abort ถ้า fetch hang เกินนี้

// ===== STATE (module-scope — persist ระหว่าง warm invocations) =====
const ipStore = new Map();
let cache    = { body: null, expires: 0, staleUntil: 0 };
let inflight = null;   // กัน thundering herd — รวม concurrent requests เป็น Promise เดียว

function rateLimit(ip) {
  const now = Date.now();
  const record = ipStore.get(ip) || { count: 0, time: now };

  if (now - record.time > RATE_LIMIT_WINDOW) {
    ipStore.set(ip, { count: 1, time: now });
    return false;
  }

  record.count++;
  ipStore.set(ip, record);
  return record.count > RATE_LIMIT_MAX;
}

async function fetchWithRetry(url, options, retries = MAX_RETRY) {
  // Timeout per attempt — กัน function ค้าง
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res;
  } catch (err) {
    if (retries > 0) {
      console.warn('Retrying...', retries, err.message);
      return fetchWithRetry(url, options, retries - 1);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFromGAS(url, options) {
  const res = await fetchWithRetry(url, options);
  return await res.text();
}

// Race promise กับ timeout — ถ้าเกิน ms จะ reject 'partial-timeout'
// (promise ยังคงรันต่อใน background → ถ้า resolve ได้จะ populate cache ให้ request ถัดไป)
function raceTimeout(promise, ms, label) {
  let timer;
  const timeoutP = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error('partial-timeout:' + label)), ms);
  });
  return Promise.race([promise, timeoutP]).finally(() => clearTimeout(timer));
}

function busyResponse(retryAfterSec) {
  return {
    statusCode: 503,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Retry-After': String(retryAfterSec),
      'X-Cache': 'COMPUTING'
    },
    body: JSON.stringify({
      status: 'computing',
      message: 'Backend warming up — please retry shortly',
      retry_after: retryAfterSec
    })
  };
}

function jsonResponse(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...extraHeaders
    },
    body
  };
}

exports.handler = async (event) => {
  const ip = event.headers['x-forwarded-for'] || 'unknown';

  // ===== RATE LIMIT =====
  if (rateLimit(ip)) {
    return jsonResponse(429, JSON.stringify({ error: 'Too many requests' }));
  }

  try {
    const method = event.httpMethod;
    const qs     = event.queryStringParameters || {};
    const action = qs.action || (method === 'POST' ? 'addRow' : 'getRows');
    const url    = `${GAS_URL}?action=${encodeURIComponent(action)}`;

    // ===========================================================
    //  POST — passthrough + invalidate cache (data เปลี่ยน)
    // ===========================================================
    if (method === 'POST') {
      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: event.body || ''
      };
      const text = await fetchFromGAS(url, options);
      cache.expires    = 0;        // invalidate fresh window
      cache.staleUntil = 0;        // invalidate stale window
      console.log('[POST] action=' + action + ' → cache invalidated');
      return jsonResponse(200, text);
    }

    // ===========================================================
    //  GET getRows — cache-first
    // ===========================================================
    if (action === 'getRows') {
      const now = Date.now();

      // (1) Fresh cache → return immediately (~10ms)
      if (cache.body && now < cache.expires) {
        const ageS = Math.round((CACHE_TTL_MS - (cache.expires - now)) / 1000);
        console.log('[cache] HIT fresh age=' + ageS + 's');
        return jsonResponse(200, cache.body, { 'X-Cache': 'HIT', 'X-Cache-Age': String(ageS) });
      }

      // (2) Stale cache → return stale + refresh in background (SWR)
      if (cache.body && now < cache.staleUntil) {
        console.log('[cache] STALE — return stale + background refresh');
        if (!inflight) {
          inflight = fetchFromGAS(url, { method: 'GET' })
            .then(text => {
              cache = { body: text, expires: Date.now() + CACHE_TTL_MS, staleUntil: Date.now() + STALE_TTL_MS };
              console.log('[cache] refreshed bg, size=' + text.length);
            })
            .catch(err => console.warn('[cache] bg refresh failed:', err.message))
            .finally(() => { inflight = null; });
        }
        return jsonResponse(200, cache.body, { 'X-Cache': 'STALE' });
      }

      // (3) Cache miss + มี inflight อยู่ — coalesce แต่ race timeout
      // (ถ้า inflight ใช้เวลานานเกิน GAS_WAIT_MS → early-return 503 ให้ client retry)
      if (inflight) {
        console.log('[cache] MISS — wait inflight (race ' + GAS_WAIT_MS + 'ms)');
        try {
          const text = await raceTimeout(inflight, GAS_WAIT_MS, 'coalesced');
          return jsonResponse(200, text, { 'X-Cache': 'COALESCED' });
        } catch (err) {
          if (err.message.startsWith('partial-timeout')) {
            console.warn('[cache] inflight >' + GAS_WAIT_MS + 'ms — return 503 retry');
            return busyResponse(20);
          }
          // inflight failed → ตกลง fall through ทำ cold fetch ใหม่
          console.warn('[cache] inflight failed:', err.message);
        }
      }

      // (4) Cold call — fetch (ไม่ await ตรง ๆ) + race กับ GAS_WAIT_MS
      // ถ้า GAS ตอบทันใน 25s → return data + populate cache
      // ถ้าเกิน → return 503 + GAS continues on Google server → populate CacheService → next retry hit
      console.log('[cache] MISS — cold fetch from GAS (race ' + GAS_WAIT_MS + 'ms)');
      const fetchPromise = fetchFromGAS(url, { method: 'GET' })
        .then(text => {
          cache = { body: text, expires: Date.now() + CACHE_TTL_MS, staleUntil: Date.now() + STALE_TTL_MS };
          console.log('[cache] populated, size=' + text.length);
          return text;
        })
        .catch(err => {
          console.warn('[cache] cold fetch failed:', err.message);
          throw err;
        })
        .finally(() => { inflight = null; });

      inflight = fetchPromise;

      try {
        const text = await raceTimeout(fetchPromise, GAS_WAIT_MS, 'cold-fetch');
        return jsonResponse(200, text, { 'X-Cache': 'MISS' });
      } catch (err) {
        if (err.message.startsWith('partial-timeout')) {
          // GAS ยังทำงานต่อบน Google server (Lambda freeze ไม่ kill GAS request)
          // → GAS finish → populate CacheService → client retry ใน 20s → hit GAS cache → fast
          console.warn('[cache] cold fetch >' + GAS_WAIT_MS + 'ms — early-return 503 (GAS continues server-side)');
          return busyResponse(20);
        }
        throw err;
      }
    }

    // ===========================================================
    //  GET อื่น ๆ (ไม่ใช่ getRows) — passthrough ไม่ cache
    // ===========================================================
    const text = await fetchFromGAS(url, { method: 'GET' });
    return jsonResponse(200, text);

  } catch (err) {
    console.error('ERROR:', err.message);

    // Last resort — ถ้ามี stale cache → serve มันแทน 500
    if (cache.body) {
      console.warn('[cache] error fallback — serving stale');
      return jsonResponse(200, cache.body, { 'X-Cache': 'STALE-ERROR' });
    }
    return jsonResponse(500, JSON.stringify({ error: 'Internal error', message: err.message }));
  }
};
