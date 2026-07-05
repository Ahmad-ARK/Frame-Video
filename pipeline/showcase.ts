import fs from 'fs';
import path from 'path';
import { FPS, PUBLIC_DIR, OUT_DIR, CREDITS_SECONDS } from './config';
import { synthesize } from './tts';
import { renderVideo } from './render';
import type { Credit, RenderProps, RenderScene, ResolvedCue, WordStamp } from './types';

/**
 * Renders one demo video containing EVERY scene component once, narrated so
 * you know what you're looking at. Reuses already-downloaded images — no LLM
 * or image-search cost, only free TTS.
 *
 * Run: npx tsx pipeline/showcase.ts
 */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function cueAt(trigger: string, words: WordStamp[], fallbackFrac: number, durationInFrames: number): number {
  const t = norm(trigger);
  const hit = words.find((w) => norm(w.text) === t);
  return hit ? Math.round(hit.start * FPS) : Math.round(fallbackFrac * durationInFrames);
}

interface Def {
  component: string;
  narration: string;
  build: (images: string[], words: WordStamp[], durationInFrames: number) => Record<string, unknown>;
  imageCount: number;
}

async function main() {
  // reuse images from the most recent produced video
  const assetsRoot = path.join(PUBLIC_DIR, 'assets');
  const sourceDir = fs
    .readdirSync(assetsRoot)
    .filter((d) => fs.statSync(path.join(assetsRoot, d)).isDirectory() && d !== 'showcase')
    .sort()[0];
  if (!sourceDir) {
    console.error('No downloaded assets found in public/assets — run the pipeline once first.');
    process.exit(1);
  }
  const pool = fs
    .readdirSync(path.join(assetsRoot, sourceDir))
    .filter((f) => /^img_.*\.(jpg|png|webp)$/.test(f))
    .map((f) => `assets/${sourceDir}/${f}`);
  console.log(`🖼️  Reusing ${pool.length} images from ${sourceDir}`);
  const pick = (i: number) => pool[i % pool.length];

  const showcaseDir = path.join(assetsRoot, 'showcase');
  fs.mkdirSync(showcaseDir, { recursive: true });

  let imgCursor = 0;
  const take = (n: number) => Array.from({ length: n }, () => pick(imgCursor++));

  const defs: Def[] = [
    {
      component: 'HookTitle',
      narration:
        'The hook title scene. Footage drifts as a montage, and the title card only appears on the trigger word, holds a moment, then hands back to the footage.',
      imageCount: 3,
      build: (images, words, dur) => ({
        images,
        title: 'The Hook Title',
        subtitle: 'every video opens here',
        titleAppearFrame: cueAt('title', words, 0.3, dur),
      }),
    },
    {
      component: 'KenBurns',
      narration:
        'The Ken Burns montage. Every image fits the screen height, the camera zooms into the subject, and words like gold and silk pop exactly when spoken.',
      imageCount: 3,
      build: (images, words, dur) => ({
        images,
        cues: [
          { frame: cueAt('gold', words, 0.55, dur), action: 'popText', text: 'GOLD' },
          { frame: cueAt('silk', words, 0.68, dur), action: 'popText', text: 'SILK' },
          { frame: cueAt('spoken', words, 0.85, dur), action: 'popImage', image: pick(imgCursor++) },
        ] as ResolvedCue[],
      }),
    },
    {
      component: 'ArchivalFilm',
      narration: 'The archival film scene. Sepia, flicker, gate weave and grain, built for anything that happened before nineteen fifty.',
      imageCount: 2,
      build: (images) => ({ images }),
    },
    {
      component: 'MacroScreenFocus',
      narration: 'The macro focus scene. One punchy headline highlighted over a drifting monochrome image.',
      imageCount: 1,
      build: (images) => ({ images, headline: 'The Turning Point' }),
    },
    {
      component: 'SplitScreen',
      narration: 'The split screen comparison. Two subjects, opposing motion, side tints, and a center badge.',
      imageCount: 2,
      build: (images) => ({ images, leftLabel: 'Before', rightLabel: 'After', centerLabel: 'VS' }),
    },
    {
      component: 'QuoteOverlay',
      narration: 'The quote overlay scene renders an attributed quotation, revealed word by word.',
      imageCount: 1,
      build: (images) => ({ images, quoteText: 'The only true wisdom is in knowing you know nothing.', speakerName: 'Socrates' }),
    },
    {
      component: 'StatueReveal',
      narration: 'The statue reveal. A slow pull back from a close up, while the narration types itself out on screen.',
      imageCount: 1,
      build: (images) => ({ images }),
    },
    {
      component: 'Timeline',
      narration: 'The timeline scene. A progress sweep activates each dated event with a tick, exactly on time.',
      imageCount: 1,
      build: (images) => ({
        images,
        events: [
          { year: '130 BC', label: 'Routes open' },
          { year: '1271', label: 'Marco Polo' },
          { year: '1453', label: 'Routes close' },
        ],
      }),
    },
    {
      component: 'GlitchGrid',
      narration: 'The glitch grid. Panels assemble in staccato with digital noise and chromatic aberration.',
      imageCount: 1,
      build: (images) => ({ images, headline: 'System Shock', subtitle: 'signal' }),
    },
    {
      component: 'EditorialPaper',
      narration: 'The editorial paper scene lays out headlines and findings like a broadsheet front page.',
      imageCount: 1,
      build: (images) => ({ images, headline: 'The Verdict', bodyText: 'A newspaper style layout for verdicts, findings and announcements.' }),
    },
    {
      component: 'Map',
      narration:
        'The map scene. Real country shapes, a camera that flies to the region, and every country on the route is highlighted, including Pakistan.',
      imageCount: 0,
      build: () => ({
        images: [],
        focusCountries: ['CHN', 'ITA'],
        routes: [{ points: ['CHN', 'PAK', 'IRN', 'TUR', 'ITA'], label: 'Overland Route' }],
      }),
    },
    {
      component: 'StatCounter',
      narration: 'The stat counter scene. One striking number counts up, with a riser building underneath.',
      imageCount: 1,
      build: (images) => ({ images, value: 6400, suffix: ' km', label: 'Length of the route' }),
    },
    {
      component: 'GrungeCollage',
      narration: 'The grunge collage. Stop motion jitter, film scratches, and an accent wipe behind the title.',
      imageCount: 1,
      build: (images) => ({ images, title: 'REVOLT', bodyText: 'A punk manifesto card for war, revolution and upheaval.' }),
    },
    {
      component: 'InvestigationOpener',
      narration: 'The investigation opener. A case file scrapbook with a jittering eight millimeter camera.',
      imageCount: 1,
      build: (images) => ({ images, title: 'Case File', caseFileText: 'Subject unknown. Last seen on the northern route. Evidence inconclusive.' }),
    },
    {
      component: 'CinematicFire',
      narration: 'The cinematic fire scene. Embers drift upward while the frame burns in and burns out.',
      imageCount: 1,
      build: (images) => ({ images, title: 'The Fall', subtitle: '1453' }),
    },
    {
      component: 'ParallaxDeep',
      narration: 'The parallax deep scene. A true three dimensional camera dolly separates the foreground from the background.',
      imageCount: 1,
      build: (images) => ({ images }),
    },
    {
      component: 'TitleParallax',
      narration: 'The title parallax scene. A premium emphasis card, floating text in true three dimensional space.',
      imageCount: 0,
      build: () => ({ images: [], title: 'One Empire Falls', kicker: 'PART II' }),
    },
    {
      component: 'PhotoCarousel3D',
      narration: 'The photo carousel scene. A ring of photographs on a three dimensional cylinder that snaps from one to the next.',
      imageCount: 4,
      build: (images) => ({ images }),
    },
    {
      component: 'DocumentRig',
      narration: 'The document rig scene. A letter on a desk that the camera picks up and reads, one line highlighted in marker.',
      imageCount: 1,
      build: (images) => ({ images, docTitle: 'The Treaty of Rome', stampText: 'SEALED' }),
    },
    {
      component: 'CubeReveal',
      narration: 'The cube reveal scene. The whole frame physically rotates from one image to a completely different one.',
      imageCount: 2,
      build: (images) => ({ images, faceLabels: ['BEFORE', 'AFTER'] }),
    },
    {
      component: 'NewspaperAnnotation',
      narration: 'The newspaper annotation scene. An academic breakdown that circles the evidence in red marker.',
      imageCount: 1,
      build: (images) => ({
        images,
        headline: 'The Treaty',
        bodyText: 'An academic layout with hand drawn annotations over a document or portrait.',
        caption: 'fig. 1 — the document',
      }),
    },
    {
      component: 'FontRollDecoder',
      narration: 'Every scene. One video.',
      imageCount: 0,
      build: (_images, words) => {
        const displayWords = [
          { text: 'EVERY', size: 60 },
          { text: 'SCENE', size: 150, isAccent: true },
          { text: 'ONE', size: 60 },
          { text: 'VIDEO', size: 150, isAccent: true },
        ];
        const wordDelays = displayWords.map((w, i) => {
          const hit = words.find((x) => norm(x.text) === norm(w.text));
          return hit ? Math.round(hit.start * FPS) : i * 6;
        });
        return { images: [], words: displayWords, wordDelays };
      },
    },
    {
      component: 'SocialJustice',
      narration: 'The social justice scene. A giant matte word filled with imagery, washed in a duotone.',
      imageCount: 1,
      build: (images) => ({
        images,
        matteText: 'POWER',
        words: [
          { text: 'The', size: 55, type: 'sans' },
          { text: 'People', size: 120, type: 'serif' },
          { text: 'Rise', size: 90, type: 'sans' },
        ],
        duotone: 'warm',
      }),
    },
  ];

  const scenes: RenderScene[] = [];
  let cursor = 0;

  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    console.log(`▶ ${i + 1}/${defs.length} ${def.component}`);
    const audioRel = `assets/showcase/audio_${i}.mp3`;
    const tts = await synthesize(def.narration, path.join(PUBLIC_DIR, audioRel));
    const durationInFrames = Math.ceil((tts.durationSec + 0.35) * FPS);
    const images = take(def.imageCount);
    scenes.push({
      component: def.component,
      props: { cues: [], ...def.build(images, tts.words, durationInFrames) },
      narration: def.narration,
      audioPath: audioRel,
      wordTimestamps: tts.words,
      startFrame: cursor,
      durationInFrames,
    });
    cursor += durationInFrames;

    // demo the act divider midway through the catalog
    if (i === 9) {
      scenes.push({
        component: 'ChapterCard',
        props: { actNumber: 2, title: 'Chapter Cards Divide Acts' },
        narration: '',
        wordTimestamps: [],
        startFrame: cursor,
        durationInFrames: 75,
      });
      cursor += 75;
    }
  }

  // credits card demo: reuse the last real video's ledger if available
  let credits: Credit[] = [];
  const propsFile = fs.readdirSync(PUBLIC_DIR).find((f) => f.startsWith('props_') && !f.includes('showcase'));
  if (propsFile) {
    try {
      credits = (JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, propsFile), 'utf-8')).credits ?? []).slice(0, 8);
    } catch {
      /* ignore */
    }
  }

  // theme: `npm run showcase -- noir` (defaults to gold)
  const themeArg = process.argv.slice(2).find((a) => !a.startsWith('-'))?.toLowerCase() ?? 'gold';
  const creditsDurationInFrames = credits.length > 0 ? CREDITS_SECONDS * FPS : 0;
  const props: RenderProps = {
    scenes,
    credits,
    creditsDurationInFrames,
    totalDuration: cursor + creditsDurationInFrames,
    hasBgm: fs.existsSync(path.join(PUBLIC_DIR, 'bgm.mp3')),
    theme: themeArg,
  };
  fs.writeFileSync(path.join(PUBLIC_DIR, 'props_showcase.json'), JSON.stringify(props, null, 2));

  if (process.argv.includes('--props-only')) {
    console.log('✅ props_showcase.json written (render skipped)');
    process.exit(0);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outName = themeArg === 'gold' ? 'showcase.mp4' : `showcase_${themeArg}.mp4`;
  console.log(`\n🎬 Rendering showcase (${(props.totalDuration / FPS).toFixed(1)}s, ${scenes.length} scenes, theme: ${themeArg})...`);
  await renderVideo(props, path.join(OUT_DIR, outName));
  console.log(`✅ ${path.join(OUT_DIR, outName)}`);
  process.exit(0);
}

main();
