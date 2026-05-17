// app.js
document.addEventListener('DOMContentLoaded', function() {
  console.log('[init] DOMContentLoaded — binding listeners');

  const reloadBtn = document.getElementById('reloadBtn');
  if (reloadBtn) reloadBtn.addEventListener('click', () => {
    console.log('[click] reload');
    // Loading state — กัน double-click + ให้ user เห็นว่า action กำลังทำงาน
    reloadBtn.disabled = true;
    reloadBtn.innerText = 'Loading...';
    loadRows().finally(() => {
      reloadBtn.disabled = false;
      reloadBtn.innerText = 'Reload';
    });
  });

  const addBtn = document.getElementById('addBtn');
  if (addBtn) addBtn.addEventListener('click', () => {
    console.log('[click] add open');
    openAdd();
  });

  const addCancel = document.getElementById('addCancel');
  if (addCancel) addCancel.addEventListener('click', () => {
    console.log('[click] add cancel');
    closeAdd();
  });

  const addSave = document.getElementById('addSave');
  if (addSave) addSave.addEventListener('click', submitAdd);   // logs ของ submitAdd อยู่ภายใน

  const clearBtn = document.getElementById('clearFilters');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    console.log('[click] clear filters');
    clearFilters();
  });

  const sourceEl = document.getElementById('sourceFilter');
  if (sourceEl) sourceEl.addEventListener('change', resetAndRender);

  const pageSizeEl = document.getElementById('pageSizeSelect');
  if (pageSizeEl) pageSizeEl.addEventListener('change', function(e){
    pageSize = e.target.value === 'all' ? Infinity : parseInt(e.target.value, 10);
    currentPage = 1;
    render(rows);
  });

  // 🔹 Pagination Prev/Next — event delegation (เพราะปุ่มถูก re-create ทุกครั้งใน renderPagination)
  const pgNav = document.getElementById('pgNav');
  if (pgNav) pgNav.addEventListener('click', function(e){
    const t = e.target;
    if (t.classList.contains('pg-prev') && !t.disabled) {
      console.log('[click] prev page', { from: currentPage, to: currentPage - 1 });
      currentPage = Math.max(1, currentPage - 1);
      render(rows);
    } else if (t.classList.contains('pg-next') && !t.disabled) {
      console.log('[click] next page', { from: currentPage, to: currentPage + 1 });
      currentPage = currentPage + 1;
      render(rows);
    }
  });

  console.log('[init] listeners bound:',
    { reload:!!reloadBtn, add:!!addBtn, save:!!addSave, clear:!!clearBtn,
      source:!!sourceEl, pageSize:!!pageSizeEl, pgNav:!!pgNav });

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

// 🔹 Normalize row schema — รองรับทั้ง capitalized (Sheet header) และ lowercase (submitAdd payload)
// ทำครั้งเดียวตอน loadRows() ก่อน assign global rows → render ใช้ canonical keys อย่างเดียว
function normalizeRow(r) {
  if (!r || typeof r !== 'object') return {};
  return {
    Date:         r.Date          ?? r.date     ?? '',
    'Start Time': r['Start Time'] ?? r.Start    ?? r.start    ?? '',
    'End Time':   r['End Time']   ?? r.End      ?? r.end      ?? '',
    Hours:        r.Hours         ?? r.hours    ?? '',
    'ห้องสตู':    r['ห้องสตู']     ?? r.Studio   ?? r.studio   ?? '',
    'คนไลฟ์':    r['คนไลฟ์']     ?? r.Streamer ?? r.streamer ?? '',
    BRAND:        r.BRAND         ?? r.Brand    ?? r.brand    ?? '',
    Platform:     r.Platform      ?? r.platform ?? '',
    source:       r.source        ?? r.Source   ?? ''
  };
}

function render(data = rows) {
  const tbody = document.getElementById('tbody');

  if (!tbody) {
    console.error('tbody not found');
    return;
  }

  // 🔹 Shallow copy — กัน data.sort() mutate global rows array
  data = Array.isArray(data) ? [...data] : [];

  let html = '';

  // 🔹 source filter
  const sourceFilter = document.getElementById('sourceFilter')?.value;

  if (sourceFilter && sourceFilter !== 'ALL') {
    data = data.filter(row => {
      const src = row.source || '';
      if (sourceFilter === 'WFH') return src.startsWith('WFH');
      return src === sourceFilter;
    });
  }

  // 🔹 date filter (เติมกลับ — guard parseThaiDate throw)
  const fromStr = document.getElementById('dateFrom')?.value;
  const toStr   = document.getElementById('dateTo')?.value;
  if (fromStr) {
    try {
      const fromDate = parseThaiDate(fromStr);
      data = data.filter(row => (+new Date(row.Date) || 0) >= +fromDate);
    } catch (e) { console.warn('dateFrom skip:', e); }
  }
  if (toStr) {
    try {
      const toDate = parseThaiDate(toStr);
      toDate.setHours(23, 59, 59, 999);
      data = data.filter(row => (+new Date(row.Date) || 0) <= +toDate);
    } catch (e) { console.warn('dateTo skip:', e); }
  }

  // 🔹 sort DESC (วันใหม่อยู่บน — row ที่เพิ่ง add จะอยู่หน้า 1 ทันที)
  data.sort((a, b) => {
    const aDate  = +new Date(a.Date) || 0;
    const bDate  = +new Date(b.Date) || 0;
    const aStart = +new Date(a['Start Time']) || 0;
    const bStart = +new Date(b['Start Time']) || 0;
    return (bDate - aDate) || (bStart - aStart);
  });

  console.log('[render] total:', data.length, 'page:', currentPage, 'size:', pageSize);

  // 🔹 pagination (slice + clamp currentPage กัน overshoot)
  const totalPages = pageSize === Infinity ? 1 : Math.max(1, Math.ceil(data.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * pageSize;
  const end = pageSize === Infinity ? data.length : start + pageSize;
  const pageData = data.slice(start, end);

  pageData.forEach(row => {
    // empty fallback "-" — แยกแยะ "data ว่างจริง" จาก "render เสีย" ในสายตา user
    html += `
      <tr>
        <td>${displayDate(row.Date) || '-'}</td>
        <td>${displayTime(row['Start Time']) || '-'}</td>
        <td>${displayTime(row['End Time']) || '-'}</td>
        <td>${row.Hours || '-'}</td>
        <td>${row['ห้องสตู'] || '-'}</td>
        <td>${row['คนไลฟ์'] || '-'}</td>
        <td>${row.BRAND || '-'}</td>
        <td>${row.Platform || '-'}</td>
        <td>${renderSourceBadge(row.source || '') || '-'}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  // 🔹 pagination UI (info + Prev/Next)
  renderPagination(data.length, totalPages);
}

// 🔹 ใหม่: populate #pgInfo + #pgNav (ปุ่ม Prev/Next ผ่าน event delegation ใน DOMContentLoaded)
function renderPagination(total, totalPages) {
  const info = document.getElementById('pgInfo');
  const nav  = document.getElementById('pgNav');
  if (!info || !nav) return;

  if (pageSize === Infinity) {
    info.innerText = total ? `Showing all ${total} rows` : 'No rows';
    nav.innerHTML = '';
    return;
  }

  const fromIdx = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const toIdx   = Math.min(currentPage * pageSize, total);
  info.innerText = total === 0 ? 'No rows' : `Showing ${fromIdx}-${toIdx} of ${total}`;

  const prevDis = currentPage <= 1 ? 'disabled' : '';
  const nextDis = currentPage >= totalPages ? 'disabled' : '';
  nav.innerHTML =
    `<button class="btn pg-prev" ${prevDis}>‹ Prev</button>` +
    `<span class="pg-page" style="padding:0 8px">Page ${currentPage}/${totalPages}</span>` +
    `<button class="btn pg-next" ${nextDis}>Next ›</button>`;
}

async function loadRows() {
  const status = document.getElementById('status');
  const tableWrap = document.getElementById('tableWrap');

  console.log('[loadRows] start');

  try {
    const raw = await fetchRows();
    rows = Array.isArray(raw) ? raw.map(normalizeRow) : [];
    currentPage = 1;

    // 🔹 Diagnostic: schema sample + ตรวจ silent data drop
    if (Array.isArray(raw) && raw[0]) {
      console.log('[loadRows] raw sample keys:', Object.keys(raw[0]));
      console.log('[loadRows] normalized sample:', rows[0]);
      const missingCore = rows.filter(r => !r.Date && !r['Start Time']).length;
      const missingDate = rows.filter(r => !r.Date).length;
      console.log('[loadRows] integrity:', { total: rows.length, missingDate, missingDateAndStart: missingCore });
    }

    console.log('[loadRows] fetched rows:', rows.length);

    if (!rows || rows.length === 0) {
      status.style.display = '';            // ← unhide เสมอเมื่อมี message (กัน silent)
      status.innerText = 'No data';
      tableWrap.style.display = 'none';
      return;
    }

    status.style.display = 'none';
    tableWrap.style.display = 'block';

    render(rows);
    showToast(`Loaded ${rows.length} rows`, 'success');

  } catch (err) {
    console.error('[loadRows] error:', err);
    status.style.display = '';              // ← unhide เสมอเมื่อมี message (กัน silent)
    status.innerText = 'Error loading data';
    tableWrap.style.display = 'none';
    showToast('Error loading data: ' + err.message, 'error');
  }
}

async function submitAdd() {
  console.log('[click] add save');

  const saveBtn = document.getElementById('addSave');
  const errEl   = document.getElementById('addErr');
  if (errEl) errEl.innerText = '';

  // Defensive: ส่งทั้ง 2 schema (canonical Sheet header + lowercase alias) เผื่อ GAS doPost ใช้ key แบบใดแบบหนึ่ง
  const _date     = document.getElementById('addDate').value;
  const _start    = document.getElementById('addStart').value;
  const _end      = document.getElementById('addEnd').value;
  const _hours    = document.getElementById('addHours').value;
  const _studio   = document.getElementById('addStudio').value;
  const _streamer = document.getElementById('addStreamer').value;
  const _brand    = document.getElementById('addBrand').value;
  const _platform = document.getElementById('addPlatform').value;

  const row = {
    // Canonical keys (ตรง Sheet header — ถ้า GAS doPost ใช้ keys เป็น column header ตรง ๆ)
    'Date':        _date,
    'Start Time':  _start,
    'End Time':    _end,
    'Hours':       _hours,
    'ห้องสตู':     _studio,
    'คนไลฟ์':     _streamer,
    'BRAND':       _brand,
    'Platform':    _platform,
    'source':      'STUDIO',
    // Lowercase aliases (ถ้า GAS doPost map payload.date → "Date" column)
    'date':        _date,
    'start':       _start,
    'end':         _end,
    'hours':       _hours,
    'studio':      _studio,
    'streamer':    _streamer,
    'brand':       _brand,
    'platform':    _platform
  };

  // 🔹 Log payload — verify end-to-end ว่า submitAdd ส่ง field ตรงกับ Sheet header
  console.log('[submitAdd] payload →', row);

  // กัน double-click + ให้ user เห็นว่า action กำลังทำงาน
  if (saveBtn) { saveBtn.disabled = true; saveBtn.innerText = 'Saving...'; }

  try {
    await addRow(row);
    console.log('[submitAdd] success');
    closeAdd();
    showToast('Row saved', 'success');
    await loadRows();
  } catch (err) {
    console.error('[submitAdd] error:', err);
    if (errEl) errEl.innerText = 'Save failed: ' + err.message;
    showToast('Save failed: ' + err.message, 'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerText = 'Save'; }
  }
}

// 🔹 ใหม่: toast helper — element มีใน HTML แล้ว (#toast) แค่ไม่เคยถูกใช้
function showToast(message, kind) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.className = 'toast show' + (kind === 'error' ? ' toast-error' : kind === 'success' ? ' toast-success' : '');
  el.innerText = message;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.className = 'toast'; }, 2500);
}

// (เคย bind clearFilters listener ที่ top-level ตรงนี้ — ลบออก เพราะใน DOMContentLoaded ผูกอยู่แล้ว
//  การ bind ซ้ำทำให้ render() ถูกเรียก 2 ครั้งต่อการกด Clear filters)

function clearFilters() {
  const sourceFilter = document.getElementById('sourceFilter');
  const dateFrom = document.getElementById('dateFrom');
  const dateTo = document.getElementById('dateTo');

  if (sourceFilter) sourceFilter.value = 'ALL';

  // ใช้ flatpickr API ถ้ามี — กัน internal state ของ picker ไม่ sync กับ input.value
  if (dateFrom) { if (dateFrom._flatpickr) dateFrom._flatpickr.clear(); else dateFrom.value = ''; }
  if (dateTo)   { if (dateTo._flatpickr)   dateTo._flatpickr.clear();   else dateTo.value = ''; }

  currentPage = 1;

  render(rows);
  showToast('Filters cleared', 'success');
}