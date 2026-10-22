# Fonts in this project

| Family | File(s) | Axes | Source | License |
| --- | --- | --- | --- | --- |
| Cairo (variable) | `cairo-arabic.woff2`, `cairo-latin.woff2`, `cairo-latin-ext.woff2` | `wght` 200–1000 | Google Fonts API, Cairo v31 (`fonts.gstatic.com/s/cairo/v31/…`), downloaded 2026-10-22 | SIL Open Font License 1.1 (`OFL.txt`) |

Why vendored: the render machine had no Arabic display family installed (only DejaVu Sans and
FreeSans cover the Arabic block). Cairo was the first candidate on the brief's preference list, so it
was frozen into `assets/fonts/` and declared with `@font-face` + `unicode-range` so the render is local
and deterministic (no render-time font fetch). The files are the unmodified Google Fonts subsets.
Cairo is designed by Mohamed Gaber (The Cairo Project Authors); see https://fonts.google.com/specimen/Cairo.
