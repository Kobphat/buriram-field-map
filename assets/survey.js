/* Web survey (IOC v1.4). Demo mode saves nothing; live mode posts one JSON record to CONFIG.endpoint after EC approval.
   Knowledge items 25–28 carry no answer key in this file on purpose: scoring happens only in analysis. */
(function () {
  "use strict";
  const CONFIG = window.SURVEY_CONFIG || { live: false, endpoint: "" };
  const DEMO = !CONFIG.live;
  const S = window.SURVEY;
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
    meta: { id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())).slice(0, 8), version: R() < .5 ? "A" : "B", order: R() < .5 ? 1 : 2, design: "fixed", mode: null, venue: null, started: null },
    cj: { stage: "intro", i: 0, tasks: null, fails: 0, follow: {} },
  };

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
    if (v < 2460) return `<span class="bad">ตรวจปีเกิดอีกครั้ง</span>`;
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
      <div class="admin">
        <fieldset class="q"><legend class="qh"><span class="qt">วิธีตอบ</span></legend><div class="opts row">
          ${[[1, "ผู้เก็บข้อมูลอ่านให้ฟัง"], [0, "กรอกเองโดยมีผู้เก็บข้อมูลอยู่ด้วย"], [2, "ตอบเองออนไลน์"]].map(([c, t]) => `<label class="opt"><input type="radio" name="mode" value="${c}" ${st.meta.mode === c ? "checked" : ""}><span class="box"></span><span class="ot">${t}</span></label>`).join("")}</div></fieldset>
        <fieldset class="q" id="venue-q" ${st.meta.mode === 2 ? "hidden" : ""}><legend class="qh"><span class="qt">สถานที่พบผู้ตอบ <em class="muted">(ผู้เก็บข้อมูลเลือก)</em></span></legend><div class="opts row">
          ${[[1, "ตลาดหรือจุดที่คนพลุกพล่าน"], [2, "จุดรวมตัวของชุมชน (สภากาแฟ)"], [3, "เยี่ยมครัวเรือน"]].map(([c, t]) => `<label class="opt"><input type="radio" name="venue" value="${c}" ${st.meta.venue === c ? "checked" : ""}><span class="box"></span><span class="ot">${t}</span></label>`).join("")}</div></fieldset>

      </div>
      <p class="consent">การกด “เริ่มตอบ” ถือว่าท่านยินยอมเข้าร่วมการวิจัย (ความยินยอมโดยการกระทำ)</p>
      <div class="nav"><span></span><button class="btn primary" id="start">เริ่มตอบ</button></div>
    </section>`;
    app.onchange = e => {
      const t = e.target;
      if (t.name === "mode") { st.meta.mode = +t.value; $("#venue-q").hidden = st.meta.mode === 2; if (st.meta.mode === 2) st.meta.venue = 4; else if (st.meta.venue === 4) st.meta.venue = null; }
      if (t.name === "venue") st.meta.venue = +t.value;
    };
    $("#start").onclick = () => {
      if (st.meta.mode == null) st.meta.mode = 2, st.meta.venue = 4;
      st.meta.started = new Date().toISOString(); st.t0 = performance.now();
      st.screen = "part"; st.part = 0; render();
    };
  }

  function partHead(i, extra = "") {
    const P = PARTS[i];
    const m = P.title.match(/^ส่วนที่ (\d) (.+?) \((ข้อ .+)\)$/);
    return `${progress()}<header class="phead"><p class="eyebrow">ส่วนที่ ${m[1]} · ${m[3]}</p><h2>${m[2]}</h2>${extra}</header>`;
  }

  function renderPart() {
    const P = PARTS[st.part];
    const intro = st.part === 6 ? `<p class="lead">ส่วนสุดท้ายเป็นคำถามเกี่ยวกับชุมชนของท่านโดยทั่วไป ไม่ใช่เรื่องของตัวท่าน ไม่ต้องระบุชื่อบุคคลใด</p>` : st.part === 4 ? `<p class="lead">ส่วนนี้อยู่หลังการเลือกผู้สมัครโดยเจตนา เพื่อไม่ให้คำถามเรื่องความเสี่ยงชี้นำการเลือก</p>` : "";
    let html = partHead(st.part, intro) + `<form class="panel" novalidate>`;
    P.items.forEach((it, k) => html += itemHTML(it, P.items[k - 1]));
    html += `<div class="nav">${navBtns()}</div></form>`;
    app.innerHTML = html;
    bindForm(P.items);
  }
  function navBtns(nextLabel = "ถัดไป") {
    return `<button type="button" class="btn ghost" id="back">← ย้อนกลับ</button>
      <span class="navr">${DEMO ? `<button type="button" class="btn ghost small" id="autofill" title="เติมคำตอบสุ่มเพื่อดูขั้นตอนถัดไป">เติมคำตอบสุ่ม</button>` : ""}<button type="button" class="btn primary" id="next">${nextLabel}</button></span>`;
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

  function next(items) {
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
      const out = (y && y > 2551) || st.ans["5"] === 3;
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
        default: st.ans[it.n] = pick(it.o.filter(o => o.c !== it.other)).c;
      }
    }
    if (st.ans["1"] > 2551) st.ans["1"] = 2540;
    if (st.ans["5"] === 3) st.ans["5"] = 1;
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
  function candCard(p, side, task, col) {
    const uid = `${task.k}${side}${Math.floor(R() * 1e6)}`;
    const party = task.design === "fixed" ? p.party : p.party;
    const sideCls = side === "L" ? "l" : "r";
    const picked = task.choice === side ? " picked" : task.choice ? " other" : "";
    return `<article class="cand ${sideCls}${picked}" data-side="${side}" style="--d:${(R() * 3).toFixed(2)}s">
      <div class="cand-top">${Avatar.svg(p.look, uid)}<div class="who"><span class="col">ผู้สมัคร ${col}</span><h3>${esc(p.name)}</h3><p class="num small">อายุ ${p.age} ปี · ${p.sex}</p><span class="party">${/^[A-D]$/.test(party) ? "พรรค " + party : esc(party)}</span></div></div>
      <dl>${rowsFor(p, task.design).map(([l, v]) => `<div><dt>${l}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
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
      meta: { id: st.meta.id, started: st.meta.started, finished: new Date().toISOString(), seconds: Math.round((performance.now() - (st.t0 || 0)) / 1000), mode: st.meta.mode, venue: st.meta.venue, design: st.meta.design, version: st.meta.version, order: st.meta.order, instrument: "IOC v1.4" },
      answers: { ...st.ans }, text: { ...st.txt },
      conjoint: (st.cj.tasks || []).map((t, i) => ({ task: i + 1, pair: t.k, item: t.n, chosen: t.choice, ms: t.at, left: strip(t.L, t.design), right: strip(t.Rt, t.design) })),
      ipc: { I: sc.I, P: sc.P, C: sc.C, complete: sc.complete },
    };
  }
  function strip(p, design) {
    const look = { sex: p.look.sex, pose: p.look.pose, skin: p.look.skin, shirt: p.look.shirt, hairC: p.look.hairC, flip: p.look.flip };
    if (design === "fixed") return { name: p.name, party: p.partyCode || p.party, look };
    const o = { party: p.party, sex: p.sex, age: p.age, look };
    for (const k of ["occ", "exp", "fam", "role", "tie", "offer", "amt", "time", "cert"]) if (p[k] !== undefined) o[k] = p[k];
    return o;
  }

  function finish() {
    const rec = record();
    st.rec = rec;
    if (!DEMO && CONFIG.endpoint) {
      fetch(CONFIG.endpoint, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(rec) }).catch(() => {});
    }
    st.screen = "done"; render();
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
      ${DEMO ? `<details class="rec"><summary>ข้อมูลที่ระบบจะบันทึกเมื่อเปิดเก็บจริง <span class="chip">โหมดตัวอย่าง · ไม่ได้ส่งไปที่ใด</span></summary>
        <p class="small muted">หนึ่งแถวต่อผู้ตอบ ไม่มีชื่อ เบอร์โทร หรือพิกัด ข้อ 25–28 เก็บเฉพาะคำตอบ การตรวจคะแนนทำตอนวิเคราะห์เท่านั้น</p>
        <pre>${esc(JSON.stringify(st.rec, null, 1))}</pre>
        <button type="button" class="btn" id="dl">ดาวน์โหลดไฟล์ JSON</button></details>` : `<p class="small muted">ระบบส่งคำตอบแล้ว ปิดหน้านี้ได้เลย</p>`}
      <div class="nav"><button type="button" class="btn ghost" id="again">เริ่มใหม่</button><a class="btn primary" href="../">กลับหน้าหลักงานวิจัย</a></div>
    </section>`;
    const dl = $("#dl");
    if (dl) dl.onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(st.rec, null, 1)], { type: "application/json" })); a.download = `survey-demo-${st.meta.id}.json`; a.click(); };
    $("#again").onclick = () => location.reload();
  }

  function renderOut() {
    app.innerHTML = `<section class="panel"><h2>ขอบคุณสำหรับเวลาของท่าน</h2>
      <p class="lead">จากคำตอบในส่วนที่ 1 ท่านไม่อยู่ในกลุ่มที่งานวิจัยนี้ศึกษา (ผู้มีสิทธิเลือกตั้งที่มีชื่อในทะเบียนบ้านใน 4 อำเภอของบุรีรัมย์) จึงขอยุติการตอบเพียงเท่านี้</p>
      <div class="nav"><button class="btn ghost" id="b">← แก้คำตอบส่วนที่ 1</button>${DEMO ? `<button class="btn" id="c">ทดลองต่อ (โหมดตัวอย่าง)</button>` : ""}</div></section>`;
    $("#b").onclick = () => { st.screen = "part"; st.part = 0; render(); };
    const c = $("#c"); if (c) c.onclick = () => { st.screen = "part"; st.part = 1; render(); };
  }

  let toastT;
  function toast(msg) {
    let t = $("#toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 3800);
  }

  window.__survey = { st, scores, record };     // for testing
  const jump = DEMO && location.hash.match(/^#p([1-7])$/);
  if (jump) { st.meta.mode = 2; st.meta.venue = 4; st.meta.started = new Date().toISOString(); st.t0 = performance.now(); st.screen = "part"; st.part = +jump[1] - 1; if (st.part === 3) st.cj.stage = "intro"; }
  render();
})();
