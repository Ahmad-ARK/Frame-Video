# Documentary Pipeline

Faceless-YouTube documentary generator. Give it a **topic** (or your own exact
**script**) and it produces an upload-ready package:

- 🎬 a narrated, captioned, color-graded 1080p documentary (`.mp4`)
- 📱 a vertical ≤59s **Short** cut from the strongest scenes
- 🖼️ a **thumbnail** (AI-written hook text + auto subject cutout)
- 📝 **metadata** (title, description with chapters + image credits, tags)
- 🔍 an optional automated **QA** pass — flagged scenes get re-sourced and re-rendered

Under the hood: scriptwriting (or your verbatim script), 20+ scene components
chosen by an AI director, word-synced text/image pops driven by real speech
timestamps, vision-verified image sourcing from four providers with license
filtering + attribution, mood-matched ducked music, SFX, per-channel visual
identity, and a video-wide **theme** that color-grades every image so mismatched
stock footage reads as one film.

---

## 1. Requirements

| What | Why | Install |
| --- | --- | --- |
| **Node.js 18+** | everything | https://nodejs.org |
| **ffmpeg + ffprobe on PATH** | audio normalization, durations, QA frames | https://ffmpeg.org (`winget install ffmpeg` on Windows) |
| An **LLM key** (see §2) | scene planning, title, image checks | DeepSeek and/or Anthropic |
| Internet at render time | Google Fonts are fetched while rendering | — |

Optional but recommended: free **Pixabay** + **Pexels** API keys (stock b-roll).

## 2. LLM providers (the cost knobs)

The pipeline uses LLMs for two different jobs, and you can point each at a
different provider via `.env`:

| Role | What it does | Default | Env |
| --- | --- | --- | --- |
| **Planning** | maps script → scenes, image queries, cues; writes the title/thumbnail hook | DeepSeek **V4-Flash** if `DEEPSEEK_API_KEY` set, else Claude Sonnet | `DEEPSEEK_API_KEY`, `PLAN_MODEL` |
| **Vision** | ranks/accepts images, reads focal point + brightness + subject; post-render QA | Claude **Haiku 4.5** | `ANTHROPIC_API_KEY`, `VISION_MODEL` |

**Recommended cheap setup:** DeepSeek Platform key for planning (≈ **$0.01–0.02
per video**, and prompt-caches automatically) + an Anthropic key for vision
(≈ **$0.17**, or run `--no-qa` to roughly halve it). Planning falls back to
Anthropic automatically if you don't set a DeepSeek key.

DeepSeek uses its Anthropic-compatible endpoint (`api.deepseek.com/anthropic`),
so the same code drives both — you only swap a key + model string.

## 3. Install & first run

```bash
cd documentary-pipeline
npm install

cp .env.example .env    # then paste your keys (see §2)

npm run run-pipeline    # renders every topic in input.txt → out/
```

First render downloads a headless Chrome (~150 MB) automatically.

## 4. Writing topics — `input.txt`

Topics are separated by lines containing `===`. A topic is either a **prompt**
(the pipeline researches + writes it) or your own **verbatim script**.

```
The final 24 hours of Pompeii, hour by hour.
===
THEME: noir
LENGTH: 5min
The disappearance of the Roman Ninth Legion.
===
VERBATIM: My exact narration, spoken word for word.

Blank lines split it into acts (a "PART II" divider card between them).
```

Per-topic option lines (each optional):

| Line | Effect |
| --- | --- |
| `VERBATIM:` prefix | skip scriptwriting; your text is the narration verbatim |
| `THEME: gold\|noir\|vintage` | visual theme for this video |
| `LENGTH: 5min` (or `90s`) | prompt mode only: longer multi-act script + YouTube chapters |

**VERBATIM specifics** (this is the common mode):
- **Blank lines = act boundaries** → a divider card appears between acts. No
  blank lines = one continuous video, no dividers. You control pacing.
- Long scripts are chunked automatically so planning never overflows.
- The **title, thumbnail hook, and mood are AI-generated** from your script
  (one tiny call) — so a script that opens "In 1953, the Korean War…" gets a
  real title like *"The War That Never Ended"* + thumbnail *"STILL AT WAR"*.

## 5. Channels — per-channel identity (`--channel`)

Running the same pipeline for many channels risks looking like one content
farm. A **channel config** gives each channel a distinct look + narrator so N
channels read as N different shows. Create `channels/<name>.json`:

```json
{
  "theme": "noir",
  "voice": "en-US-ChristopherNeural",
  "accent": "#E4572E",
  "niche": "true crime & investigations"
}
```

Then:

```bash
npm run run-pipeline -- --channel verdict
```

| Field | Effect |
| --- | --- |
| `theme` | base theme for this channel (a per-topic `THEME:` still overrides) |
| `voice` | edge-tts narrator voice (different voice per channel is the #1 anti-farm signal) |
| `accent` | hex signature colour — overrides the theme accent everywhere (captions, rules, glows, map, thumbnail) so one base theme yields many identities |
| `niche` | your own note; not used at runtime |

Example configs ship in `channels/` (`atlas`, `verdict`, `relic`). The chosen
voice is part of the audio cache key, so channels never share cached narration.
> Tip for scale: give each channel a **different niche** and **voice** — those
> matter more than colour for looking like genuinely separate channels.

## 6. Outputs (per topic, in `out/`)

```
<slug>.mp4              the documentary
<slug>_short.mp4        9:16 vertical Short
<slug>_thumb.png        thumbnail (+ _subject/_split/_full with --thumbs=all)
<slug>.metadata.txt     paste-ready title / description(+chapters+credits) / tags
<slug>.qa.json          QA findings (unless --no-qa)
```

Working files: `public/assets/<slug>/` (images + narration audio),
`public/props_<slug>.json` (exact render inputs; open `npm run dev` to inspect).

## 7. Commands

```bash
npm run run-pipeline                        # produce all topics in input.txt
npm run run-pipeline -- --channel <name>    # apply a channel identity (see §5)
npm run run-pipeline -- --no-qa             # skip the QA/repair pass (cheaper)
npm run run-pipeline -- --review            # curate images in a web UI before render (§8)
npm run run-pipeline -- --force             # ignore cache, redo everything
npm run run-pipeline -- --thumbs=all        # render all 3 thumbnail layouts
npm run run-pipeline -- --rerender <slug>   # re-render from saved props (no API cost)

npm run showcase                            # demo video with every scene component
npm run dev                                 # Remotion Studio (visual scene inspector)
npx tsx pipeline/themecheck.ts              # stills of every scene × every theme
```

Every stage caches in `.cache/` — if a run dies (network, etc.), just run the
same command again and it resumes. Delete `.cache/script_*.json` to force a
title/script regenerate for an already-run topic.

## 8. Asset review UI (`--review`)

Pauses each video after images are resolved, before rendering, and opens
**http://localhost:4711** listing every image slot: scene, narration, search
query, and the image found. Per slot you can **edit the query + Re-fetch** or
**Upload** your own `.jpg/.png/.webp`. Click **Continue → Render** to resume
with your edits baked in (thumbnail + credits included). Progress is saved
after every edit, so closing the tab loses nothing.

## 9. Render performance

Rendering is frame-by-frame in headless Chrome; the blur/3D scenes dominate.
Two knobs (both in `.env`, both auto-tuned):

| Env | Default | Effect |
| --- | --- | --- |
| `RENDER_CONCURRENCY` | all logical cores | parallel Chrome workers. Lower it (e.g. `8`) if the machine swaps/crashes on RAM |
| `RENDER_GL` | `angle` (GPU) | GPU-accelerates blur/3D filters. Set `swiftshader` if headless GPU init fails on your box |

On a 16-core machine this typically takes a 6-min video from ~30 min down to
~10–12 min. For minutes-not-tens, render on a high-core cloud VM (same settings)
or wire up Remotion Lambda.

## 10. Themes

A theme re-skins **all** scenes via design tokens and color-grades every fetched
image (filter + tint wash + grain), so images from four stock sites look like
one film. The vision pass tags each image bright/mid/dark so the grade adapts.

- `gold` — warm cinematic (default)
- `noir` — high-contrast monochrome, crimson accent
- `vintage` — sepia archive, parchment tones

Theme priority: per-topic `THEME:` → `--channel` theme → `DEFAULT_THEME` in
`.env` → derived from the script's mood. A channel `accent` recolours whichever
theme is chosen (see §5).

## 11. Scene components (the director picks per beat)

**Imagery-led:** KenBurns, ArchivalFilm, SplitScreen, Map (d3-geo, route-aware),
Timeline, StatCounter, CinematicFire, **ParallaxDeep** (true 3D depth dolly),
**PhotoCarousel3D** (3D photo ring), **DocumentRig** (document on a desk, camera
reads it), **CubeReveal** (before/after 3D flip).

**Typography-led:** HookTitle (cold open), **TitleParallax** (premium emphasis /
act-divider card), MacroScreenFocus, QuoteOverlay, StatueReveal, GlitchGrid,
EditorialPaper, GrungeCollage, InvestigationOpener, NewspaperAnnotation,
FontRollDecoder, SocialJustice. Plus the Credits end card.

**Word-synced cues:** any imagery scene can carry cues that fire the moment the
narrator speaks a trigger word — `popText` slams a word on screen, `popImage`
punches in a polaroid. Enumerations become synced pop sequences automatically.

## 12. Optional self-hosted endpoints (Modal)

Both optional; the pipeline works without them.

**Chatterbox TTS** (better narrator, MIT-licensed):
```bash
pip install modal && modal setup
modal deploy modal/chatterbox_tts.py
modal secret create tts-auth TTS_AUTH_TOKEN=<random-string>
# put the endpoint URL + same string in .env
```
Falls back to the free Edge voice automatically if unreachable.

**FLUX image generation** (last-resort b-roll when no real photo is found): any
Modal FLUX.1-dev deployment accepting `POST {prompt,width,height,steps}`. Wire
via `FLUX_ENDPOINT` / `FLUX_MODAL_KEY` / `FLUX_MODAL_SECRET`.
> Note: AI generation is only good for *generic* b-roll. It cannot produce a
> correct likeness of a real person (e.g. a named historical figure) — use the
> review UI to pick a real photo for those.

## 13. Licensing & attribution

Image search is filtered to commercial-safe licenses (public domain, CC0, CC BY,
CC BY-SA, Pexels/Pixabay). Attributions are collected per video, shown on the
credits card, and written into the metadata. Music is Kevin MacLeod
(incompetech.com, CC BY 4.0), attributed automatically. AI images are labeled.

## 14. Troubleshooting

- **`ffmpeg` not found** — install it; confirm `ffmpeg -version` in a fresh terminal.
- **Wikimedia searches fail (ENOTFOUND / all downloads fail)** — Wikimedia is
  region-blocked (e.g. Pakistan); use a VPN for historical imagery. On a *large*
  job, blanket download failures can also be rate-limiting, not a block — the
  pipeline retries with backoff and still completes via the other sources.
- **Render fails to start with a GPU error** — set `RENDER_GL=swiftshader` in `.env`.
- **Machine swaps / render crashes on memory** — set `RENDER_CONCURRENCY` lower.
- **`modal deploy` 'charmap' error on Windows** — run `PYTHONUTF8=1 modal deploy ...`.
- Keep the project on a **local disk** — cloud-synced folders (OneDrive/Dropbox)
  can lock files mid-render.
```
