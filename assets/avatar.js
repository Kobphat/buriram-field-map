/* Original flat-style candidate portraits. Appearance is drawn at random per candidate and recorded with the answer,
   so it can be balanced (and estimated) in analysis instead of being tied to one profile. Clothing uses neutral tones
   only, so no colour reads as a real party. */
(function (g) {
  const SKIN = ["#f2cfae", "#e2b08a", "#bf8460", "#8f5c3d"];          // 0,1 lighter · 2,3 darker
  const SKIN_SH = ["#e3b892", "#cf9771", "#a56d4c", "#774a30"];
  const HAIR_C = ["#1d1916", "#3a2a20", "#5b4636", "#7d7b78"];        // black, dark brown, brown, grey
  const SHIRT = ["#d8d2c3", "#c3cbc4", "#e7e4dc", "#b9b1a4", "#cfd3d8", "#c9c2b2"];
  const M_HAIR = ["short", "side", "crop"], F_HAIR = ["bob", "bun", "long"];

  function pick(a, r) { return a[Math.floor(r() * a.length)]; }

  // two contrasting looks for one pair: one lighter, one darker skin; different hair & shirt
  function pairLooks(sexA, sexB, r) {
    const light = Math.floor(r() * 2), dark = 2 + Math.floor(r() * 2);
    const darkFirst = r() < 0.5;
    const s1 = shuffle(SHIRT.slice(), r);
    const mk = (sex, skin, shirt, age) => ({
      sex, skin, shirt,
      hair: pick(sex === "หญิง" ? F_HAIR : M_HAIR, r),
      hairC: age >= 52 && r() < 0.55 ? 3 : Math.floor(r() * 3),
      glasses: r() < 0.3,
    });
    return (ageA, ageB) => {
      const A = mk(sexA, darkFirst ? dark : light, s1[0], ageA);
      const B = mk(sexB, darkFirst ? light : dark, s1[1], ageB);
      if (A.sex === B.sex && A.hair === B.hair) {
        const pool = (B.sex === "หญิง" ? F_HAIR : M_HAIR).filter(h => h !== A.hair);
        B.hair = pick(pool, r);
      }
      return [A, B];
    };
  }
  function shuffle(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function hairBack(l, c) {
    if (l.hair === "long") return `<path d="M33 56 C30 30 46 18 60 18 C76 18 90 30 87 56 L90 100 C80 104 72 98 70 90 L50 90 C48 98 40 104 30 100 Z" fill="${c}"/>`;
    if (l.hair === "bob") return `<path d="M34 58 C31 30 46 19 60 19 C75 19 89 30 86 58 L87 78 C80 82 76 76 76 70 L44 70 C44 76 40 82 33 78 Z" fill="${c}"/>`;
    return "";
  }
  function hairFront(l, c) {
    switch (l.hair) {
      case "short": return `<path d="M37 50 C35 30 48 21 60 21 C73 21 86 29 83 50 C80 41 74 35 64 34 C56 33 47 35 41 42 C39 45 38 47 37 50 Z" fill="${c}"/>`;
      case "side":  return `<path d="M36 52 C33 30 47 20 61 20 C76 20 87 30 84 50 C82 44 79 40 74 37 C64 40 50 38 44 34 C40 39 37 45 36 52 Z" fill="${c}"/>`;
      case "crop":  return `<path d="M38 46 C38 30 49 24 60 24 C71 24 82 30 82 46 C78 38 70 33 60 33 C50 33 42 38 38 46 Z" fill="${c}" opacity=".92"/>`;
      case "bob":   return `<path d="M37 54 C36 34 47 25 60 25 C74 25 84 34 83 54 C80 42 72 37 66 36 C62 41 52 44 41 44 C39 47 38 50 37 54 Z" fill="${c}"/>`;
      case "bun":   return `<circle cx="60" cy="17" r="9" fill="${c}"/><path d="M37 50 C36 31 48 23 60 23 C72 23 84 31 83 50 C80 40 71 34 60 34 C49 34 40 40 37 50 Z" fill="${c}"/>`;
      case "long":  return `<path d="M37 54 C36 33 47 24 60 24 C73 24 84 33 83 54 C79 42 71 36 60 35 C55 41 46 45 39 46 C38 49 37 51 37 54 Z" fill="${c}"/>`;
    }
    return "";
  }

  function svg(l, uid) {
    const sk = SKIN[l.skin], sh = SKIN_SH[l.skin], hc = HAIR_C[l.hairC];
    const female = l.sex === "หญิง";
    const collar = female
      ? `<path d="M48 86 Q60 98 72 86" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="2"/>`
      : `<path d="M50 84 L60 96 L70 84 L66 82 L60 89 L54 82 Z" fill="#f6f4ef"/><path d="M58 92 L62 92 L63 112 L60 116 L57 112 Z" fill="rgba(0,0,0,.22)"/>`;
    const glasses = l.glasses ? `<g fill="none" stroke="#2b2b2b" stroke-width="1.6" opacity=".85"><circle cx="51" cy="54" r="6"/><circle cx="69" cy="54" r="6"/><path d="M57 54 L63 54"/></g>` : "";
    const ear = female ? `<circle cx="38.5" cy="62" r="1.8" fill="#d9c27a"/><circle cx="81.5" cy="62" r="1.8" fill="#d9c27a"/>` : "";
    return `<svg class="av" viewBox="0 0 120 120" role="img" aria-label="ภาพประกอบผู้สมัคร (ภาพสมมติ)">
  <defs><clipPath id="c${uid}"><circle cx="60" cy="60" r="58"/></clipPath></defs>
  <circle cx="60" cy="60" r="58" fill="var(--skin-bg)"/>
  <g clip-path="url(#c${uid})"><g class="av-body">
    ${hairBack(l, hc)}
    <path d="M14 124 C16 96 36 84 60 84 C84 84 104 96 106 124 Z" fill="${l.shirt}"/>
    <path d="M14 124 C16 96 36 84 60 84 C84 84 104 96 106 124" fill="none" stroke="rgba(0,0,0,.10)" stroke-width="2"/>
    <rect x="52" y="70" width="16" height="16" rx="6" fill="${sh}"/>
    ${collar}
    <ellipse cx="38" cy="57" rx="4" ry="6" fill="${sh}"/><ellipse cx="82" cy="57" rx="4" ry="6" fill="${sh}"/>
    <ellipse cx="60" cy="54" rx="22" ry="25" fill="${sk}"/>
    ${ear}
    ${hairFront(l, hc)}
    <path d="M45 46 Q51 43 56 46" fill="none" stroke="${hc}" stroke-width="2" stroke-linecap="round"/>
    <path d="M64 46 Q69 43 75 46" fill="none" stroke="${hc}" stroke-width="2" stroke-linecap="round"/>
    <g class="av-eyes"><ellipse cx="51" cy="54" rx="2.4" ry="2.8" fill="#231c18"/><ellipse cx="69" cy="54" rx="2.4" ry="2.8" fill="#231c18"/></g>
    <ellipse cx="46" cy="63" rx="4" ry="2.2" fill="#e07a6a" opacity=".18"/><ellipse cx="74" cy="63" rx="4" ry="2.2" fill="#e07a6a" opacity=".18"/>
    <path d="M58 58 Q60 62 62 58" fill="none" stroke="${sh}" stroke-width="1.8" stroke-linecap="round"/>
    <path class="av-mouth" d="M52 66 Q60 72 68 66" fill="none" stroke="#7a3b30" stroke-width="2.2" stroke-linecap="round"/>
    ${glasses}
  </g></g>
</svg>`;
  }
  g.Avatar = { svg, pairLooks, SKIN_LABEL: ["ผิวสว่าง 1", "ผิวสว่าง 2", "ผิวเข้ม 1", "ผิวเข้ม 2"] };
})(window);
