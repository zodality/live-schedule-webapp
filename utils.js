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

const API_URL = 'https://script.googleusercontent.com/macros/echo?user_content_key=AUkAhnR5c-lRnwP6rEk9Bhjc2Lj3fEfsMbLkagGPj857rl2RaacvDu4hadcYx-OJXcg7vEA1kBi9IhXfF8QDVtLbusKPV-enHw8ddqtHHyaRONborUXUIfCqME7uFBPd45Uuj31xIWwRKUMFdBrrFCKfKrohb_CAXTmZ1aoOiZ8W2i1QW68F7lp41vW0CgXRw990y7K8ocEBW6eVnGcS0zBB-8zgZqpK3SDfVGvUhrp5pXHpOTKrXt3lyt1yLX7hueqN2u6gDjeuTZJegI3lwxzw8P-IZoCYgNOhd-oiTp6c&lib=MkrbBtvrRdPveIrfjgQHIEtPnlkU-3RBx';

async function fetchRows() {
  const res = await fetch(API_URL + '&action=getRows');
  return await res.json();
}

async function addRow(row) {
  await fetch(API_URL + '&action=addRow', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action: 'addRow', ...row })
  });
}