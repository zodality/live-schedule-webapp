// app.js
document.addEventListener('DOMContentLoaded', function() {
  const reloadBtn = document.getElementById('reloadBtn');
  if (reloadBtn) reloadBtn.addEventListener('click', loadRows);

  const addBtn = document.getElementById('addBtn');
  if (addBtn) addBtn.addEventListener('click', openAdd);

  const addCancel = document.getElementById('addCancel');
  if (addCancel) addCancel.addEventListener('click', closeAdd);

  const addSave = document.getElementById('addSave');
  if (addSave) addSave.addEventListener('click', submitAdd);

  const clearBtn = document.getElementById('clearFilters');
  if (clearBtn) clearBtn.addEventListener('click', clearFilters);

  const sourceEl = document.getElementById('sourceFilter');
  if (sourceEl) sourceEl.addEventListener('change', resetAndRender);

  const pageSizeEl = document.getElementById('pageSizeSelect');
  if (pageSizeEl) pageSizeEl.addEventListener('change', function(e){
    pageSize = e.target.value === 'all' ? Infinity : parseInt(e.target.value, 10);
    currentPage = 1;
    render(rows);
  });

  // flatpickr
  flatpickr('#dateFrom', { dateFormat: 'd/m/Y' });
  flatpickr('#dateTo', { dateFormat: 'd/m/Y' });
  flatpickr('#addDate', { dateFormat: 'd/m/Y' });

document.getElementById('dateFrom')
  ?.addEventListener('change', resetAndRender);

document.getElementById('dateTo')
  ?.addEventListener('change', resetAndRender);

  loadRows();
});

function resetAndRender() {
  currentPage = 1;
  render(rows);
}

function render(data = rows) {
  const tbody = document.getElementById('tbody');

  if (!tbody) {
    console.error('tbody not found');
    return;
  }

  let html = '';

const sourceFilter = document.getElementById('sourceFilter')?.value;
const from = document.getElementById('dateFrom')?.value;
const to = document.getElementById('dateTo')?.value;

if (from) {
  const fromDate = parseThaiDate(from);

  data = data.filter(row => {
    return new Date(row.Date) >= fromDate;
  });
}

if (to) {
  const toDate = parseThaiDate(to);

  toDate.setHours(23, 59, 59, 999);

  data = data.filter(row => {
    return new Date(row.Date) <= toDate;
  });
}

if (sourceFilter && sourceFilter !== 'ALL') {
  data = data.filter(row => {
    if (sourceFilter === 'WFH') {
      return row.source.startsWith('WFH');
    }

    return row.source === sourceFilter;
  });
}

// ✅ เพิ่มตรงนี้
data.sort((a, b) => {
  const aDate = new Date(a.Date);
  const bDate = new Date(b.Date);

  const aStart = new Date(a['Start Time']);
  const bStart = new Date(b['Start Time']);

  return (aDate - bDate) || (aStart - bStart);
});

  (data || []).forEach(row => {
    html += `
      <tr>
  <td>${displayDate(row.Date)}</td>
  <td>${displayTime(row['Start Time'])}</td>
  <td>${displayTime(row['End Time'])}</td>
  <td>${row.Hours || ''}</td>
  <td>${row['ห้องสตู'] || ''}</td>
  <td>${row['คนไลฟ์'] || ''}</td>
  <td>${row.BRAND || ''}</td>
  <td>${row.Platform || ''}</td>
  <td>${renderSourceBadge(row.source || '')}</td>
</tr>
    `;
  });

  tbody.innerHTML = html;
}

async function loadRows() {
  const status = document.getElementById('status');
  const tableWrap = document.getElementById('tableWrap');

  try {
    rows = await fetchRows();

    console.log(rows);

    if (!rows || rows.length === 0) {
      status.innerText = 'No data';
      tableWrap.style.display = 'none';
      return;
    }

    status.style.display = 'none';

    // 🔥 สำคัญมาก
    tableWrap.style.display = 'block';

    render(rows);

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
    source: 'STUDIO'
  };

  await addRow(row);

  closeAdd();

  loadRows();
}

document.getElementById('clearFilters')
  .addEventListener('click', clearFilters);

  function clearFilters() {
  const sourceFilter = document.getElementById('sourceFilter');
  const dateFrom = document.getElementById('dateFrom');
  const dateTo = document.getElementById('dateTo');

  if (sourceFilter) sourceFilter.value = 'ALL';

  if (dateFrom) dateFrom.value = '';

  if (dateTo) dateTo.value = '';

  currentPage = 1;

  render(rows);
}