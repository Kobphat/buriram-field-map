/* Web survey (IOC v1.5). Demo mode saves nothing; live mode posts one JSON record to CONFIG.endpoint after EC approval.
   Knowledge items 25–28 carry no answer key in this file on purpose: scoring happens only in analysis. */
(function () {
  "use strict";
  const CONFIG = window.SURVEY_CONFIG || { live: false, endpoint: "" };
  const DEMO = !CONFIG.live;                 // demo: nothing leaves the browser
  const TESTRUN = !!CONFIG.test;             // live + test: records are saved but marked test = 1
  const store = {
    get(k, d) { try { const v = localStorage.getItem("bfm." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("bfm." + k, JSON.stringify(v)); } catch (e) {} },
  };
  const S = window.SURVEY;
  // a one-time QR from a collector: ?q=<invite>. The respondent answers on their own phone; the code carries that collector's number.
  const INV = new URLSearchParams(location.search).get("q");
  let invInfo = null;          // {enumerator, venue} once checked
  const PARTS = S.parts;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const app = $("#app");
  const R = Math.random;
  const pick = (a) => a[Math.floor(R() * a.length)];
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const st = {
    screen: "intro", part: 0, ans: {}, txt: {}, warned: {},
    meta: { id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12), version: R() < .5 ? "A" : "B", order: R() < .5 ? 1 : 2, design: "fixed", mode: null, venue: null, started: null, enumerator: null, collector: null, cdate: null, code: null },
    cj: { stage: "intro", i: 0, tasks: null, fails: 0, follow: {} },
  };

  /* ---------- respondent code: Gen + LGU + DDMM + enumerator + set, e.g. ZT05-1501-103 ---------- */
  const LGU_CODE = Object.fromEntries(S.lgus.map(l => [l.n, l.code]));
  const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const beYear = iso => +iso.slice(0, 4) + 543;
  const ddmmOf = iso => iso.slice(8, 10) + iso.slice(5, 7);
  const genFromAge = a => a <= 29 ? "Z" : a <= 45 ? "Y" : a <= 61 ? "X" : "B";
  /** Preview of the code in demo mode only. With the back end connected, the server issues the code when the form arrives. */
  function makeCode() {
    const iso = st.meta.cdate || todayISO(), y = st.ans["1"];
    const gen = y ? genFromAge(beYear(iso) - y) : "Z";
    let lc = LGU_CODE[st.ans["4"]];
    if (!lc) { const d = st.ans["3"] || {}; const L = S.lgus.filter(l => l.d === d.a && d.t && l.t.includes(d.t)); lc = L.length === 1 ? L[0].code : "U00"; }
    const online = st.meta.mode === 2;            // mode 3 (QR) uses the collector's own number
    return `${gen}${lc}-${ddmmOf(iso)}-${online ? "9" : (st.meta.enumerator || 1)}${online ? "01" : "01"}`;
  }
  const refOf = (id = st.meta.id) => String(id).replace(/-/g, "").slice(0, 8).toUpperCase();
  const validPhone = p => /^0\d{8,9}$/.test(String(p || "").replace(/\D/g, ""));

  /* ---------- helpers for item text ---------- */
  const optText = t => t.replace(/\s*_{2,}\s*/g, "").trim();
  function issueText() {
    const c = st.ans["16"];
    if (!c) return "ปัญหาที่ท่านเลือกไว้ในข้อ 16";
    if (c === 12) return (st.txt["16"] || "").trim() || "เรื่องที่ท่านระบุ";
    return PARTS[2].items.find(i => i.n === "16").o.find(o => o.c === c).t;
  }
  const otherIssue = () => st.ans["16"] === 4 ? "การดูแลผู้สูงอายุและเบี้ยยังชีพ" : "ถนน ไฟฟ้า น้ำประปา";
  const fill = s => s.replace(/“เรื่องของท่าน”(\s*ที่เลือกไว้ในข้อ 16)?/g, `“${issueText()}”`).replace(/“เรื่องอื่น”/g, `“${otherIssue()}”`);

  /* ---------- progress ---------- */
  const STEPS = ["พื้นฐาน", "เศรษฐกิจ", "การเมือง", "ผู้สมัคร", "ความเสี่ยง", "ความเชื่อ", "ชุมชน"];
  function progress() {
    const cur = st.screen === "part" ? st.part : st.screen === "done" ? 7 : -1;
    return `<ol class="steps" aria-label="ความคืบหน้า">${STEPS.map((s, i) =>
      `<li class="${i < cur ? "done" : i === cur ? "now" : ""}" ${i === cur ? 'aria-current="step"' : ""}><b class="num">${i + 1}</b><span>${s}</span></li>`).join("")}</ol>`;
  }

  /* ---------- item renderers ---------- */
  function opts(it, kind) {
    const name = "q_" + it.n;
    return it.o.map(o => `<label class="opt${o.g ? " g" : ""}"><input type="${kind}" name="${name}" value="${o.c}" ${chk(it, o.c)}><span class="box" aria-hidden="true"></span><span class="ot">${o.g ? `<small>${esc(o.g)}</small>` : ""}${esc(optText(o.t))}</span></label>`).join("");
  }
  function chk(it, c) {
    const v = st.ans[it.n];
    return (Array.isArray(v) ? v.includes(c) : v === c) ? "checked" : "";
  }
  function otherBox(it) {
    if (!it.other) return "";
    const show = st.ans[it.n] === it.other;
    return `<input class="txt other" data-txt="${it.n}" placeholder="โปรดระบุ" value="${esc(st.txt[it.n] || "")}" ${show ? "" : "hidden"}>`;
  }
  function body(it) {
    switch (it.type) {
      case "radio":
        if (it.cards) return `<div class="moneycards">${it.o.map((o, k) => `<label class="mcard"><input type="radio" name="q_${it.n}" value="${o.c}" ${chk(it, o.c)}><span class="mc-ico" aria-hidden="true">${bagIcon(it.n, k)}</span><span class="mc-t">${esc(o.t)}</span></label>`).join("")}</div>`;
        return `<div class="opts${it.o.length <= 3 && it.o.every(o => o.t.length < 14) ? " row" : ""}">${opts(it, "radio")}</div>${otherBox(it)}`;
      case "scale":
        return `<div class="scale" role="radiogroup">${it.o.map(o => `<label class="sc"><input type="radio" name="q_${it.n}" value="${o.c}" ${chk(it, o.c)}><b class="num">${o.c}</b><span>${esc(o.t)}</span></label>`).join("")}</div>`;
      case "check":
        return `<div class="opts">${opts(it, "checkbox")}</div>`;
      case "year": {
        const v = st.ans["1"] || "";
        return `<div class="inrow"><span class="pre">พ.ศ.</span><input class="txt short num" type="number" inputmode="numeric" name="q_1" min="2460" max="2569" placeholder="เช่น 2530" value="${v}"></div><p class="live small muted" id="agefb">${ageMsg(v)}</p>`;
      }
      case "num": {
        const v = st.ans[it.n];
        const isOpt = typeof v === "string";
        return `<div class="inrow"><input class="txt short num" type="number" inputmode="numeric" name="q_${it.n}" min="${it.min}" max="${it.max}" value="${!isOpt && v != null ? v : ""}" ${isOpt ? "disabled" : ""}><span class="post">${it.unitLabel}</span></div>` +
          (it.optOut ? `<div class="opts row slim">${it.optOut.map(o => `<label class="opt"><input type="checkbox" name="oo_${it.n}" value="${o}" ${v === o ? "checked" : ""}><span class="box" aria-hidden="true"></span><span class="ot">${o}</span></label>`).join("")}</div>` : "");
      }
      case "residence": {
        const d = st.ans["3"] || {};
        const ds = ["เมืองบุรีรัมย์", "สตึก", "บ้านด่าน", "แคนดง"];
        const tb = d.a ? S.tambons.filter(t => t.a === d.a) : [];
        return `<div class="opts row">${ds.map((x, k) => `<label class="opt"><input type="radio" name="res_a" value="${x}" ${d.a === x ? "checked" : ""}><span class="box" aria-hidden="true"></span><span class="ot">อ.${x}</span></label>`).join("")}</div>
          <div class="grid2">
            <label class="fld"><span>ตำบล</span><select name="res_t" ${d.a ? "" : "disabled"}><option value="">${d.a ? "เลือกตำบล" : "เลือกอำเภอก่อน"}</option>${tb.map(t => `<option ${d.t === t.t ? "selected" : ""}>${t.t}</option>`).join("")}</select></label>
            <label class="fld"><span>หมู่ที่หรือชื่อชุมชน <em>(ไม่บังคับ)</em></span><input class="txt" name="res_m" value="${esc(d.m || "")}"></label>
          </div>`;
      }
      case "lgu": {
        const d = st.ans["3"] || {};
        let L = S.lgus.filter(l => l.d === d.a && (!d.t || l.t.includes(d.t)));
        if (!d.a) return `<p class="muted small">เลือกอำเภอและตำบลในข้อ 3 ก่อน</p>`;
        const v = st.ans["4"];
        const kind = { nk: "เทศบาลนคร", mg: "เทศบาลเมือง", tb: "เทศบาลตำบล", ao: "อบต." };
        const nm = n => n.replace(/^ทน\.|^ทม\.|^ทต\.|^อบต\./, "");
        return `<div class="opts">${L.map(l => `<label class="opt"><input type="radio" name="q_4" value="${l.n}" ${v === l.n ? "checked" : ""}><span class="box" aria-hidden="true"></span><span class="ot">${kind[l.k]}${nm(l.n)}</span></label>`).join("")}
          <label class="opt"><input type="radio" name="q_4" value="unsure" ${v === "unsure" ? "checked" : ""}><span class="box" aria-hidden="true"></span><span class="ot">ไม่แน่ใจ</span></label></div>
          ${d.t && L.length > 1 ? `<p class="small muted">ตำบล${d.t}มี 2 อปท. ดูแลคนละพื้นที่ เลือกตามที่ท่านมีสิทธิเลือกตั้ง</p>` : ""}`;
      }
      case "occ": {
        const main = it.o.filter(o => !o.g), not = it.o.filter(o => o.g);
        return `<label class="fld"><span>ชื่ออาชีพหรือตำแหน่ง และงานที่ทำจริง <em>(ไม่บังคับ)</em></span><input class="txt" data-txt="7ก" value="${esc(st.txt["7ก"] || "")}" placeholder="เช่น ทำนา ขายของในตลาด"></label>
          <p class="sub">หมวดอาชีพ</p><div class="opts">${main.map(o => `<label class="opt"><input type="radio" name="q_7ก" value="${o.c}" ${chk(it, o.c)}><span class="box" aria-hidden="true"></span><span class="ot">${esc(o.t)}</span></label>`).join("")}</div>
          <p class="sub">ไม่ได้ทำงาน</p><div class="opts">${not.map(o => `<label class="opt"><input type="radio" name="q_7ก" value="${o.c}" ${chk(it, o.c)}><span class="box" aria-hidden="true"></span><span class="ot">${esc(o.t)}</span></label>`).join("")}</div>`;
      }
      case "phase2": {
        const v = st.ans["75"], c = st.contact || {};
        return `<div class="opts row">${it.o.map(o => `<label class="opt"><input type="radio" name="q_75" value="${o.c}" ${v === o.c ? "checked" : ""}><span class="box" aria-hidden="true"></span><span class="ot">${o.t}</span></label>`).join("")}</div>
          <div class="grid2" id="phonebox" ${v === 1 ? "" : "hidden"}>
            <label class="fld"><span>เบอร์โทรศัพท์</span><input class="txt num" type="tel" inputmode="tel" autocomplete="off" name="ph" value="${esc(c.phone || "")}" placeholder="08x-xxx-xxxx"></label>
            <label class="fld"><span>ช่วงเวลาที่สะดวกให้โทร <em>(ไม่บังคับ)</em></span><select name="pht"><option value="">ไม่ระบุ</option>${["เช้า", "บ่าย", "เย็น", "เสาร์–อาทิตย์"].map(t => `<option ${c.time === t ? "selected" : ""}>${t}</option>`).join("")}</select></label>
          </div>`;
      }
      case "ipc": {
        const L = [[-3, "ไม่เห็นด้วยอย่างยิ่ง"], [-2, "ไม่เห็นด้วย"], [-1, "ไม่เห็นด้วยเล็กน้อย"], [1, "เห็นด้วยเล็กน้อย"], [2, "เห็นด้วย"], [3, "เห็นด้วยอย่างยิ่ง"]];
        return `<div class="ipc" role="radiogroup">${L.map(([c, t]) => `<label class="ip${c < 0 ? " neg" : " pos"}"><input type="radio" name="q_${it.n}" value="${c}" ${st.ans[it.n] === c ? "checked" : ""}><b class="num">${c > 0 ? "+" + c : "−" + (-c)}</b><span>${t}</span></label>`).join("")}</div>`;
      }
    }
    return "";
  }
  function bagIcon(n, k) {
    if (n === "41") return k === 0
      ? `<svg viewBox="0 0 48 48"><path d="M17 12 L31 12 L27 18 L21 18 Z" fill="currentColor" opacity=".6"/><path d="M21 18 C9 24 8 42 24 42 C40 42 39 24 27 18 Z" fill="currentColor"/><text x="24" y="35" text-anchor="middle" font-size="10" fill="var(--surface)" font-family="IBM Plex Mono">100%</text></svg>`
      : `<svg viewBox="0 0 48 48"><path d="M17 12 L31 12 L27 18 L21 18 Z" fill="currentColor" opacity=".6"/><path d="M21 18 C9 24 8 42 24 42 C40 42 39 24 27 18 Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-dasharray="5 4"/><text x="24" y="35" text-anchor="middle" font-size="10" fill="currentColor" font-family="IBM Plex Mono">50%</text></svg>`;
    return k === 0
      ? `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="16" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M24 14 V24 L31 28" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"/></svg>`
      : `<svg viewBox="0 0 48 48"><rect x="9" y="12" width="30" height="27" rx="4" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M9 20 H39 M17 8 V15 M31 8 V15" stroke="currentColor" stroke-width="2.4"/><text x="24" y="34" text-anchor="middle" font-size="10" fill="currentColor" font-family="IBM Plex Mono">+1y</text></svg>`;
  }
  function ageMsg(v) {
    v = +v;
    if (!v) return "";
    if (v > 2551) return `<span class="bad">ยังไม่มีสิทธิเลือกตั้งในวันที่ 8 ก.พ. 2569 (ไม่อยู่ในเกณฑ์)</span>`;
    if (v < 2440) return `<span class="bad">ตรวจปีเกิดอีกครั้ง (ใส่เป็นปี พ.ศ.)</span>`;
    return `อายุประมาณ <b class="num">${2569 - v}</b> ปี${v === 2551 ? " · ต้องเกิดในหรือก่อน 8 ก.พ. 2551" : ""}`;
  }

  function itemHTML(it, prev) {
    let pre = "";
    if (it.know && (!prev || !prev.know)) pre = `<div class="notice acc know"><b>${esc(it.lead.replace(/\s*\(.*\)$/, ""))}</b><br><span class="small">บางข้อถูก บางข้อไม่ถูก ถ้าไม่แน่ใจตอบว่าไม่ทราบได้ ไม่ใช่การสอบ และระบบจะไม่แสดงเฉลย</span></div>`;
    if (PARTS[5].items[0] === it) pre = `<div class="notice acc"><b>ไม่มีคำตอบถูกหรือผิด</b><br><span class="small">ขอให้บอกว่าเห็นด้วยหรือไม่เห็นด้วยกับแต่ละข้อมากน้อยเพียงใด ไม่มีตัวเลือกตรงกลาง</span></div>`;
    const badge = it.ecOnly ? `<span class="chip warn"><i></i>ใช้ได้เมื่อ EC อนุมัติแล้วเท่านั้น</span>` : "";
    const hint = it.hint ? `<p class="hint">${esc(it.hint)}</p>` : "";
    const q = esc(it.q).replace(/\(ตอบได้มากกว่า 1 ข้อ\)/, '<span class="tag">ตอบได้หลายข้อ</span>').replace(/\(เลือก 1 ข้อ\)/, '<span class="tag">เลือก 1 ข้อ</span>');
    return `${pre}<fieldset class="q t-${it.type}" id="q-${it.n}" data-n="${it.n}"><legend class="qh"><span class="qn num">${it.n}</span><span class="qt">${q} ${badge}</span></legend>${hint}<div class="qa">${body(it)}</div></fieldset>`;
  }

  /* ---------- validation ---------- */
  function answered(it) {
    const v = st.ans[it.n];
    if (it.type === "residence") return !!(v && v.a && v.t);
    if (it.type === "check") return Array.isArray(v) && v.length > 0;
    if (it.type === "year") return !!v;
    if (it.type === "phase2") return v === 2 || (v === 1 && validPhone(st.contact && st.contact.phone));
    return v !== undefined && v !== null && v !== "";
  }

  /* ---------- screens ---------- */
  function render() {
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    if (st.screen === "intro") return renderIntro();
    if (st.screen === "out") return renderOut();
    if (st.screen === "done") return renderDone();
    if (st.part === 3) return renderConjoint();
    renderPart();
  }

  function renderIntro() {
    app.innerHTML = `
    <section class="panel intro">
      <h2>ก่อนเริ่ม</h2>
      <div class="infogrid">
        <div><b>งานวิจัยนี้ศึกษาอะไร</b><p>วิธีที่ผู้มีสิทธิเลือกตั้งในบุรีรัมย์ชั่งน้ำหนักระหว่างผู้สมัครที่ช่วยเหลือเป็นรายครัวเรือน กับผู้สมัครที่เสนอนโยบาย และความเชื่อของแต่ละคนว่าชีวิตถูกกำหนดโดยอะไร</p></div>
        <div><b>ท่านจะต้องทำอะไร</b><p>ตอบคำถาม 7 ส่วน รวมการเลือกผู้สมัครสมมติ 7 คู่ ใช้เวลาประมาณ 30 นาที</p></div>
        <div><b>สิทธิของท่าน</b><p>ไม่ต้องบอกชื่อ ข้ามข้อที่ไม่สบายใจได้ และหยุดได้ทุกเมื่อ แบบสอบถามนี้ไม่ถามว่าท่านเลือกผู้สมัครหรือพรรคใด</p></div>
        <div><b>ข้อมูลของท่าน</b><p>ใช้วิเคราะห์ในภาพรวมเท่านั้น ไม่นำเสนอรายบุคคลหรือรายหมู่บ้าน</p></div>
      </div>
      ${DEMO ? `<div class="notice"><b>โหมดตัวอย่าง:</b> หน้านี้ใช้ดูและทดลองแบบสอบถามเท่านั้น ระบบไม่ส่งหรือบันทึกคำตอบใด ๆ การเก็บข้อมูลจริงจะเปิดหลังคณะกรรมการจริยธรรมการวิจัยในมนุษย์ (EC) อนุมัติ</div>` : ""}
      ${INV ? `<div class="notice acc" id="invbox">กำลังตรวจ QR…</div>` : ""}
      <div class="admin" ${INV ? `style="display:none"` : ""}>
        <fieldset class="q"><legend class="qh"><span class="qt">วิธีตอบ</span></legend><div class="opts row">
          ${[[1, "ผู้เก็บข้อมูลอ่านให้ฟัง"], [0, "คีย์จากฟอร์มกระดาษ (ผู้ตอบกรอกเอง)"], [2, "ตอบเองออนไลน์"]].map(([c, t]) => `<label class="opt"><input type="radio" name="mode" value="${c}" ${st.meta.mode === c ? "checked" : ""}><span class="box"></span><span class="ot">${t}</span></label>`).join("")}</div></fieldset>
        <fieldset class="q" id="venue-q" ${st.meta.mode === 2 ? "hidden" : ""}><legend class="qh"><span class="qt">สถานที่พบผู้ตอบ <em class="muted">(ผู้เก็บข้อมูลเลือก)</em></span></legend><div class="opts row">
          ${[[1, "ตลาดหรือจุดที่คนพลุกพล่าน"], [2, "จุดรวมตัวของชุมชน (สภากาแฟ)"], [3, "เยี่ยมครัวเรือน"]].map(([c, t]) => `<label class="opt"><input type="radio" name="venue" value="${c}" ${st.meta.venue === c ? "checked" : ""}><span class="box"></span><span class="ot">${t}</span></label>`).join("")}</div></fieldset>

        <fieldset class="q" id="enum-q" ${st.meta.mode === 2 || st.meta.mode == null ? "hidden" : ""}><legend class="qh"><span class="qt">ผู้เก็บข้อมูล <em class="muted">(ต้องเข้าสู่ระบบ ระบบออกรหัสผู้ตอบให้ตอนส่ง)</em></span></legend>
          <div id="who"></div>
        </fieldset>
      </div>
      ${!INV && !DEMO && !TESTRUN && store.get("done", false) ? `<div class="notice">เครื่องนี้เคยส่งคำตอบแบบตอบเองออนไลน์ไปแล้ว ถ้าเป็นผู้ตอบคนใหม่ ให้ผู้เก็บข้อมูลเลือก “ผู้เก็บข้อมูลอ่านให้ฟัง” หรือใช้อีกเครื่อง</div>` : ""}
      <p class="consent">การกด “เริ่มตอบ” ถือว่าท่านยินยอมเข้าร่วมการวิจัย (ความยินยอมโดยการกระทำ)</p>
      <div class="nav"><span></span><button class="btn primary" id="start">เริ่มตอบ</button></div>
    </section>`;
    app.onchange = e => {
      const t = e.target;
      if (t.name === "mode") { st.meta.mode = +t.value; $("#venue-q").hidden = st.meta.mode === 2; $("#enum-q").hidden = st.meta.mode === 2; if (st.meta.mode === 2) st.meta.venue = 4; else if (st.meta.venue === 4) st.meta.venue = null; renderWho(); }
      if (t.name === "venue") st.meta.venue = +t.value;
      if (t.name === "cdate") st.meta.cdate = t.value;
    };
    renderWho();
    if (INV) checkInvite();
    $("#start").onclick = () => {
      if (INV) {
        if (!invInfo) { toast("QR นี้ใช้ไม่ได้ ขอ QR ใหม่จากผู้เก็บข้อมูล"); return; }
        st.meta.mode = 3; st.meta.venue = invInfo.venue || null; st.meta.enumerator = invInfo.enumerator; st.meta.cdate = todayISO();
        st.meta.started = new Date().toISOString(); st.t0 = performance.now(); st.screen = "part"; st.part = 0; return render();
      }
      if (st.meta.mode == null) st.meta.mode = 2, st.meta.venue = 4;
      if (st.meta.mode !== 2) {
        const se = Auth.get();
        if (!se || se.user.mustChange) { toast("ผู้เก็บข้อมูลต้องเข้าสู่ระบบก่อนเริ่ม"); $("#who").scrollIntoView({ block: "center" }); return; }
        if (!se.user.enumerator) { toast("บัญชีนี้ยังไม่มีเลขผู้เก็บข้อมูล ติดต่อผู้วิจัย"); return; }
        if (st.meta.venue == null) { toast("เลือกสถานที่พบผู้ตอบก่อนเริ่ม"); return; }
        st.meta.enumerator = se.user.enumerator; st.meta.collector = se.user.username; st.meta.cdate = st.meta.cdate || todayISO();
      } else st.meta.cdate = todayISO();
      st.meta.started = new Date().toISOString(); st.t0 = performance.now();
      st.screen = "part"; st.part = 0; render();
    };
  }

  async function checkInvite() {
    const box = $("#invbox"), go = $("#start");
    const done = store.get("inv.done", []).includes(INV.slice(-24));
    if (done) { box.className = "notice"; box.innerHTML = "เครื่องนี้ส่งคำตอบจาก QR นี้ไปแล้ว ขอบคุณครับ ถ้าเป็นผู้ตอบคนใหม่ ขอ QR ใหม่จากผู้เก็บข้อมูล"; go.disabled = true; return; }
    if (INV === "demo" || DEMO) { invInfo = { enumerator: 1, venue: 1 }; }
    else {
      const j = await Auth.api("checkInvite", { invite: INV });
      if (!j.ok) { box.className = "notice"; box.innerHTML = `<b>QR นี้ใช้ไม่ได้</b> ${esc(j.error || "")}`; go.disabled = true; return; }
      invInfo = { enumerator: j.enumerator, venue: j.venue };
    }
    box.innerHTML = `<b>แบบสอบถามนี้ส่งมาจากผู้เก็บข้อมูลเลข ${invInfo.enumerator}</b><br><span class="small">ท่านตอบบนโทรศัพท์ของท่านเองได้เลย ไม่ต้องเข้าสู่ระบบ ใช้เวลาราว 30 นาที ปิดแล้วกลับมาตอบต่อจาก QR เดิมได้ภายใน 7 วัน (เริ่มใหม่ตั้งแต่ต้น)</span>${INV === "demo" || DEMO ? `<br><span class="small">โหมดตัวอย่าง: QR สาธิต ไม่บันทึกคำตอบ</span>` : ""}`;
    chips();
  }

  /* ---------- collector: QR for a respondent who wants to answer on their own phone ----------
     Each QR works for one respondent, for 7 days. A few are fetched at once so the next one shows even when the signal drops. */
  const invKey = () => "inv.stash." + ((Auth.get() || {}).user || {}).username;
  async function nextInvite(venue) {
    const se = Auth.get();
    if (DEMO || !se || se.demo) return { t: "demo", demo: true };
    let stash = store.get(invKey(), []).filter(x => x.exp > Date.now() + 864e5 && x.venue === venue);
    if (!stash.length) {
      const j = await Auth.api("invite", { venue, n: 5 });
      if (!j.ok) throw new Error(j.error || "สร้าง QR ไม่สำเร็จ");
      stash = j.invites.map(t => ({ t, venue, exp: Date.now() + j.days * 864e5 }));
    }
    const it = stash.shift(); store.set(invKey(), stash); return it;
  }
  async function showQR() {
    if (st.meta.venue == null || st.meta.venue === 4) { toast("เลือกสถานที่พบผู้ตอบก่อนสร้าง QR"); $("#venue-q").scrollIntoView({ block: "center" }); return; }
    let dlg = $("#qrdlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "qrdlg"; dlg.className = "qrdlg"; document.body.appendChild(dlg); }
    dlg.innerHTML = `<div class="qr-in"><p class="small muted">กำลังสร้าง QR…</p></div>`; dlg.showModal();
    let it;
    try { it = await nextInvite(st.meta.venue); } catch (e) { dlg.innerHTML = `<div class="qr-in"><p class="notice">${esc(e.message)}</p><button class="btn" id="qrx">ปิด</button></div>`; $("#qrx").onclick = () => dlg.close(); return; }
    const url = location.origin + location.pathname + "?q=" + encodeURIComponent(it.t);
    const qr = qrcode(0, "M"); qr.addData(url); qr.make();
    const se = Auth.get(), V = { 1: "ตลาดหรือจุดที่คนพลุกพล่าน", 2: "จุดรวมตัวของชุมชน", 3: "เยี่ยมครัวเรือน" };
    dlg.innerHTML = `<div class="qr-in">
      <h3>ให้ผู้ตอบสแกนด้วยโทรศัพท์ของตัวเอง</h3>
      <div class="qr-img">${qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true })}</div>
      <p class="small">ใช้ได้ <b>1 คน</b> ภายใน 7 วัน · ผู้เก็บเลข ${se ? se.user.enumerator : 1} · ${V[st.meta.venue]}</p>
      <p class="small muted">ให้ QR หลังอธิบายโครงการและผู้ตอบยินยอมแล้วเท่านั้น รหัสผู้ตอบจะออกเมื่อเขาส่งคำตอบ และขึ้นในหน้า “เข้าสู่ระบบ” ของคุณ${it.demo ? " · โหมดตัวอย่าง: QR สาธิต" : ""}</p>
      <div class="qr-btns"><button class="btn" id="qrcopy">คัดลอกลิงก์ (ส่งทาง LINE)</button><button class="btn primary" id="qrnext">QR ใบถัดไป</button><button class="btn ghost" id="qrx">ปิด</button></div></div>`;
    $("#qrx").onclick = () => dlg.close();
    $("#qrnext").onclick = () => showQR();
    $("#qrcopy").onclick = async e => { try { await navigator.clipboard.writeText(url); e.target.textContent = "คัดลอกแล้ว"; } catch (x) { prompt("คัดลอกลิงก์นี้", url); } };
  }

  /* ---------- enumerator sign-in inside the intro ---------- */
  function renderWho() {
    const el = $("#who"); if (!el || st.meta.mode === 2 || st.meta.mode == null) return;
    const se = Auth.get();
    if (!se || se.user.mustChange) {
      Auth.form(el, { lead: "ใช้ชื่อผู้ใช้ที่ผู้วิจัยสร้างให้ เลขผู้เก็บข้อมูลผูกกับบัญชี ไม่ต้องเลือกเอง", onDone: () => { renderWho(); chips(); flush(); },
        demo: { label: "ทดลองด้วยบัญชีสาธิต (ผู้เก็บเลข 1)", user: { username: "demo", name: "ผู้เก็บสาธิต", role: "enumerator", enumerator: 1 } } });
      return;
    }
    const u = se.user, sent = store.get("sent", []).filter(x => x.by === u.username).slice(0, 8);
    el.innerHTML = `<div class="whobox">
      <div class="whotop"><span class="avatar" aria-hidden="true">${esc((u.name || u.username).slice(0, 1))}</span>
        <div><b>${esc(u.name || u.username)}</b><p class="small muted">${esc(u.username)} · ${u.enumerator ? "ผู้เก็บเลข " + u.enumerator : "ยังไม่มีเลขผู้เก็บ"}${se.demo ? " · บัญชีสาธิต" : ""}</p></div>
        <button type="button" class="btn ghost small" id="logout">ออกจากระบบ</button></div>
      ${u.enumerator ? "" : `<div class="notice small">บัญชีนี้ดูข้อมูลได้แต่เก็บข้อมูลไม่ได้ เพราะยังไม่มีเลขผู้เก็บ ให้ผู้ดูแลกำหนดเลขให้ในหน้าหลังบ้าน</div>`}
      ${u.enumerator ? `<div class="qrrow"><button type="button" class="btn" id="mkqr">▣ ให้ผู้ตอบทำในโทรศัพท์ตัวเอง (QR)</button><span class="small muted">ผู้ตอบสแกนแล้วตอบเอง ระบบนับเป็นชุดของคุณ</span></div>` : ""}
      <label class="fld" style="max-width:220px"><span>วันที่เก็บข้อมูล</span><input class="txt" type="date" name="cdate" value="${st.meta.cdate || todayISO()}" max="${todayISO()}"></label>
      <p class="small muted">คีย์ฟอร์มกระดาษย้อนหลัง ให้ใส่วันที่ที่ผู้ตอบกรอกจริง ระบบออกรหัสผู้ตอบให้หลังส่งสำเร็จ แล้วเขียนรหัสนั้นลงมุมขวาบนของฟอร์มกระดาษ</p>
      ${sent.length ? `<details class="sent"><summary>ส่งจากเครื่องนี้ล่าสุด ${sent.length} ชุด</summary><table><thead><tr><th>เวลา</th><th>เลขอ้างอิง</th><th>รหัสผู้ตอบ</th></tr></thead><tbody>${sent.map(x => `<tr><td class="num">${esc(new Date(x.at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}</td><td class="num">${esc(x.ref)}</td><td class="num"><b>${esc(x.code)}</b></td></tr>`).join("")}</tbody></table></details>` : ""}
    </div>`;
    $("#logout").onclick = () => { Auth.clear(); renderWho(); chips(); };
    const mq = $("#mkqr"); if (mq) mq.onclick = showQR;
  }

  function partHead(i, extra = "") {
    const P = PARTS[i];
    const m = P.title.replace("(ข้อ 15–28)", "(ข้อ 16–28)").match(/^ส่วนที่ (\d) (.+?) \((ข้อ .+)\)$/);
    const bar = st.meta.mode === 0 || st.meta.mode === 1 ? `<p class="codebar">เลขอ้างอิงฟอร์ม <b class="num">${refOf()}</b><span>รหัสผู้ตอบจะออกหลังส่ง</span></p>` : "";
    return `${progress()}<header class="phead">${bar}<p class="eyebrow">ส่วนที่ ${m[1]} · ${m[3]}</p><h2>${m[2]}</h2>${extra}</header>`;
  }

  function renderPart() {
    const P = PARTS[st.part];
    const intro = st.part === 1 ? `<p class="lead">“ครัวเรือน” ในส่วนนี้ หมายถึงคนที่อาศัยและกินอยู่ร่วมกับท่านเป็นประจำ ถ้าท่านไปทำงานหรือเรียนที่อื่น ให้นึกถึงครัวเรือนที่บ้านในพื้นที่นี้</p>` : st.part === 6 ? `<p class="lead">ส่วนสุดท้ายเป็นคำถามเกี่ยวกับชุมชนของท่านโดยทั่วไป ไม่ใช่เรื่องของตัวท่าน ไม่ต้องระบุชื่อบุคคลใด</p>` : st.part === 4 ? `<p class="lead">ส่วนนี้อยู่หลังการเลือกผู้สมัครโดยเจตนา เพื่อไม่ให้คำถามเรื่องความเสี่ยงชี้นำการเลือก</p>` : "";
    let html = partHead(st.part, intro) + `<form class="panel" novalidate>`;
    const items = P.items.filter(it => !it.ecOnly || DEMO || CONFIG.splitTicket);   // item 43 only after EC approves it
    items.forEach((it, k) => html += itemHTML(it, items[k - 1]));
    html += `<div class="nav">${navBtns()}</div></form>`;
    app.innerHTML = html;
    bindForm(items);
  }
  function navBtns(nextLabel = "ถัดไป") {
    return `<button type="button" class="btn ghost" id="back">← ย้อนกลับ</button>
      <span class="navr">${DEMO || TESTRUN ? `<button type="button" class="btn ghost small" id="autofill" title="เติมคำตอบสุ่มเพื่อดูขั้นตอนถัดไป">เติมคำตอบสุ่ม</button>` : ""}<button type="button" class="btn primary" id="next">${nextLabel}</button></span>`;
  }

  function bindForm(items) {
    const form = $("form", app);
    form.onchange = form.oninput = e => onInput(e, items);
    $("#back").onclick = goBack;
    $("#next").onclick = () => next(items);
    const af = $("#autofill"); if (af) af.onclick = () => { autofill(items); st.part === 3 ? renderConjoint() : renderPart(); };
  }
  function onInput(e, items) {
    const t = e.target;
    if (t.dataset.txt) { st.txt[t.dataset.txt] = t.value; return; }
    if (t.name === "res_a") { st.ans["3"] = { a: t.value }; delete st.ans["4"]; refresh("3"); refresh("4"); return; }
    if (t.name === "res_t") { st.ans["3"].t = t.value; delete st.ans["4"]; refresh("4"); return; }
    if (t.name === "res_m") { st.ans["3"].m = t.value; return; }
    if (t.name === "ph" || t.name === "pht") { st.contact = st.contact || {}; st.contact[t.name === "ph" ? "phone" : "time"] = t.value; clearFlag("75"); return; }
    if (t.name.startsWith("oo_")) {
      const n = t.name.slice(3);
      $$(`input[name="oo_${n}"]`).forEach(x => { if (x !== t) x.checked = false; });
      st.ans[n] = t.checked ? t.value : undefined;
      const inp = $(`input[name="q_${n}"]`); inp.disabled = t.checked; if (t.checked) inp.value = "";
      clearFlag(n); return;
    }
    if (!t.name || !t.name.startsWith("q_")) return;
    const n = t.name.slice(2), it = items.find(i => i.n === n);
    if (!it) return;
    if (it.type === "check") {
      const c = +t.value;
      let v = (st.ans[n] || []).filter(x => x !== c);
      if (t.checked) {
        if (it.excl.includes(c)) v = [c];
        else v = v.filter(x => !it.excl.includes(x)).concat(c);
      }
      st.ans[n] = v.sort((a, b) => a - b);
      $$(`input[name="q_${n}"]`).forEach(x => x.checked = st.ans[n].includes(+x.value));
    } else if (it.type === "year" || it.type === "num") {
      st.ans[n] = t.value === "" ? undefined : +t.value;
      if (it.type === "year") $("#agefb").innerHTML = ageMsg(t.value);
    } else if (it.type === "lgu") {
      st.ans[n] = t.value;
    } else {
      st.ans[n] = +t.value;
      if (n === "7ก") {                           // not working (10–13) ⇒ employment status 8
        const notWorking = st.ans[n] >= 10;
        if (notWorking) st.ans["7ข"] = 8; else if (st.ans["7ข"] === 8) delete st.ans["7ข"];
        $$('input[name="q_7ข"]').forEach(x => x.checked = st.ans["7ข"] === +x.value); clearFlag("7ข");
      }
      if (it.type === "phase2") { const box = $("#phonebox"); box.hidden = st.ans[n] !== 1; if (st.ans[n] !== 1) st.contact = null; else if (e.type === "change") $('input[name="ph"]').focus(); }
      if (it.other) { const o = $(`[data-txt="${n}"]`); o.hidden = st.ans[n] !== it.other; if (!o.hidden && e.type === "change") o.focus(); }
    }
    clearFlag(n);
  }
  function refresh(n) {
    const it = PARTS.flatMap(p => p.items).find(i => i.n === n);
    const el = $(`#q-${n} .qa`); if (el) el.innerHTML = body(it);
    clearFlag(n);
  }
  const clearFlag = n => { const q = $(`#q-${n}`); if (q) q.classList.remove("miss"); };

  const HARD = ["1", "3", "4", "5", "5ก"];          // needed for eligibility and the respondent code: cannot be skipped
  const yearOK = v => v >= 2440 && v <= 2569;
  function next(items) {
    const hard = items.filter(it => HARD.includes(it.n) && (!answered(it) || (it.n === "1" && !yearOK(st.ans["1"]))));
    if (hard.length) {
      $$(".q.miss").forEach(q => q.classList.remove("miss"));
      hard.forEach(it => { const q = $(`#q-${it.n}`); if (q) q.classList.add("miss"); });
      $(`#q-${hard[0].n}`).scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      toast(`ข้อ ${hard.map(i => i.n).join(", ")} ต้องตอบก่อนไปต่อ ใช้คัดกรองและสร้างรหัสผู้ตอบ`);
      return;
    }
    const miss = items.filter(it => !answered(it));
    $$(".q.miss").forEach(q => q.classList.remove("miss"));
    const key = st.screen + st.part + (st.part === 3 ? st.cj.stage : "");
    if (miss.length && !st.warned[key]) {
      miss.forEach(it => { const q = $(`#q-${it.n}`); if (q) q.classList.add("miss"); });
      const first = $(`#q-${miss[0].n}`);
      first.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      toast(`ยังไม่ได้ตอบ ${miss.length} ข้อ${DEMO ? " · กดถัดไปอีกครั้งเพื่อข้าม (โหมดตัวอย่าง)" : " · ถ้าไม่ประสงค์ตอบ กดถัดไปอีกครั้งเพื่อข้าม"}`);
      st.warned[key] = true;
      return;
    }
    advance();
  }
  function advance() {
    if (st.screen === "part" && st.part === 0) {
      const y = st.ans["1"], d = st.ans["3"];
      const out = (y && y > 2551) || st.ans["5"] === 3 || st.ans["5ก"] === 2;
      if (out) { st.screen = "out"; return render(); }
    }
    if (st.part === 3) return cjAdvance();
    if (st.part === 6) return finish();
    st.part++; if (st.part === 3) st.cj.stage = "intro";
    render();
  }
  function goBack() {
    if (st.part === 3 && st.cj.stage !== "intro") return cjBack();
    if (st.part === 0) { st.screen = "intro"; return render(); }
    st.part--;
    if (st.part === 3) st.cj.stage = "post";
    render();
  }

  function autofill(items) {
    for (const it of items) {
      if (answered(it)) continue;
      switch (it.type) {
        case "year": st.ans["1"] = 2500 + Math.floor(R() * 50); break;
        case "residence": { const a = pick(["เมืองบุรีรัมย์", "สตึก", "บ้านด่าน", "แคนดง"]); st.ans["3"] = { a, t: pick(S.tambons.filter(t => t.a === a)).t }; break; }
        case "lgu": { const d = st.ans["3"] || {}; const L = S.lgus.filter(l => l.d === d.a && (!d.t || l.t.includes(d.t))); st.ans["4"] = L.length ? pick(L).n : "unsure"; break; }
        case "num": st.ans[it.n] = it.n === "8" ? 1 + Math.floor(R() * 6) : 3000 + Math.floor(R() * 40) * 1000; break;
        case "check": { const o = it.o.filter(o => !it.excl.includes(o.c)); st.ans[it.n] = shuffle(o).slice(0, 1 + Math.floor(R() * 2)).map(o => o.c).sort((a, b) => a - b); break; }
        case "ipc": st.ans[it.n] = pick([-3, -2, -1, 1, 2, 3]); break;
        case "occ": st.ans["7ก"] = pick(it.o).c; break;
        case "phase2": st.ans["75"] = 2; break;
        default: st.ans[it.n] = pick(it.o.filter(o => o.c !== it.other)).c;
      }
    }
    if (st.ans["1"] > 2551) st.ans["1"] = 2540;
    if (st.ans["5"] === 3) st.ans["5"] = 1;
    if (st.ans["5ก"] === 2) st.ans["5ก"] = 1;
  }

  /* ---------- conjoint ---------- */
  const NAMES = { "ชาย": ["วิชัย", "สมพงษ์", "เกรียงไกร", "บุญมี", "ทองดี", "คำปั่น", "สมบัติ", "อำนวย", "ประสิทธิ์", "สุรชัย", "ธนากร", "บุญเลิศ"],
                  "หญิง": ["สุภาพร", "วันเพ็ญ", "อรุณี", "นงลักษณ์", "จันทร์เพ็ญ", "พิมพ์ใจ", "ศิริพร", "บุษบา", "มาลัย", "รัตนา", "อำไพ", "สมใจ"] };
  const ATTR = {
    occ: { l: "อาชีพเดิม", v: ["วิศวกรโยธา", "ทนายความ", "อาจารย์มหาวิทยาลัย", "ครู", "เกษตรกร", "พยาบาล", "พนักงานบริษัทเอกชน"] },
    exp: { l: "ประสบการณ์การเมือง", v: ["ไม่เคยดำรงตำแหน่งทางการเมือง", "สมาชิกสภาท้องถิ่น 8 ปี", "อดีตนายก อบต."] },
    fam: { l: "ครอบครัว", v: ["ครอบครัวไม่เคยอยู่ในการเมือง", "ครอบครัวอยู่ในการเมืองท้องถิ่นมานาน"] },
    role: { l: "บทบาทในชุมชน", v: ["เป็นเจ้าภาพงานบุญ งานศพ และช่วยชาวบ้านติดต่อราชการ", "ให้คำปรึกษาด้านอาชีพแก่ชาวบ้านโดยไม่คิดค่าใช้จ่าย", "ยังไม่เคยมีบทบาทช่วยเหลือในพื้นที่"] },
    tie: { l: "กับครอบครัวท่าน", v: ["เคยช่วยครอบครัวของท่านโดยตรงตอนเดือดร้อนเมื่อปีที่แล้ว", "ไม่เคยรู้จักหรือช่วยเหลือครอบครัวของท่านเป็นการส่วนตัว"] },
    offer: { l: "สิ่งที่เสนอ", v: ["ผลักดันนโยบายในสภาเพื่อแก้ “เรื่องของท่าน”", "ผลักดันนโยบายในสภาเพื่อแก้ “เรื่องอื่น”", "ใช้งบทำโครงการส่วนรวมในตำบลเพื่อแก้ “เรื่องของท่าน” ทุกครัวเรือนได้ประโยชน์", "ช่วยค่าใช้จ่ายเมื่อเดือดร้อน ให้ทุกครอบครัวไม่ว่าจะเลือกใคร", "ช่วยค่าใช้จ่ายเมื่อเดือดร้อน เฉพาะครอบครัวที่สนับสนุนตน"] },
    amt: { l: "วงเงิน", v: ["ครั้งละไม่เกิน 1,000 บาท", "ครั้งละไม่เกิน 2,000 บาท"] },
    time: { l: "ระยะเวลา", v: ["ได้ผลภายในปีแรก", "เห็นผลภายใน 2 ปี", "ใช้เวลาราว 4 ปี"] },
    cert: { l: "ความแน่นอน", v: ["แน่นอนว่าทำได้จริง", "ถ้าสำเร็จจะแก้ได้เกือบทั้งหมด แต่มีโอกาสราวครึ่งหนึ่งที่จะไม่สำเร็จ", "แก้ได้บางส่วน (ราว 1 ใน 3) แต่ค่อนข้างแน่นอน"] },
  };
  const ROWS_FIXED = ["occ", "bg", "offer", "result"], ROW_L = { occ: "อาชีพ", bg: "ภูมิหลัง", offer: "สิ่งที่เสนอ", result: "ผลที่จะได้รับ" };
  let rowOrder = null;   // random design: order of the 5 background rows, fixed per respondent

  function randProfile(sex) {
    const p = { sex, age: 42 + Math.floor(R() * 14) };
    for (const k of ["occ", "exp", "fam", "role", "tie", "offer"]) p[k] = Math.floor(R() * ATTR[k].v.length);
    if (p.exp > 0 && p.role === 2) p.role = Math.floor(R() * 2);              // restriction: office-holders have a community role
    const help = p.offer >= 3;
    if (help) p.amt = Math.floor(R() * 2); else { p.time = Math.floor(R() * 3); p.cert = Math.floor(R() * 3); }
    return p;
  }
  function makeRandomTask(k) {
    const sexA = R() < .5 ? "ชาย" : "หญิง", sexB = R() < .5 ? "ชาย" : "หญิง";
    let A, B, n = 0;
    do { A = randProfile(sexA); B = randProfile(sexB); n++; } while (n < 20 && ["occ", "exp", "fam", "role", "tie", "offer"].every(k => A[k] === B[k]));
    const parties = shuffle(["A", "B", "C", "D"]);
    A.party = parties[0]; B.party = parties[1];
    const nm = shuffle(NAMES["ชาย"]), nf = shuffle(NAMES["หญิง"]);
    A.name = (sexA === "ชาย" ? "นาย" : "นาง") + (sexA === "ชาย" ? nm[0] : nf[0]);
    B.name = (sexB === "ชาย" ? "นาย" : "นาง") + (sexB === "ชาย" ? nm[1] : nf[1]);
    const [la, lb] = Avatar.pairLooks(sexA, sexB, R)(A.age, B.age);
    A.look = la; B.look = lb;
    return { k, design: "random", L: A, Rt: B, choice: null };
  }
  function makeFixedTasks() {
    const pairs = PARTS[3].items.filter(i => i.type === "pair");
    const mid = [2, 3, 4, 5, 6]; const ord = [1].concat(st.meta.order === 1 ? mid : mid.slice().reverse(), [7]);
    return ord.map(k => {
      const p = pairs.find(x => x.k === k);
      let L = { ...p.A }, Rt = { ...p.B };
      if (st.meta.version === "B") [L, Rt] = [Rt, L];
      const [la, lb] = Avatar.pairLooks(L.sex, Rt.sex, R)(L.age, Rt.age);
      L.look = la; Rt.look = lb;
      return { k, n: p.n, v: p.v, design: "fixed", pre: p.pre, L, Rt, choice: null };
    });
  }
  function ensureTasks() {
    if (st.cj.tasks && st.cj.tasks.design === st.meta.design) return;
    if (st.meta.design === "random") {
      rowOrder = shuffle(["occ", "exp", "fam", "role", "tie"]);
      st.cj.tasks = Array.from({ length: 7 }, (_, i) => makeRandomTask(i + 1));
    } else st.cj.tasks = makeFixedTasks();
    st.cj.tasks.design = st.meta.design;
  }

  function rowsFor(p, design) {
    if (design === "fixed") return ROWS_FIXED.map(k => [ROW_L[k], fill(p[k])]);
    const out = rowOrder.map(k => [ATTR[k].l, ATTR[k].v[p[k]]]);
    const help = p.offer >= 3;
    out.push(["สิ่งที่เสนอ", fill(ATTR.offer.v[p.offer]) + (help ? ` ${ATTR.amt.v[p.amt]}` : "")]);
    out.push(["ผลที่จะได้รับ", help ? "ได้รับความช่วยเหลือทันทีเมื่อร้องขอ แต่ช่วยเป็นครั้ง ๆ" : `${ATTR.time.v[p.time]} · ${ATTR.cert.v[p.cert]}`]);
    return out;
  }
  /* ---------- what differs in a pair: word-level comparison of the two candidates' rows (pairs 2–7 only;
     pair 1 differs on everything, so nothing is marked there). Names, ages and party letters are not marked,
     except the party line in pair 7, where the party is the thing that differs. ---------- */
  const HIGHLIGHT = true;
  const SEG = window.Intl && Intl.Segmenter ? new Intl.Segmenter("th", { granularity: "word" }) : null;
  const toks = s => SEG ? [...SEG.segment(s)].map(x => x.segment) : s.split(/(\s+)/);
  function diffMark(a, b) {                      // returns [htmlA, htmlB] with differing words wrapped in <mark>
    const A = toks(a), B = toks(b), n = A.length, m = B.length;
    const L = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const ka = new Array(n).fill(false), kb = new Array(m).fill(false);
    for (let i = 0, j = 0; i < n && j < m;) { if (A[i] === B[j]) { ka[i] = kb[j] = true; i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
    const out = (T, keep) => { let h = "", open = false;
      T.forEach((t, i) => { const ch = !keep[i] && /\S/.test(t); if (ch && !open) { h += '<mark class="df">'; open = true; } else if (!ch && open && /\S/.test(t)) { h += "</mark>"; open = false; } h += esc(t); });
      return h + (open ? "</mark>" : ""); };
    return [out(A, ka), out(B, kb)];
  }
  function pairMarks(task) {
    if (!HIGHLIGHT || task.design !== "fixed" || task.k === 1) return null;
    if (task.marks) return task.marks;
    const L = {}, Rr = {};
    ROWS_FIXED.forEach(k => { const a = fill(task.L[k]), b = fill(task.Rt[k]); if (a !== b) [L[k], Rr[k]] = diffMark(a, b); });
    if (task.k === 7) [L.party, Rr.party] = diffMark(task.L.party, task.Rt.party);
    return (task.marks = { L, R: Rr });
  }
  function candCard(p, side, task, col) {
    const uid = `${task.k}${side}${Math.floor(R() * 1e6)}`;
    const party = task.design === "fixed" ? p.party : p.party;
    const sideCls = side === "L" ? "l" : "r";
    const marks = pairMarks(task), mk = marks ? marks[side === "L" ? "L" : "R"] : null;
    const picked = task.choice === side ? " picked" : task.choice ? " other" : "";
    return `<article class="cand ${sideCls}${picked}" data-side="${side}" style="--d:${(R() * 3).toFixed(2)}s">
      <div class="cand-top">${Avatar.svg(p.look, uid)}<div class="who"><span class="col">ผู้สมัคร ${col}</span><h3>${esc(p.name)}</h3><p class="num small">อายุ ${p.age} ปี · ${p.sex}</p><span class="party">${mk && mk.party ? mk.party : /^[A-D]$/.test(party) ? "พรรค " + party : esc(party)}</span></div></div>
      <dl>${task.design === "fixed" ? ROWS_FIXED.map(k => `<div${mk && mk[k] ? ' class="dif"' : ""}><dt>${ROW_L[k]}</dt><dd>${mk && mk[k] ? mk[k] : esc(fill(p[k]))}</dd></div>`).join("") : rowsFor(p, task.design).map(([l, v]) => `<div><dt>${l}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
      <button type="button" class="btn choose" data-side="${side}">เลือกผู้สมัคร ${col}</button>
      <span class="stamp" aria-hidden="true">เลือกแล้ว</span>
    </article>`;
  }

  function renderConjoint() {
    ensureTasks();
    const c = st.cj;
    if (c.stage === "post") {
      const items = PARTS[3].items.filter(i => i.n === "38" || i.n === "39");
      app.innerHTML = partHead(3) + `<form class="panel" novalidate>${items.map(i => itemHTML(i)).join("")}<div class="nav">${navBtns()}</div></form>`;
      return bindForm(items);
    }
    if (c.stage === "follow") {
      const items = PARTS[3].items.filter(i => i.n === "31ก" || i.n === "31ข");
      app.innerHTML = partHead(3) + `<form class="panel" novalidate><p class="lead">คำถามต่อจากคู่ที่ 1</p>${items.map(i => itemHTML(i)).join("")}<div class="nav">${navBtns()}</div></form>`;
      return bindForm(items);
    }
    if (c.stage === "intro") {
      app.innerHTML = partHead(3) + `<section class="panel">
        <p class="lead">ต่อไปจะเป็นผู้สมัคร ส.ส. เขตสมมติ 7 คู่ ทุกคู่ลงสมัครในเขตของท่าน ขอให้เลือกคนที่ท่านจะลงคะแนนให้ ถ้าต้องเลือกจริง ไม่มีคำตอบถูกหรือผิด</p>
        <ul class="bul"><li>พรรค A B C และ D เป็นพรรคสมมติ ไม่ใช่พรรคจริง</li><li>ภาพผู้สมัครเป็นภาพวาดประกอบเท่านั้น</li><li>“เรื่องของท่าน” ในคู่ผู้สมัคร คือ <b>${esc(issueText())}</b> ที่ท่านเลือกไว้ในข้อ 16</li></ul>
        <fieldset class="q" id="q-29"><legend class="qh"><span class="qn num">29</span><span class="qt">ตรวจความเข้าใจ: พรรค A B C D ในคำถามต่อไปนี้เป็นพรรคแบบใด</span></legend>
          <div class="opts row"><label class="opt"><input type="radio" name="cmp" value="1"><span class="box"></span><span class="ot">พรรคสมมติ</span></label><label class="opt"><input type="radio" name="cmp" value="2"><span class="box"></span><span class="ot">พรรคจริง</span></label></div>
          <p class="live small" id="cmpfb"></p></fieldset>
        <div class="nav">${navBtns("เริ่มคู่ที่ 1")}</div></section>`;
      $("#back").onclick = goBack;
      const af = $("#autofill"); if (af) af.remove();
      $("#next").onclick = () => {
        const v = $('input[name="cmp"]:checked');
        if (!v) { $("#q-29").classList.add("miss"); return; }
        if (v.value === "1") { st.ans["29"] = c.fails ? 2 : 1; c.stage = "task"; c.i = 0; return render(); }
        c.fails++;
        if (c.fails >= 2) { st.ans["29"] = 0; c.stage = "post"; toast("ข้ามการเลือกผู้สมัคร ไปข้อ 38"); return render(); }
        $("#cmpfb").innerHTML = `<span class="bad">พรรค A–D เป็นพรรคสมมติ ขอให้อ่านคำชี้แจงอีกครั้งแล้วตอบใหม่</span>`;
        v.checked = false;
      };
      return;
    }
    // task screen
    const t = c.tasks[c.i];
    const pre = t.pre ? `<div class="notice acc">${esc(t.pre.replace(/[“”]/g, ""))}</div>` : "";
    app.innerHTML = partHead(3) + `<section class="panel conj">
      <div class="conj-head"><p class="eyebrow num">คู่ที่ ${c.i + 1} / ${c.tasks.length}</p>
        <div class="dots">${c.tasks.map((x, i) => `<i class="${x.choice ? "on" : ""}${i === c.i ? " cur" : ""}"></i>`).join("")}</div></div>
      ${pre}
      <h3 class="ask">ถ้าท่านต้องเลือกระหว่างผู้สมัครสองคนนี้ ท่านจะลงคะแนนให้คนใด</h3>
      ${pairMarks(t) ? `<p class="dfnote"><mark class="df">ข้อความที่ขีดเน้น</mark> คือจุดที่สองคนนี้ต่างกัน นอกนั้นเหมือนกัน</p>` : ""}
      <div class="pair">${candCard(t.L, "L", t, "ก")}<div class="vs" aria-hidden="true">หรือ</div>${candCard(t.Rt, "R", t, "ข")}</div>
      <div class="nav"><button type="button" class="btn ghost" id="back">← ย้อนกลับ</button>
        <span class="navr">${DEMO && t.design === "random" ? `<button type="button" class="btn ghost" id="reroll" title="สุ่มคุณลักษณะคู่นี้ใหม่ (โหมดตัวอย่าง)">↻ สุ่มคู่นี้ใหม่</button>` : ""}
        <button type="button" class="btn primary" id="next" ${t.choice ? "" : "disabled"}>ถัดไป</button></span></div>
    </section>`;
    $("#back").onclick = goBack;
    $("#next").onclick = cjAdvance;
    const rr = $("#reroll");
    if (rr) rr.onclick = () => {
      const pair = $(".pair"); pair.classList.add("flip");
      setTimeout(() => { c.tasks[c.i] = makeRandomTask(t.k); renderConjoint(); }, reduce ? 0 : 260);
    };
    $(".pair").onclick = e => {
      const card = e.target.closest(".cand"); if (!card) return;
      if (e.target.closest("dl") && !e.target.closest(".choose") && window.getSelection().toString()) return;
      const side = card.dataset.side;
      t.choice = side; t.at = Math.round(performance.now() - st.t0);
      $$(".cand").forEach(x => { x.classList.toggle("picked", x.dataset.side === side); x.classList.toggle("other", x.dataset.side !== side); });
      $$(".dots i")[c.i].classList.add("on");
      $("#next").disabled = false;
      clearTimeout(st.cjT);
      st.cjT = setTimeout(cjAdvance, reduce ? 300 : 900);
    };
  }
  function cjAdvance() {
    clearTimeout(st.cjT);
    const c = st.cj;
    if (c.stage === "task") {
      if (!c.tasks[c.i].choice) return;
      if (c.i === 0 && !c.follow.done) { c.stage = "follow"; c.follow.done = true; return render(); }
      if (c.i < c.tasks.length - 1) { c.i++; return render(); }
      c.stage = "post"; return render();
    }
    if (c.stage === "follow") { c.stage = "task"; c.i = Math.min(1, c.tasks.length - 1); return render(); }
    if (c.stage === "post") { st.part = 4; st.screen = "part"; return render(); }
  }
  function cjBack() {
    clearTimeout(st.cjT);
    const c = st.cj;
    if (c.stage === "post") { if (st.ans["29"] === 0) { c.stage = "intro"; c.fails = 0; } else { c.stage = "task"; c.i = c.tasks.length - 1; } return render(); }
    if (c.stage === "follow") { c.stage = "task"; c.i = 0; return render(); }
    if (c.stage === "task") {
      if (c.i === 0) { c.stage = "intro"; return render(); }
      if (c.i === 1) { c.stage = "follow"; return render(); }
      c.i--; return render();
    }
  }

  /* ---------- LoC scoring & result ---------- */
  function scores() {
    const s = { I: 0, P: 0, C: 0 }, n = { I: 0, P: 0, C: 0 };
    for (const it of PARTS[5].items) { const v = st.ans[it.n]; if (typeof v === "number") { s[it.dim] += v; n[it.dim]++; } }
    const out = {};
    for (const k of ["I", "P", "C"]) out[k] = n[k] === 8 ? s[k] + 24 : n[k] ? Math.round((s[k] / n[k]) * 8 + 24) : null;   // prorate if some skipped
    out.complete = n.I === 8 && n.P === 8 && n.C === 8;
    return out;
  }
  const DIM = {
    I: { name: "ภายในตน", en: "Internality", col: "var(--mg)", hi: "เชื่อมากว่าความพยายามและความสามารถของตัวเองเป็นตัวกำหนดผลในชีวิต", lo: "ไม่ค่อยมองว่าความพยายามของตัวเองเพียงอย่างเดียวจะกำหนดผลในชีวิตได้" },
    P: { name: "ผู้มีอำนาจ", en: "Powerful Others", col: "var(--nk)", hi: "มองว่าคนที่มีอำนาจหรือตำแหน่ง มีผลต่อชีวิตของท่านมาก", lo: "ไม่ค่อยมองว่าชีวิตของท่านขึ้นอยู่กับคนที่มีอำนาจ" },
    C: { name: "โชคหรือความบังเอิญ", en: "Chance", col: "var(--tb)", hi: "มองว่าโชค ชะตา หรือเหตุบังเอิญ มีผลต่อชีวิตมาก", lo: "ไม่ค่อยมองว่าชีวิตขึ้นอยู่กับโชคหรือความบังเอิญ" },
  };
  const band = v => v >= 33 ? "สูง" : v >= 17 ? "ปานกลาง" : "ต่ำ";
  function radar(sc) {
    const cx = 150, cy = 140, R0 = 105, ang = { I: -90, P: 30, C: 150 };
    const pt = (k, f) => { const a = ang[k] * Math.PI / 180; return [cx + Math.cos(a) * R0 * f, cy + Math.sin(a) * R0 * f]; };
    const ring = f => ["I", "P", "C"].map(k => pt(k, f).join(",")).join(" ");
    const poly = ["I", "P", "C"].map(k => pt(k, (sc[k] ?? 0) / 48).map(x => x.toFixed(1)).join(",")).join(" ");
    const lab = k => { const [x, y] = pt(k, 1.2); return `<text x="${x}" y="${y + (k === "I" ? -2 : 12)}" text-anchor="middle" class="rl"><tspan font-weight="600" fill="${DIM[k].col}">${k}</tspan> ${DIM[k].name}</text>`; };
    return `<svg class="radar" viewBox="-10 0 320 232" role="img" aria-label="ภาพสามเหลี่ยมคะแนน I ${sc.I} P ${sc.P} C ${sc.C} จาก 48">
      ${[1 / 3, 2 / 3, 1].map(f => `<polygon points="${ring(f)}" fill="none" stroke="var(--line2)" stroke-width="${f === 1 ? 1.4 : .8}" ${f < 1 ? 'stroke-dasharray="3 4"' : ""}/>`).join("")}
      ${["I", "P", "C"].map(k => `<line x1="${cx}" y1="${cy}" x2="${pt(k, 1)[0]}" y2="${pt(k, 1)[1]}" stroke="var(--line2)" stroke-width=".8"/>`).join("")}
      <polygon class="rpoly" points="${poly}" fill="color-mix(in oklab,var(--accent) 22%,transparent)" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round"/>
      ${["I", "P", "C"].map(k => { const [x, y] = pt(k, (sc[k] ?? 0) / 48); return `<circle cx="${x}" cy="${y}" r="5" fill="${DIM[k].col}" stroke="var(--surface)" stroke-width="2"/>`; }).join("")}
      ${["I", "P", "C"].map(lab).join("")}
      <text x="${cx - 6}" y="${cy - R0 / 3 + 3}" text-anchor="end" class="rt">16</text><text x="${cx - 6}" y="${cy - 2 * R0 / 3 + 3}" text-anchor="end" class="rt">32</text><text x="${cx - 6}" y="${cy - R0 + 3}" text-anchor="end" class="rt">48</text>
    </svg>`;
  }

  function record() {
    const sc = scores();
    return {
      meta: { id: st.meta.id, code: null, test: DEMO || TESTRUN, enumerator: st.meta.mode === 2 ? 9 : st.meta.enumerator, collector: st.meta.mode === 0 || st.meta.mode === 1 ? st.meta.collector : "", cdate: st.meta.cdate, collectedBE: beYear(st.meta.cdate || todayISO()), started: st.meta.started, finished: new Date().toISOString(), seconds: Math.round((performance.now() - (st.t0 || 0)) / 1000), mode: st.meta.mode, venue: st.meta.venue, design: st.meta.design, version: st.meta.version, order: st.meta.order, instrument: "IOC v1.5" },
      answers: { ...st.ans }, text: { ...st.txt },
      conjoint: (st.cj.tasks || []).map((t, i) => ({ task: i + 1, pair: t.k, item: t.n, chosen: t.choice, ms: t.at, left: strip(t.L, t.design), right: strip(t.Rt, t.design) })),
      ipc: { I: sc.I, P: sc.P, C: sc.C, complete: sc.complete },
      contact: st.ans["75"] === 1 && st.contact && validPhone(st.contact.phone) ? { phone: String(st.contact.phone).replace(/\D/g, ""), time: st.contact.time || "" } : undefined,
    };
  }
  function strip(p, design) {
    const look = { sex: p.look.sex, pose: p.look.pose, skin: p.look.skin, shirt: p.look.shirt, hairC: p.look.hairC, flip: p.look.flip };
    if (design === "fixed") return { name: p.name, party: p.partyCode || p.party, look };
    const o = { party: p.party, sex: p.sex, age: p.age, look };
    for (const k of ["occ", "exp", "fam", "role", "tie", "offer", "amt", "time", "cert"]) if (p[k] !== undefined) o[k] = p[k];
    return o;
  }

  /* ---------- sending: an outbox in this browser, so a lost signal in the field does not lose an interview.
     The server issues the respondent code when the record arrives; interviewer forms go with the collector's sign-in token. ---------- */
  const outbox = () => store.get("outbox", []);
  function remember(rec, code) {
    const sent = store.get("sent", []).filter(x => x.ref !== refOf(rec.meta.id));
    sent.unshift({ ref: refOf(rec.meta.id), code, at: Date.now(), by: rec.meta.collector || "", test: !!rec.meta.test });
    store.set("sent", sent.slice(0, 200));
  }
  let flushing = false;
  async function flush() {
    if (flushing) return; flushing = true;
    const se = Auth.get(), keep = [];
    for (const it of outbox()) {
      const mine = it.rec.meta.id === st.meta.id, needSign = it.rec.meta.mode === 0 || it.rec.meta.mode === 1;
      if (needSign && (!se || se.demo || se.user.username !== it.rec.meta.collector)) {          // wait for the person who collected it to sign in
        keep.push(it); if (mine) st.send = { state: "login" }; continue;
      }
      const j = await Auth.api("submit", { rec: it.rec, invite: it.invite });
      if (j.ok) { remember(it.rec, j.code); if (it.invite) store.set("inv.done", store.get("inv.done", []).concat([it.invite.slice(-24)]).slice(-50)); if (mine) st.send = { state: "ok", code: j.code, flag: j.flag }; if (it.rec.meta.mode === 2 && !TESTRUN) store.set("done", true); }
      else if (j.offline || j.auth) { keep.push(it); if (mine) st.send = { state: j.auth ? "login" : "queued" }; }
      else if (mine) st.send = { state: "rejected", error: j.error };          // the current interview stays on screen
      else keep.push(Object.assign(it, { error: j.error }));
    }
    store.set("outbox", keep); flushing = false; chips();
    if (st.screen === "done") sendBox();
  }
  function finish() {
    if (DEMO) st.meta.code = makeCode();
    const rec = record();
    st.rec = rec;
    if (!DEMO && CONFIG.endpoint) { store.set("outbox", outbox().concat([st.meta.mode === 3 ? { rec, invite: INV } : { rec }])); st.send = { state: "sending" }; flush(); }
    st.screen = "done"; render();
  }
  function sendBox() {
    const el = $("#sendbox"); if (!el) return;
    const s = st.send || {}, paper = st.meta.mode === 0, ref = refOf();
    if (DEMO) el.innerHTML = `<div class="notice acc small">โหมดตัวอย่าง: เมื่อเปิดเก็บจริง ระบบจะออกรหัสผู้ตอบให้หลังส่ง เช่น <b class="num">${esc(st.meta.code)}</b></div>`;
    else if (s.state === "ok") el.innerHTML = `<div class="notice acc"><b>บันทึกแล้ว</b> · รหัสผู้ตอบ <b class="num big-code">${esc(s.code)}</b>${paper ? `<br><span class="small">เขียนรหัสนี้ที่มุมขวาบนของฟอร์มกระดาษ</span>` : ""}${s.flag ? `<br><span class="small">ระบบติดธง: ${esc(s.flag)} ผู้วิจัยจะตรวจสอบภายหลัง</span>` : ""}</div>`;
    else if (s.state === "sending") el.innerHTML = `<div class="notice acc">กำลังส่งคำตอบ…</div>`;
    else if (s.state === "queued") el.innerHTML = `<div class="notice"><b>ยังส่งไม่ได้</b> คำตอบเก็บไว้ในเครื่องนี้แล้ว ระบบจะส่งให้เองเมื่อมีสัญญาณ ${paper ? `เขียนเลขอ้างอิง <b class="num">${ref}</b> บนฟอร์มกระดาษไว้ก่อน รหัสผู้ตอบจะขึ้นในรายการ “ส่งจากเครื่องนี้”` : ""} <button type="button" class="btn" id="resend">ส่งอีกครั้ง</button></div>`;
    else if (s.state === "login") el.innerHTML = `<div class="notice"><b>ต้องเข้าสู่ระบบก่อนส่ง</b> คำตอบเก็บไว้ในเครื่องนี้แล้ว (เลขอ้างอิง <b class="num">${ref}</b>) ให้ผู้เก็บที่สัมภาษณ์ชุดนี้เข้าสู่ระบบ แล้วระบบจะส่งให้เอง<div id="relogin" style="margin-top:10px"></div></div>`;
    else if (s.state === "rejected") el.innerHTML = `<div class="notice"><b>ระบบไม่รับคำตอบนี้</b> ${esc(s.error || "")} <span class="small">(เลขอ้างอิง ${ref})</span></div>`;
    const rs = $("#resend"); if (rs) rs.onclick = () => { st.send = { state: "sending" }; sendBox(); flush(); };
    const rl = $("#relogin"); if (rl) Auth.form(rl, { onDone: () => { st.send = { state: "sending" }; sendBox(); flush(); } });
  }
  function chips() {
    const el = $("#chips"); if (!el) return;
    const n = outbox().length;
    el.innerHTML = (DEMO ? `<span class="chip warn"><i></i>โหมดตัวอย่าง · ไม่บันทึกคำตอบ</span><span class="chip">รอ EC อนุมัติก่อนเปิดเก็บจริง</span>`
      : TESTRUN ? `<span class="chip warn"><i></i>โหมดทดสอบระบบ · บันทึกเป็นข้อมูลทดสอบ</span>` : `<span class="chip mint"><i></i>เก็บข้อมูลจริง</span>`) +
      (n ? `<span class="chip warn">รอส่ง ${n} ชุด</span>` : "") +
      (INV ? `<span class="chip acc">ตอบผ่าน QR ของผู้เก็บข้อมูล${invInfo ? " เลข " + invInfo.enumerator : ""}</span>` : Auth.get() ? `<span class="chip">เข้าสู่ระบบ: ${esc(Auth.get().user.username)}</span>` : "");
  }

  function renderDone() {
    const sc = scores();
    const order = ["I", "P", "C"].filter(k => sc[k] != null).sort((a, b) => sc[b] - sc[a]);
    const top = order[0], lead = order.filter(k => sc[top] - sc[k] <= 2), tie = lead.length > 1, flat = lead.length === 3;
    const anyScore = order.length > 0;
    app.innerHTML = progress() + `
    <section class="panel done">
      <p class="eyebrow">ขอบคุณที่ร่วมตอบ</p>
      <h2>ความเชื่อเรื่องสิ่งที่กำหนดชีวิตของท่าน</h2>
      <p class="lead">คะแนนแต่ละด้านอยู่ระหว่าง 0–48 คิดจาก 8 ข้อของด้านนั้นในส่วนที่ 6 สามด้านนี้<b>แยกกัน</b> ไม่ใช่ประเภทเดียว คนหนึ่งคนอาจสูงได้มากกว่าหนึ่งด้าน</p>
      ${anyScore ? `<div class="result">
        <div class="rchart">${radar(sc)}</div>
        <div class="rtext">
          <div class="topline"><span class="big" style="color:${flat ? "var(--ink)" : DIM[top].col}">${lead.join(" · ")}</span><div><b>${flat ? "ไม่มีด้านใดเด่นชัด" : tie ? "ด้านที่เด่นใกล้เคียงกัน" : "ด้านที่เด่นที่สุด"}</b><p class="small muted">${flat ? "สามด้านต่างกันไม่เกิน 2 คะแนน" : tie ? lead.map(k => DIM[k].name).join(" และ ") : DIM[top].name + " (" + DIM[top].en + ")"}</p></div></div>
          ${["I", "P", "C"].map(k => sc[k] == null ? "" : `<div class="bar"><div class="bh"><span><b style="color:${DIM[k].col}">${k}</b> ${DIM[k].name}</span><span class="num">${sc[k]} <small class="muted">/ 48 · ${band(sc[k])}</small></span></div>
            <div class="track"><i style="--w:${(sc[k] / 48 * 100).toFixed(1)}%;background:${DIM[k].col}"></i><s style="left:50%"></s></div>
            <p class="small">${sc[k] >= 33 ? DIM[k].hi : sc[k] < 17 ? DIM[k].lo : "อยู่ช่วงกลาง: ให้น้ำหนักด้านนี้บ้างแต่ไม่มาก"}</p></div>`).join("")}
          ${sc.complete ? "" : `<p class="small muted">ตอบส่วนที่ 6 ไม่ครบ คะแนนจึงคำนวณจากข้อที่ตอบแล้วเฉลี่ยขึ้นเป็น 8 ข้อ</p>`}
        </div></div>` : `<div class="notice">ยังไม่ได้ตอบส่วนที่ 6 จึงยังแสดงผลไม่ได้</div>`}
      <div class="notice acc small">ผลนี้เป็นคะแนนจากแบบวัด IPC ของ Levenson (1981) ฉบับแปลไทยที่อยู่ระหว่างตรวจสอบ ใช้เพื่อให้ท่านเห็นภาพความคิดของตัวเองเท่านั้น <b>ไม่ใช่การวินิจฉัย</b> และไม่มีด้านใดดีหรือแย่กว่ากัน เส้นกลางของแต่ละแถบคือ 24 คะแนน (จุดกึ่งกลางของมาตรา) ไม่ใช่ค่าเฉลี่ยของคนทั่วไป</div>
      <div id="sendbox"></div>
      ${DEMO ? `<details class="rec"><summary>ข้อมูลที่ระบบจะบันทึกเมื่อเปิดเก็บจริง <span class="chip">โหมดตัวอย่าง · ไม่ได้ส่งไปที่ใด</span></summary>
        <p class="small muted">หนึ่งแถวต่อผู้ตอบ ไม่มีชื่อหรือพิกัด เบอร์โทร (เฉพาะผู้ที่ยินดี) แยกไปเก็บอีกชีตและไม่อยู่ในแถวคำตอบ ข้อ 25–28 เก็บเฉพาะคำตอบ การตรวจคะแนนทำตอนวิเคราะห์เท่านั้น</p>
        <pre>${esc(JSON.stringify(Object.assign({}, st.rec, st.rec.contact ? { contact: { phone: "[ซ่อน]", time: st.rec.contact.time } } : {}), null, 1))}</pre>
        <button type="button" class="btn" id="dl">ดาวน์โหลดไฟล์ JSON</button></details>` : ""}
      <div class="nav"><button type="button" class="btn ghost" id="again">เริ่มใหม่</button><a class="btn primary" href="../">กลับหน้าหลักงานวิจัย</a></div>
    </section>`;
    const dl = $("#dl");
    if (dl) dl.onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(Object.assign({}, st.rec, { contact: undefined }), null, 1)], { type: "application/json" })); a.download = `survey-demo-${st.meta.id}.json`; a.click(); };
    $("#again").onclick = () => location.reload();
    sendBox();
  }

  function renderOut() {
    app.innerHTML = `<section class="panel"><h2>ขอบคุณสำหรับเวลาของท่าน</h2>
      <p class="lead">${st.ans["5ก"] === 2 ? "ท่านเคยตอบแบบสอบถามชุดนี้แล้ว ขอบคุณที่ร่วมงานวิจัยอีกครั้ง ไม่ต้องตอบซ้ำ" : "จากคำตอบในส่วนที่ 1 ท่านไม่อยู่ในกลุ่มที่งานวิจัยนี้ศึกษา (ผู้มีสิทธิเลือกตั้งที่มีชื่อในทะเบียนบ้านใน 4 อำเภอของบุรีรัมย์) จึงขอยุติการตอบเพียงเท่านี้"}</p>
      <div class="nav"><button class="btn ghost" id="b">← แก้คำตอบส่วนที่ 1</button>${DEMO ? `<button class="btn" id="c">ทดลองต่อ (โหมดตัวอย่าง)</button>` : ""}</div></section>`;
    $("#b").onclick = () => { st.screen = "part"; st.part = 0; render(); };
    const c = $("#c"); if (c) c.onclick = () => { st.screen = "part"; st.part = 1; render(); };
  }

  let toastT;
  function toast(msg) {
    let t = $("#toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 3800);
  }

  window.__survey = { st, scores, record, makeCode };     // for testing
  chips();
  if (!DEMO && CONFIG.endpoint && outbox().length) flush();
  window.addEventListener("online", () => { if (!DEMO && outbox().length) flush(); });
  const jump = (DEMO || TESTRUN) && location.hash.match(/^#p([1-7])$/);
  if (jump) { st.meta.mode = 2; st.meta.venue = 4; st.meta.started = new Date().toISOString(); st.t0 = performance.now(); st.screen = "part"; st.part = +jump[1] - 1; if (st.part === 3) st.cj.stage = "intro"; }
  render();
})();
