/* Candidate portraits built from the researcher's own slide characters (Canva SVG export, rebuilt as vector gradients).
   Two poses (A: hands together in a wai, B: arms crossed) × two hair styles (bun/bob = หญิง, top-knot = ชาย) are recombined;
   skin, shirt and hair colours are remapped per channel from each template's own gradient end-points, so the shading
   of the original drawing is kept. Appearance is drawn at random and recorded with the answer. */
(function (g) {
  const T = window.AVATAR_TPL;                      // { A_patron:{vb,groups}, B_policy:{vb,groups} }
  const POSE = { A: T.A_patron, B: T.B_policy };
  const NATIVE_SEX = { A: "หญิง", B: "ชาย" };
  // reference gradient end-points measured from the original pieces [dark, light]
  const REF = {
    skin: { A: ["#785242", "#d1ab91"], B: ["#cc8d5e", "#f8ddc3"] },
    shirt: { A: ["#8a6f45", "#dbbf80"], B: ["#edc068", "#ece9df"] },
    hair: ["#010101", "#3a3636"],
  };
  const mix = (a, b, t) => "#" + [1, 3, 5].map(i => Math.round(parseInt(a.substr(i, 2), 16) * (1 - t) + parseInt(b.substr(i, 2), 16) * t).toString(16).padStart(2, "0")).join("");
  // skin tones: 0 = the light character's own skin … 3 = the dark character's own skin, 1–2 interpolated between them
  const SKIN = [0, 1 / 3, 2 / 3, 1].map(t => [mix(REF.skin.B[0], REF.skin.A[0], t), mix(REF.skin.B[1], REF.skin.A[1], t)]);
  const SKIN_LABEL = ["ผิวสว่าง 1", "ผิวสว่าง 2", "ผิวเข้ม 1", "ผิวเข้ม 2"];
  // neutral shirts only (no party colours); each entry gives [dark, light] for pose A and pose B
  const SHIRT = [
    { k: "gold", A: REF.shirt.A, B: ["#c9a45a", "#efe2c4"] },
    { k: "cream", A: ["#b9a78a", "#efe6d3"], B: REF.shirt.B },
    { k: "sage", A: ["#5f6d55", "#b7c2a4"], B: ["#9aa886", "#e3e8d8"] },
    { k: "grey", A: ["#5e5f62", "#c3c4c6"], B: ["#9c9ea2", "#e6e7e8"] },
    { k: "white", A: ["#a9a59c", "#f3f1ec"], B: ["#c9c6be", "#f6f4ef"] },
  ];
  // moving parts by template index. A (hands together): forearms "fa", hands "hn", head "hd". B (arms crossed): arms "ar", chest "ch", head "hd"
  const ANIM = { A: { 9: "fa", 11: "fa", 15: "hn", 16: "hn", 0: "hd", 17: "hd", 18: "hd", 19: "hd", 20: "hd" },
                 B: { 0: "ar", 1: "ar", 8: "ar", 9: "ar", 10: "ar", 12: "ar", 2: "ch", 3: "ch", 7: "ch", 16: "ch", 5: "hd", 6: "hd", 13: "hd", 14: "hd", 15: "hd" } };
  const HAIR = [REF.hair, ["#1c120c", "#4a3426"], ["#5a5a5a", "#a9a9a9"]];

  const hex = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
  function mapper(from, to) {                       // project each colour onto the reference dark→light line, then re-draw it on the target line
    const F0 = hex(from[0]), F1 = hex(from[1]), T0 = hex(to[0]), T1 = hex(to[1]);
    const D = F1.map((v, i) => v - F0[i]), dd = D.reduce((s, v) => s + v * v, 0) || 1;
    return c => {
      const C = hex(c);
      const t = Math.max(-0.4, Math.min(1.4, C.reduce((s, v, i) => s + (v - F0[i]) * D[i], 0) / dd));
      return "#" + T0.map((v, i) => Math.max(0, Math.min(255, Math.round(v + t * (T1[i] - v)))).toString(16).padStart(2, "0")).join("");
    };
  }
  const recolor = (s, f) => f ? s.replace(/stop-color="(#[0-9a-f]{6})"/gi, (_, c) => `stop-color="${f(c)}"`) : s;
  const uniq = (s, u) => s.replace(/id="([^"]+)"/g, `id="${u}$1"`).replace(/url\(#([^)]+)\)/g, `url(#${u}$1)`).replace(/href="#([^"]+)"/g, `href="#${u}$1"`);

  function svg(l, uid) {
    const pose = l.pose || "A", P = POSE[pose], other = pose === "A" ? "B" : "A", O = POSE[other];
    const swap = l.sex !== NATIVE_SEX[pose];
    const fSkin = l.skin == null ? null : mapper(REF.skin[pose], SKIN[l.skin]);
    const fSkinO = l.skin == null ? null : mapper(REF.skin[other], SKIN[l.skin]);
    const fShirt = l.shirt == null ? null : mapper(REF.shirt[pose], SHIRT[l.shirt][pose]);
    const fHair = l.hairC == null ? null : mapper(REF.hair, HAIR[l.hairC]);
    const head = P.groups.find(x => x.role === "head").box, headO = O.groups.find(x => x.role === "head").box;
    const s = head[2] / headO[2];
    const tr = `translate(${(head[0] + head[2] / 2).toFixed(2)} ${head[1].toFixed(2)}) scale(${s.toFixed(4)}) translate(${(-(headO[0] + headO[2] / 2)).toFixed(2)} ${(-headO[1]).toFixed(2)})`;
    let defs = "", body = "";
    const add = (x, f, wrap, cls) => {
      defs += recolor(x.defs, f);
      const h = wrap ? `<g transform="${tr}">${x.html}</g>` : x.html;
      body += cls ? `<g class="g-${cls}">${h}</g>` : h;      // a wrapper, so CSS motion never replaces the part's own transform
    };
    const part = ANIM[pose];
    const fFor = r => r === "hairBack" || r === "hairFront" ? fHair : r === "skin" || r === "head" ? fSkin : r === "shirt" || r === "button" ? fShirt : null;
    P.groups.forEach((x, i) => {
      if (x.role === "badge" && !l.badge) return;
      if (l.only && !l.only.includes(x.role)) return;
      if (swap && (x.role === "hairBack" || x.role === "hairFront")) return;
      if (swap && x.role === "head") for (const y of O.groups) if (y.role === "hairBack") add(y, fHair, true, "hd");
      add(x, fFor(x.role), false, part[i]);
    });
    if (swap) for (const y of O.groups) if (y.role === "hairFront") add(y, fHair, true, "hd");
    const vb = P.vb, crop = [vb[0], vb[1], vb[2], vb[3] * (pose === "A" ? 0.86 : 0.84)];
    const cx = vb[0] + vb[2] / 2;
    const flip = l.flip ? ` transform="translate(${2 * cx} 0) scale(-1 1)"` : "";
    return uniq(`<svg class="av av2 pose-${pose}" viewBox="${crop.map(v => v.toFixed(2)).join(" ")}" role="img" aria-label="ภาพประกอบผู้สมัคร (ภาพสมมติ)"><defs>${defs}</defs><g${flip}><g class="av-body">${body}</g></g></svg>`, "u" + uid + "_");
  }

  // two contrasting looks for one pair: one lighter and one darker skin, different poses and shirts, side assignment random
  function pairLooks(sexA, sexB, r) {
    const pick = a => a[Math.floor(r() * a.length)];
    const darkFirst = r() < 0.5;
    const light = Math.floor(r() * 2), dark = 2 + Math.floor(r() * 2);
    const poseA = r() < 0.5 ? "A" : "B", poseB = poseA === "A" ? "B" : "A";
    const shirts = [0, 1, 2, 3, 4].sort(() => r() - 0.5);
    const mk = (sex, skin, pose, shirt, age) => ({ sex, skin, pose, shirt, hairC: age >= 52 && r() < 0.5 ? 2 : (r() < 0.7 ? 0 : 1), flip: r() < 0.5, badge: false });
    return (ageA, ageB) => [mk(sexA, darkFirst ? dark : light, poseA, shirts[0], ageA), mk(sexB, darkFirst ? light : dark, poseB, shirts[1], ageB)];
  }
  g.Avatar = { svg, pairLooks, SKIN_LABEL, SHIRT_KEYS: SHIRT.map(s => s.k), version: 2 };
})(window);
