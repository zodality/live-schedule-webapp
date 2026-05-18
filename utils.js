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
  // Timeout 30s — กัน loading ค้างถาวรถ้า GAS/Netlify Function ตอบช้า
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(API_URL + '?action=getRows', { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Request timeout (30s)');
    throw err;
  } finally {
    clearTimeout(timer);
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