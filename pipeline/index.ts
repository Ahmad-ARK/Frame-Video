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
import { renderVideo, renderThumbnail } from './render';
import { writeMetadata } from './metadata';
import { qaVideo } from './qa';
import { pickMusic } from './music';
import { isTheme, themeFromMood, FLUX_STYLES, type ThemeName } from './themes';
import type { Credit, Cue, ImageQuery, Plan, QaFinding, RenderProps, RenderScene, ResolvedCue, ScenePlan, Script, WordStamp } from './types';

// ---------- CLI ----------

const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const NO_QA = argv.includes('--no-qa');
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
      return 0; // fully vector / typographic scenes
    case 'SplitScreen':
      return 2;
    case 'KenBurns':
    case 'ArchivalFilm':
      return Math.min(6, Math.max(1, Math.ceil(durationSec / MAX_SECONDS_PER_IMAGE)));
    case 'HookTitle':
      // the hook is a montage now — footage keeps moving before/after the title card
      return Math.min(3, Math.max(1, Math.ceil(durationSec / MAX_SECONDS_PER_IMAGE)));
    default:
      return 1;
  }
}

const normWord = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Map cue trigger words to scene-local frames using the REAL word timestamps.
 * Matching is substring-based over normalized token windows because Edge TTS
 * emits date/number expressions as single tokens ("August 24th, 79").
 */
function matchCueFrames(cues: Cue[], words: WordStamp[], durationInFrames: number, logPrefix: string): number[] {
  const norms = words.map((w) => normWord(w.text));
  let searchFrom = 0;

  const findFrom = (start: number, target: string): number => {
    if (!target) return -1;
    for (let i = start; i < words.length; i++) {
      let acc = '';
      for (let j = i; j < Math.min(i + 6, words.length); j++) {
        acc += norms[j];
        if (acc.includes(target)) return i;
        if (acc.length > target.length + 14) break;
      }
    }
    return -1;
  };

  return cues.map((cue, ci) => {
    const target = normWord(cue.trigger);
    let idx = findFrom(searchFrom, target);
    if (idx === -1) {
      // fall back to the longest single word of the trigger
      const parts = cue.trigger.split(/\s+/).map(normWord).filter((p) => p.length > 2);
      parts.sort((a, b) => b.length - a.length);
      for (const part of parts) {
        idx = findFrom(searchFrom, part);
        if (idx !== -1) break;
      }
    }
    if (idx !== -1) {
      searchFrom = idx + 1;
      return Math.round(words[idx].start * FPS);
    }
    console.warn(`${logPrefix} ⚠️ cue trigger "${cue.trigger}" not found — placing proportionally`);
    return Math.round(((ci + 1) / (cues.length + 1)) * durationInFrames);
  });
}

/** For FontRollDecoder: sync display words to the moment they are spoken. */
function matchWordDelays(displayWords: { text: string }[], words: WordStamp[]): number[] {
  let searchFrom = 0;
  return displayWords.map((w, idx) => {
    const target = normWord(w.text);
    for (let i = searchFrom; i < words.length; i++) {
      if (normWord(words[i].text) === target) {
        searchFrom = i + 1;
        return Math.round(words[i].start * FPS);
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

  const cacheKey = `scene_${slug}_${sceneIdx}_${hash(JSON.stringify(scenePlan) + ttsSignature())}`;
  const cachedScene = readCache<SceneArtifact>(cacheKey);
  if (cachedScene) {
    const files = [cachedScene.audioPath, ...((cachedScene.props.images as string[]) ?? [])].filter(
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
    credits.push(...resolved.map((r) => r.credit));
    console.log(`${P} 🖼️  ${images.length} image(s)`);
  }

  const cues: ResolvedCue[] = [];
  if (planCues && planCues.length > 0) {
    const cueFrames = matchCueFrames(planCues, tts.words, durationInFrames, P);
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
          cues.push({ frame: cueFrames[c], action: 'popImage', image: img.file });
        }
      }
    }
    cues.sort((a, b) => a.frame - b.frame);
    if (cues.length > 0) console.log(`${P} ⚡ ${cues.length} cue(s)`);
  }

  const props: Record<string, unknown> = { ...specificProps, images, focalPoints, imageTones, cues };
  if (component === 'FontRollDecoder') {
    const displayWords = (specificProps as { words?: { text: string }[] }).words ?? [];
    props.wordDelays = matchWordDelays(displayWords, tts.words);
  }
  if (component === 'HookTitle') {
    // the title card enters exactly when the narrator hits the trigger word
    const trigger = (specificProps as { titleTrigger?: string }).titleTrigger;
    if (trigger) {
      const [frame] = matchCueFrames([{ trigger, action: 'popText', text: '' }], tts.words, durationInFrames, P);
      props.titleAppearFrame = frame;
    }
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

// ---------- per-video production ----------

const CHAPTER_CARD_FRAMES = 75;

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

  // plan every act (cached per act)
  const plans: Plan[] = [];
  for (let a = 0; a < script.acts.length; a++) {
    const act = script.acts[a];
    const plan = await cached<Plan>(`plan_${hash(script.title + a + JSON.stringify(act.beats))}`, () =>
      planScenes({
        videoTitle: script.title,
        beats: act.beats,
        isFirstAct: a === 0,
        actLabel: script.acts.length > 1 ? `Part ${a + 1}: ${act.title ?? ''}` : undefined,
      }),
    );
    plans.push(plan);
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
        scenes.push({
          component: 'ChapterCard',
          props: { actNumber: act + 1, title: script.acts[act].title },
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

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const videoPath = path.join(OUT_DIR, `${slug}.mp4`);
  console.log(`\n🎬 Rendering ${slug}.mp4 (${(props.totalDuration / FPS).toFixed(1)}s)...`);
  await renderVideo(props, videoPath);
  await renderThumbnail({ title: script.title, image: thumbImage, theme: videoTheme }, path.join(OUT_DIR, `${slug}_thumb.png`));
  console.log(`🖼️  Thumbnail → ${slug}_thumb.png`);
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
      resolved.forEach((r) => addCredit(r.credit));
    }
    props.usedUrls = [...usedUrls];
    fs.writeFileSync(propsPath, JSON.stringify(props, null, 2));
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
  await renderVideo(props, path.join(OUT_DIR, `${slug}.mp4`));
  const shortsProps = buildShortsProps(props, props.script?.title ?? slug);
  if (shortsProps) {
    console.log(`📱 Re-rendering ${slug}_short.mp4...`);
    await renderVideo(shortsProps, path.join(OUT_DIR, `${slug}_short.mp4`), 'Shorts');
  }
  if (props.script) {
    await renderThumbnail(
      { title: props.script.title, image: props.thumbImage ?? 'placeholder.jpg' },
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
