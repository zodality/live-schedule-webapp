// ui.js
function openAdd() {
  modalMode = 'add';
  // Reset fields ทุกครั้งที่เปิด modal — กัน state ค้างจากครั้งก่อน
  ['addDate','addStart','addEnd','addHours','addStudio','addStreamer','addBrand','addPlatform'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el._flatpickr) el._flatpickr.clear(); else el.value = '';
  });
  const errEl = document.getElementById('addErr');
  if (errEl) errEl.innerText = '';
  document.getElementById('modalBg').style.display = 'flex';
  // Set initial validation state — Save จะ disabled จนกว่ากรอก date/start/end
  if (typeof updateAddRowState === 'function') updateAddRowState();
}

function closeAdd() {
  document.getElementById('modalBg').style.display = 'none';
}

function buildActionButtons(k) {
  return '<button class="btn-link" onclick="editRow(\'' + k + '\')">Edit</button>';
}

function renderSourceBadge(source) {
  if (!source) return '';
  const s = String(source);
  if (s === 'STUDIO') {
    return '<span class="badge badge-studio">STUDIO</span>';
  }
  if (s.startsWith('WFH')) {
    // เฉดสีต่างกันเล็กน้อยตาม WFH_NN (โทนเขียวเหมือนกัน)
    const num   = parseInt(s.replace(/\D/g, ''), 10) || 0;
    const shade = num % 5;     // 0-4 → 5 เฉด
    return `<span class="badge badge-wfh badge-wfh-${shade}">${escapeHtml(s)}</span>`;
  }
  return `<span class="badge badge-other">${escapeHtml(s)}</span>`;
}