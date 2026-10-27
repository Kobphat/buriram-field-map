/* Sign-in for the research website. The back end (Google Apps Script) checks the password and returns a signed token;
   this file keeps the token in this browser and attaches it to requests. Data are never stored here.
   Auth.form(el, opts) draws the sign-in box (and the set-new-password step) inside el. */
(function () {
  "use strict";
  const CONF = window.SITE_CONFIG || {};
  const KEY = "bfm.session";
  const HOURS = { admin: 12, enumerator: 72 };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const connected = !!(CONF.live && CONF.endpoint);

  function get() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.exp > Date.now()) return s; } catch (e) {} return null; }
  function set(token, user, expires) { const s = { token, user, exp: (expires || Date.now() + (HOURS[user.role] || 12) * 3600e3) - 60e3 }; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} fire(); return s; }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} fire(); }
  const subs = [];
  function fire() { subs.forEach(f => { try { f(get()); } catch (e) {} }); }

  async function api(action, body = {}) {
    if (!connected) return { ok: false, error: "ยังไม่ได้เชื่อมระบบหลังบ้าน (โหมดตัวอย่าง)" };
    const s = get();
    let r;
    try {
      r = await fetch(CONF.endpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(Object.assign({ action, token: s && s.token }, body)) });
    } catch (e) { return { ok: false, offline: true, error: "ติดต่อระบบไม่ได้ ตรวจสัญญาณอินเทอร์เน็ต" }; }
    let t = ""; try { t = await r.text(); } catch (e) {}
    let j; try { j = JSON.parse(t); } catch (e) { console.error("back end replied:", t.slice(0, 800)); return { ok: false, error: "ระบบตอบกลับผิดรูปแบบ (HTTP " + r.status + ") " + t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) }; }
    if (!j.ok && j.auth) clear();
    if (!j.ok && j.forbidden && /รหัสผ่านใหม่/.test(j.error || "") && s) { s.user.mustChange = true; set(s.token, s.user); }
    return j;
  }
  async function login(username, password, remember) { const j = await api("login", { username, password, remember: !!remember }); if (j.ok) set(j.token, j.user, j.expires); return j; }
  async function changePassword(old, password) { const j = await api("changePassword", { old, password }); if (j.ok) set(j.token, j.user, j.expires); return j; }

  /** Draws the sign-in box. opts: { title, lead, onDone(session), demo: {label, user} } */
  function form(el, opts = {}) {
    const s = get();
    if (s && s.user.mustChange) return changeForm(el, opts);
    el.innerHTML = `<form class="login" novalidate>
      ${opts.title ? `<h3>${esc(opts.title)}</h3>` : ""}${opts.lead ? `<p class="small muted">${esc(opts.lead)}</p>` : ""}
      <label class="fld"><span>ชื่อผู้ใช้</span><input class="txt" name="u" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
      <label class="fld"><span>รหัสผ่าน</span><span class="pw"><input class="txt" name="p" type="password" autocomplete="current-password" required><button type="button" class="eye" aria-label="แสดงรหัสผ่าน">แสดง</button></span></label>
      <p class="err small" role="alert"></p>
      <label class="remember"><input type="checkbox" name="r" checked> จำการเข้าสู่ระบบในเครื่องนี้ 30 วัน <span class="muted">(ไม่ต้องติ๊กถ้าเป็นเครื่องที่คนอื่นใช้ด้วย)</span></label>
      <div class="row"><button class="btn primary" type="submit" ${connected ? "" : "disabled"}>เข้าสู่ระบบ</button>
      ${!connected && opts.demo ? `<button class="btn" type="button" data-demo>${esc(opts.demo.label)}</button>` : ""}</div>
      ${connected ? `<p class="small muted">ลืมรหัสผ่าน: ขอให้ผู้วิจัยตั้งรหัสผ่านชั่วคราวให้ใหม่</p>` : `<p class="small muted">หน้านี้ยังเป็นโหมดตัวอย่าง ระบบเข้าสู่ระบบจะใช้ได้เมื่อเชื่อมกับหลังบ้าน (Google Apps Script) แล้ว</p>`}
    </form>`;
    const f = el.querySelector("form"), err = el.querySelector(".err");
    el.querySelector(".eye").onclick = e => { const i = f.p; i.type = i.type === "password" ? "text" : "password"; e.target.textContent = i.type === "password" ? "แสดง" : "ซ่อน"; };
    const d = el.querySelector("[data-demo]"); if (d) d.onclick = () => { const ss = { token: "demo", user: opts.demo.user, exp: Date.now() + 3600e3, demo: true }; try { localStorage.setItem(KEY, JSON.stringify(ss)); } catch (e) {} fire(); opts.onDone && opts.onDone(ss); };
    f.onsubmit = async e => {
      e.preventDefault(); err.textContent = "";
      if (!f.u.value.trim() || !f.p.value) { err.textContent = "กรอกชื่อผู้ใช้และรหัสผ่าน"; return; }
      const b = f.querySelector("[type=submit]"); b.disabled = true; b.textContent = "กำลังตรวจสอบ…";
      const j = await login(f.u.value.trim(), f.p.value.trim(), f.r.checked);          // copied passwords often carry a stray space
      b.disabled = false; b.textContent = "เข้าสู่ระบบ";
      if (!j.ok) { err.textContent = j.error || "เข้าสู่ระบบไม่สำเร็จ"; f.p.value = ""; f.p.focus(); return; }
      if (j.user.mustChange) return changeForm(el, opts, f.p.value.trim());
      opts.onDone && opts.onDone(get());
    };
  }
  function changeForm(el, opts, oldPw = "") {
    el.innerHTML = `<form class="login" novalidate>
      <h3>ตั้งรหัสผ่านของคุณ</h3><p class="small muted">รหัสผ่านที่ได้จากผู้วิจัยเป็นรหัสชั่วคราว ตั้งรหัสใหม่อย่างน้อย 8 ตัวที่จำได้และไม่ใช้กับบริการอื่น</p>
      ${oldPw ? "" : `<label class="fld"><span>รหัสผ่านชั่วคราว</span><input class="txt" name="o" type="password" autocomplete="current-password"></label>`}
      <label class="fld"><span>รหัสผ่านใหม่</span><input class="txt" name="n" type="password" autocomplete="new-password" minlength="8"></label>
      <label class="fld"><span>พิมพ์รหัสผ่านใหม่อีกครั้ง</span><input class="txt" name="n2" type="password" autocomplete="new-password"></label>
      <p class="err small" role="alert"></p>
      <div class="row"><button class="btn primary" type="submit">บันทึกรหัสผ่าน</button><button class="btn ghost" type="button" data-out>ยกเลิก</button></div></form>`;
    const f = el.querySelector("form"), err = el.querySelector(".err");
    el.querySelector("[data-out]").onclick = () => { clear(); form(el, opts); };
    f.onsubmit = async e => {
      e.preventDefault(); err.textContent = "";
      const o = (oldPw || (f.o && f.o.value) || "").trim();
      if (f.n.value.length < 8) { err.textContent = "รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัว"; return; }
      if (f.n.value !== f.n2.value) { err.textContent = "รหัสผ่านใหม่สองช่องไม่ตรงกัน"; return; }
      const j = await changePassword(o, f.n.value);
      if (!j.ok) { err.textContent = j.error || "บันทึกไม่สำเร็จ"; if (j.auth) form(el, opts); return; }
      opts.onDone && opts.onDone(get());
    };
  }

  /* the "เข้าสู่ระบบ" item in the site menu becomes the signed-in user's own page */
  function paintNav() {
    const s = get();
    document.querySelectorAll('.site-nav a[href$="admin/"]').forEach(a => {
      if (!a.dataset.label) a.dataset.label = a.textContent;
      if (s && !s.user.mustChange) {
        const nm = s.user.name || s.user.username;
        a.innerHTML = `<span class="me-av" aria-hidden="true">${esc(nm.slice(0, 1))}</span><span class="me-nm">${esc(nm)}</span>`;
        a.classList.add("me"); a.title = "บัญชีของฉัน (" + s.user.username + ")"; a.setAttribute("aria-label", "บัญชีของฉัน: " + nm);
      } else { a.textContent = a.dataset.label; a.classList.remove("me"); a.removeAttribute("title"); a.removeAttribute("aria-label"); }
    });
  }
  /* pick up changes the researcher made to this account (e.g. a collector number) without signing out */
  async function refresh() {
    const s = get(); if (!s || s.demo || !connected) return s;
    const j = await api("me"); if (!j.ok || !j.user) return get();
    const cur = get(); if (!cur) return null;
    if (JSON.stringify(cur.user) !== JSON.stringify(Object.assign({}, cur.user, j.user))) { cur.user = Object.assign({}, cur.user, j.user); try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) {} fire(); }
    return cur;
  }
  subs.push(paintNav);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paintNav); else paintNav();
  setTimeout(refresh, 0);
  window.addEventListener("storage", e => { if (e.key === KEY) fire(); });     // sign-in or sign-out in another tab

  window.Auth = { connected, get, set, clear, api, login, changePassword, refresh, form, onChange: f => subs.push(f), esc };
})();
