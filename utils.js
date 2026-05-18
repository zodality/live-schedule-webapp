// utils.js
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, function(m) {
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]);
  });
}

function displayDate(date) {
  if (!date) return '';

  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);  // guard Invalid Date — กัน render() throw

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  return `${day}/${month}/${year}`;
}

// ใช้ canonical /exec URL เท่านั้น (อย่าใช้ googleusercontent โดยตรง — key หมดอายุ)
const API_URL = '/.netlify/functions/gas';

async function fetchRows() {
  // Auto-retry strategy:
  //   - Netlify อาจ early-return 503 ตอน GAS cold call (>25s) → retry หลัง 20s
  //   - ระหว่างนั้น GAS finish + populate CacheService → retry hit cache → fast
  //   - Max 4 attempts → cap total wait ~90s
  const MAX_ATTEMPTS    = 4;
  const ATTEMPT_TIMEOUT = 30000;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ATTEMPT_TIMEOUT);
    let res;
    try {
      res = await fetch(API_URL + '?action=getRows', { signal: ctrl.signal });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        if (attempt < MAX_ATTEMPTS) {
          if (typeof showToast === 'function') {
            showToast(`Timeout — retry ${attempt + 1}/${MAX_ATTEMPTS}`);
          }
          continue;
        }
        throw new Error('Request timeout (Netlify Function)');
      }
      throw err;
    }
    clearTimeout(timer);

    // 503 = Netlify backend computing → wait Retry-After then retry
    if (res.status === 503) {
      const retryAfter = parseInt(res.headers.get('Retry-After') || '20', 10);
      if (attempt < MAX_ATTEMPTS) {
        if (typeof showToast === 'function') {
          showToast(`Backend warming up — retry in ${retryAfter}s (${attempt}/${MAX_ATTEMPTS - 1})`);
        }
        await new Promise(r => setTimeout(r, retryAfter * 1000));
        continue;
      }
      throw new Error(`Backend still computing after ${MAX_ATTEMPTS} attempts — try again in a minute`);
    }

    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }
}

async function addRow(row) {
  // Timeout 30s — เผื่อ GAS lock contention
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(API_URL + '?action=addRow', {
      method: 'POST',
      body: JSON.stringify({ action: 'addRow', ...row }),
      signal: ctrl.signal
    });

    if (!res.ok) throw new Error('HTTP ' + res.status);

    // GAS อาจ return { error: '...' } หรือ { success: true } แม้ status = 200
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { return text; }   // ไม่ใช่ JSON → คืน text เดิม

    if (json && json.error)             throw new Error(json.error);
    if (json && json.success === false) throw new Error(json.message || 'Save failed');
    return json;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Request timeout (30s)');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function displayTime(time) {
  if (!time) return '';

  const d = new Date(time);
  if (isNaN(d.getTime())) return String(time);  // guard Invalid Date — กัน render() throw

  return d.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

// (เคยมี displayDate / displayTime ประกาศซ้ำตรงนี้ — ลบออกแล้ว ใช้ definition ด้านบนตัวเดียว)

function parseThaiDate(str) {
  const [day, month, year] = str.split('/');

  return new Date(year, month - 1, day);
}