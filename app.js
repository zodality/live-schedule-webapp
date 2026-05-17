// app.js
document.addEventListener('DOMContentLoaded', function() {

  // Event listeners
  document.getElementById('reloadBtn').addEventListener('click', loadRows);
  document.getElementById('addBtn').addEventListener('click', openAdd);
  document.getElementById('addCancel').addEventListener('click', closeAdd);
  document.getElementById('addSave').addEventListener('click', submitAdd);

  const sourceEl = document.getElementById('sourceFilter');
  if (sourceEl) sourceEl.addEventListener('change', resetAndRender);

  const pageSizeEl = document.getElementById('pageSizeSelect');
  if (pageSizeEl) pageSizeEl.addEventListener('change', function(e){
    pageSize = e.target.value === 'all' ? Infinity : parseInt(e.target.value, 10);
    currentPage = 1;
    render();
  });

  loadRows();
});

function resetAndRender() {
  currentPage = 1;
  render();
}

// Placeholder
function loadRows() { /* fetch from GAS API */ }
function submitAdd() { /* add row to GAS API */ }
function render() { /* render table & pagination */ }

const API_URL = 'https://script.google.com/macros/s/AKfycbxuhdY_J6N6KPwpG76uDn5or4mnjSNvFPiYaL41d_rWO6ZHQeoEQIdotvurFpX5G7w/exec';

async function fetchRows() {
  const res = await fetch(API_URL + '?action=getRows');
  return await res.json();
}

async function addRow(row) {
  await fetch(API_URL + '?action=addRow', {
    method: 'POST',
    body: JSON.stringify(row)
  });
}