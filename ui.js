// ui.js
function openAdd() {
  modalMode = 'add';
  document.getElementById('modalBg').style.display = 'flex';
}

function closeAdd() {
  document.getElementById('modalBg').style.display = 'none';
}

function buildActionButtons(k) {
  return '<button class="btn-link" onclick="editRow(\'' + k + '\')">Edit</button>';
}

function renderSourceBadge(source) {
  if (source === 'STUDIO') {
    return '<span class="badge badge-studio">STUDIO</span>';
  }

  if (source && source.startsWith('WFH')) {
    return '<span class="badge badge-wfh">' + source + '</span>';
  }

  return source || '';
}