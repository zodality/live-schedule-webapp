// ================= CONFIG =================
const SHEETS = {
  STUDIO: { id: '1DiRyqpUHPH3e8zlACo8TksLe_I8ykFPkRNya5xQUCAU', label: 'STUDIO' },
  WFH_01: { id: '1D4etPDj39H0kJMnoMBRDhmvRx1e_d1kDYW2ZfH_uzLQ', label: 'WFH-01'},
  WFH_02: { id: '1LuiWU_TMwaPk1UCABFwstPOgi3oYfc-vJeZqOvzj6FQ', label: 'WFH-02'},
  WFH_03: { id: '1Uvj_NTfirl1TwNQER9dabs6EMZqVCKPEZC-dj1IpKwc', label: 'WFH-03'},
  WFH_04: { id: '1BBqoeOAPJLt-9TrXXxm9TNjXJWW0inyy5gGZrIXTPaM', label: 'WFH-04'},
  WFH_05: { id: '1p0mTKtFrmRbSn_MInH7jCZYsX8Swy2PuP4Oa9yYFzmY', label: 'WFH-05'},
  WFH_06: { id: '1s6eNhaA80V_uVsb1LdBXt-Ziy74ZRfVtyr75B2BqWsU', label: 'WFH-06'},
  WFH_07: { id: '13EFbypyjNO3qTmg-MUAKJMrEEIN_bA2USaFcHk8BxbM', label: 'WFH-07'},
  WFH_08: { id: '1-Y2rdZ2FUd4w1MdC1c9ORGvqgIT_26rgLfehAb6BloQ', label: 'WFH-08'},
  WFH_09: { id: '1M-WGgTeejiZ6_SK_4Ytxn1xWREryM9wGWzBP1obTr9A', label: 'WFH-09'},
  WFH_10: { id: '13uyWVfmgCVWGgOZwvOJ_YVr31acczkJu55BjOl5GYd8', label: 'WFH-10'},
  WFH_11: { id: '1k8gFeLP9G8jszceMFgYnaYkI-L5KkrAiUaz1PZFMMVQ', label: 'WFH-11'}
};

// ================= NORMALIZE =================
function normalizeDate_(v) {
  if (!v) return '';
  const d = new Date(v);
  if (!isNaN(d)) {
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return '';
}

function normalizeTime_(v) {
  if (!v) return '';

  if (typeof v === 'number') {
    const totalMinutes = Math.round(v * 24 * 60);
    const h = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }

  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
  }

  return String(v);
}

function normalizeStudio_(s) {
  if (!s) return 'UNKNOWN';
  const v = String(s).toUpperCase();

  if (v.includes('STUDIO1')) return 'STUDIO1';
  if (v.includes('STUDIO2')) return 'STUDIO2';
  if (v.includes('STUDIO3')) return 'STUDIO3';
  if (v.includes('STUDIO4')) return 'STUDIO4';
  if (v.includes('STUDIO5')) return 'STUDIO5';
  if (v.includes('STUDIO6')) return 'STUDIO6';
  if (v.includes('STUDIOH')) return 'STUDIO_H';

  return 'UNKNOWN';
}

function toNumber(t) {
  if (!t) return 0;
  const [h,m] = t.split(':');
  return Number(h) + (Number(m) || 0)/60;
}

// ================= PARSE STUDIO =================
function parseSheet_(values, source, tab) {
  const out = [];
  const header = values[0];

  for (let i=1;i<values.length;i++) {
    const row = values[i];
    if (row.every(v=>!v)) continue;

    const obj = {};

    header.forEach((h,idx)=>{
      if (!h) return;

      let val = row[idx];
      const key = String(h).toLowerCase();

      if (key.includes('date')) {
        val = normalizeDate_(val);
      } else if (key.includes('start') || key.includes('end') || key.includes('time')) {
        val = normalizeTime_(val);
      }

      obj[h] = val;
    });

    obj['BRAND'] = obj['BRAND'] || obj['Brand'] || 'UNKNOWN';
    obj['คนไลฟ์'] = obj['คนไลฟ์'] || '-';
    obj['ห้องสตู'] = normalizeStudio_(obj['ห้องสตู']);

    const start = toNumber(obj['Start Time']);
    const end = toNumber(obj['End Time']);
    obj['Hours'] = Math.round((end - start) * 100) / 100;

    obj.source = source;
    obj.Tab = tab;

    out.push(obj);
  }

  return out;
}

// ================= PARSE WFH_09 =================
function parseWFH09_(values, source, tab) {
  const out = [];

  for (let i = 0; i < values.length; i++) {
    const row = values[i].map(v => String(v || '').trim());
    const joined = row.join(' ');

    const match = joined.match(/(\d{1,2}[-/]\d{1,2}[-/]\d{4}).*?(\d{1,2}:\d{2})/);
    if (!match) continue;

    const date = normalizeDate_(match[1]);
    const start = match[2];

    const name = row.find(v =>
      v && isNaN(v) && !v.match(/[:\-\/]/) && v.length < 20
    );
    if (!name) continue;

    const startNum = toNumber(start);
    const endNum = startNum + 2;

    out.push({
      Date: date,
      'Start Time': start,
      'End Time': `${Math.floor(endNum)%24}:00`,
      Hours: 2,
      'คนไลฟ์': name,
      BRAND: 'WFH',
      'ห้องสตู': 'WFH',
      source,
      Tab: tab
    });
  }

  return out;
}

// ================= GET ALL =================
function getAllRows_() {
  let output = [];

  Object.keys(SHEETS).forEach(key => {
    const ss = SpreadsheetApp.openById(SHEETS[key].id);

    ss.getSheets().forEach(sheet => {
      if (sheet.isSheetHidden()) return;

      const values = sheet.getDataRange().getValues();
      if (values.length < 2) return;

      let rows = [];

      if (key === 'WFH_09') {
        rows = parseWFH09_(values, key, sheet.getName());
      } else {
        rows = parseSheet_(values, key, sheet.getName());
      }

      output = output.concat(rows);
    });
  });

  return output;
}

// ================= CONFLICT =================
function detectConflicts_(rows) {

  const byRoom = {};
  const byPerson = {};

  rows.forEach(r => {
    const k1 = r.Date + '_' + r['ห้องสตู'];
    const k2 = r.Date + '_' + r['คนไลฟ์'];

    (byRoom[k1] = byRoom[k1] || []).push(r);
    (byPerson[k2] = byPerson[k2] || []).push(r);
  });

  Object.values(byRoom).forEach(list => {
    list.sort((a,b)=>toNumber(a['Start Time']) - toNumber(b['Start Time']));
    for (let i=0;i<list.length-1;i++) {
      if (toNumber(list[i]['End Time']) > toNumber(list[i+1]['Start Time'])) {
        list[i].conflict = 'ROOM';
        list[i+1].conflict = 'ROOM';
      }
    }
  });

  Object.values(byPerson).forEach(list => {
    list.sort((a,b)=>toNumber(a['Start Time']) - toNumber(b['Start Time']));
    for (let i=0;i<list.length-1;i++) {
      if (toNumber(list[i]['End Time']) > toNumber(list[i+1]['Start Time'])) {
        list[i].conflict = 'PERSON';
        list[i+1].conflict = 'PERSON';
      }
    }
  });

  return rows;
}

// ================= API =================
function doGet(e) {

  const action = e.parameter.action;

  if (action === 'getRows') {
    return ContentService.createTextOutput(
      JSON.stringify(getAllRows_())
    ).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'getConflicts') {
    const rows = getAllRows_();
    const result = detectConflicts_(rows);

    return ContentService.createTextOutput(
      JSON.stringify(result)
    ).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput(JSON.stringify({error:'invalid action'}))
    .setMimeType(ContentService.MimeType.JSON);
}