import fs from 'fs';
import path from 'path';
import { FPS } from './config';
import type { Credit, RenderScene, Script } from './types';

const PROVIDER_NAMES: Record<string, string> = {
  wikimedia: 'Wikimedia Commons',
  openverse: 'Openverse',
  pixabay: 'Pixabay',
  pexels: 'Pexels',
  flux: 'AI-generated (FLUX.1-dev)',
};

const fmtTime = (frames: number) => {
  const totalSec = Math.floor(frames / FPS);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

/**
 * YouTube-ready metadata: title, description (hook + chapters + attribution),
 * and tags — assembled from artifacts we already have, zero LLM cost.
 */
export function writeMetadata(opts: {
  slug: string;
  script: Script;
  scenes: RenderScene[];
  credits: Credit[];
  /** startFrame of each act's first scene, aligned with script.acts */
  actStartFrames: number[];
  outDir: string;
}): void {
  const { slug, script, credits, actStartFrames, outDir } = opts;

  const hook = script.acts[0]?.beats[0]?.narration ?? '';
  const fullNarration = script.acts.map((a) => a.beats.map((b) => b.narration).join(' ')).join('\n\n');

  const chapters: string[] = [];
  if (script.acts.length > 1) {
    chapters.push(`0:00 ${script.title}`);
    script.acts.forEach((act, i) => {
      if (i === 0) return;
      const frame = actStartFrames[i];
      if (frame !== undefined) chapters.push(`${fmtTime(frame)} ${act.title ?? `Part ${i + 1}`}`);
    });
  }

  const attribution = credits.map((c) => {
    const parts = [c.title, c.author, c.license, PROVIDER_NAMES[c.provider] ?? c.provider].filter(Boolean);
    return `• ${parts.join(' — ')}`;
  });

  const stopWords = new Set(['the', 'a', 'an', 'of', 'and', 'that', 'this', 'with', 'from', 'for', 'was', 'were', 'not', 'one']);
  const titleWords = script.title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
  const tags = [...new Set([...titleWords, 'documentary', 'history', 'history documentary', 'educational'])].slice(0, 20);

  const description = [
    hook,
    '',
    fullNarration.length > 2500 ? `${fullNarration.slice(0, 2500)}…` : fullNarration,
    ...(chapters.length > 0 ? ['', 'CHAPTERS', ...chapters] : []),
    '',
    'IMAGE SOURCES & CREDITS',
    ...attribution,
    '',
    '#documentary #history',
  ].join('\n');

  const meta = { title: script.title, description, tags, chapters };
  fs.writeFileSync(path.join(outDir, `${slug}.metadata.json`), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(outDir, `${slug}.metadata.txt`), `TITLE\n${meta.title}\n\nDESCRIPTION\n${description}\n\nTAGS\n${tags.join(', ')}\n`);
  console.log(`📝 Metadata → ${slug}.metadata.txt`);
}
