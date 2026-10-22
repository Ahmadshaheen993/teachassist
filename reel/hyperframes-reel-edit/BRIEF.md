# BRIEF — Arabic 9:16 editorial reel (HyperFrames)

## The ask, distilled
Turn the single raw talking-head reel (`../rawreel.mp4`, 35.1 s, 464×848) into a premium 1080×1920 Arabic reel:
silence removal and hard cuts, three motivated crop states on the presenter, small word-timed captions, and
full-screen editorial motion-design interludes (warm paper, one monochrome symbolic object per scene, large Arabic
kinetic typography) that replace the presenter for roughly half of the narration. HyperFrames is the only system:
sub-compositions per scene, `data-media-start` / `data-duration` / `data-start` for the source edit, paused
registered timelines, `check` as the gate, Studio preview as the approval pause, then an H.264/AAC render.

## What the footage actually says (verified transcript, Modern Standard Arabic, not Egyptian dialect)
> كثير من الطلاب عندما يسألهم المعلم: ما إعراب كلمة؟ يصيبه الارتباك ويصيبه القلق. لماذا؟ أولًا: لأنه لا يوجد منهجية
> حقيقية في تعلم اللغة العربية، وبالإضافة إلى أسلوب المعلم الممل. ونحن في هذه المنصة سنقوم بإذن الله تعالى على
> تسهيل وتبسيط هذه المادة للطالب، ليخرج عالمًا في أمور اللغة العربية الخاصة بالمنهج القطري، بإذن الله تعالى.

A presenter for an Arabic-grammar learning platform: many students panic when the teacher asks "what is the
iʿrāb (case parsing) of a word?"; two reasons (no real methodology; the teacher's boring style); the platform's
promise (simplify the subject) and the result (a student fluent in the Arabic of the Qatari curriculum).

## Decisions and assumptions (stated once)
- **Canvas / fps**: 1080×1920 at 30 fps. The source is timestamped on a 30 fps grid (every 5th frame absent,
  ≈25 unique frames/s); 30 fps keeps every source timestamp on the grid, so no retiming is needed.
- **Plate**: `assets/aroll.mp4` is a derived, lossless-audio conditioning of the original (Lanczos upscale to
  1080×1974, constant 30 fps, 0.5 s GOP for seek accuracy, and the source's baked fade-from-black over 0–0.9 s
  compensated per frame from measured luma). The original `rawreel.mp4` is untouched.
- **Opening**: speech starts at 0.12 s while the picture is still dark; the first live frame (source 0.40 s) is
  held for 0.30 s so frame 0 is a clean thumbnail and lip-sync is exact from 0.30 s on. No fade, no black.
- **Font**: no Arabic display family was installed on this machine (only DejaVu Sans / FreeSans cover Arabic).
  Cairo — the brief's first candidate — was vendored into `assets/fonts/` (Google Fonts v31 variable woff2,
  OFL 1.1) and loaded with `@font-face`; the render is local and deterministic. Verified with
  `document.fonts.check()` in the HyperFrames preview.
- **No CTA was spoken**, so none is invented: the final card lands the spoken keyword «المنهج القطري» and the
  spoken closing line «بإذن الله تعالى», held 15 frames after the last word.
- **Audio**: the original dialogue is the only audio (−13.6 LUFS, −1.2 dBTP measured; noise floor ≈ −60 dBFS,
  so no denoise). Three bundled, licence-free SFX (Pixabay Content License) sit far below the voice on graphic
  cuts and hero-word landings. No music.
- **Ratio**: 49.8 % talking head / 50.2 % graphic interludes (15.62 s / 15.72 s of 31.34 s).

## Deliverables
`index.html` + `compositions/`, `assets/`, `scripts/` (plan → transcript/timing/captions; build → root + captions;
scenes → the five editorial scenes), `transcript.json`, `captions.srt` (+ `captions-source.srt`), `timing-map.json`,
`source-analysis.md`, `SPEC.md`, `STORYBOARD.md`, `REVIEW.md`, `review/` (contact sheets, seams, phone sheet, keyframe
shots), `renders/preview_draft.mp4` (draft-quality review file), and after preview approval `final_reel.mp4`.
