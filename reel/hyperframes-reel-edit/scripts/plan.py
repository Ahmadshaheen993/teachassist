#!/usr/bin/env python3
"""Edit plan for the reel: verified words (source time), retained source ranges, output mapping.

Writes, next to the project root:
  plan.json            everything the compositions consume (segments, words in output time, caption groups)
  transcript.json      word-level tokens {text,start,end} in SOURCE time (+ output times)
  timing-map.json      every retained source range -> output start/end, plus removed ranges
  captions.srt         corrected Arabic cue transcript in OUTPUT (edited reel) time
  captions-source.srt  the same cues in SOURCE time
Run: python3 scripts/plan.py   (from the project root)
"""
import json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FPS = 30
SRC_DURATION = 35.133
SRC_AUDIO_END = 35.12

# ---- verified words, SOURCE time. Whisper large-v3 boundaries snapped to the measured voiced regions
# (-42 dBFS, 10 ms hop) and corrected by hand (orthography: tanween on أولًا / عالمًا, كثير written without a case ending; punctuation).
W = [
 ("كثير",0.13,0.38),("من",0.38,0.48),("الطلاب",0.48,1.10),
 ("عندما",1.33,1.60),("يسألهم",1.60,2.31),("المعلم",2.44,2.86),("ما",2.86,3.01),
 ("إعراب",3.51,4.02),("كلمة؟",4.02,4.67),
 ("يصيبه",5.72,6.08),("الارتباك",6.08,6.92),("ويصيبه",7.01,7.74),("القلق",7.74,8.38),
 ("لماذا؟",8.77,9.33),
 ("أولًا",9.73,10.04),("لأنه",10.04,10.76),("لا",10.76,11.02),("يوجد",11.02,11.44),("منهجية",11.44,12.02),("حقيقية",12.02,13.12),("في",13.12,13.25),
 ("تعلم",13.61,14.10),("اللغة",14.10,14.68),("العربية",14.68,15.31),
 ("وبالإضافة",15.73,16.45),("إلى",16.45,16.76),
 ("أسلوب",17.53,18.05),("المعلم",18.43,19.10),("الممل",19.17,19.74),
 ("ونحن",20.10,20.42),("في",20.42,20.70),("هذه",20.75,21.00),("المنصة",21.00,21.63),
 ("سنقوم",21.96,22.38),("بإذن",22.38,22.62),("الله",22.62,22.78),("تعالى",22.78,23.29),
 ("على",23.56,23.80),("تسهيل",23.80,24.40),
 ("وتبسيط",24.72,25.28),("هذه",25.28,25.54),("المادة",25.54,26.22),("للطالب",26.22,26.86),
 ("ليخرج",27.23,27.82),("عالمًا",27.82,29.08),  # عالمًا carries a hesitation restart (27.82–28.11 | 28.47–29.08), kept natural
 ("في",29.08,29.34),
 ("أمور",29.64,30.38),("اللغة",30.38,30.96),("العربية",30.96,31.44),("الخاصة",31.44,32.20),
 ("بالمنهج",32.45,33.04),("القطري",33.04,33.66),("بإذن",33.66,33.98),("الله",33.98,34.14),("تعالى",34.14,34.65),
]

# ---- segments in order. kind: aroll | graphic. src_in/src_out are source seconds; trims are removed inside.
SEG = [
 dict(id="s1", kind="aroll",   src_in=0.10,  src_out=1.33,  trims=[], note="hook; frame 0.40 held for the first 0.30 s (source fade-in)"),
 dict(id="g1", kind="graphic", scene="q",      src_in=1.33,  src_out=4.77,  trims=[(3.11,3.45)]),
 dict(id="s2", kind="aroll",   src_in=5.64,  src_out=10.76, trims=[(8.46,8.69),(9.41,9.65)]),
 dict(id="g2", kind="graphic", scene="method", src_in=10.76, src_out=15.39, trims=[(13.33,13.53)]),
 dict(id="s3", kind="aroll",   src_in=15.65, src_out=16.84, trims=[]),
 dict(id="g3", kind="graphic", scene="boring", src_in=17.45, src_out=19.82, trims=[(18.13,18.35)]),
 dict(id="s4", kind="aroll",   src_in=20.02, src_out=23.52, trims=[(21.71,21.88)]),
 dict(id="g4", kind="graphic", scene="simplify", src_in=23.52, src_out=26.94, trims=[(24.48,24.64)]),
 dict(id="s5", kind="aroll",   src_in=27.15, src_out=32.37, trims=[]),
 dict(id="g5", kind="graphic", scene="final",  src_in=32.37, src_out=35.15, trims=[], hold_after_last_word=0.50),
]
OPEN_HOLD = 0.30          # s1: still frame shown for this long before the live picture
OPEN_STILL_SRC = 0.40     # source time of the held frame

def q(x):  # quantise to the frame grid (full precision: the runtime floors frame indices)
    return round(x*FPS)/FPS

# ---- build retained ranges and the source->output map
ranges = []   # (src_a, src_b, out_a, seg_id)
removed = []  # (src_a, src_b, why)
t_out = 0.0
prev_src_end = 0.0
for s in SEG:
    if s["src_in"] > prev_src_end + 1e-6:
        removed.append((round(prev_src_end,3), s["src_in"], "pause/dead air between segments"))
    cursor = q(s["src_in"])             # source in-points sit on the plate's frame grid too, so every
    pieces = []                          # media offset names one exact plate frame
    for (a,b) in s["trims"]:
        a, b = q(a), q(b)
        pieces.append((cursor,a)); removed.append((a,b,"internal pause trimmed (2–4 frames of room kept)")); cursor = b
    pieces.append((cursor, q(s["src_out"])))
    s["src_in"] = pieces[0][0]
    s["out_start"] = round(q(t_out),6)
    s["pieces"] = []
    for (a,b) in pieces:
        d = q(b - a)                      # whole frames: every clip start and length sits on the 30 fps grid,
        b = a + d                         # so the frame extractor and the sample-accurate audio map identically
        ranges.append((round(a,6),round(b,6),round(q(t_out),6),s["id"]))
        s["pieces"].append(dict(src_in=round(a,6), src_out=round(b,6), out_start=round(q(t_out),6), out_end=round(q(t_out+d),6), duration=round(d,6)))
        t_out = q(t_out + d)
    s["src_out"] = s["pieces"][-1]["src_out"]
    s["out_end"] = round(q(t_out),6)
    s["duration"] = round(s["out_end"]-s["out_start"],6)
    prev_src_end = s["src_out"]
removed.append((SEG[-1]["src_out"], SRC_DURATION, "trailing fade-out/dead air"))
TOTAL = round(t_out, 6)

def src_to_out(t):
    for (a,b,oa,_) in ranges:
        if a - 1e-6 <= t <= b + 1e-6:
            return round(oa + (t - a), 4)
    # inside a removed gap: clamp to the nearest edge
    best = None
    for (a,b,oa,_) in ranges:
        for edge, oe in ((a,oa),(b,oa+(b-a))):
            d = abs(t-edge)
            if best is None or d < best[0]: best = (d, oe)
    return round(best[1], 4)

words = []
for i,(txt,a,b) in enumerate(W):
    words.append(dict(id=f"w{i}", text=txt, start=a, end=b, outStart=src_to_out(a), outEnd=src_to_out(b)))

# ---- caption groups for talking-head segments (output time comes from the words)
# each: words (by index), accent word index (or None) and accent tone
CAP = [
 dict(seg="s1", words=[0,1,2], accent=None),
 dict(seg="s2", words=[9,10],  accent=10, tone="warm"),
 dict(seg="s2", words=[11,12], accent=12, tone="warm"),
 dict(seg="s2", words=[13],    accent=13, tone="warm", big=True),
 dict(seg="s2", words=[14,15], accent=14, tone="cool"),
 dict(seg="s3", words=[24,25], accent=None),
 dict(seg="s4", words=[29,30,31,32], accent=32, tone="warm"),
 dict(seg="s4", words=[33,34,35,36], accent=None),
 dict(seg="s5", words=[43,44], accent=44, tone="warm", big=True),
 dict(seg="s5", words=[45,46,47,48], accent=None),
 dict(seg="s5", words=[49], accent=None),
]
segmap = {s["id"]: s for s in SEG}
groups = []
for g in CAP:
    s = segmap[g["seg"]]
    ws = [words[i] for i in g["words"]]
    start = max(s["out_start"], ws[0]["outStart"] - 0.04)
    end = min(s["out_end"], ws[-1]["outEnd"] + 0.12)
    groups.append(dict(seg=g["seg"], start=q(start), end=q(end), accent=g["accent"], tone=g.get("tone"), big=g.get("big",False),
                       words=[dict(id=w["id"], text=w["text"], start=q(w["outStart"]), end=q(w["outEnd"])) for w in ws]))

# ---- SRT cues: every phrase of the reel (talking-head groups + the phrases the graphic scenes typeset)
PHRASES = [
 [0,1,2],[3,4,5],[6,7,8],[9,10],[11,12],[13],[14,15],[16,17,18,19],[20,21,22,23],[24,25],[26,27,28],
 [29,30,31,32],[33,34,35,36],[37,38],[39,40,41,42],[43,44],[45,46,47,48],[49,50,51],[52,53,54],
]
def srt_time(t):
    ms = int(round(t*1000)); h=ms//3600000; m=(ms%3600000)//60000; s=(ms%60000)//1000; ms%=1000
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
def write_srt(path, key_a, key_b):
    lines=[]
    for n,idx in enumerate(PHRASES,1):
        ws=[words[i] for i in idx]
        lines += [str(n), f"{srt_time(ws[0][key_a])} --> {srt_time(ws[-1][key_b])}", " ".join(w['text'] for w in ws), ""]
    open(path,"w",encoding="utf-8").write("\n".join(lines))
write_srt(os.path.join(ROOT,"captions.srt"), "outStart", "outEnd")
write_srt(os.path.join(ROOT,"captions-source.srt"), "start", "end")

json.dump(dict(timebase="source seconds of rawreel.mp4 (outStart/outEnd = seconds in the edited reel)",
               language="ar", model="faster-whisper large-v3, int8, word_timestamps, boundaries snapped to measured voiced regions, hand-verified",
               words=[dict(text=w["text"],start=w["start"],end=w["end"],outStart=w["outStart"],outEnd=w["outEnd"]) for w in words]),
          open(os.path.join(ROOT,"transcript.json"),"w",encoding="utf-8"), ensure_ascii=False, indent=1)

json.dump(dict(fps=FPS, source=dict(file="../rawreel.mp4", duration=SRC_DURATION),
               output=dict(duration=TOTAL, frames=round(TOTAL*FPS)),
               segments=[dict(id=s["id"], kind=s["kind"], scene=s.get("scene"), src_in=s["src_in"], src_out=s["src_out"],
                              out_start=s["out_start"], out_end=s["out_end"], duration=s["duration"], pieces=s["pieces"], note=s.get("note")) for s in SEG],
               retained=[dict(src_in=a, src_out=b, out_start=oa, out_end=round(oa+(b-a),4), segment=sid) for (a,b,oa,sid) in ranges],
               removed=[dict(src_in=round(a,3), src_out=round(b,3), duration=round(b-a,3), why=why) for (a,b,why) in removed],
               opening=dict(still_source_time=OPEN_STILL_SRC, still_hold=OPEN_HOLD, why="the source fades in from black over 0–0.9 s while speech starts at 0.12 s; the first live frame is held so no dark frame is shown and sync is exact")),
          open(os.path.join(ROOT,"timing-map.json"),"w",encoding="utf-8"), ensure_ascii=False, indent=1)

json.dump(dict(fps=FPS, total=TOTAL, segments=SEG, words=words, groups=groups, open_hold=OPEN_HOLD, open_still_src=OPEN_STILL_SRC),
          open(os.path.join(ROOT,"plan.json"),"w",encoding="utf-8"), ensure_ascii=False, indent=1)

removed_total = sum(b-a for (a,b,_) in removed)
aroll = sum(s["duration"] for s in SEG if s["kind"]=="aroll"); graphic = TOTAL - aroll
print(f"OUTPUT {TOTAL:.3f}s ({round(TOTAL*FPS)} frames)  removed {removed_total:.3f}s  A-roll {aroll:.2f}s ({aroll/TOTAL*100:.1f}%)  graphics {graphic:.2f}s ({graphic/TOTAL*100:.1f}%)")
for s in SEG:
    print(f"  {s['id']:3} {s['kind']:8} src {s['src_in']:6.2f}-{s['src_out']:6.2f}  out {s['out_start']:6.2f}-{s['out_end']:6.2f}  ({s['duration']:.2f}s)  trims={s['trims']}")
print("groups:")
for g in groups: print(f"  {g['seg']} {g['start']:6.2f}-{g['end']:6.2f} :: "+" ".join(w['text'] for w in g['words']))
