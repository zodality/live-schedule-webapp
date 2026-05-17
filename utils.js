// utils.js
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, function(m) {
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]);
  });
}

function displayDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString();
}

// ใช้ canonical /exec URL เท่านั้น (อย่าใช้ googleusercontent โดยตรง — key หมดอายุ)
const API_URL = 'https://script.google.com/macros/s/AKfycbzWOV0oIy2p1tsBhSQNtABhBWKQ1o3TS09JTX7p1IBNCoLqoQ9SptE6jZ8joN0zRPAi/exec';

async function fetchRows() {
  const res = await fetch(API_URL + '?action=getRows');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await res.json();
}

async function addRow(row) {
  // อย่า set Content-Type: application/json → จะ trigger CORS preflight (OPTIONS) ที่ GAS ไม่ตอบ
  // ปล่อย default เป็น text/plain (simple request) — GAS อ่าน e.postData.contents ได้ JSON เหมือนเดิม
  const res = await fetch(API_URL + '?action=addRow', {
    method: 'POST',
    body: JSON.stringify({ action: 'addRow', ...row })
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await res.json().catch(() => ({}));
}