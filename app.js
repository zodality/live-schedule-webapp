// app.js
document.addEventListener('DOMContentLoaded', function() {

  // Event listeners
  document.getElementById('reloadBtn').addEventListener('click', loadRows);
  document.getElementById('addBtn').addEventListener('click', openAdd);
  document.getElementById('addCancel').addEventListener('click', closeAdd);
  document.getElementById('addSave').addEventListener('click', submitAdd);

  const pageSizeEl = document.getElementById('pageSizeSelect');
  if (pageSizeEl) pageSizeEl.addEventListener('change', function(e){
    pageSize = e.target.value === 'all' ? Infinity : parseInt(e.target.value, 10);
    currentPage = 1;
    render();
  });

   // ✅ เพิ่มตรงนี้
  flatpickr('#dateFrom', {
    dateFormat: 'd/m/Y'
  });

  flatpickr('#dateTo', {
    dateFormat: 'd/m/Y'
  });

  flatpickr('#addDate', {
    dateFormat: 'd/m/Y'
  });
  
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

if (sourceFilter && sourceFilter !== 'ALL') {
  data = data.filter(row => {
    if (sourceFilter === 'WFH') {
      return row.source.startsWith('WFH');
    }

    return row.source === sourceFilter;
  });
}

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
  document.getElementById('sourceFilter').value = 'ALL';

  currentPage = 1;

  render(rows);
}