import dns from 'dns';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Windows resolver intermittently fails IPv6-first lookups under concurrent
// load (getaddrinfo ENOTFOUND on hosts that curl resolves fine).
dns.setDefaultResultOrder('ipv4first');

import { FPS, PUBLIC_DIR, OUT_DIR, ROOT, MAX_SECONDS_PER_IMAGE, CREDITS_SECONDS, KEYS, TARGET_SCRIPT_WORDS, DEFAULT_THEME } from './config';
import { writeScript } from './script';
import { planScenes } from './planner';
import { researchTopic } from './research';
import { synthesize, ttsSignature } from './tts';
import { resolveImages } from './assets/resolve';
import { renderVideo, renderThumbnail, syncPublicFileToBundle } from './render';
import { writeMetadata } from './metadata';
import { qaVideo } from './qa';
import { runReview } from './review';
import { pickMusic } from './music';
import { removeBackgroundToFile } from './thumbnail/cutout';
import { isTheme, themeFromMood, FLUX_STYLES, type ThemeName } from './themes';
import type { Credit, Cue, ImageMeta, ImageQuery, Plan, QaFinding, RenderProps, RenderScene, ResolvedCue, ScenePlan, Script, WordStamp } from './types';

// ---------- CLI ----------

const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const NO_QA = argv.includes('--no-qa');
const REVIEW = argv.includes('--review');
const THUMBS_ALL = argv.includes('--thumbs=all');
const RERENDER_SLUG = argv.includes('--rerender') ? argv[argv.indexOf('--rerender') + 1] : null;

// ---------- cache ----------

const CACHE_DIR = path.join(ROOT, '.cache');
const hash = (s: string) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);

function readCache<T>(key: string): T | null {
  if (FORCE) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(CACHE_DIR, `${key}.json`), 'utf-8')) as T;
  } catch {
    return null;
  }
}
function writeCache(key: string, data: unknown): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(data));
}
async function cached<T>(key: string, produce: () => Promise<T>): Promise<T> {
  const hit = readCache<T>(key);
  if (hit !== null) return hit;
  const value = await produce();
  writeCache(key, value);
  return value;
}

// ---------- helpers ----------

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'video';

/** Simple concurrency pool preserving result order. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Split a list into the fewest chunks of size <= max, balanced so no chunk is
 * tiny (17 with max 8 → [6,6,5], not [8,8,1]). Used to keep each scene-planning
 * call within the 8-scene schema cap without leaving a stray 1-2 beat chunk.
 */
function chunkBeats<T>(items: T[], max: number): T[][] {
  const numChunks = Math.max(1, Math.ceil(items.length / max));
  const base = Math.floor(items.length / numChunks);
  const extra = items.length % numChunks;
  const chunks: T[][] = [];
  let i = 0;
  for (let c = 0; c < numChunks; c++) {
    const size = base + (c < extra ? 1 : 0);
    chunks.push(items.slice(i, i + size));
    i += size;
  }
  return chunks;
}

interface Topic {
  text: string;
  targetWords: number;
  theme?: string;
}

/** Topics separated by === lines; an optional "LENGTH: 5min" line sets duration. */
function parseTopics(raw: string): Topic[] {
  return raw
    .split(/^\s*===\s*$/m)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      let targetWords = TARGET_SCRIPT_WORDS;
      let theme: string | undefined;
      const text = block
        .replace(/^\s*\[?length\s*[:=]\s*(\d+)\s*(min|minutes|m|sec|seconds|s)?\]?\s*$/im, (_, num, unit) => {
          const n = Number(num);
          const seconds = !unit || /^m/.test(unit) ? n * 60 : n;
          targetWords = Math.max(80, Math.round((seconds / 60) * 155));
          return '';
        })
        .replace(/^\s*\[?theme\s*[:=]\s*([a-z]+)\]?\s*$/im, (_, name) => {
          if (isTheme(name.toLowerCase())) theme = name.toLowerCase();
          else console.warn(`⚠️ unknown theme "${name}" — using default`);
          return '';
        })
        .trim();
      return { text, targetWords, theme };
    });
}

function imagesNeeded(plan: ScenePlan, durationSec: number): number {
  switch (plan.component) {
    case 'Map':
    case 'FontRollDecoder':
    case 'TitleParallax':
      return 0; // fully vector / typographic scenes
    case 'SplitScreen':
    case 'CubeReveal':
      return 2;
    case 'KenBurns':
    case 'ArchivalFilm':
      return Math.min(6, Math.max(1, Math.ceil(durationSec / MAX_SECONDS_PER_IMAGE)));
    case 'HookTitle':
      // the hook is a montage now — footage keeps moving before/after the title card
      return Math.min(3, Math.max(1, Math.ceil(durationSec / MAX_SECONDS_PER_IMAGE)));
    case 'PhotoCarousel3D':
      return Math.min(5, Math.max(3, Math.ceil(durationSec / 3.5)));
    default:
      return 1;
  }
}

const normWord = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Align narration tokens to whisper word timestamps. Triggers are matched
 * against the NARRATION (the planner copies it verbatim) instead of whisper's
 * transcription, which mangles numbers ("25"→"twenty-five") and proper nouns
 * ("Hispana"→"Hispanic"). Unanchored tokens get timestamps interpolated from
 * their nearest anchored neighbors.
 */
function buildAligner(narration: string, words: WordStamp[]) {
  const tokens = narration.split(/\s+/).filter(Boolean);
  const tNorm = tokens.map(normWord);
  const wNorm = words.map((w) => normWord(w.text));
  const anchor: number[] = new Array(tokens.length).fill(-1);
  let j = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (!tNorm[i]) continue;
    for (let k = j; k < Math.min(j + 8, wNorm.length); k++) {
      const a = tNorm[i];
      const b = wNorm[k];
      if (!b) continue;
      if (a === b || (b.length > 2 && a.includes(b)) || (a.length > 2 && b.includes(a))) {
        anchor[i] = k;
        j = k + 1;
        break;
      }
    }
  }
  const timeOf = (i: number): number | null => {
    const idx = Math.max(0, Math.min(i, tokens.length - 1));
    if (anchor[idx] >= 0) return words[anchor[idx]].start;
    let a = -1;
    let b = -1;
    for (let x = idx - 1; x >= 0; x--) if (anchor[x] >= 0) { a = x; break; }
    for (let x = idx + 1; x < tokens.length; x++) if (anchor[x] >= 0) { b = x; break; }
    if (a < 0 && b < 0) return null;
    if (a < 0) return Math.max(0, words[anchor[b]].start - 0.35 * (b - idx));
    if (b < 0) return words[anchor[a]].start + 0.35 * (idx - a);
    const ta = words[anchor[a]].start;
    const tb = words[anchor[b]].start;
    return ta + ((tb - ta) * (idx - a)) / (b - a);
  };
  return { tokens, tNorm, timeOf };
}

/** Map cue trigger words to scene-local frames via narration-anchored alignment. */
function matchCueFrames(cues: Cue[], narration: string, words: WordStamp[], durationInFrames: number, logPrefix: string): number[] {
  const al = buildAligner(narration, words);
  let searchFrom = 0;

  const findTokenIdx = (start: number, target: string): number => {
    if (!target) return -1;
    for (let i = start; i < al.tokens.length; i++) {
      let acc = '';
      for (let k = i; k < Math.min(i + 6, al.tokens.length); k++) {
        acc += al.tNorm[k];
        if (acc.includes(target)) return i;
        if (acc.length > target.length + 14) break;
      }
    }
    return -1;
  };

  return cues.map((cue, ci) => {
    const target = normWord(cue.trigger);
    let idx = findTokenIdx(searchFrom, target);
    if (idx === -1) {
      const parts = cue.trigger.split(/\s+/).map(normWord).filter((p) => p.length > 2);
      parts.sort((a, b) => b.length - a.length);
      for (const part of parts) {
        idx = findTokenIdx(searchFrom, part);
        if (idx !== -1) break;
      }
    }
    if (idx !== -1) {
      searchFrom = idx + 1;
      const t = al.timeOf(idx);
      if (t !== null) return Math.round(t * FPS);
    }
    console.warn(`${logPrefix} ⚠️ cue trigger "${cue.trigger}" not in narration — placing proportionally`);
    return Math.round(((ci + 1) / (cues.length + 1)) * durationInFrames);
  });
}

/** For FontRollDecoder: sync display words to the moment they are spoken. */
function matchWordDelays(displayWords: { text: string }[], narration: string, words: WordStamp[]): number[] {
  const al = buildAligner(narration, words);
  let searchFrom = 0;
  return displayWords.map((w, idx) => {
    const target = normWord(w.text);
    for (let i = searchFrom; i < al.tokens.length; i++) {
      if (al.tNorm[i] === target || (target.length > 2 && al.tNorm[i].includes(target))) {
        searchFrom = i + 1;
        const t = al.timeOf(i);
        if (t !== null) return Math.round(t * FPS);
        break;
      }
    }
    return idx * 6; // staggered fallback
  });
}

// ---------- per-scene production ----------

interface SceneArtifact {
  component: string;
  props: Record<string, unknown>;
  narration: string;
  audioPath: string;
  wordTimestamps: WordStamp[];
  durationInFrames: number;
  credits: Credit[];
  queries: ImageQuery[];
}

async function produceScene(opts: {
  scenePlan: ScenePlan;
  sceneIdx: number;
  slug: string;
  assetDirAbs: string;
  assetDirRel: string;
  usedUrls: Set<string>;
  counter: { n: number };
  fluxStyle?: string;
}): Promise<SceneArtifact> {
  const { scenePlan, sceneIdx, slug, assetDirAbs, assetDirRel, usedUrls, counter, fluxStyle } = opts;
  const { component, narration, imageQueries, cues: planCues, ...specificProps } = scenePlan as ScenePlan &
    Record<string, unknown> & { cues?: Cue[] };
  const P = `  [S${sceneIdx + 1}]`;

  const cacheKey = `scene_${slug}_${sceneIdx}_${hash(JSON.stringify(scenePlan) + ttsSignature() + '|match-v6')}`;
  const cachedScene = readCache<SceneArtifact>(cacheKey);
  if (cachedScene) {
    const cutoutFiles = ((cachedScene.props.cutouts as (string | null)[] | undefined) ?? []).filter(
      (f): f is string => !!f,
    );
    const files = [cachedScene.audioPath, ...((cachedScene.props.images as string[]) ?? []), ...cutoutFiles].filter(
      (f) => f && f !== 'placeholder.jpg',
    );
    if (files.every((f) => fs.existsSync(path.join(PUBLIC_DIR, f)))) {
      console.log(`${P} ♻️  cached [${component}]`);
      return cachedScene;
    }
  }

  console.log(`${P} ▶ [${component}] "${narration.slice(0, 55)}..."`);

  const audioRel = `${assetDirRel}/audio_${sceneIdx}.mp3`;
  const tts = await synthesize(narration, path.join(PUBLIC_DIR, audioRel));
  const durationInFrames = Math.ceil((tts.durationSec + 0.25) * FPS);

  const credits: Credit[] = [];
  const needed = imagesNeeded(scenePlan, tts.durationSec);
  let images: string[] = [];
  let focalPoints: ({ x: number; y: number } | null)[] = [];
  let imageTones: (string | null)[] = [];
  let imageMeta: ImageMeta[] = [];
  if (needed > 0) {
    const resolved = await resolveImages({
      queries: imageQueries,
      count: needed,
      narration,
      destDirAbs: assetDirAbs,
      publicRel: assetDirRel,
      usedUrls,
      counter,
      fluxStyle,
    });
    images = resolved.map((r) => r.file);
    focalPoints = resolved.map((r) => r.focal ?? null);
    imageTones = resolved.map((r) => r.tone ?? null);
    imageMeta = resolved.map((r) => ({
      query: r.query,
      provider: r.credit.provider,
      author: r.credit.author,
      license: r.credit.license,
      sourceUrl: r.credit.sourceUrl,
      title: r.credit.title,
      tone: r.tone ?? null,
      focal: r.focal ?? null,
      subject: r.subject ?? null,
    }));
    credits.push(...resolved.map((r) => r.credit));
    console.log(`${P} 🖼️  ${images.length} image(s)`);
  }

  const cues: ResolvedCue[] = [];
  if (planCues && planCues.length > 0) {
    const cueFrames = matchCueFrames(planCues, narration, tts.words, durationInFrames, P);
    for (let c = 0; c < planCues.length; c++) {
      const cue = planCues[c];
      if (cue.action === 'popText' && cue.text) {
        cues.push({ frame: cueFrames[c], action: 'popText', text: cue.text });
      } else if (cue.action === 'popImage' && cue.imageQuery) {
        const [img] = await resolveImages({
          queries: [cue.imageQuery],
          count: 1,
          narration,
          destDirAbs: assetDirAbs,
          publicRel: assetDirRel,
          usedUrls,
          counter,
          fluxStyle,
        });
        if (img.file !== 'placeholder.jpg') {
          credits.push(img.credit);
          cues.push({
            frame: cueFrames[c],
            action: 'popImage',
            image: img.file,
            query: img.query,
            provider: img.credit.provider,
            author: img.credit.author,
            license: img.credit.license,
            sourceUrl: img.credit.sourceUrl,
            title: img.credit.title,
          });
        }
      }
    }
    cues.sort((a, b) => a.frame - b.frame);
    if (cues.length > 0) console.log(`${P} ⚡ ${cues.length} cue(s)`);
  }

  const props: Record<string, unknown> = { ...specificProps, images, focalPoints, imageTones, imageMeta, cues };
  if (component === 'FontRollDecoder') {
    const displayWords = (specificProps as { words?: { text: string }[] }).words ?? [];
    props.wordDelays = matchWordDelays(displayWords, narration, tts.words);
  }
  if (component === 'Timeline') {
    // sync each event's dot to the moment its year is spoken
    const events = (specificProps as { events?: { year: string }[] }).events ?? [];
    if (events.length > 0) {
      props.eventFrames = matchCueFrames(
        events.map((e) => ({ trigger: e.year, action: 'popText' as const })),
        narration,
        tts.words,
        durationInFrames,
        P,
      );
    }
  }
  if (component === 'HookTitle') {
    // the title card enters exactly when the narrator hits the trigger word
    const trigger = (specificProps as { titleTrigger?: string }).titleTrigger;
    if (trigger) {
      const [frame] = matchCueFrames([{ trigger, action: 'popText', text: '' }], narration, tts.words, durationInFrames, P);
      props.titleAppearFrame = frame;
    }
  }
  if (component === 'ParallaxDeep' && imageMeta[0] && (imageMeta[0].subject === 'person' || imageMeta[0].subject === 'object')) {
    // true parallax needs a foreground layer separate from the image itself
    const cutoutAbs = path.join(assetDirAbs, `cutout_${sceneIdx}.png`);
    if (await removeBackgroundToFile(path.join(PUBLIC_DIR, images[0]), cutoutAbs)) {
      props.cutouts = [`${assetDirRel}/${path.basename(cutoutAbs)}`];
      console.log(`${P} ✂️  cutout generated`);
    }
  }
  if (component === 'CubeReveal') {
    // the flip lands on the scene's first cue trigger if the planner gave one, else duration*0.45
    props.flipFrame = planCues && planCues.length > 0 ? cues[0]?.frame : Math.round(durationInFrames * 0.45);
  }

  const artifact: SceneArtifact = {
    component,
    props,
    narration,
    audioPath: audioRel,
    wordTimestamps: tts.words,
    durationInFrames,
    credits,
    queries: imageQueries,
  };
  writeCache(cacheKey, artifact);
  return artifact;
}

/**
 * Rebuild the video-level credit ledger from each scene's `imageMeta` + any
 * popImage cue provenance. Reproducible after review-UI edits (refetch/upload)
 * since credits are derived from current props rather than collected once
 * during production.
 */
export function rebuildCreditsFromScenes(scenes: RenderScene[], extra: Credit[] = []): Credit[] {
  const credits: Credit[] = [];
  const seen = new Set<string>();
  const add = (c: Credit) => {
    // 'user' (uploaded via the review UI) still gets a ledger line — no
    // license claim to make, but the user should see their own asset listed.
    if (!c.provider || c.provider === 'placeholder') return;
    const key = c.sourceUrl ?? `${c.provider}:${c.title}`;
    if (seen.has(key)) return;
    seen.add(key);
    credits.push(c);
  };
  for (const scene of scenes) {
    const meta = (scene.props.imageMeta as ImageMeta[] | undefined) ?? [];
    for (const m of meta) {
      add({ provider: m.provider, author: m.author, license: m.license, sourceUrl: m.sourceUrl, title: m.title });
    }
    const cues = (scene.props.cues as ResolvedCue[] | undefined) ?? [];
    for (const c of cues) {
      if (c.action !== 'popImage' || !c.provider) continue;
      add({ provider: c.provider, author: c.author, license: c.license, sourceUrl: c.sourceUrl, title: c.title });
    }
  }
  for (const c of extra) add(c);
  return credits;
}

/** First image across all scenes whose vision-tagged subject is cutout-worthy. */
function pickCutoutSource(scenes: RenderScene[]): string | null {
  for (const scene of scenes) {
    const meta = (scene.props.imageMeta as ImageMeta[] | undefined) ?? [];
    const images = (scene.props.images as string[] | undefined) ?? [];
    for (let i = 0; i < meta.length; i++) {
      if ((meta[i]?.subject === 'person' || meta[i]?.subject === 'object') && images[i] && images[i] !== 'placeholder.jpg') {
        return images[i];
      }
    }
  }
  return null;
}

// ---------- per-video production ----------

const CHAPTER_CARD_FRAMES = 75;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

async function produceVideo(topic: Topic, index: number): Promise<void> {
  const research = topic.text.toUpperCase().startsWith('VERBATIM:')
    ? ''
    : await cached(`research_${hash(topic.text)}`, () => researchTopic(topic.text));

  const script = await cached<Script>(`script_${hash(topic.text + topic.targetWords)}`, () =>
    writeScript(topic.text, research, topic.targetWords),
  );

  const slug = `${slugify(script.title)}_${index + 1}`;
  // theme: per-topic THEME: line > channel default > derived from mood
  const videoTheme: ThemeName =
    (topic.theme as ThemeName | undefined) ??
    (isTheme(DEFAULT_THEME) ? DEFAULT_THEME : themeFromMood(script.mood));
  console.log(`🎨 Theme: ${videoTheme}`);

  const assetDirAbs = path.join(PUBLIC_DIR, 'assets', slug);
  const assetDirRel = `assets/${slug}`;
  fs.mkdirSync(assetDirAbs, { recursive: true });

  // plan every act. An act with >8 beats is split into balanced <=8-beat chunks
  // and planned across multiple calls (the scene schema caps at 8 scenes/call).
  // Chunks belong to the SAME act, so no act divider appears between them —
  // dividers land only on real act boundaries (blank lines, for VERBATIM).
  const plans: Plan[] = [];
  for (let a = 0; a < script.acts.length; a++) {
    const act = script.acts[a];
    const chunks = chunkBeats(act.beats, 8);
    const actScenes: ScenePlan[] = [];
    for (let c = 0; c < chunks.length; c++) {
      const chunk = chunks[c];
      // avoid the same component straddling a chunk seam (the planner can't see across calls)
      const prevComponent = actScenes.length > 0 ? actScenes[actScenes.length - 1].component : undefined;
      const chunkPlan = await cached<Plan>(
        `plan_${hash(script.title + a + c + JSON.stringify(chunk) + (prevComponent ?? ''))}`,
        () =>
          planScenes({
            videoTitle: script.title,
            beats: chunk,
            isFirstAct: a === 0 && c === 0,
            actLabel: script.acts.length > 1 ? `Part ${a + 1}: ${act.title ?? ''}` : undefined,
            prevComponent,
          }),
      );
      actScenes.push(...chunkPlan.scenes);
    }
    plans.push({ scenes: actScenes });
  }

  const totalScenes = plans.reduce((n, p) => n + p.scenes.length, 0);
  console.log(`\n🎞️  "${script.title}" — ${script.acts.length} act(s), ${totalScenes} scenes → ${slug}.mp4`);

  // produce all scenes with bounded concurrency (act structure preserved by index)
  const usedUrls = new Set<string>();
  const counter = { n: 0 };
  const flatPlans: { scenePlan: ScenePlan; act: number }[] = [];
  plans.forEach((plan, a) => plan.scenes.forEach((s) => flatPlans.push({ scenePlan: s, act: a })));

  const artifacts = await mapPool(flatPlans, 3, (item, i) =>
    produceScene({ scenePlan: item.scenePlan, sceneIdx: i, slug, assetDirAbs, assetDirRel, usedUrls, counter, fluxStyle: FLUX_STYLES[videoTheme] }),
  );

  // assemble timeline: chapter cards between acts, cumulative start frames
  const scenes: RenderScene[] = [];
  const credits: Credit[] = [];
  const creditKeys = new Set<string>();
  const actStartFrames: number[] = [];
  let cursor = 0;
  let currentAct = -1;

  const addCredit = (credit: Credit) => {
    if (credit.provider === 'placeholder') return;
    const key = credit.sourceUrl ?? `${credit.provider}:${credit.title}`;
    if (creditKeys.has(key)) return;
    creditKeys.add(key);
    credits.push(credit);
  };

  artifacts.forEach((artifact, i) => {
    const act = flatPlans[i].act;
    if (act !== currentAct) {
      currentAct = act;
      actStartFrames[act] = cursor;
      if (act > 0) {
        // premium act divider — replaces the old plain ChapterCard (kept registered for legacy compat)
        scenes.push({
          component: 'TitleParallax',
          props: { title: script.acts[act].title ?? script.title, kicker: `PART ${ROMAN[act] ?? act + 1}` },
          narration: '',
          wordTimestamps: [],
          startFrame: cursor,
          durationInFrames: CHAPTER_CARD_FRAMES,
        });
        actStartFrames[act] = cursor;
        cursor += CHAPTER_CARD_FRAMES;
      }
    }
    artifact.credits.forEach(addCredit);
    scenes.push({
      component: artifact.component,
      props: artifact.props,
      narration: artifact.narration,
      audioPath: artifact.audioPath,
      wordTimestamps: artifact.wordTimestamps,
      startFrame: cursor,
      durationInFrames: artifact.durationInFrames,
      queries: artifact.queries,
    });
    cursor += artifact.durationInFrames;
  });

  // mood-matched music (CC BY — its attribution joins the credits card + metadata)
  const music = pickMusic(script.mood);
  if (music) {
    addCredit(music.credit);
    console.log(`🎵 Mood "${script.mood ?? 'curious'}" → ${music.bgmPath}`);
  }


  const creditsDurationInFrames = credits.length > 0 ? CREDITS_SECONDS * FPS : 0;
  const thumbImage =
    scenes.flatMap((s) => (s.props.images as string[] | undefined) ?? []).find((f) => f !== 'placeholder.jpg') ??
    'placeholder.jpg';

  const props: RenderProps = {
    scenes,
    credits,
    creditsDurationInFrames,
    totalDuration: cursor + creditsDurationInFrames,
    hasBgm: music !== null || fs.existsSync(path.join(PUBLIC_DIR, 'bgm.mp3')),
    bgmPath: music?.bgmPath,
    theme: videoTheme,
    usedUrls: [...usedUrls],
    // extra fields for --rerender and inspection (ignored by the composition)
    script,
    actStartFrames,
    thumbImage,
  };
  const propsPath = path.join(PUBLIC_DIR, `props_${slug}.json`);
  fs.writeFileSync(propsPath, JSON.stringify(props, null, 2));

  if (REVIEW) {
    await runReview({ props, propsPath, assetDirAbs, assetDirRel });
    // the user may have edited/uploaded images — credits and thumbnail must
    // reflect the final state before rendering
    props.credits = rebuildCreditsFromScenes(props.scenes, props.credits);
    props.thumbImage =
      props.scenes.flatMap((s) => (s.props.images as string[] | undefined) ?? []).find((f) => f !== 'placeholder.jpg') ??
      'placeholder.jpg';
    fs.writeFileSync(propsPath, JSON.stringify(props, null, 2));
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const videoPath = path.join(OUT_DIR, `${slug}.mp4`);
  console.log(`\n🎬 Rendering ${slug}.mp4 (${(props.totalDuration / FPS).toFixed(1)}s)...`);
  // Remotion's bundler copies public/ into the bundle ONCE and reuses that
  // bundle for the rest of the process — from video 2 onward in a multi-topic
  // batch, this video's images wouldn't exist in that stale copy without an
  // explicit sync. See the big comment on syncPublicFileToBundle in render.ts.
  await syncPublicFileToBundle(assetDirRel);
  await renderVideo(props, videoPath);

  // subject cutout for the thumbnail's 'subject' layout — best-effort, never blocks
  const finalThumbImage = (props.thumbImage as string) ?? thumbImage;
  const cutoutSource = pickCutoutSource(props.scenes);
  let cutoutRel: string | undefined;
  if (cutoutSource) {
    const cutoutAbs = path.join(assetDirAbs, 'thumb_cutout.png');
    console.log('✂️  Removing background for thumbnail subject...');
    if (await removeBackgroundToFile(path.join(PUBLIC_DIR, cutoutSource), cutoutAbs)) {
      cutoutRel = `${assetDirRel}/thumb_cutout.png`;
      await syncPublicFileToBundle(cutoutRel); // generated after the bundle exists — must mirror explicitly
    }
  }

  const thumbBase = { title: script.title, image: finalThumbImage, theme: videoTheme, thumbText: script.thumbText, cutout: cutoutRel };
  if (THUMBS_ALL) {
    for (const layout of ['subject', 'split', 'full'] as const) {
      if (layout === 'subject' && !cutoutRel) continue;
      await renderThumbnail({ ...thumbBase, layout }, path.join(OUT_DIR, `${slug}_thumb_${layout}.png`));
    }
    console.log(`🖼️  Thumbnails → ${slug}_thumb_{subject,split,full}.png`);
  } else {
    await renderThumbnail(thumbBase, path.join(OUT_DIR, `${slug}_thumb.png`));
    console.log(`🖼️  Thumbnail → ${slug}_thumb.png`);
  }
  writeMetadata({ slug, script, scenes, credits, actStartFrames, outDir: OUT_DIR });

  if (!NO_QA) {
    await qaAndRepair({ slug, props, propsPath, videoPath, assetDirAbs, assetDirRel, addCredit });
    // credits may have grown during repair — refresh the metadata
    writeMetadata({ slug, script, scenes: props.scenes, credits: props.credits, actStartFrames, outDir: OUT_DIR });
  }

  // vertical Shorts cut: hook + highest-energy scenes, ≤59s (after QA so repaired images flow in)
  const shortsProps = buildShortsProps(props, script.title);
  if (shortsProps) {
    console.log(`📱 Rendering ${slug}_short.mp4 (${(shortsProps.totalDuration / FPS).toFixed(1)}s vertical)...`);
    await syncPublicFileToBundle(assetDirRel); // cheap no-op if already synced; cheap safety net otherwise
    await renderVideo(shortsProps, path.join(OUT_DIR, `${slug}_short.mp4`), 'Shorts');
  }
  console.log(`✅ ${videoPath}`);
}

// ---------- Shorts cut selection ----------

const SHORT_MAX_FRAMES = 58 * FPS;
const SHORT_END_CARD_FRAMES = 45;

/** Hook + the highest-cue-density scenes (original order), capped under 59s. */
function buildShortsProps(props: RenderProps, title: string): Record<string, unknown> & { totalDuration: number } | null {
  const eligible = props.scenes.filter(
    (s) => s.component !== 'ChapterCard' && (((s.props.images as string[]) ?? []).length > 0) && s.audioPath,
  );
  if (eligible.length === 0) return null;

  const cap = SHORT_MAX_FRAMES - SHORT_END_CARD_FRAMES;
  const hook = eligible[0];
  const rest = eligible
    .slice(1)
    .map((s) => ({ s, score: ((s.props.cues as unknown[]) ?? []).length }))
    .sort((a, b) => b.score - a.score);

  const chosen = [hook];
  let total = Math.min(hook.durationInFrames, cap);
  for (const { s } of rest) {
    if (total + s.durationInFrames <= cap) {
      chosen.push(s);
      total += s.durationInFrames;
    }
  }
  chosen.sort((a, b) => a.startFrame - b.startFrame); // back to story order

  let cursor = 0;
  const scenes = chosen.map((s) => {
    const rebased = { ...s, startFrame: cursor };
    cursor += s.durationInFrames;
    return rebased;
  });
  return { scenes, title, totalDuration: cursor + SHORT_END_CARD_FRAMES, hasBgm: props.hasBgm, bgmPath: props.bgmPath, theme: props.theme };
}

// ---------- QA + one automatic repair pass ----------

async function qaAndRepair(opts: {
  slug: string;
  props: RenderProps;
  propsPath: string;
  videoPath: string;
  assetDirAbs: string;
  assetDirRel: string;
  addCredit: (c: Credit) => void;
}): Promise<void> {
  const { slug, props, propsPath, videoPath, assetDirAbs, assetDirRel, addCredit } = opts;
  console.log('🔍 QA pass...');
  let findings = await qaVideo(videoPath, props.scenes);
  const report = (fnds: QaFinding[]) =>
    fnds
      .filter((f) => !f.ok)
      .forEach((f) => console.warn(`  ⚠️ QA scene ${f.sceneIndex} [${props.scenes[f.sceneIndex]?.component}]: ${f.problem} — ${f.note ?? ''}`));
  report(findings);

  const repairable = findings
    .filter((f) => !f.ok && (f.problem === 'irrelevant' || f.problem === 'broken'))
    .map((f) => f.sceneIndex)
    .filter((i) => {
      const s = props.scenes[i];
      return s?.queries && s.queries.length > 0 && ((s.props.images as string[]) ?? []).length > 0;
    });

  if (repairable.length > 0) {
    console.log(`  🔧 re-sourcing images for scene(s) ${repairable.join(', ')} and re-rendering...`);
    const usedUrls = new Set(props.usedUrls ?? []);
    // continue numbering past every existing image file in this video's folder
    const maxIdx = fs
      .readdirSync(assetDirAbs)
      .map((f) => Number((f.match(/^img_(\d+)\./) ?? [])[1]))
      .filter(Number.isFinite)
      .reduce((a, b) => Math.max(a, b as number), 0);
    const counter = { n: maxIdx + 1 };

    for (const i of repairable) {
      const scene = props.scenes[i];
      const resolved = await resolveImages({
        queries: scene.queries!,
        count: ((scene.props.images as string[]) ?? []).length,
        narration: scene.narration,
        destDirAbs: assetDirAbs,
        publicRel: assetDirRel,
        usedUrls,
        counter,
      });
      scene.props.images = resolved.map((r) => r.file);
      scene.props.focalPoints = resolved.map((r) => r.focal ?? null);
      scene.props.imageTones = resolved.map((r) => r.tone ?? null);
      scene.props.imageMeta = resolved.map((r) => ({
        query: r.query,
        provider: r.credit.provider,
        author: r.credit.author,
        license: r.credit.license,
        sourceUrl: r.credit.sourceUrl,
        title: r.credit.title,
        tone: r.tone ?? null,
        focal: r.focal ?? null,
        subject: r.subject ?? null,
      }));
      resolved.forEach((r) => addCredit(r.credit));
    }
    props.usedUrls = [...usedUrls];
    props.credits = rebuildCreditsFromScenes(props.scenes, props.credits);
    fs.writeFileSync(propsPath, JSON.stringify(props, null, 2));
    await syncPublicFileToBundle(assetDirRel); // repaired images were just downloaded after the bundle already exists
    await renderVideo(props, videoPath);
    findings = await qaVideo(videoPath, props.scenes);
    console.log('🔍 QA after repair:');
    report(findings);
  }

  fs.writeFileSync(path.join(OUT_DIR, `${slug}.qa.json`), JSON.stringify({ findings }, null, 2));
  const bad = findings.filter((f) => !f.ok).length;
  console.log(bad === 0 ? '  ✅ QA clean' : `  ⚠️ QA finished with ${bad} open finding(s) → ${slug}.qa.json`);
}

// ---------- entry ----------

async function rerender(slug: string): Promise<void> {
  const propsPath = path.join(PUBLIC_DIR, `props_${slug}.json`);
  if (!fs.existsSync(propsPath)) {
    console.error(`❌ ${propsPath} not found. Run the full pipeline first.`);
    process.exit(1);
  }
  const props = JSON.parse(fs.readFileSync(propsPath, 'utf-8')) as RenderProps & {
    script?: Script;
    actStartFrames?: number[];
    thumbImage?: string;
  };
  console.log(`🎬 Re-rendering ${slug}.mp4 from saved props...`);
  const assetDirRel = `assets/${slug}`;
  await syncPublicFileToBundle(assetDirRel); // fresh bundle this process — mirror this video's asset dir into it
  await renderVideo(props, path.join(OUT_DIR, `${slug}.mp4`));
  const shortsProps = buildShortsProps(props, props.script?.title ?? slug);
  if (shortsProps) {
    console.log(`📱 Re-rendering ${slug}_short.mp4...`);
    await renderVideo(shortsProps, path.join(OUT_DIR, `${slug}_short.mp4`), 'Shorts');
  }
  if (props.script) {
    const assetDirAbs = path.join(PUBLIC_DIR, 'assets', slug);
    const cutoutSource = pickCutoutSource(props.scenes);
    let cutoutRel: string | undefined;
    if (cutoutSource) {
      const cutoutAbs = path.join(assetDirAbs, 'thumb_cutout.png');
      if (await removeBackgroundToFile(path.join(PUBLIC_DIR, cutoutSource), cutoutAbs)) {
        cutoutRel = `assets/${slug}/thumb_cutout.png`;
        await syncPublicFileToBundle(cutoutRel); // generated after the bundle exists — must mirror explicitly
      }
    }
    await renderThumbnail(
      {
        title: props.script.title,
        image: props.thumbImage ?? 'placeholder.jpg',
        theme: props.theme as string | undefined,
        thumbText: props.script.thumbText,
        cutout: cutoutRel,
      },
      path.join(OUT_DIR, `${slug}_thumb.png`),
    );
    writeMetadata({
      slug,
      script: props.script,
      scenes: props.scenes,
      credits: props.credits,
      actStartFrames: props.actStartFrames ?? [],
      outDir: OUT_DIR,
    });
  }
  console.log(`✅ ${path.join(OUT_DIR, `${slug}.mp4`)}`);
}

async function main() {
  if (!KEYS.anthropic) {
    console.error('❌ ANTHROPIC_API_KEY missing in .env');
    process.exit(1);
  }
  if (RERENDER_SLUG) {
    await rerender(RERENDER_SLUG);
    process.exit(0);
  }

  const inputPath = path.join(ROOT, 'input.txt');
  if (!fs.existsSync(inputPath)) {
    console.error('❌ input.txt not found. Add one topic per block, separated by lines with ===');
    process.exit(1);
  }
  const topics = parseTopics(fs.readFileSync(inputPath, 'utf-8'));

  console.log(`📦 ${topics.length} topic(s) to process.${FORCE ? ' (--force: cache ignored)' : ''}`);
  const failures: string[] = [];
  for (let i = 0; i < topics.length; i++) {
    console.log(`\n=========== Video ${i + 1}/${topics.length} ===========`);
    try {
      await produceVideo(topics[i], i);
    } catch (err) {
      console.error(`❌ Video ${i + 1} failed:`, err);
      failures.push(`Video ${i + 1}`);
    }
  }
  console.log(failures.length === 0 ? '\n🎉 All videos produced.' : `\n⚠️ Done with failures: ${failures.join(', ')}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main();
