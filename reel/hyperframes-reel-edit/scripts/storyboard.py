#!/usr/bin/env python3
"""Regenerates STORYBOARD.md from plan.json (run after scripts/plan.py)."""
import json, os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p=json.load(open(os.path.join(ROOT,'plan.json'),encoding='utf-8'))
w={x['id']:x for x in p['words']}
def o(i): return w[f'w{i}']['outStart']
S={s['id']:s for s in p['segments']}
T=p['total']; fr=round(T*30)
ar=sum(s['duration'] for s in p['segments'] if s['kind']=='aroll'); gr=T-ar
fm=f"""---
format: 1080x1920
duration: {T:.2f}s
message: "Students panic at «ما إعراب كلمة؟» — this platform simplifies Arabic grammar for the Qatari curriculum"
arc: Hook (presenter) → the question (card) → the panic (presenter) → why: no method (route) → why: boring style (flat line) → the platform (presenter) → the promise (transformation) → the result (presenter) → the keyword (final card)
audience: Arabic-speaking students and parents on Reels/TikTok, often muted
mode: autonomous
fps: 30
ratio: {ar/T*100:.1f}% talking head / {gr/T*100:.1f}% editorial graphics
---

# STORYBOARD — content-specific shot plan

Every frame quotes the verified transcript phrase that drives it; times are **output seconds after silence removal**
(source seconds in brackets). Every cut sits on the 30 fps grid ({fr} frames in all). Crop states are scale values on the
presenter's inner wrapper (origin 50% 30%).
"""
frames=[]
def fr_(n,title,seg,src,scene,vo,reads,sound,crop,narr,src_file):
    s=S[seg]
    frames.append(f"""## Frame {n} — {title} ({s['out_start']:.2f}–{s['out_end']:.2f}s)

- act: {scene}
- scene: {narr.splitlines()[0]}
- duration: {s['duration']:.2f}s
- source_range: {src}
- transition_in: cut
- status: animated
- voiceover: "{vo}"
- reads: {reads}
- sound: {sound}
- crop: {crop}
- src: {src_file}

{narr}
""")
fr_(1,"Hook on the presenter","s1","0.10–1.33 (frame 0.40 held for 0.30 s)","Act 1: the panic","كثير من الطلاب",
   f"«كثير من الطلاب» word-timed caption ({max(0.1,o(0)):.2f}–{w['w2']['outEnd']:.2f}s)","dialogue only",
   "1.00 → 1.12 push-in over 0.73 s (expo.out), does not return",
   "Presenter, clean first frame, a fast elegant push toward the face while the first three words land under the chin.\nNo logo, no fade: the picture is already full and lit at frame 0.","index.html (A-roll clips #a-s1s #a-s1)")
fr_(2,"The teacher's question (card)","g1","1.33–4.77, pause 3.11–3.45 trimmed","Act 1: the panic","عندما يسألهم المعلم: ما إعراب كلمة؟",
   f"«عندما يسألهم المعلم» line ({o(3):.2f}–{o(5):.2f}s); the blank card is on the paper from the cut; hero «ما إعراب» ({o(6):.2f}–{o(7):.2f}s); «كلمة» on the card ({o(8):.2f}s) and the three case-ending marks ـَ ـُ ـِ with «؟» ({o(8)+0.07:.2f}–{S['g1']['out_end']:.2f}s hold)",
   "whoosh-short on the cut; pop as «إعراب» lands","n/a (full-screen paper)",
   "Warm paper. A lined index card holds the word «كلمة»; three case-ending marks pop above it and an oversized «؟» leans in. The spoken question becomes the typography: context line, then «إعراب» as the hero word.\nObject: the case-ending marks are the literal subject of iʿrāb — the thing students are asked for.","compositions/q.html")
fr_(3,"The panic, then «why?»","s2","5.64–10.75, pauses 8.46–8.69 and 9.41–9.65 trimmed","Act 1: the panic","يصيبه الارتباك ويصيبه القلق. لماذا؟ أولًا لأنه",
   f"«يصيبه الارتباك» ({o(9):.2f}–{o(10):.2f}s, الارتباك warm); «ويصيبه القلق» ({o(11):.2f}–{o(12):.2f}s, القلق warm); «لماذا؟» big ({o(13):.2f}s); «أولًا لأنه» ({o(14):.2f}s, أولًا cool)",
   "dialogue only","1.08 at the cut; hard punch 1.16 on «لماذا؟»; hard punch-out 1.10 on «أولًا»",
   "Back to the presenter's face for the emotional claim (confusion, anxiety): credibility beats a graphic here. The two trimmed pauses are hidden by the two crop changes, each on a new claim.","index.html (A-roll clips #a-s2a #a-s2b #a-s2c)")
fr_(4,"No real methodology (route)","g2","10.76–15.40, pause 13.33–13.53 trimmed","Act 2: why","لا يوجد منهجية حقيقية في تعلم اللغة العربية",
   f"«لا يوجد» warm stamp ({o(16):.2f}s); hero «منهجية» ({o(18):.2f}s); route nodes ١ ٢ ٣ appear ({S['g2']['out_start']+0.1:.2f}–{S['g2']['out_start']+1.0:.2f}s), the third link breaks into a scribble and a dashed «؟» node on «حقيقية» ({o(19):.2f}s); «في تعلم اللغة العربية» lands ({o(21):.2f}–{o(23):.2f}s); hold to {S['g2']['out_end']:.2f}s",
   "whoosh-short on the cut; pop on «منهجية»; click-soft on the break","n/a",
   "A route of numbered step nodes that should connect: the ink connector draws, then the third link thins and knots — a dashed «؟» node is all that is left — as «حقيقية» is spoken. The negation «لا يوجد» is the only warm word; «منهجية» is the hero.\nLongest process scene: one sentence, so 4.4 s is what the speech needs.","compositions/method.html")
fr_(5,"«And in addition…»","s3","15.65–16.85","Act 2: why","وبالإضافة إلى",
   f"«وبالإضافة إلى» ({o(24):.2f}–{o(25):.2f}s)","dialogue only","1.00 (resolution after the route)",
   "A short breath on the presenter between the two reasons: he is enumerating, the viewer sees him.","index.html (A-roll clip #a-s3)")
fr_(6,"The boring style (flat line)","g3","17.45–19.82, pause 18.13–18.35 trimmed","Act 2: why","أسلوب المعلم الممل",
   f"flat line draws at constant speed ({S['g3']['out_start']:.2f}–{S['g3']['out_start']+1.25:.2f}s); «أسلوب المعلم» ({o(26):.2f}–{o(27):.2f}s); «الممل» warm stamp ({o(28):.2f}s); hold to {S['g3']['out_end']:.2f}s",
   "whoosh-short on the cut; pop on «الممل»","n/a",
   "Short interlude: one long flat monotone line drawn across the paper with three identical ticks, the two words above it, then «الممل» stamps in warm.\nObject: a flat line is the voice that never changes pitch.","compositions/boring.html")
fr_(7,"We, on this platform","s4","20.02–23.51, pause 21.71–21.88 trimmed","Act 3: the platform","ونحن في هذه المنصة سنقوم بإذن الله تعالى",
   f"«ونحن في هذه المنصة» ({o(29):.2f}–{o(32):.2f}s, المنصة warm); «سنقوم بإذن الله تعالى» ({o(33):.2f}–{o(36):.2f}s)","dialogue only",
   "1.04 at the cut; 0.5 s push to 1.10 on «المنصة»; hard 1.16 on «سنقوم»",
   "The pivot and the promise stay on the presenter: «we», «this platform», «God willing» are credibility lines.","index.html (A-roll clips #a-s4a #a-s4b)")
fr_(8,"Simplify and ease (transformation)","g4","23.52–26.94, pause 24.48–24.64 trimmed","Act 3: the platform","على تسهيل وتبسيط هذه المادة للطالب",
   f"knot drawn ({S['g4']['out_start']:.2f}s); «على» small ({o(37):.2f}s); «تسهيل» warm stamp ({o(38):.2f}s) + arrow draws; «وتبسيط» ({o(39):.2f}s); three bars assemble on «هذه المادة» ({o(40):.2f}–{o(41):.2f}s), active bar warm, settled bars ink; student card on «للطالب» ({o(42):.2f}s); hold to {S['g4']['out_end']:.2f}s",
   "whoosh-short on the cut; pop on «تسهيل»; click-soft ×3 on the bars","n/a",
   "The list/transformation scene: a tangled knot on the right becomes three aligned bars on the left through an arrow, and the bars are framed by an outlined student card as «للطالب» is spoken.","compositions/simplify.html")
fr_(9,"The result on the presenter","s5","27.15–32.38 (pauses kept)","Act 4: the result","ليخرج عالمًا في أمور اللغة العربية الخاصة",
   f"«ليخرج عالمًا» ({o(43):.2f}–{o(44):.2f}s, عالمًا warm, larger); «في أمور اللغة العربية» ({o(45):.2f}–{o(48):.2f}s); «الخاصة» ({o(49):.2f}s)","dialogue only",
   "1.14 at the cut (close payoff); 0.4 s pull-out to 1.04 on «في أمور»",
   "The payoff needs the presenter: «ليخرج عالمًا» lands on his face, then a pull-out gives resolution while the sentence completes. Hesitation pauses kept so the line breathes.","index.html (A-roll clip #a-s5)")
fr_(10,"Final card: the keyword","g5","32.37–35.14 (audio ends 34.65; card holds 0.5 s)","Act 4: the result","بالمنهج القطري بإذن الله تعالى",
   f"context «اللغة العربية» ({S['g5']['out_start']:.2f}s); hero «المنهج» ({o(50):.2f}s) «القطري» warm ({o(51):.2f}s); book outline draws ({S['g5']['out_start']+0.92:.2f}–{S['g5']['out_start']+1.82:.2f}s); «بإذن الله تعالى» ({o(52):.2f}–{o(54):.2f}s); completed card held 15 frames to {S['g5']['out_end']:.2f}s",
   "whoosh-short on the cut; pop on «القطري»; no music","n/a",
   "The designed closing card lands the spoken keyword «المنهج القطري» with a minimal open-book outline and the spoken closing line. No CTA was spoken, so none is added. Does not end on black: the completed card is the last frame.","compositions/final.html")
open(os.path.join(ROOT,'STORYBOARD.md'),'w',encoding='utf-8').write(fm+"\n".join(frames))
print(f"STORYBOARD.md: {len(frames)} frames, total {T:.3f}s ({fr} frames), A-roll {ar:.2f}s ({ar/T*100:.1f}%), graphics {gr:.2f}s ({gr/T*100:.1f}%)")
for s in p['segments']: print(f"  {s['id']:3} f{round(s['out_start']*30)}–{round(s['out_end']*30)}  out {s['out_start']:.3f}–{s['out_end']:.3f}  src {s['src_in']:.3f}–{s['src_out']:.3f}")
