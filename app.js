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
  if (!res.ok) throw new Error('Network error');
  return await res.json();
}

async function addRow(row) {
  await fetch(API_URL + '?action=addRow', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action: 'addRow', ...row }) // สำคัญต้องมี action
  });
}

async function loadRows() {
  const status = document.getElementById('status');
  const tableWrap = document.getElementById('tableWrap');
  if (!status || !tableWrap) return; // safety check

  status.innerText = 'Loading...';
  tableWrap.style.display = 'none';

  try {
    const data = await fetchRows();

    if (!data || data.length === 0) {
      status.innerText = 'No data';
      return;
    }

    status.innerText = '';
    tableWrap.style.display = 'block';
    render(data); // ส่ง data ให้ render
  } catch (err) {
    console.error(err);
    status.innerText = 'Error loading data';
  }
}

async function submitAdd() {
  const row = {
    date: document.getElementById('addDate').value,
    start: document.getElementById('addStart').value,
    end: document.getElementById('addEnd').value,
    studio: document.getElementById('addStudio').value,
    streamer: document.getElementById('addStreamer').value,
    brand: document.getElementById('addBrand').value,
    platform: document.getElementById('addPlatform').value,
    source: document.getElementById('sourceFilter').value
  };
  await addRow(row);
  closeAdd();
  loadRows();
}