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
  const res = await fetch(API_URL + '?action=getRows');

  if (!res.ok) throw new Error('HTTP ' + res.status);

  return await res.json();
}

async function addRow(row) {
  const res = await fetch(API_URL + '?action=addRow', {
    method: 'POST',
    body: JSON.stringify({ action: 'addRow', ...row })
  });

  if (!res.ok) throw new Error('POST failed');

  return await res.text();
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