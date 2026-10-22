#!/usr/bin/env python3
"""Writes the five editorial scene sub-compositions (compositions/q|method|boring|simplify|final.html).
Each file inlines the shared paper look and helpers because a scene file cannot include another."""
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_FACE = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read().split("<style>")[1].split("* { margin")[0]
GRAIN_URI = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' seed='7' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.35 0 0 0 0 0.3 0 0 0 0 0.25 0 0 0 0.9 0'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)'/%3E%3C/svg%3E"
COMMON_CSS = FONT_FACE + """
    #root { position: absolute; inset: 0; overflow: hidden; background: var(--paper, #E9E0D3);
            font-family: "Cairo", sans-serif; direction: rtl; color: var(--ink, #1B1D1E); }
    .ground { position: absolute; inset: 0; background: var(--paper, #E9E0D3); }
    .vig { position: absolute; inset: 0; background: radial-gradient(ellipse 72% 62% at 50% 46%, rgba(212,200,184,0) 52%, rgba(212,200,184,0.6) 100%); }
    .grain { position: absolute; inset: 0; opacity: 0.075; mix-blend-mode: multiply; background-image: url("__GRAIN__"); background-size: 256px 256px; }
    .t { position: absolute; left: 80px; right: 80px; text-align: center; direction: rtl; unicode-bidi: isolate; white-space: nowrap; line-height: 1.15; }
    .row { display: flex; flex-direction: row; justify-content: center; align-items: baseline; gap: 0.28em; }
    .w { display: inline-block; will-change: transform, opacity, filter; }
    .ctx { font-weight: 600; font-size: 46px; color: var(--ink-soft, #3A3D3E); }
    .sub { font-weight: 700; font-size: 64px; color: var(--ink-soft, #3A3D3E); }
    .hero { font-weight: 900; color: var(--ink, #1B1D1E); letter-spacing: -0.01em; }
    .warm { color: var(--accent-warm-dark, #C85218); }
    svg { position: absolute; overflow: visible; }
    .ink { stroke: var(--ink, #1B1D1E); fill: none; stroke-linecap: round; stroke-linejoin: round; }
    path[pathLength], rect[pathLength] { stroke-dasharray: 1; stroke-dashoffset: 1; }
    .warm-fill { fill: var(--accent-warm, #E66A21); }
""".replace("__GRAIN__", GRAIN_URI)
HELPERS = """
      function rise(tl, targets, at, stagger, dur) {
        tl.fromTo(targets, { opacity: 0, y: 26, filter: "blur(6px)" },
          { opacity: 1, y: 0, filter: "blur(0px)", duration: dur || 0.3, ease: "expo.out", stagger: stagger || 0 }, at);
      }
      function stamp(tl, target, at, rot) {
        tl.fromTo(target, { opacity: 0, scale: 1.12, rotation: rot || 0, filter: "blur(5px)" },
          { opacity: 1, scale: 1, rotation: 0, filter: "blur(0px)", duration: 0.2333, ease: "power4.out" }, at);
      }
      function draw(tl, path, at, dur, ease) {   // every path carries pathLength="1"
        tl.fromTo(path, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: dur, ease: ease || "power2.inOut" }, at);
      }
      function pop(tl, target, at) {
        tl.fromTo(target, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.2, ease: "back.out(1.4)" }, at);
      }
"""
def scene(cid, body_css, body_html, body_js):
    return f'''<template>
  <style>{COMMON_CSS}{body_css}
  </style>
  <div id="root" data-composition-id="{cid}" data-width="1080" data-height="1920" dir="rtl" lang="ar">
    <div class="ground"></div>
    <div class="vig"></div>
{body_html}
    <div class="grain" data-layout-ignore></div>
  </div>
  <script>
    (function () {{
      "use strict";
      var tl = gsap.timeline({{ paused: true }});{HELPERS}
{body_js}
      tl.seek(0);
      window.__timelines["{cid}"] = tl;
    }})();
  </script>
</template>
'''
S = {}
# ---------------- G1: the question ----------------
S["q"] = ("""
    #q-ctx { top: 286px; font-weight: 700; font-size: 76px; color: var(--ink, #1B1D1E); }
    #q-hero { top: 430px; }
    #q-hero .ma { font-weight: 800; font-size: 96px; }
    #q-hero .big { font-size: 190px; line-height: 1.05; }
    #q-marks { top: 700px; font-weight: 900; font-size: 300px; line-height: 1; color: var(--ink, #1B1D1E); }
    #q-marks .row { gap: 40px; }
    #q-word { top: 1050px; font-weight: 800; font-size: 132px; line-height: 1.1; }
    #q-qm { position: absolute; left: 96px; top: 1010px; font-weight: 900; font-size: 380px; line-height: 1; color: var(--accent-warm-dark, #C85218); transform-origin: 50% 60%; }
""", """
    <svg id="q-cardsvg" width="1080" height="640" viewBox="0 0 1080 640" style="top: 880px; left: 0">
      <g id="q-cardg" transform="rotate(-3 540 300)">
        <rect id="q-cardfill" x="190" y="90" width="700" height="420" rx="14" fill="var(--paper-light, #F6F0E7)" />
        <path id="q-rule1" class="ink" d="M 250 380 H 830" stroke-width="3" pathLength="1" stroke="var(--paper-dark, #D4C8B8)" />
        <path id="q-rule2" class="ink" d="M 250 440 H 830" stroke-width="3" pathLength="1" stroke="var(--paper-dark, #D4C8B8)" />
        <rect id="q-cardborder" class="ink" x="190" y="90" width="700" height="420" rx="14" stroke-width="5" pathLength="1" />
      </g>
    </svg>
    <div id="q-ctx" class="t ctx row"><span class="w" id="q-c1">عندما</span><span class="w" id="q-c2">يسألهم</span><span class="w" id="q-c3">المعلم</span></div>
    <div id="q-hero" class="t row"><span class="w ma" id="q-ma">ما</span><span class="w hero big" id="q-irab">إعراب</span></div>
    <div id="q-marks" class="t row"><span class="w" id="q-m1">ـَ</span><span class="w" id="q-m2">ـُ</span><span class="w" id="q-m3">ـِ</span></div>
    <div id="q-word" class="t"><span class="w hero" id="q-kalima">كلمة</span></div>
    <div id="q-qm" class="w" data-layout-allow-overlap>؟</div>
""", """
      // cues (scene-local seconds): عندما 0.00 · يسألهم 0.27 · المعلم 1.11 · ما 1.53 · إعراب 1.84 · كلمة؟ 2.35 · cut 3.10
      // the scene opens on its object: the blank card is already on the paper at the cut, its border inks in
      gsap.set("#q-cardfill", { opacity: 1 });
      draw(tl, "#q-cardborder", 0.0, 0.45);
      draw(tl, "#q-rule1", 0.30, 0.25, "power1.inOut");  draw(tl, "#q-rule2", 0.36, 0.25, "power1.inOut");
      rise(tl, "#q-c1", 0.0, 0, 0.16);  rise(tl, "#q-c2", 0.27);  rise(tl, "#q-c3", 1.11);
      rise(tl, "#q-ma", 1.53);
      stamp(tl, "#q-irab", 1.84);
      rise(tl, "#q-kalima", 2.35);
      pop(tl, "#q-m1", 2.42);  pop(tl, "#q-m2", 2.50);  pop(tl, "#q-m3", 2.58);
      stamp(tl, "#q-qm", 2.62, 10);
""")
# ---------------- G2: no real methodology ----------------
S["method"] = ("""
    #m-neg { top: 290px; font-weight: 900; font-size: 112px; color: var(--accent-warm-dark, #C85218); line-height: 1.1; }
    #m-hero { top: 420px; font-size: 212px; line-height: 1.05; }
    #m-sub { top: 700px; font-weight: 800; font-size: 92px; color: var(--ink-soft, #3A3D3E); }
    #m-bottom { top: 1490px; font-weight: 700; font-size: 62px; color: var(--ink-soft, #3A3D3E); }
    #m-route text { font-family: "Cairo", sans-serif; font-weight: 800; font-size: 50px; fill: var(--ink, #1B1D1E); text-anchor: middle; dominant-baseline: central; }
    #m-route .node circle { fill: var(--paper-light, #F6F0E7); }
""", """
    <div id="m-neg" class="t row"><span class="w" id="m-la">لا</span><span class="w" id="m-yujad">يوجد</span></div>
    <div id="m-hero" class="t"><span class="w hero" id="m-manhaj">منهجية</span></div>
    <div id="m-sub" class="t"><span class="w" id="m-haq">حقيقية</span></div>
    <svg id="m-route" width="1080" height="600" viewBox="0 0 1080 600" style="top: 860px; left: 0">
      <path id="m-l1" class="ink" d="M 846 470 C 800 420, 760 380, 734 342" stroke-width="6" pathLength="1" />
      <path id="m-l2" class="ink" d="M 626 322 C 580 340, 540 370, 512 396" stroke-width="6" pathLength="1" />
      <path id="m-l3" class="ink" d="M 406 388 C 380 360, 362 330, 352 300" stroke-width="6" pathLength="1" />
      <path id="m-stub" class="ink" d="M 352 300 c -10 -28 -8 -54 -4 -70" stroke-width="3" pathLength="1" />
      <path id="m-scribble" class="ink" d="M 330 232 c 18 -26 42 -4 20 16 c -22 20 -38 -16 -10 -28 c 24 -10 46 20 14 34 c -30 12 -52 -22 -16 -36" stroke-width="5" pathLength="1" />
      <g id="m-n1" class="node"><circle cx="900" cy="500" r="54" class="ink" stroke-width="6" /><text x="900" y="500">١</text></g>
      <g id="m-n2" class="node"><circle cx="680" cy="320" r="54" class="ink" stroke-width="6" /><text x="680" y="320">٢</text></g>
      <g id="m-n3" class="node"><circle cx="460" cy="420" r="54" class="ink" stroke-width="6" /><text x="460" y="420">٣</text></g>
      <g id="m-n4" class="node"><circle cx="230" cy="170" r="54" class="ink" stroke-width="5" stroke-dasharray="14 12" /><text x="230" y="170">؟</text></g>
    </svg>
    <div id="m-bottom" class="t row"><span class="w" id="m-b1">في</span><span class="w" id="m-b2">تعلم</span><span class="w" id="m-b3">اللغة</span><span class="w" id="m-b4">العربية</span></div>
""", """
      // cues: لا 0.00 · يوجد 0.26 · منهجية 0.68 · حقيقية 1.26 · في 2.36 · تعلم 2.65 · اللغة 3.14 · العربية 3.72 · cut 4.43
      gsap.set(["#m-n1", "#m-n2", "#m-n3", "#m-n4"], { opacity: 0, transformOrigin: "50% 50%" });
      stamp(tl, "#m-la", 0.0);  stamp(tl, "#m-yujad", 0.26);
      pop(tl, "#m-n1", 0.10);
      draw(tl, "#m-l1", 0.26, 0.36);
      pop(tl, "#m-n2", 0.52);
      stamp(tl, "#m-manhaj", 0.68);
      draw(tl, "#m-l2", 0.74, 0.34);
      pop(tl, "#m-n3", 0.98);
      rise(tl, "#m-haq", 1.26);
      draw(tl, "#m-l3", 1.26, 0.22, "power1.in");          // the third link starts…
      draw(tl, "#m-stub", 1.44, 0.16, "power1.out");       // …thins to a dashed stub…
      draw(tl, "#m-scribble", 1.52, 0.30, "power2.out");   // …and knots up: no real method
      tl.fromTo("#m-n4", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.25, ease: "power2.out" }, 1.74);
      rise(tl, "#m-b1", 2.36);  rise(tl, "#m-b2", 2.65);  rise(tl, "#m-b3", 3.14);  rise(tl, "#m-b4", 3.72);
""")
# ---------------- G3: the boring style ----------------
S["boring"] = ("""
    #b-line1 { top: 640px; font-weight: 800; font-size: 120px; line-height: 1.1; }
    #b-hero { top: 1090px; font-size: 240px; line-height: 1.05; color: var(--accent-warm-dark, #C85218); }
""", """
    <div id="b-line1" class="t row"><span class="w" id="b-w1">أسلوب</span><span class="w" id="b-w2">المعلم</span></div>
    <svg id="b-flat" width="1080" height="200" viewBox="0 0 1080 200" style="top: 880px; left: 0">
      <path id="b-path" class="ink" d="M 1000 100 c -20 -22 -40 -22 -60 0 c -20 22 -40 22 -60 0 c -20 -22 -40 -22 -60 0 c -20 22 -40 22 -60 0 H 80" stroke-width="6" pathLength="1" />
      <path id="b-t1" class="ink" d="M 620 84 V 116" stroke-width="5" pathLength="1" />
      <path id="b-t2" class="ink" d="M 440 84 V 116" stroke-width="5" pathLength="1" />
      <path id="b-t3" class="ink" d="M 260 84 V 116" stroke-width="5" pathLength="1" />
    </svg>
    <div id="b-hero" class="t"><span class="w hero warm" id="b-mumil">الممل</span></div>
""", """
      // cues: أسلوب 0.08 · المعلم 0.76 · الممل 1.50 · cut 2.15
      rise(tl, "#b-w1", 0.08);  rise(tl, "#b-w2", 0.76);
      draw(tl, "#b-path", 0.0, 1.25, "none");               // constant speed: the monotony is the point
      draw(tl, "#b-t1", 0.56, 0.08, "none");  draw(tl, "#b-t2", 0.80, 0.08, "none");  draw(tl, "#b-t3", 1.04, 0.08, "none");
      stamp(tl, "#b-mumil", 1.50);
""")
# ---------------- G4: simplify and ease ----------------
S["simplify"] = ("""
    #s-ctx { top: 286px; }
    #s-h1 { top: 356px; font-size: 176px; line-height: 1.05; color: var(--accent-warm-dark, #C85218); }
    #s-h2 { top: 572px; font-size: 156px; line-height: 1.05; }
    #s-sub { top: 790px; font-weight: 700; font-size: 66px; color: var(--ink-soft, #3A3D3E); }
    #s-label { top: 1516px; font-weight: 800; font-size: 74px; }
""", """
    <div id="s-ctx" class="t ctx"><span class="w" id="s-ala">على</span></div>
    <div id="s-h1" class="t"><span class="w hero warm" id="s-tasheel">تسهيل</span></div>
    <div id="s-h2" class="t"><span class="w hero" id="s-tabseet">وتبسيط</span></div>
    <div id="s-sub" class="t row"><span class="w" id="s-hadhihi">هذه</span><span class="w" id="s-madda">المادة</span></div>
    <svg id="s-obj" width="1080" height="600" viewBox="0 0 1080 600" style="top: 900px; left: 0">
      <path id="s-knot" class="ink" d="M 712 318 c 24 -96 128 -118 150 -30 c 18 72 -78 112 -124 56 c -46 -58 36 -150 104 -106 c 62 40 36 142 -34 144 c -84 2 -108 -92 -46 -126 c 58 -32 128 16 112 76 c -14 54 -92 60 -118 14 c -26 -46 24 -96 76 -72 c 52 24 44 94 -8 100 c -40 6 -66 -30 -54 -60" stroke-width="6" pathLength="1" />
      <path id="s-arrow" class="ink" d="M 640 300 H 470" stroke-width="7" pathLength="1" data-layout-ignore />
      <path id="s-head" class="ink" d="M 512 258 L 470 300 L 512 342" stroke-width="7" pathLength="1" data-layout-ignore />
      <rect id="s-bar1" x="120" y="192" width="280" height="44" rx="22" fill="#1B1D1E" />
      <rect id="s-bar2" x="120" y="292" width="280" height="44" rx="22" fill="#1B1D1E" />
      <rect id="s-bar3" x="120" y="392" width="280" height="44" rx="22" fill="#1B1D1E" />
      <rect id="s-card" class="ink" x="70" y="60" width="380" height="480" rx="26" stroke-width="6" pathLength="1" />
      <path id="s-person" class="ink" d="M 232 108 a 28 28 0 1 1 56 0 a 28 28 0 1 1 -56 0 M 198 170 c 10 -30 114 -30 124 0" stroke-width="6" pathLength="1" />
    </svg>
    <div id="s-label" class="t"><span class="w hero" id="s-talib">للطالب</span></div>
""", """
      // cues: على 0.04 · تسهيل 0.28 · وتبسيط 1.04 · هذه 1.60 · المادة 1.86 · للطالب 2.54 · cut 3.26
      gsap.set(["#s-bar1", "#s-bar2", "#s-bar3"], { opacity: 0, transformOrigin: "100% 50%", scaleX: 0.2 });
      rise(tl, "#s-ala", 0.04);
      draw(tl, "#s-knot", 0.0, 0.42, "power2.out");
      stamp(tl, "#s-tasheel", 0.28);
      draw(tl, "#s-arrow", 0.34, 0.26);  draw(tl, "#s-head", 0.56, 0.12, "power2.out");
      stamp(tl, "#s-tabseet", 1.04);
      rise(tl, "#s-hadhihi", 1.60);  rise(tl, "#s-madda", 1.86);
      var bars = ["#s-bar1", "#s-bar2", "#s-bar3"];
      bars.forEach(function (b, i) {
        var at = 1.62 + i * 0.12;
        tl.fromTo(b, { opacity: 0, scaleX: 0.2, fill: "#E66A21" }, { opacity: 1, scaleX: 1, duration: 0.22, ease: "power3.out" }, at);
        var settleAt = i < 2 ? at + 0.12 : 2.54;
        tl.to(b, { fill: "#1B1D1E", duration: 0.2, ease: "power1.inOut" }, settleAt);   // active module warm, settled modules ink
      });
      draw(tl, "#s-card", 2.54, 0.4);
      draw(tl, "#s-person", 2.70, 0.3, "power2.out");
      rise(tl, "#s-talib", 2.54);
""")
# ---------------- G5: final card ----------------
S["final"] = ("""
    #f-ctx { top: 420px; font-size: 52px; }
    #f-h1 { top: 500px; font-size: 212px; line-height: 1.05; }
    #f-h2 { top: 748px; font-size: 212px; line-height: 1.05; color: var(--accent-warm-dark, #C85218); }
    #f-close { top: 1470px; font-weight: 700; font-size: 66px; color: var(--ink-soft, #3A3D3E); }
""", """
    <div id="f-ctx" class="t ctx row"><span class="w" id="f-c1">اللغة</span><span class="w" id="f-c2">العربية</span></div>
    <div id="f-h1" class="t"><span class="w hero" id="f-manhaj">المنهج</span></div>
    <div id="f-h2" class="t"><span class="w hero warm" id="f-qatari">القطري</span></div>
    <svg id="f-book" width="600" height="360" viewBox="0 0 600 360" style="top: 1060px; left: 240px">
      <path id="f-pageL" class="ink" d="M 300 70 C 230 30, 120 28, 40 60 V 300 C 120 268, 230 270, 300 310" stroke-width="7" pathLength="1" />
      <path id="f-pageR" class="ink" d="M 300 70 C 370 30, 480 28, 560 60 V 300 C 480 268, 370 270, 300 310" stroke-width="7" pathLength="1" />
      <path id="f-spine" class="ink" d="M 300 70 V 310" stroke-width="7" pathLength="1" />
      <path id="f-line1" class="ink" d="M 90 130 C 150 112, 220 112, 260 126" stroke-width="5" pathLength="1" />
      <path id="f-line2" class="ink" d="M 90 190 C 150 172, 220 172, 260 186" stroke-width="5" pathLength="1" />
      <path id="f-line3" class="ink" d="M 340 126 C 380 112, 450 112, 510 130" stroke-width="5" pathLength="1" />
      <path id="f-line4" class="ink" d="M 340 186 C 380 172, 450 172, 510 190" stroke-width="5" pathLength="1" />
      <path id="f-mark" d="M 410 44 V 120 L 426 106 L 442 120 V 44" fill="none" stroke="var(--accent-gold, #D8A44A)" stroke-width="6" stroke-linejoin="round" pathLength="1" />
    </svg>
    <div id="f-close" class="t row"><span class="w" id="f-b1">بإذن</span><span class="w" id="f-b2">الله</span><span class="w" id="f-b3">تعالى</span></div>
""", """
      // cues: بالمنهج 0.08 · القطري 0.67 · بإذن 1.29 · الله 1.61 · تعالى 1.77 (ends 2.28) · last frame 2.78 (15-frame hold)
      rise(tl, ["#f-c1", "#f-c2"], 0.0, 0.08);
      stamp(tl, "#f-manhaj", 0.08);
      stamp(tl, "#f-qatari", 0.67);
      draw(tl, "#f-spine", 0.92, 0.18);
      draw(tl, "#f-pageR", 0.98, 0.42);  draw(tl, "#f-pageL", 0.98, 0.42);
      draw(tl, "#f-line3", 1.30, 0.16, "power1.out");  draw(tl, "#f-line4", 1.36, 0.16, "power1.out");
      draw(tl, "#f-line1", 1.42, 0.16, "power1.out");  draw(tl, "#f-line2", 1.48, 0.16, "power1.out");
      draw(tl, "#f-mark", 1.60, 0.22, "power2.out");
      rise(tl, "#f-b1", 1.29);  rise(tl, "#f-b2", 1.61);  rise(tl, "#f-b3", 1.77);
""")
for cid, (css, html, js) in S.items():
    open(os.path.join(ROOT, "compositions", f"{cid}.html"), "w", encoding="utf-8").write(scene(cid, css, html, js))
print("scenes written:", ", ".join(S))
