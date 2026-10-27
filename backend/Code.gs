/* Survey back end on Google Apps Script + Google Sheets.
   - doPost: receives one JSON record from the web survey, checks the respondent code, saves it.
   - doGet:  serves the admin dashboard (Admin.html) to Google accounts listed in the ADMINS property only.
   Script properties (Project Settings → Script properties):
     ADMINS    comma-separated Google e-mails allowed into the dashboard
     ACCEPT    "1" after the ethics committee approves; until then only test records (meta.test) are saved
     DELETE_BY date by which phone numbers must be deleted, e.g. 2570-06-30
     SHEET_ID  optional; leave empty when this script is bound to the spreadsheet */

var SHEETS = { responses: "คำตอบ", conjoint: "คู่ผู้สมัคร", contacts: "เบอร์ติดต่อ (ลบหลังสัมภาษณ์)", log: "บันทึกระบบ" };

function props_() { return PropertiesService.getScriptProperties(); }
function book_() { var id = props_().getProperty("SHEET_ID"); return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(name, header) {
  var b = book_(), s = b.getSheetByName(name);
  if (!s) { s = b.insertSheet(name); s.appendRow(header); s.setFrozenRows(1); s.getRange(1, 1, 1, header.length).setFontWeight("bold"); }
  return s;
}
function log_(what) { sheet_(SHEETS.log, ["เวลา", "ผู้ใช้", "รายการ"]).appendRow([new Date(), Session.getActiveUser().getEmail() || "-", what]); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function admins_() { return (props_().getProperty("ADMINS") || "").split(",").map(function (s) { return s.trim().toLowerCase(); }).filter(String); }
function isAdmin_() { var e = (Session.getActiveUser().getEmail() || "").toLowerCase(); return !!e && admins_().indexOf(e) >= 0; }
function guard_() { if (!isAdmin_()) throw new Error("บัญชีนี้ไม่มีสิทธิ์เข้าหลังบ้าน"); }

/** Run once from the editor: creates the sheets and adds you as the first admin. */
function setup() {
  sheet_(SHEETS.responses, ["code", "received", "test", "flag", "json"]);
  sheet_(SHEETS.conjoint, ["code", "test", "task", "pair", "item", "chosen_side", "chosen_name", "left_name", "right_name", "left_look", "right_look", "ms"]);
  sheet_(SHEETS.contacts, ["code", "phone", "best_time", "consented", "delete_by"]);
  sheet_(SHEETS.log, ["เวลา", "ผู้ใช้", "รายการ"]);
  var p = props_();
  if (!p.getProperty("ADMINS")) p.setProperty("ADMINS", Session.getEffectiveUser().getEmail());
  if (!p.getProperty("ACCEPT")) p.setProperty("ACCEPT", "0");
  if (!p.getProperty("DELETE_BY")) p.setProperty("DELETE_BY", "2570-06-30");
  log_("setup");
}

/* ---------------- collection ---------------- */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    var rec = JSON.parse(e.postData.contents);
    var isTest = !!(rec.meta && rec.meta.test);
    if (props_().getProperty("ACCEPT") !== "1" && !isTest) return out_({ ok: false, error: "ระบบยังไม่เปิดรับข้อมูลจริง" });

    var R = sheet_(SHEETS.responses, ["code", "received", "test", "flag", "json"]);
    var data = R.getDataRange().getValues(), header = data[0].map(String), ci = header.indexOf("code"), ji = header.indexOf("json");
    var codes = data.slice(1).map(function (r) { return String(r[ci]); });

    var code = String(rec.meta.code || "");
    if (/\?\?$/.test(code)) code = code.replace(/\?\?$/, nextOnlineSeq(codes, code.split("-")[1]));
    var errs = checkCode(code, LGUS, rec);
    if (errs.length) return out_({ ok: false, error: errs.join(" · ") });
    var key = codeKey(code);
    for (var i = 0; i < codes.length; i++) if (codeKey(codes[i]) === key) return out_({ ok: false, dup: true, next: nextFreeSeq(codes, key), error: "มีรหัสวันที่ ผู้เก็บ และชุดที่นี้อยู่แล้ว (" + codes[i] + ")" });
    rec.meta.code = code;

    // likely duplicate respondent (same birth year): compare with stored answers
    var others = [];
    data.slice(1).forEach(function (r) { try { var j = JSON.parse(r[ji]); if (j.answers && j.answers["1"] === rec.answers["1"]) others.push({ code: String(r[ci]), answers: j.answers }); } catch (x) {} });
    var dupOf = findLikelyDuplicate(rec, others);

    var contact = rec.contact; delete rec.contact;            // phone numbers never enter the responses sheet
    var flat = flattenRecord(rec);
    flat.received = new Date(); flat.flag = dupOf ? "อาจซ้ำกับ " + dupOf : "";
    flat.json = JSON.stringify({ answers: rec.answers, text: rec.text, ipc: rec.ipc });
    var row = rowForHeader(header, flat);
    if (header.length > data[0].length) R.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight("bold");
    R.appendRow(row);

    var C = sheet_(SHEETS.conjoint, ["code"]);
    (rec.conjoint || []).forEach(function (t) {
      var side = t.chosen === "L" ? t.left : t.chosen === "R" ? t.right : null;
      C.appendRow([code, isTest ? 1 : 0, t.task, t.pair, t.item || "", t.chosen || "", side ? side.name : "", t.left ? t.left.name : "", t.right ? t.right.name : "",
        JSON.stringify(t.left ? t.left.look : ""), JSON.stringify(t.right ? t.right.look : ""), t.ms || ""]);
    });

    if (contact && contact.phone) {
      sheet_(SHEETS.contacts, ["code", "phone", "best_time", "consented", "delete_by"])
        .appendRow([code, "'" + String(contact.phone).replace(/\D/g, ""), contact.time || "", new Date(), props_().getProperty("DELETE_BY") || ""]);
    }
    return out_({ ok: true, code: code, flag: flat.flag });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  } finally { lock.releaseLock(); }
}

/* ---------------- dashboard ---------------- */
function doGet() {
  if (!isAdmin_()) {
    var who = Session.getActiveUser().getEmail();
    return HtmlService.createHtmlOutput('<meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:sans-serif;max-width:520px;margin:15vh auto;padding:0 16px;line-height:1.7"><h2>ไม่มีสิทธิ์เข้าหลังบ้าน</h2><p>' +
      (who ? "บัญชี " + who + " ยังไม่อยู่ในรายชื่อผู้ดูแล ติดต่อผู้วิจัยเพื่อขอสิทธิ์" : "กรุณาเข้าผ่านลิงก์หลังบ้าน (ต้องเข้าสู่ระบบด้วยบัญชี Google)") + "</p></div>").setTitle("ไม่มีสิทธิ์");
  }
  return HtmlService.createTemplateFromFile("Admin").evaluate().setTitle("หลังบ้าน · แบบสอบถามบุรีรัมย์")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function apiData() {
  guard_();
  var R = sheet_(SHEETS.responses, ["code", "received", "test", "flag", "json"]);
  var v = R.getDataRange().getValues(), h = v[0].map(String);
  var col = function (n) { return h.indexOf(n); };
  var c = { code: col("code"), rec: col("received"), test: col("test"), flag: col("flag"), sex: col("q2"), d: col("q3_district"), t: col("q3_tambon"), mode: col("mode"), P: col("ipc_P"), I: col("ipc_I"), C: col("ipc_C"), q75: col("q75") };
  var rows = v.slice(1).map(function (r) {
    var g = function (k) { return c[k] >= 0 ? r[c[k]] : ""; };
    return { code: String(g("code")), received: g("rec") ? new Date(g("rec")).toISOString() : "", test: +g("test") === 1, flag: g("flag"), sex: +g("sex") || 0, district: g("d"), tambon: g("t"),
      mode: g("mode"), P: g("P"), I: g("I"), C: g("C"), phase2: +g("q75") === 1 };
  });
  var K = sheet_(SHEETS.contacts, ["code", "phone", "best_time", "consented", "delete_by"]).getLastRow() - 1;
  return { rows: rows, lgus: LGUS, district: DISTRICT_TARGET, contacts: Math.max(0, K), accept: props_().getProperty("ACCEPT") === "1",
    deleteBy: props_().getProperty("DELETE_BY") || "", sheetUrl: book_().getUrl(), me: Session.getActiveUser().getEmail() };
}

function apiDetail(code) {
  guard_();
  var v = sheet_(SHEETS.responses, ["code"]).getDataRange().getValues(), h = v[0].map(String), ci = h.indexOf("code"), ji = h.indexOf("json");
  for (var i = 1; i < v.length; i++) if (String(v[i][ci]) === code) return v[i][ji];
  return null;
}

function apiContacts() {
  guard_();
  var v = sheet_(SHEETS.contacts, ["code", "phone", "best_time", "consented", "delete_by"]).getDataRange().getValues();
  log_("เปิดดูรายชื่อเบอร์ติดต่อ");
  return v.slice(1).map(function (r) { return { code: String(r[0]), phone: String(r[1]), time: String(r[2] || ""), consented: r[3] ? new Date(r[3]).toISOString() : "", deleteBy: String(r[4] || "") }; });
}

function apiDeleteContacts(confirmText) {
  guard_();
  if (confirmText !== "ลบเบอร์ทั้งหมด") throw new Error("พิมพ์ข้อความยืนยันไม่ตรง");
  var K = sheet_(SHEETS.contacts, ["code"]); var n = K.getLastRow() - 1;
  if (n > 0) K.deleteRows(2, n);
  log_("ลบเบอร์ติดต่อทั้งหมด " + n + " รายการ");
  return n;
}

/** Fake records for testing the pipeline before EC approval. They carry test = 1. */
function apiSeedTest(n) {
  guard_();
  n = Math.min(+n || 20, 100);
  var R = sheet_(SHEETS.responses, ["code"]);
  var used = R.getDataRange().getValues().slice(1).map(function (r) { return String(r[0]); });
  var made = 0, today = new Date(), dd = ("0" + today.getDate()).slice(-2) + ("0" + (today.getMonth() + 1)).slice(-2), BE = today.getFullYear() + 543;
  for (var i = 0; i < n * 3 && made < n; i++) {
    var L = LGUS[Math.floor(Math.random() * LGUS.length)], y = BE - (18 + Math.floor(Math.random() * 60)), gen = genFromAge(BE - y);
    var enumr = 1 + Math.floor(Math.random() * 4), seq = ("0" + (1 + Math.floor(Math.random() * 40))).slice(-2);
    var code = gen + L.code + "-" + dd + "-" + enumr + seq;
    if (used.some(function (c) { return codeKey(c) === codeKey(code); })) continue;
    used.push(code);
    var ans = { "1": y, "2": 1 + Math.floor(Math.random() * 2), "3": { a: L.d, t: L.t[0] }, "4": L.n, "5": 1, "75": Math.random() < .3 ? 1 : 2 };
    var ipc = { I: 10 + Math.floor(Math.random() * 30), P: 5 + Math.floor(Math.random() * 35), C: 5 + Math.floor(Math.random() * 35), complete: true };
    var rec = { meta: { code: code, test: true, mode: 1, venue: 1, enumerator: enumr, collectedBE: BE, started: today.toISOString(), finished: today.toISOString() }, answers: ans, text: {}, ipc: ipc, conjoint: [] };
    if (ans["75"] === 1) rec.contact = { phone: "08" + Math.floor(10000000 + Math.random() * 89999999), time: "เย็น" };
    var res = JSON.parse(doPost({ postData: { contents: JSON.stringify(rec) } }).getContent());
    if (res.ok) made++;
  }
  log_("สร้างข้อมูลทดสอบ " + made + " ชุด");
  return made;
}

function apiClearTest() {
  guard_();
  var n = 0;
  [SHEETS.responses, SHEETS.conjoint].forEach(function (name) {
    var s = sheet_(name, ["code"]), v = s.getDataRange().getValues(), ti = v[0].map(String).indexOf("test");
    for (var i = v.length - 1; i >= 1; i--) if (+v[i][ti] === 1) { s.deleteRow(i + 1); if (name === SHEETS.responses) n++; }
  });
  // test phones: codes no longer in responses
  var keep = sheet_(SHEETS.responses, ["code"]).getDataRange().getValues().slice(1).map(function (r) { return String(r[0]); });
  var K = sheet_(SHEETS.contacts, ["code"]), kv = K.getDataRange().getValues();
  for (var j = kv.length - 1; j >= 1; j--) if (keep.indexOf(String(kv[j][0])) < 0) K.deleteRow(j + 1);
  log_("ลบข้อมูลทดสอบ " + n + " ชุด");
  return n;
}
