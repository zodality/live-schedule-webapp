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

const API_URL = 'https://script.google.com/macros/s/AKfycbxuhdY_J6N6KPwpG76uDn5or4mnjSNvFPiYaL41d_rWO6ZHQeoEQIdotvurFpX5G7w/exec';

async function fetchRows() {
  const res = await fetch(API_URL + '?action=getRows');
  return await res.json();
}

async function addRow(row) {
  await fetch(API_URL + '?action=addRow', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action: 'addRow', ...row })
  });
} // <-- ปิดฟังก์ชันตรงนี้s