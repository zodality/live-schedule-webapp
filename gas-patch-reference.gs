/**
 * ========================================================================
 *  GAS BACKEND PATCH — getAllRows() เท่านั้น
 *  (Aggregate ทุก monthly tab ในทุก spreadsheet ของ SHEETS config)
 * ========================================================================
 *
 *  ⚠️ ไฟล์นี้คือ REFERENCE สำหรับ copy ไปวางใน Apps Script editor
 *     (script.google.com) — ไม่ใช่ไฟล์ frontend
 *
 *  สิ่งที่เปลี่ยน (จาก Code.gs เดิม):
 *    • `getAllRows()` (บรรทัด 38-53) — แทนที่ทั้งฟังก์ชันด้วย version ใหม่ด้านล่าง
 *
 *  สิ่งที่ "ไม่แตะ" (ตามคำสั่ง):
 *    • SHEETS config
 *    • doGet(e), doPost(e)
 *    • addNewRow(rowData)     ← ⚠️ มี bug แฝง (ลง tab แรกเสมอ) — flag ไว้ใน report
 *    • conflict logic stubs
 *
 *  Decision (จาก user):
 *    ✅ Skip hidden tabs        (sheet.isSheetHidden())
 *    ✅ Skip empty tabs         (values.length < 2 — header only)
 *    ✅ Skip blank rows         (ทุก cell ใน row ว่าง)
 *    ❌ ไม่ skip ตามชื่อ tab    (user ยืนยันว่า tab ทุกตัวที่ visible คือ data)
 *    ✅ เพิ่ม rowObj.Tab        (debug field — เก็บชื่อ tab ต้นทาง)
 *    ✅ คง rowObj.source = key  (frontend filter ใช้ field นี้)
 *
 *  วิธี deploy:
 *    1. เปิด Apps Script editor ของโปรเจกต์
 *    2. ในไฟล์ Code.gs — หา function `getAllRows()` (บรรทัด 38)
 *    3. แทนที่ทั้งฟังก์ชันด้วย version ด้านล่าง
 *    4. Save (Ctrl+S)
 *    5. Deploy → Manage deployments → Edit (icon ดินสอ) → Version: New version
 *       → Deploy (URL คงเดิม — ไม่ต้องแก้ frontend)
 * ========================================================================
 */


function getAllRows() {
  let output = [];

  Object.keys(SHEETS).forEach(key => {
    const ss = SpreadsheetApp.openById(SHEETS[key].id);

    // ⬇ เปลี่ยนจาก getSheets()[0] → loop ทุก sheet
    ss.getSheets().forEach(sheet => {
      const tabName = sheet.getName();

      // Skip hidden tabs
      if (sheet.isSheetHidden()) return;

      const values = sheet.getDataRange().getValues();

      // Skip empty / header-only tabs
      if (values.length < 2) return;

      const header = values[0];

      for (let i = 1; i < values.length; i++) {
        const rowValues = values[i];

        // Skip blank rows (ทุก cell ใน row ว่าง)
        const isBlank = rowValues.every(v => v === '' || v === null || v === undefined);
        if (isBlank) continue;

        let rowObj = {};
        header.forEach((h, idx) => {
          if (h !== '' && h !== null && h !== undefined) {
            rowObj[String(h).trim()] = rowValues[idx];
          }
        });

        rowObj.source = key;       // เดิม — frontend filter ใช้
        rowObj.Tab    = tabName;   // ใหม่ — debug origin
        output.push(rowObj);
      }
    });
  });

  return output;
}
