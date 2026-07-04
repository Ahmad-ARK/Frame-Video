# Upgrade Plan: Asset Review UI · Thumbnail v2 · Premium Scenes

This is an execution spec. Each part is independent and sized as one work
session. Follow the GROUND RULES for every part. Do the parts in order
(Part 2 and 3 both benefit from Part 1's per-image metadata refactor;
Part 3's ParallaxDeep benefits from Part 2's background-removal module).

---

## GROUND RULES (apply to every part)

1. **Determinism**: all animation uses `useCurrentFrame()` + `interpolate`/`spring`.
   NEVER CSS `transition`/`animation` (they do nothing in Remotion). NEVER
   `Math.random()` — use `random(seed)` from remotion.
2. **Theme tokens only**: no hardcoded colors in scene components. Use
   `useTheme()` → `theme.accent / bg / paper / ink / textPrimary / textSecondary /
   accentGlow / highlighter / fire / map / duotone`, and `gradeFilter(theme, tone)`
   on every fetched image. Rule from the owner: EVERY scene must work in EVERY
   theme — re-skin, never exclude.
3. **Verification loop after each step**: `npx tsc` must pass; then render
   stills via `npx tsx pipeline/themecheck.ts` (requires `public/props_showcase.json`;
   regenerate with `npm run showcase -- --props-only` if scene set changed) and
   LOOK at the PNGs in `out/themecheck/<theme>/` for all 3 themes before moving on.
4. **Cache discipline**: scene artifacts cache in `.cache/` keyed by
   `hash(scenePlan + ttsSignature() + '|match-v3')` (see `produceScene` in
   `pipeline/index.ts`). If you change the shape of scene props produced by the
   pipeline, bump the literal version suffix in that key (e.g. `|match-v4`) so
   stale artifacts regenerate.
5. **Windows quirks**: run `modal deploy` with `PYTHONUTF8=1`; never rely on
   heredocs with backticks in Git Bash — write patch scripts to files.
6. **Schema changes**: planner/script schemas live in `pipeline/types.ts` (zod,
   discriminated union on `component`). Any new scene = new union member +
   planner menu text in `pipeline/planner.ts` + `COMPONENTS` map in
   `src/Root.tsx` + `imagesNeeded()` case in `pipeline/index.ts` + entry in
   `pipeline/showcase.ts` + (if it draws its own text) `TEXT_SCENES` set in Root.

---

# PART 1 — Asset Review UI (human-in-the-loop stage)

## Goal
Optional pause after all assets are resolved and BEFORE rendering: a local web
page lists every image slot (scene, query used, image found, provider/license).
User can approve, edit the query and re-fetch, or upload a replacement. On
"Continue", the pipeline renders with the edits.

## Prerequisite refactor: per-image metadata (do this first)
Today `scene.props.images` is `string[]`; the query/credit/tone/focal that
produced each image is not stored per-image. Fix:

1. `pipeline/types.ts`: add
   `ImageMeta { query: string; provider: string; author?: string; license?: string; sourceUrl?: string; tone?: string | null; focal?: {x:number;y:number} | null }`
   and to `ResolvedCue` add `query?: string`.
2. `pipeline/index.ts` `produceScene()`: alongside `images`, build
   `props.imageMeta: ImageMeta[]` from the `ResolvedImage[]` returned by
   `resolveImages` (it already carries credit/focal/tone). For cue images set
   `cue.query = cue.imageQuery.query` when pushing the ResolvedCue.
3. Rebuild the video-level `credits` array in `produceVideo` from all
   `imageMeta` + cue metas + music credit (dedupe by sourceUrl||provider+title)
   instead of collecting during production. This makes credits reproducible
   after review edits.
4. Bump the scene-cache version suffix (rule 4). `npx tsc` + one cached-topic
   pipeline run to verify props JSON now contains `imageMeta`.

## The review server
New file `pipeline/review.ts` exporting
`runReview(opts: { props: RenderProps; propsPath: string; assetDirAbs: string; assetDirRel: string }) : Promise<void>`
that resolves when the user clicks Continue.

- Node built-in `http` only. Port 4711. On start, print the URL and open the
  browser: `exec('start "" "http://localhost:4711"')` on win32, `open` on
  darwin, `xdg-open` otherwise; wrap in try/catch.
- Build `slots: ReviewSlot[]` from props:
  - one slot per `scenes[i].props.images[k]` →
    `{ id: "s:i:k", sceneIdx, component, narrationPreview, query: imageMeta[k].query, file, provider, license }`
  - one slot per popImage cue → `{ id: "c:i:k", ... query: cue.query }`
  - skip `placeholder.jpg`? NO — show it flagged red "no image found" (these
    are exactly what the user wants to fix).
- Endpoints (all JSON unless noted):
  - `GET /` → single self-contained HTML page (template string in
    `pipeline/review-page.ts` exporting `REVIEW_HTML`; vanilla JS, dark UI,
    no external assets).
  - `GET /state` → `{ slots, videoTitle, theme }`
  - `GET /img?f=<public-relative path>` → streams the file. SECURITY: resolve
    against PUBLIC_DIR and reject if `!resolved.startsWith(PUBLIC_DIR)`.
  - `POST /refetch` `{ id, query?, kind? }` → calls `resolveImages` with the
    (possibly user-edited) single query, `count: 1`,
    `usedUrls: new Set(props.usedUrls)` so a NEW candidate returns, counter
    continuing from max existing `img_<n>` index + 1000. Updates the slot in
    props (file + imageMeta/cue), pushes new url into `props.usedUrls`,
    returns the updated slot. If resolution returns placeholder → `{error}`.
  - `POST /upload` `{ id, filename, dataBase64 }` (browser reads the file with
    FileReader → base64; cap 25 MB; accept only .jpg/.jpeg/.png/.webp by
    extension). Write to `<assetDirAbs>/img_user_<timestamp>.<ext>`, update
    slot with `provider:'user', license:'User-provided', tone:null, focal:null`,
    return updated slot.
  - `POST /done` → save props to `propsPath` (JSON.stringify …, null, 2),
    respond `{ok:true}`, then `server.close()` and resolve the promise.
- UI page requirements: cards grouped by scene with component + narration
  header; each card: image (via /img), editable query input, provider/license
  caption, buttons "Re-fetch" and "Upload", red border when file is
  placeholder.jpg; sticky footer with slot count and a big "Continue → Render"
  button; every mutation re-renders that card from the server response.

## Pipeline wiring
- `pipeline/index.ts`: new CLI flag `--review` (`const REVIEW = argv.includes('--review')`).
- In `produceVideo`, AFTER props are assembled and written but BEFORE
  `renderVideo`: `if (REVIEW) { await runReview({...}); }` then:
  - recompute `thumbImage` (first non-placeholder image) AFTER review,
  - rebuild credits from imageMeta (see prerequisite step 3),
  - re-write the props file.
- README: document `npm run run-pipeline -- --review`.

## Acceptance tests
1. `npm run run-pipeline -- --review` on a cached topic → browser opens,
   all slots visible, placeholders flagged.
2. Edit a query → Re-fetch → card shows a different image; check
   `public/props_<slug>.json` changed on Continue.
3. Upload a local jpg → renders into the final video (extract the scene's
   frame with ffmpeg and confirm visually); credits card + metadata contain
   "User-provided".
4. Run WITHOUT `--review` → no pause, behavior unchanged.

---

# PART 2 — Thumbnail v2

## Goal
Three thumbnail layouts with a subject-cutout hero look, punchy 2–4 word text,
small-size readability, and optional A/B variants.

## Step 1 — punch text from the script (no new LLM call)
- `pipeline/types.ts`: add to `ScriptSchema` and `LongScriptSchema`:
  `thumbText: z.string().describe('thumbnail hook, 2-4 words, uppercase, curiosity punch — e.g. "NEVER FOUND", "THEY LIED"')`
  and add `thumbText?: string` to the normalized `Script` interface; pass it
  through in `pipeline/script.ts` returns. Fallback when absent: existing
  stopword-trimmed title logic.

## Step 2 — background removal module
- `npm i @imgly/background-removal-node` (MIT, local ONNX; first run downloads
  the model — allow several minutes; CPU-only is fine).
- New `pipeline/thumbnail/cutout.ts`:
  `removeBackground(inputAbs: string, outputAbsPng: string): Promise<boolean>`
  — wraps the lib, try/catch → false on any failure, times out at 90s.
- Subject pick: extend the vision-verify JSON (in `pipeline/assets/verify.ts`)
  with `"subject": "person" | "object" | "scene"` per acceptable candidate
  (same call, zero cost); store on ResolvedImage/imageMeta. Thumbnail picks the
  first image whose subject is `person`, else `object`, else no cutout.

## Step 3 — three layouts in `src/Thumbnail.tsx`
Props become `{ title, thumbText?, image, cutout?, theme?, layout? }` where
`cutout` is a public-relative PNG path. Auto layout choice:
`cutout ? 'subject' : (imageMeta says portrait aspect ? 'split' : 'full')`.

- **subject**: bg = original image, `gradeFilter` + blur(6px) + brightness .5 +
  vignette; cutout on the right ~45% width scaled 1.12 anchored bottom
  (slight top overflow is desirable), behind it a duplicated cutout offset
  8px filled with `theme.accent` (solid silhouette outline trick:
  `filter: drop-shadow(0 0 0 accent)` won't fill — instead render the accent
  copy with `filter: brightness(0) drop-shadow(...)` replaced by CSS
  `filter: opacity(1)` + `background`?? — SIMPLEST RELIABLE TRICK: render the
  cutout img twice; the back copy gets
  `filter: brightness(0) invert(1)`-free approach is messy, so use:
  back copy with `filter: drop-shadow(6px 0 0 ACCENT) drop-shadow(-6px 0 0 ACCENT) drop-shadow(0 6px 0 ACCENT) drop-shadow(0 -6px 0 ACCENT)`
  which draws a clean 6px outline around transparent PNGs); left side: kicker
  chip ("DOCUMENTARY" small, letter-spaced, accent bg, ink text), then
  thumbText at 150–190px Oswald 700 uppercase, white, `WebkitTextStroke:
  '6px rgba(0,0,0,0.6)'` plus heavy drop shadow, last word in
  `theme.captionActive`.
- **split**: left 55% panel `theme.bg` with a 12px accent diagonal divider
  (skewX(-6deg)); text block as above at 120–150px; right 45% image
  cover-fit, graded, `contrast(1.15) saturate(1.25)`.
- **full**: current design + `saturate(1.25)`, text stroke as above, min font
  raised to 120px.
- Readability hard rules: max 5 words on screen; 60px safe margins; gradient
  under text always; verify at 320px wide.

## Step 4 — pipeline wiring
- In `produceVideo` after review/QA: pick subject image → run cutout into
  `public/assets/<slug>/thumb_cutout.png` (skip silently on failure) → call
  `renderThumbnail({title, thumbText: script.thumbText, image, cutout, theme})`.
- Optional flag `--thumbs=all`: render all three layouts to
  `<slug>_thumb_a.png / _b.png / _c.png` (pass `layout` explicitly).

## Acceptance tests
1. For the existing legion + pompeii props: render all 3 layouts × gold theme;
   downscale each to 320px wide with ffmpeg and LOOK — text must be readable,
   subject must pop, nothing clipped.
2. Cutout failure path: feed a landscape-only video → pipeline still produces
   a thumbnail (split/full) without crashing.
3. Noir + vintage: accent/stroke colors follow the theme.

---

# PART 3 — Premium scene tier (CSS-3D + motion)

No Three.js. Chrome renders CSS 3D (`perspective`, `rotateX/Y`, `translateZ`,
`transform-style: preserve-3d`) deterministically and fast. CRITICAL Chrome
gotchas: a parent with `overflow: hidden` or a non-none `filter` FLATTENS
preserve-3d children — grade the images INSIDE the 3D planes, never on the 3D
container; render one themecheck still immediately after scaffolding each
scene to catch flattening early.

Add scenes one at a time, in this order, following rule 6's checklist for each:

## 3.1 ParallaxDeep (the 2.5D flagship)
- Schema: `{ component: 'ParallaxDeep', ...common }` (no extra fields).
- Layers, back to front, inside a `perspective: 1200px` root:
  1. bg: image cover-fit, graded, blur(10px) brightness(0.55), scale 1.25,
     slow translateX drift;
  2. mid: same image sharp, `rotateY` from -3° to 3° and `translateZ` 0→90px
     over the scene (camera dolly feel), transform-origin at focal point;
  3. IF a cutout exists (reuse Part 2's module; pipeline generates
     `props.cutouts?: (string|null)[]` for this component when the image
     subject is person/object): cutout at `translateZ 140→220px`, scale
     1.05→1.18 — true parallax separation;
  4. dust particles (reuse HookTitle's DustLayer, extract it to
     `src/scenes/DustLayer.tsx` first) at two z-depths with different speeds;
  5. light sweep: a 30%-wide diagonal white gradient at opacity 0.10,
     screen blend, translating across once per scene.
- `imagesNeeded`: 1. Captions: shown. Planner text: "cinematic depth shot of a
  single powerful image; use for the most emotionally important single visual
  of an act".

## 3.2 TitleParallax (premium emphasis/chapter card)
- Schema: `{ component: 'TitleParallax', ...common, title: max 4 words, kicker?: max 3 words }`.
- Root `perspective: 900px`; three text copies stacked in Z: shadow copy
  (translateZ -60, ink/black, blur 8, opacity .5), main (Playfair 170px,
  textPrimary), glow copy (translateZ 40, accent, opacity .25, blur 14);
  whole stack drifts `rotateX 8°→2°`; background: theme.bg + conic-gradient
  light cone from top (masked, opacity .12) + DustLayer; kicker chip above.
- Also use it INSTEAD of ChapterCard when the video is long-form: in
  `produceVideo`'s chapter-card insertion, keep ChapterCard but switch the
  component name to TitleParallax with actNumber → kicker "PART II". Keep
  ChapterCard registered for backward compat.
- Captions: off (add to TEXT_SCENES). Images: 0.

## 3.3 PhotoCarousel3D
- Schema: `{ component: 'PhotoCarousel3D', ...common }`; imagesNeeded:
  `clamp(ceil(durationSec/3.5), 3, 5)`.
- Cylinder: container `perspective: 1400px`; ring div
  `transform-style: preserve-3d; rotateY(interpolate(frame, [0,dur], [0,-360/n * (n-1)]))`
  stepped with spring easing per segment (use `Math.floor(progress*n)` +
  spring on the fractional part so it SNAPS between photos rather than
  spinning continuously); each photo: width 560px, `rotateY(i*360/n) translateZ(radius)`
  where `radius = 560/(2*tan(PI/n)) + 40`; theme paper frame (14px border) +
  shadow; front-facing photo gets brightness 1, others 0.7 (compute from
  angular distance); floor reflection: duplicate ring, scaleY(-1),
  translateY, masked gradient, opacity 0.18.
- Captions: shown. Planner: "a series of artifacts, faces or places named
  together — the narration should enumerate".

## 3.4 DocumentRig (3D document zoom)
- Schema: `{ component: 'DocumentRig', ...common, docTitle: max 4 words, stampText?: max 2 words }`.
- A paper sheet (theme.paper, subtle turbulence texture, 3:4) lying on a dark
  desk plane: sheet starts `rotateX(38°) translateZ(-80) scale(.9)` and
  animates to `rotateX(6°) scale(1.06)` (camera picks the document up);
  the image (graded, sepia-leaning) sits inside the sheet with a caption
  strip; theme.marker highlight bar sweeps across one line region at 40%
  scene time; optional red stamp (stampText, marker color, rotated -12°,
  opacity pops in with spring + hit SFX) at 70%.
- Captions: shown. Images: 1.

## 3.5 CubeReveal
- Schema: `{ component: 'CubeReveal', ...common, faceLabels: [string, string] }`;
  imagesNeeded: 2.
- A full-bleed cube: two faces (front + right) each holding a cover-fit graded
  image + bottom label bar; cube `rotateY` 0→-90° with `spring({damping:16})`
  triggered at the scene's midpoint (or at `props.flipFrame` — pipeline sets
  it from the FIRST cue trigger when the planner provides cues, else
  durationInFrames*0.45); add `whoosh` SFX at flip start; slight continuous
  `rotateX(2°)` breathing; vignette.
- Captions: shown. Planner: "a hard before/after or cause/effect pivot".

## Rollout + verification (per scene)
1. Implement component with theme tokens; register everywhere (rule 6).
2. Add a showcase entry with meta-narration; `npm run showcase -- --props-only`.
3. `npx tsx pipeline/themecheck.ts` → inspect the new scene's still in ALL
   THREE themes (check: no 3D flattening, no text overflow, grade applied).
4. Only then move to the next scene.
5. Final: full E2E run on a fresh topic + watch the video.

## Planner guidance update (after all five land)
Add to `pipeline/planner.ts` menu: the five new entries with BEST-FOR lines,
plus a pacing rule: "prefer a premium scene (ParallaxDeep / PhotoCarousel3D /
DocumentRig / CubeReveal) at least once per act; never twice in a row."
