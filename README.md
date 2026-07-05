# Documentary Pipeline

Fully automatic faceless-YouTube documentary generator. You write a **topic**,
it produces an upload-ready package:

- 🎬 a narrated, captioned, color-graded 1080p documentary (`.mp4`)
- 📱 a vertical ≤59s **Short** cut from the strongest scenes
- 🖼️ a **thumbnail**
- 📝 **metadata** (title, description with chapters + image credits, tags)
- 🔍 an automated **QA report** — flagged scenes get their images re-sourced
  and the video re-rendered without you touching anything

Under the hood: research-grounded scriptwriting (hook → curiosity gap → payoff),
18 scene components chosen by an AI director, word-synced text/image pops driven
by real speech timestamps, vision-verified image sourcing from four providers
with license filtering + attribution, mood-matched ducked music, SFX, and a
video-wide visual **theme** (gold / noir / vintage) that color-grades every
image so mismatched stock footage reads as one film.

---

## 1. Requirements

| What | Why | Install |
| --- | --- | --- |
| **Node.js 18+** | everything | https://nodejs.org |
| **ffmpeg + ffprobe on PATH** | audio normalization, durations, QA frames | https://ffmpeg.org/download.html (`winget install ffmpeg` on Windows) |
| **Anthropic API key** | script, planning, image checks | https://console.anthropic.com |
| Internet at render time | Google Fonts are fetched during rendering | — |

Optional but recommended: free **Pixabay** and **Pexels** API keys (see `.env.example`).

## 2. Install & first run

```bash
git clone <this repo>   # or unzip the folder
cd documentary-pipeline
npm install

cp .env.example .env    # then open .env and paste your ANTHROPIC_API_KEY

npm run run-pipeline    # renders every topic in input.txt
```

First render downloads a headless Chrome (~150 MB) automatically. Outputs land
in `out/`. That's the whole loop.

> **Minimal setup is just the Anthropic key.** Image search then uses
> Wikimedia + Openverse only, and narration uses the free Edge neural voice.
> Add the optional keys/endpoints in `.env.example` to unlock stock b-roll,
> AI image generation, and the premium Chatterbox narrator.

## 3. Writing topics — `input.txt`

Topics are separated by lines containing `===`. A topic is a **prompt, not a
script** — the pipeline researches it (Wikipedia) and writes the narration.

```
The final 24 hours of Pompeii, hour by hour.
===
THEME: noir
LENGTH: 5min
The disappearance of the Roman Ninth Legion.
===
VERBATIM: My exact narration, spoken word for word.
```

Per-topic option lines (each optional, one per line):

| Line | Effect |
| --- | --- |
| `LENGTH: 5min` (or `90s`) | long-form: multi-act script, chapter cards, mini-hooks every act, YouTube chapters |
| `THEME: gold\|noir\|vintage` | visual theme for this video |
| `VERBATIM:` prefix | skip scriptwriting, use your text as-is |

## 4. Outputs (per topic, in `out/`)

```
<slug>.mp4              the documentary
<slug>_short.mp4        9:16 vertical Short (hook + highest-energy scenes)
<slug>_thumb.png        thumbnail (or _thumb_subject/_split/_full.png with --thumbs=all)
<slug>.metadata.txt     paste-ready title/description(+chapters+credits)/tags
<slug>.qa.json          automated QA findings
```

Working files: `public/assets/<slug>/` (downloaded images + narration audio),
`public/props_<slug>.json` (exact render inputs — open `npm run dev` to inspect
scenes in Remotion Studio).

## 5. Commands

```bash
npm run run-pipeline                 # produce all topics in input.txt
npm run run-pipeline -- --force      # ignore stage cache, redo everything
npm run run-pipeline -- --no-qa      # skip the QA/repair pass
npm run run-pipeline -- --review     # pause before rendering for an asset review (see §5b)
npm run run-pipeline -- --thumbs=all # render all 3 thumbnail layouts instead of just one (see §5c)
npm run run-pipeline -- --rerender <slug>   # re-render from saved props (no API cost)

npm run showcase                     # demo video containing every scene component
npm run showcase -- noir             # ...in a specific theme
npx tsx pipeline/themecheck.ts       # stills of every scene × every theme → out/themecheck/
npm run dev                          # Remotion Studio (visual scene inspector)
```

Every pipeline stage caches in `.cache/` — if a run crashes (network, etc.),
run the same command again and it resumes where it stopped.

## 5b. Asset review UI (`--review`)

`npm run run-pipeline -- --review` pauses each video right after all images
are resolved, before rendering starts, and opens a local page at
**http://localhost:4711** listing every image slot in the video: the scene,
the narration, the search query used, and the image found (provider +
license shown). Slots with no image found are outlined in red.

Per slot you can:
- **edit the query and click Re-fetch** — pulls a fresh candidate (previously
  used images are never repeated);
- **Upload** your own `.jpg`/`.png`/`.webp` to replace that slot entirely
  (credited as "User-provided" in the ledger).

Click **Continue → Render** when you're happy; the pipeline resumes with your
edits baked in (including the thumbnail and the credits ledger). Everything
is saved to `public/props_<slug>.json` after every edit, so closing the
browser tab mid-review loses nothing — just re-run with `--review` again.

## 5c. Thumbnails

Three layouts, auto-selected per video:

- **subject** — a background-removed cutout of the video's main person/object
  pops in front of a blurred, graded backdrop with a themed outline glow. Used
  automatically whenever the vision pass tags an image's focal point as a
  `person` or `object` (cutouts run locally via `@imgly/background-removal-node`
  — no API cost, ~5-10s the first time a model downloads, seconds after).
- **split** — a solid color panel with the headline next to a graded image.
  Used as the fallback layout.
- **full** — graded full-bleed image behind the headline (the old design,
  now with a bolder stroke and higher-contrast grade). Used if neither of the
  above applies.

The headline text itself is a dedicated **`thumbText`** the script stage
writes alongside the narration — a punchy 2-4 word curiosity hook ("NEVER
FOUND", "300 DIED") distinct from the video's title, sized and stroked for
readability at small feed sizes.

Run `npm run run-pipeline -- --thumbs=all` to render all three layouts side
by side (`<slug>_thumb_subject.png` / `_split.png` / `_full.png`) and pick
your favorite by hand.

## 6. Themes

A theme re-skins **all** scenes via design tokens (accents, papers, map
palette…) and runs every fetched image through a color grade (filter + tint
wash + film grain), so images from four different stock sites look like one
film. The vision pass tags each image bright/mid/dark so the grade adapts per
image; AI-generated images are prompted in the theme's style from birth.

- `gold` — warm cinematic documentary (default)
- `noir` — high-contrast monochrome, crimson accent
- `vintage` — sepia archive, parchment tones

Priority: `THEME:` line in the topic → `DEFAULT_THEME` in `.env` → derived
from the script's mood (tense→noir, somber→vintage, else gold).

## 7. Scene components (the director picks per beat)

| Component | Use |
| --- | --- |
| HookTitle | cold-open: drifting footage montage, title slams in on the narration's key word |
| KenBurns | multi-image montage, focal-aware zoom/pan, ≤4s per still |
| ArchivalFilm | old-footage treatment (grain, flicker, gate weave) |
| MacroScreenFocus | punchy highlighted headline |
| SplitScreen | two contrasted subjects, angled divider, VS/⇄ badge |
| QuoteOverlay | attributed quotation, word-staggered reveal |
| StatueReveal | artifact close-up + typewriter narration |
| Timeline | time-driven event sweep (2–5 dated events) |
| GlitchGrid | energetic tiled reveal, HUD accents |
| EditorialPaper | newspaper layout |
| Map | d3-geo vector map: camera flies to the route, all route countries highlighted |
| StatCounter | one striking number counts up |
| GrungeCollage | stop-motion punk manifesto card |
| InvestigationOpener | true-crime case-file scrapbook |
| CinematicFire | embers + procedural fire wipe for epic turning points |
| NewspaperAnnotation | academic layout, red hand-drawn circle/underline |
| FontRollDecoder | kinetic typography, words scramble-decode in sync with speech |
| SocialJustice | giant image-filled matte word + duotone wash |
| ChapterCard / Credits | act dividers (long-form) and the attribution end card |

**Word-synced cues:** any imagery scene can carry up to 6 cues that fire the
moment the narrator speaks a trigger word — `popText` slams a word on screen,
`popImage` punches in a polaroid photo. Enumerations ("paper, spices, and
gunpowder") become synced pop sequences automatically.

## 8. Optional self-hosted endpoints (Modal)

Both are optional; the pipeline works without them.

**Chatterbox TTS** (much better narrator, MIT-licensed model):
```bash
pip install modal && modal setup          # one-time Modal account/auth
modal deploy modal/chatterbox_tts.py
modal secret create tts-auth TTS_AUTH_TOKEN=<any-random-string>
# put the endpoint URL + the same random string into .env (see .env.example)
```
Falls back to the free Edge voice automatically if unreachable.

**FLUX image generation**: any Modal FLUX.1-dev deployment that accepts
`POST {prompt,width,height,steps}` with Modal proxy auth. Wire it via
`FLUX_ENDPOINT` / `FLUX_MODAL_KEY` / `FLUX_MODAL_SECRET`.

## 9. Licensing & attribution

Image search is filtered to commercial-safe licenses (public domain, CC0,
CC BY, CC BY-SA, Pexels/Pixabay licenses). Attributions are collected per
video, rendered on the credits end card, and written into the metadata
description. Background music is Kevin MacLeod (incompetech.com, CC BY 4.0)
— its attribution is added automatically. AI-generated images are labeled.

## 10. Troubleshooting

- **`ffmpeg` not found** — install it and make sure `ffmpeg -version` works in
  a fresh terminal. Without it audio isn't loudness-normalized and QA is skipped.
- **Wikimedia searches fail (ENOTFOUND / timeouts)** — Wikimedia is blocked in
  some regions (e.g. Pakistan). Use a VPN for best historical imagery; the
  pipeline still completes via the other sources.
- **Headless Chrome timeout on first render** — transient on Windows; the
  renderer retries automatically. Just re-run if a whole run dies; the cache
  resumes it.
- **`modal deploy` crashes with a 'charmap' error on Windows** — run it as
  `PYTHONUTF8=1 modal deploy ...`.
- Keep the project on a local disk if possible — cloud-synced folders
  (OneDrive/Dropbox) can lock files mid-render.
