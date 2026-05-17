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

const API_URL = 'https://script.google.com/macros/s/AKfycbzWOV0oIy2p1tsBhSQNtABhBWKQ1o3TS09JTX7p1IBNCoLqoQ9SptE6jZ8joN0zRPAi/exec';

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
}