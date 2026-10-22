# Source analysis — `../rawreel.mp4`

## Metadata (ffprobe)
| Field | Value |
| --- | --- |
| Container / duration | MP4, 35.133 s (video), 35.120 s (audio), 7,389,650 bytes |
| Video | H.264 (yuv420p), **464 × 848** (aspect 0.547, slightly taller than 9:16), nominal 30 fps timebase, 879 frames (avg 25.02 fps: every 5th frame is absent on the 30 fps grid), 1.61 Mb/s, keyframes every ≈1.1 s |
| Audio | AAC, 44.1 kHz, stereo, 62 kb/s |
| Loudness | −13.6 LUFS integrated, LRA 4.7 LU, true peak −1.2 dBTP; room noise ≈ −60 dBFS (clean lav mic) |

Vertical talking head confirmed from 2 fps contact sheets: one presenter, centred, face centre ≈ (50 %, 22 %)
of the frame, chin ≈ 30 %, hands gesturing between 45 % and 70 % of the frame height; warm bookshelf
background; static camera. Delivery canvas 1080 × 1920 is reached by a 2.33× Lanczos upscale (plate 1080 × 1974,
27 px cropped top and bottom at the 1.00× crop).

### Baked fades in the source
- **Fade-in from black over 0.00–0.90 s** (frame luma YAVG 18 → 99) while **speech starts at 0.12 s**.
  Handled in the plate by per-frame inverse gain from the measured luma (`scripts/` note in `timing-map.json`),
  a gentle denoise on those frames only, and a 0.30 s hold of the first live frame (source 0.40 s) at the top
  of the reel. No dark frame is shown; lip-sync is exact from output 0.30 s.
- **Fade-out from 34.20 s to the end** while the last word ends at 34.65 s: covered by the final full-screen
  card, which starts at 32.37 s.

## Silence / pause map (−42 dBFS envelope, 10 ms hop; cross-checked against the transcript and gestures)
| Gap (source s) | Length | Treatment |
| --- | --- | --- |
| 0.00–0.12 | 0.12 | lead-in: cut (edit starts at 0.10) |
| 1.12–1.33 | 0.21 | kept (natural, under threshold) |
| 3.01–3.51 | 0.50 | trimmed 3.11–3.45 (dramatic pause after «ما» kept at 0.16 s) |
| 4.88–5.72 | 0.84 | cut 4.77–5.64 (segment boundary) |
| 8.38–8.77 | 0.39 | trimmed 8.46–8.69, cut lands with the punch-in on «لماذا؟» |
| 9.33–9.73 | 0.40 | trimmed 9.41–9.65, cut lands with the punch-out on «أولًا» |
| 13.25–13.61 | 0.36 | trimmed 13.33–13.53 (under the graphic) |
| 15.31–15.73 | 0.42 | cut 15.39–15.65 (segment boundary) |
| 16.76–17.53 | 0.77 | cut 16.84–17.45 (segment boundary) |
| 18.05–18.43 | 0.38 | trimmed 18.13–18.35 (under the graphic) |
| 19.74–20.10 | 0.36 | cut 19.82–20.02 (segment boundary) |
| 21.63–21.96 | 0.33 | trimmed 21.71–21.88, cut lands with the punch on «سنقوم» |
| 23.29–23.56 | 0.27 | kept (breath before «على تسهيل») |
| 24.40–24.72 | 0.32 | trimmed 24.48–24.64 (under the graphic) |
| 26.86–27.23 | 0.37 | cut 26.94–27.15 (segment boundary) |
| 28.11–28.47 | 0.36 | kept: hesitation restart inside «عالمًا» — cutting it would join two syllables |
| 29.34–29.64 | 0.30 | kept (payoff breathes) |
| 32.20–32.45 | 0.25 | kept (the cut to the final card sits in it) |
| 34.65–35.13 | 0.48 | trailing: removed (card holds over it) |

Total removed: 3.79 s. Edited length 31.34 s (940 frames).

## Transcript verification
Engine: faster-whisper **large-v3** (int8, CPU), `language=ar`, word timestamps, beam 5; language probability 1.00;
every segment avg_logprob −0.03, no-speech ≤ 0.01; all word probabilities ≥ 0.74 (most 1.00). Word boundaries were
snapped to the measured voiced regions (whisper stretches words across pauses). Uncertain stretches were
re-transcribed in isolation (0–1.35 s, 4.4–5.9 s, 15.5–20.2 s, 26.3–27.3 s, 27–29.8 s) at two temperatures and agreed.
Hand corrections: «كثيرًا» → «كثير» (both readings heard; no case ending asserted), «أولا» → «أولًا», «عالما» → «عالمًا»,
punctuation «ما إعراب كلمة؟», «لماذا؟». No English or model names occur. The register is Modern Standard Arabic
(fuṣḥā), not Egyptian dialect — kept as spoken.

## Content summary and semantic beats
| # | Source s | Phrase | Beat type |
| --- | --- | --- | --- |
| 1 | 0.13–1.10 | كثير من الطلاب | A hook — presenter |
| 2 | 1.33–4.67 | عندما يسألهم المعلم: ما إعراب كلمة؟ | A hook claim — graphic (the question) |
| 3 | 5.72–8.38 | يصيبه الارتباك ويصيبه القلق | emotional statement — presenter |
| 4 | 8.77–9.33 | لماذا؟ | question — presenter punch-in |
| 5 | 9.73–10.76 | أولًا لأنه | enumeration — presenter |
| 6 | 10.76–15.31 | لا يوجد منهجية حقيقية في تعلم اللغة العربية | reason 1 — graphic (broken route) |
| 7 | 15.73–16.76 | وبالإضافة إلى | connective — presenter |
| 8 | 17.53–19.74 | أسلوب المعلم الممل | reason 2 — graphic (flat line) |
| 9 | 20.10–23.29 | ونحن في هذه المنصة سنقوم بإذن الله تعالى | pivot / credibility — presenter |
| 10 | 23.56–26.86 | على تسهيل وتبسيط هذه المادة للطالب | promise / transformation — graphic |
| 11 | 27.23–32.20 | ليخرج عالمًا في أمور اللغة العربية الخاصة | payoff — presenter |
| 12 | 32.45–34.65 | بالمنهج القطري بإذن الله تعالى | keyword close — final card |
