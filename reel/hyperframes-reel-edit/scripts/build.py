#!/usr/bin/env python3
"""Writes index.html (root: A-roll, dialogue, scene hosts, captions host, SFX, crop timeline) and
compositions/caps.html (word-timed captions) from plan.json. Scene files are hand-authored.
Run after scripts/plan.py:  python3 scripts/build.py"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = json.load(open(os.path.join(ROOT, "plan.json"), encoding="utf-8"))
FPS = P["fps"]; TOTAL = P["total"]; SEG = P["segments"]; S = {s["id"]: s for s in SEG}
def f(x): return f"{x:.4f}".rstrip("0").rstrip(".")

FONT_FACE = """
      @font-face { font-family: "Cairo"; font-style: normal; font-weight: 200 1000; font-display: block;
        src: url("assets/fonts/cairo-arabic.woff2") format("woff2");
        unicode-range: U+0600-06FF, U+0750-077F, U+0870-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC; }
      @font-face { font-family: "Cairo"; font-style: normal; font-weight: 200 1000; font-display: block;
        src: url("assets/fonts/cairo-latin.woff2") format("woff2");
        unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
      @font-face { font-family: "Cairo"; font-style: normal; font-weight: 200 1000; font-display: block;
        src: url("assets/fonts/cairo-latin-ext.woff2") format("woff2");
        unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF; }
"""

# ---------------- A-roll picture clips (track 0) ----------------
aroll_html = []
cams = []   # (cam_id, out_start, out_end)
z = 1
still_hold = P["open_hold"]; still_src = P["open_still_src"]
for s in SEG:
    if s["kind"] != "aroll": continue
    for i, pc in enumerate(s["pieces"]):
        suffix = "" if len(s["pieces"]) == 1 else "abc"[i]
        cid = f"{s['id']}{suffix}"
        if s["id"] == "s1":
            # held clean frame (source fade-in), then the live picture in exact sync
            aroll_html.append(f'''      <div class="cam" id="cam-{cid}s"><img id="a-{cid}s" class="clip" src="assets/open-still.png" alt="" data-start="0" data-duration="{f(still_hold)}" data-track-index="0" style="z-index:{z}" /></div>''')
            cams.append((f"cam-{cid}s", 0.0, still_hold)); z += 1
            aroll_html.append(f'''      <div class="cam" id="cam-{cid}"><video id="a-{cid}" class="clip" src="assets/aroll.mp4" muted playsinline data-start="{f(still_hold)}" data-duration="{f(pc['duration']-still_hold)}" data-media-start="{f(pc['src_in']+still_hold)}" data-track-index="0" style="z-index:{z}"></video></div>''')
            cams.append((f"cam-{cid}", still_hold, pc["out_end"])); z += 1
        else:
            aroll_html.append(f'''      <div class="cam" id="cam-{cid}"><video id="a-{cid}" class="clip" src="assets/aroll.mp4" muted playsinline data-start="{f(pc['out_start'])}" data-duration="{f(pc['duration'])}" data-media-start="{f(pc['src_in'])}" data-track-index="0" style="z-index:{z}"></video></div>''')
            cams.append((f"cam-{cid}", pc["out_start"], pc["out_end"])); z += 1

# ---------------- dialogue (track 1): one clip per retained source range ----------------
dialogue_html = []
n = 0
AUDIO_END = 34.80
for s in SEG:
    for pc in s["pieces"]:
        n += 1
        src_out = min(pc["src_out"], AUDIO_END)
        dur = src_out - pc["src_in"]
        if dur <= 0: continue
        fade_out = ' data-fade-out="0.15"' if s["id"] == "g5" else ""
        dialogue_html.append(f'''      <audio id="d{n}" class="clip" src="assets/audio/dialogue.wav" data-start="{f(pc['out_start'])}" data-duration="{f(dur)}" data-media-start="{f(pc['src_in'])}" data-volume="0.92" data-track-index="1" data-audio-group="voice"{fade_out}></audio>''')

# ---------------- graphic scene hosts (track 2) ----------------
hosts_html = []
for s in SEG:
    if s["kind"] != "graphic": continue
    sc = s["scene"]
    hosts_html.append(f'''      <div id="{sc}" class="clip" data-composition-id="{sc}" data-composition-src="compositions/{sc}.html" data-start="{f(s['out_start'])}" data-duration="{f(s['duration'])}" data-track-index="2" data-track-kind="graphics" data-width="1080" data-height="1920" style="z-index:20"></div>''')

# ---------------- SFX (track 4) ----------------
W = {w["id"]: w for w in P["words"]}
def ws(i): return W[f"w{i}"]["outStart"]
sfx = []
rates = [1, 0.94, 1.06, 0.97, 1.03]
for k, s in enumerate([x for x in SEG if x["kind"] == "graphic"]):
    sfx.append(("whoosh", f"assets/sfx/whoosh-short.mp3", s["out_start"] - 0.06, 0.58, 0.13, rates[k]))
for i in (7, 18, 28, 38, 51):   # إعراب منهجية الممل تسهيل القطري
    sfx.append(("pop", "assets/sfx/pop.mp3", ws(i) + 0.03, 0.72, 0.11, 1))
for t in (ws(19) + 0.26, ws(40) + 0.02, ws(40) + 0.14, ws(40) + 0.26):  # route break (scribble lands); three bars
    sfx.append(("click", "assets/sfx/click-soft.mp3", t, 0.37, 0.14, 1))
sfx_html = []
lanes = {"whoosh": 4, "pop": 5, "click": 6}
click_n = 0
for i, (name, src, start, dur, vol, rate) in enumerate(sfx, 1):
    rate_attr = f' data-playback-rate="{rate}"' if rate != 1 else ""
    lane = lanes[name]
    if name == "click":
        lane = 6 + (click_n % 3); click_n += 1
    sfx_html.append(f'''      <audio id="sfx-{name}-{i}" class="clip" src="{src}" data-start="{f(max(0,start))}" data-duration="{f(dur)}" data-volume="{vol}" data-track-index="{lane}" data-audio-group="sfx"{rate_attr}></audio>''')

# ---------------- crop timeline (root) ----------------
ORIGIN = "50% 30%"
tl = []
tl.append(f'      gsap.set(["#cam-s1s", "#cam-s1"], {{ transformOrigin: "{ORIGIN}", scale: 1, x: 0, y: 0 }});')
tl.append(f'      tl.fromTo(["#cam-s1s", "#cam-s1"], {{ scale: 1, y: 0 }}, {{ scale: 1.12, y: 0, duration: 0.7333, ease: "expo.out" }}, 0);  // opening push, 22 frames, never returns')
def setcam(cid, t, scale, y=0): tl.append(f'      tl.set("#{cid}", {{ transformOrigin: "{ORIGIN}", scale: {scale}, x: 0, y: {y} }}, {f(t)});')
setcam("cam-s2a", S["s2"]["pieces"][0]["out_start"], 1.08)          # يصيبه الارتباك ويصيبه القلق
setcam("cam-s2b", S["s2"]["pieces"][1]["out_start"], 1.16, -8)      # لماذا؟ hard punch
setcam("cam-s2c", S["s2"]["pieces"][2]["out_start"], 1.10, -4)      # أولًا لأنه punch-out
setcam("cam-s3",  S["s3"]["pieces"][0]["out_start"], 1.00)          # وبالإضافة إلى
setcam("cam-s4a", S["s4"]["pieces"][0]["out_start"], 1.04)
tl.append(f'      tl.to("#cam-s4a", {{ scale: 1.10, y: -4, duration: 0.5, ease: "power2.inOut" }}, {f(ws(32))});  // push on المنصة')
setcam("cam-s4b", S["s4"]["pieces"][1]["out_start"], 1.16, -8)      # سنقوم hard punch
setcam("cam-s5",  S["s5"]["pieces"][0]["out_start"], 1.14, -6)      # ليخرج عالمًا
tl.append(f'      tl.to("#cam-s5", {{ scale: 1.04, y: 0, duration: 0.4, ease: "power3.out" }}, {f(ws(45))});  // pull-out on في أمور')

variables = json.dumps([
 {"id":"paper","type":"color","label":"Paper","default":"#E9E0D3"},
 {"id":"paper-dark","type":"color","label":"Paper dark","default":"#D4C8B8"},
 {"id":"paper-light","type":"color","label":"Paper light","default":"#F6F0E7"},
 {"id":"cream","type":"color","label":"Cream","default":"#FFFDF7"},
 {"id":"ink","type":"color","label":"Ink","default":"#1B1D1E"},
 {"id":"ink-soft","type":"color","label":"Ink soft","default":"#3A3D3E"},
 {"id":"accent-warm","type":"color","label":"Warm accent","default":"#E66A21"},
 {"id":"accent-warm-dark","type":"color","label":"Warm accent dark","default":"#C85218"},
 {"id":"accent-cool","type":"color","label":"Cool accent","default":"#2A8791"},
 {"id":"accent-cool-dark","type":"color","label":"Cool accent dark","default":"#216A72"},
 {"id":"accent-gold","type":"color","label":"Gold micro-accent","default":"#D8A44A"},
 {"id":"font-display","type":"string","label":"Display font","default":"Cairo"},
], ensure_ascii=False)

index = f'''<!doctype html>
<html lang="ar" dir="rtl" data-resolution="portrait" data-composition-variables='{variables}'>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>{FONT_FACE}
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ width: 1080px; height: 1920px; overflow: hidden; background: #1B1D1E; }}
      #root {{ position: relative; width: 1080px; height: 1920px; overflow: hidden; background: #1B1D1E; }}
      /* A-roll: every piece has its own untimed crop wrapper (.cam); the timed element is the media inside it. */
      .cam {{ position: absolute; inset: 0; width: 1080px; height: 1920px; overflow: hidden; will-change: transform; }}
      .cam > video, .cam > img {{ position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; object-fit: cover; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{f(TOTAL)}" data-width="1080" data-height="1920">
      <!-- ===== A-roll picture (track 0): retained source ranges, data-media-start = source offset ===== -->
{chr(10).join(aroll_html)}
      <!-- ===== dialogue (track 1): one clip per retained range, identical ranges to the picture (timing-map.json) ===== -->
{chr(10).join(dialogue_html)}
      <!-- ===== editorial scenes (track 2) ===== -->
{chr(10).join(hosts_html)}
      <!-- ===== captions (track 3): one host for every word-timed group ===== -->
      <div id="caps" class="clip" data-composition-id="caps" data-composition-src="compositions/caps.html" data-start="0" data-duration="{f(TOTAL)}" data-track-index="3" data-track-kind="captions" data-width="1080" data-height="1920" style="z-index:30"></div>
      <!-- ===== SFX (track 4): bundled Pixabay-licensed sounds, far below the voice ===== -->
{chr(10).join(sfx_html)}
    </div>
    <script>
      // Root timeline: only the presenter's crop states live here (hard sets on new claims, one smooth push to open,
      // one short push on «المنصة», one pull-out on the payoff). Scenes and captions own their own timelines.
      const tl = gsap.timeline({{ paused: true }});
{chr(10).join(tl)}
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
'''
open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8").write(index)

# ---------------- captions sub-composition ----------------
groups = P["groups"]
# no overlaps between consecutive groups; first word never before 0.10 s
for i, g in enumerate(groups):
    if i + 1 < len(groups):
        g["end"] = min(g["end"], groups[i+1]["start"])
    for w in g["words"]:
        if w["start"] < 0.10: w["start"] = 0.10
groups_js = json.dumps(groups, ensure_ascii=False)
caps = f'''<template>
  <style>{FONT_FACE}
    #root {{ position: absolute; inset: 0; overflow: visible; pointer-events: none; }}
    .cg {{ position: absolute; left: 0; right: 0; top: 1232px; height: 110px; display: flex; flex-direction: row;
          align-items: baseline; justify-content: center; gap: 0.32em; direction: rtl; unicode-bidi: isolate;
          font-family: "Cairo", sans-serif; font-weight: 700; font-size: 54px;
          line-height: 1.3; color: #FFFDF8; white-space: nowrap; opacity: 0; visibility: hidden;
          -webkit-text-stroke: 2.2px rgba(20, 22, 24, 0.82); paint-order: stroke fill;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5), 0 0 3px rgba(0, 0, 0, 0.55); }}
    .cg.big {{ font-size: 76px; font-weight: 800; top: 1218px; }}
    .cg .w {{ display: inline-block; opacity: 0; will-change: transform, opacity; }}
    .cg .w.warm {{ color: #F07A2E; }}
    .cg .w.cool {{ color: #9BE0E6; }}
    .cg .w.hero {{ font-size: 1.22em; font-weight: 900; }}
  </style>
  <div id="root" data-composition-id="caps" data-width="1080" data-height="1920">
    <div id="caps-stage" data-layout-allow-caption-zone></div>
  </div>
  <script>
    (function () {{
      "use strict";
      var GROUPS = {groups_js};
      var stage = document.getElementById("caps-stage");
      var tl = gsap.timeline({{ paused: true }});
      var IN = 0.1, SETTLE = 10;  // 3 frames, 10 px settle
      GROUPS.forEach(function (g, gi) {{
        var el = document.createElement("div");
        el.id = "cg-" + gi; el.className = "cg" + (g.big ? " big" : "");
        el.setAttribute("dir", "rtl");
        var spans = g.words.map(function (w, wi) {{
          var sp = document.createElement("span");
          sp.id = "cg-" + gi + "-w" + wi; sp.className = "w";
          sp.textContent = w.text;
          if (g.accent !== null && w.id === "w" + g.accent) sp.className += " " + (g.tone || "warm") + (g.big ? " hero" : "");
          el.appendChild(sp);
          return sp;
        }});
        stage.appendChild(el);
        // group container: on at its start, hard kill at its end
        tl.set(el, {{ opacity: 1, visibility: "visible" }}, g.start);
        g.words.forEach(function (w, wi) {{
          var sp = spans[wi];
          tl.fromTo(sp, {{ opacity: 0, y: SETTLE }}, {{ opacity: 1, y: 0, duration: IN, ease: "power2.out" }}, w.start);
          // earlier words settle to 55% when this word arrives
          if (wi > 0) {{
            tl.to(spans.slice(0, wi), {{ opacity: 0.55, duration: IN, ease: "power1.out" }}, w.start);
          }}
        }});
        tl.to(el, {{ opacity: 0, duration: 0.1, ease: "power2.in" }}, Math.max(g.start + 0.2, g.end - 0.1));
        tl.set(el, {{ opacity: 0, visibility: "hidden" }}, g.end);
      }});
      // self-lint: no group may survive its end
      GROUPS.forEach(function (g, gi) {{
        var el = document.getElementById("cg-" + gi);
        tl.seek(g.end + 0.01);
        var cs = window.getComputedStyle(el);
        if (cs.opacity !== "0" && cs.visibility !== "hidden") console.warn("[caption-lint] group " + gi + " still visible at " + (g.end + 0.01).toFixed(2));
      }});
      tl.seek(0);
      window.__timelines["caps"] = tl;
    }})();
  </script>
</template>
'''
os.makedirs(os.path.join(ROOT, "compositions"), exist_ok=True)
open(os.path.join(ROOT, "compositions", "caps.html"), "w", encoding="utf-8").write(caps)
print("index.html:", len(aroll_html), "picture clips,", len(dialogue_html), "dialogue clips,", len(hosts_html), "scene hosts,", len(sfx_html), "sfx;  caps.html:", len(groups), "groups; total", TOTAL)
