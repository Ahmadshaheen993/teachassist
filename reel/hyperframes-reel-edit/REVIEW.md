# REVIEW — delivery note (read before changing anything)

## Creative calls
- **Two worlds, hard cuts only.** Presenter (plate as shot, crop states 1.00/1.04/1.08/1.10/1.12/1.14/1.16, origin 50% 30%)
  and the printed-paper editorial world (paper #E9E0D3, static fibre grain 7.5%, ink strokes 4–7 px, Cairo 900 heroes).
  No dissolve anywhere; every scene boundary is a cut on a spoken word.
- **Objects from the transcript**, one per scene: the index card with the three case-ending marks (iʿrāb is the subject),
  the broken numbered route (no real methodology), the flat monotone line (the boring style), the tangle → arrow →
  three bars → student card (simplify and ease for the student), the open book with one gold bookmark (the curriculum).
- **Accent ration**: one warm word per scene (dark warm #C85218 on paper for 3.3:1 contrast; bright warm #F07A2E in
  captions), the cool accent once (caption «أولًا»), gold once (the bookmark, 6 px).
- **Opening**: the source fades in from black over 0–0.9 s while speech starts at 0.12 s. The plate compensates luma per
  frame and the first live frame (source 0.40 s) is held for 0.30 s, so frame 0 is a clean thumbnail and lip-sync is exact
  from 0.30 s. Push 1.00→1.12 over 22 frames, expo.out, never returns.
- **No invented CTA.** The transcript has none; the final card lands «المنهج القطري» and «بإذن الله تعالى» as spoken.
- Storylines not built: (a) presenter-only with kinetic captions and three punch-ins; (b) full paper world with the presenter
  as a cut-out inside cards. (a) under-delivers the brief's ratio, (b) needs a matte the brief did not ask for.

## What was measured, what was only looked at
- Measured: `hyperframes check` (lint, runtime, layout, motion, contrast) → 0 errors, 0 lint warnings; silence map (−42 dBFS envelope);
  transcript probabilities (≥ 0.74, most 1.00) and two-temperature re-checks of five uncertain stretches; per-frame luma of
  the source fade and of the compensated plate (flat at YAVG ≈ 98 from 0.10 s); loudness of the draft render
  (−14.3 LUFS integrated, −2.2 dBTP); font: `document.fonts.check("900 100px Cairo")` true, Cairo FontFace status
  `loaded`, glyph widths differ from the fallback (so Cairo is what renders).
- Looked at: every scene at 6 points, every cut ±0.2 s, the opening push at 0/25/50/75/100 %, caption close-ups, the 360 px
  phone sheet (`review/`).
- Nobody heard the sound: the dialogue is the original track (clean lav, −60 dBFS floor, no processing but −0.7 dB trim);
  the SFX levels were set by numbers (whoosh 0.13, pop 0.11, click 0.14 gain; peaks ≥ 17 dB under the voice peaks).

## Weakest shot, and what more time would buy
- S3 («وبالإضافة إلى», 1.19 s on the presenter between two paper scenes) is the shortest shot and reads as a breath rather
  than a beat. With more time: a two-word kinetic caption treatment with its own crop state, or folding it into the flat-line
  scene as its first small line.
- The route in G2 is a diagram; a hand-drawn ink texture on the strokes would sit better in the paper world.

## Warnings kept on purpose
- `line_unread` on the closing line «بإذن الله تعالى» (last words on screen 0.97–1.44 s, the craft floor asks for 2 s):
  the brief fixes the final hold at 12–18 frames after the last spoken word; 15 frames are used (30.84 → 31.34 s).
- No music: the brief forbids an arbitrary track; voice-only is the stated preference.
- GSAP itself is served from the jsDelivr CDN by the HyperFrames compiler (its own contract); all media and fonts are local
  files under `assets/`.

## Plan vs cut
`STORYBOARD.md` frontmatter says 31.27 s; the cut lands at 31.27 s (938 frames). A-roll 15.60 s (49.9 %), editorial
graphics 15.67 s (50.1 %). Removed from the source: 3.85 s of pauses and dead air (`timing-map.json`).

## Sync (measured on the draft render, `renders/preview_draft.mp4`)
- Dialogue: cross-correlation of every retained range against the source gives |lag| ≤ 0.33 ms (sample-level).
- Picture: rendered frames of the scale-1.00 presenter segment (S3, 35 frames) were matched against the plate by PSNR;
  every discriminative frame (13 of 35 with ≥ 3 dB margin) matches exactly the intended plate frame (offset 0).
- What it took: the frame extractor indexes its cached frames with floor((t − start) × fps). A clip start written a hair
  above its grid value (13.366667 for frame 401) made every later frame of that clip show the previous source frame
  (measured −1). Starts and lengths are therefore snapped to the 30 fps grid and written floored at 1 µs, and picture
  clips seek to the centre of the intended source frame (`data-media-start` = source in-point + 1/60 s); the dialogue
  clips keep the exact in-point. `scripts/build.py` documents this.
