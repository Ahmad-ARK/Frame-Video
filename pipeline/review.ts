import http from 'http';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { PUBLIC_DIR } from './config';
import { resolveImages } from './assets/resolve';
import { REVIEW_HTML } from './review-page';
import type { ImageMeta, RenderProps, RenderScene, ResolvedCue } from './types';

const PORT = 4711;

interface ReviewSlot {
  id: string; // "s:<sceneIdx>:<imageIdx>" | "c:<sceneIdx>:<cueIdx>"
  sceneIdx: number;
  component: string;
  narrationPreview: string;
  query: string;
  file: string;
  provider?: string;
  author?: string;
  license?: string;
  isPlaceholder: boolean;
}

function buildSlots(scenes: RenderScene[]): ReviewSlot[] {
  const slots: ReviewSlot[] = [];
  scenes.forEach((scene, sceneIdx) => {
    const images = (scene.props.images as string[] | undefined) ?? [];
    const meta = (scene.props.imageMeta as ImageMeta[] | undefined) ?? [];
    images.forEach((file, k) => {
      const m = meta[k];
      slots.push({
        id: `s:${sceneIdx}:${k}`,
        sceneIdx,
        component: scene.component,
        narrationPreview: scene.narration.slice(0, 90),
        query: m?.query ?? '',
        file,
        provider: m?.provider,
        author: m?.author,
        license: m?.license,
        isPlaceholder: file === 'placeholder.jpg',
      });
    });
    const cues = (scene.props.cues as ResolvedCue[] | undefined) ?? [];
    cues.forEach((cue, k) => {
      if (cue.action !== 'popImage' || !cue.image) return;
      slots.push({
        id: `c:${sceneIdx}:${k}`,
        sceneIdx,
        component: `${scene.component} (cue)`,
        narrationPreview: scene.narration.slice(0, 90),
        query: cue.query ?? '',
        file: cue.image,
        provider: cue.provider,
        author: cue.author,
        license: cue.license,
        isPlaceholder: cue.image === 'placeholder.jpg',
      });
    });
  });
  return slots;
}

function openBrowser(url: string): void {
  try {
    if (process.platform === 'win32') execFile('cmd', ['/c', 'start', '""', url]);
    else if (process.platform === 'darwin') execFile('open', [url]);
    else execFile('xdg-open', [url]);
  } catch {
    // non-fatal — user can open the URL manually
  }
}

function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 30 * 1024 * 1024) req.destroy(); // 30MB body cap
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function slotFromCurrentProps(props: RenderProps, id: string): ReviewSlot | null {
  return buildSlots(props.scenes).find((s) => s.id === id) ?? null;
}

const EXT_WHITELIST: Record<string, string> = {
  '.jpg': 'jpg', '.jpeg': 'jpg', '.png': 'png', '.webp': 'webp',
};

/**
 * Pause the pipeline for a human asset-review pass. Serves a local web UI at
 * http://localhost:4711 listing every resolved image slot; lets the user
 * re-fetch with an edited query or upload a replacement. Resolves once the
 * user clicks "Continue → Render" (props are mutated in place and also
 * written to propsPath as a safety checkpoint after every edit).
 */
export async function runReview(opts: {
  props: RenderProps;
  propsPath: string;
  assetDirAbs: string;
  assetDirRel: string;
}): Promise<void> {
  const { props, propsPath, assetDirAbs, assetDirRel } = opts;
  const script = (props as unknown as { script?: { title?: string } }).script;
  const videoTitle = script?.title ?? '';

  // continue image numbering past every file already in this video's folder
  const maxIdx = fs
    .readdirSync(assetDirAbs)
    .map((f) => Number((f.match(/^img_(\d+)\./) ?? [])[1]))
    .filter(Number.isFinite)
    .reduce((a, b) => Math.max(a, b as number), 0);
  const counter = { n: maxIdx + 1000 }; // big offset: never collides with the main run's numbering
  const usedUrls = new Set<string>(props.usedUrls ?? []);

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

        if (req.method === 'GET' && url.pathname === '/') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(REVIEW_HTML);
          return;
        }

        if (req.method === 'GET' && url.pathname === '/state') {
          const slots = buildSlots(props.scenes);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ slots, videoTitle, theme: props.theme }));
          return;
        }

        if (req.method === 'GET' && url.pathname === '/img') {
          const rel = url.searchParams.get('f') ?? '';
          const resolved = path.resolve(PUBLIC_DIR, rel);
          if (!resolved.startsWith(PUBLIC_DIR) || !fs.existsSync(resolved)) {
            res.writeHead(404);
            res.end('not found');
            return;
          }
          const ext = path.extname(resolved).toLowerCase();
          const contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
          res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
          fs.createReadStream(resolved).pipe(res);
          return;
        }

        if (req.method === 'POST' && url.pathname === '/refetch') {
          const body = await readJsonBody(req);
          const { id, query } = body as { id: string; query?: string };
          const slot = slotFromCurrentProps(props, id);
          if (!slot) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'slot not found' }));
            return;
          }
          const q = (query ?? slot.query ?? '').trim();
          if (!q) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'query is empty' }));
            return;
          }
          const [sceneIdx, subIdx] = parseId(id);
          const scene = props.scenes[sceneIdx];

          const [resolved] = await resolveImages({
            queries: [{ query: q, kind: 'entity' }],
            count: 1,
            narration: scene.narration,
            destDirAbs: assetDirAbs,
            publicRel: assetDirRel,
            usedUrls,
            counter,
          });

          if (!resolved || resolved.file === 'placeholder.jpg') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'no image found for that query' }));
            return;
          }

          applyResolvedToSlot(scene, id, subIdx, resolved, q);
          fs.writeFileSync(propsPath, JSON.stringify(props, null, 2));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ slot: slotFromCurrentProps(props, id) }));
          return;
        }

        if (req.method === 'POST' && url.pathname === '/upload') {
          const body = await readJsonBody(req);
          const { id, filename, dataBase64 } = body as { id: string; filename: string; dataBase64: string };
          const slot = slotFromCurrentProps(props, id);
          if (!slot) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'slot not found' }));
            return;
          }
          const ext = EXT_WHITELIST[path.extname(filename || '').toLowerCase()];
          if (!ext) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'only .jpg/.png/.webp accepted' }));
            return;
          }
          const buf = Buffer.from(dataBase64, 'base64');
          if (buf.length > 25 * 1024 * 1024) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'file too large (25MB max)' }));
            return;
          }
          const outAbs = path.join(assetDirAbs, `img_user_${Date.now()}.${ext}`);
          fs.writeFileSync(outAbs, buf);
          const file = `${assetDirRel}/${path.basename(outAbs)}`;

          const [sceneIdx, subIdx] = parseId(id);
          const scene = props.scenes[sceneIdx];
          applyUserFileToSlot(scene, id, subIdx, file, slot.query);
          fs.writeFileSync(propsPath, JSON.stringify(props, null, 2));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ slot: slotFromCurrentProps(props, id) }));
          return;
        }

        if (req.method === 'POST' && url.pathname === '/done') {
          props.usedUrls = [...usedUrls];
          fs.writeFileSync(propsPath, JSON.stringify(props, null, 2));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          server.close();
          resolve();
          return;
        }

        res.writeHead(404);
        res.end('not found');
      } catch (err) {
        console.error('  review server error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
    });

    server.listen(PORT, () => {
      const url = `http://localhost:${PORT}`;
      console.log(`\n🔎 Asset review ready → ${url}`);
      console.log('   Edit/upload images, then click "Continue → Render" in the browser.');
      openBrowser(url);
    });
    server.on('error', reject);
  });
}

function parseId(id: string): [number, number] {
  const [, sceneIdxStr, subIdxStr] = id.split(':');
  return [Number(sceneIdxStr), Number(subIdxStr)];
}

function applyResolvedToSlot(
  scene: RenderScene,
  id: string,
  subIdx: number,
  resolved: {
    file: string;
    query: string;
    focal?: { x: number; y: number };
    tone?: 'bright' | 'mid' | 'dark';
    subject?: 'person' | 'object' | 'scene';
    credit: { provider: string; author?: string; license?: string; sourceUrl?: string; title?: string };
  },
  queryUsed: string,
): void {
  if (id.startsWith('s:')) {
    const images = (scene.props.images as string[]) ?? [];
    const focalPoints = (scene.props.focalPoints as ({ x: number; y: number } | null)[]) ?? [];
    const imageTones = (scene.props.imageTones as (string | null)[]) ?? [];
    const imageMeta = (scene.props.imageMeta as ImageMeta[]) ?? [];
    images[subIdx] = resolved.file;
    focalPoints[subIdx] = resolved.focal ?? null;
    imageTones[subIdx] = resolved.tone ?? null;
    imageMeta[subIdx] = {
      query: queryUsed,
      provider: resolved.credit.provider,
      author: resolved.credit.author,
      license: resolved.credit.license,
      sourceUrl: resolved.credit.sourceUrl,
      title: resolved.credit.title,
      tone: resolved.tone ?? null,
      focal: resolved.focal ?? null,
      subject: resolved.subject ?? null,
    };
    scene.props.images = images;
    scene.props.focalPoints = focalPoints;
    scene.props.imageTones = imageTones;
    scene.props.imageMeta = imageMeta;
  } else {
    const cues = (scene.props.cues as ResolvedCue[]) ?? [];
    cues[subIdx] = {
      ...cues[subIdx],
      image: resolved.file,
      query: queryUsed,
      provider: resolved.credit.provider,
      author: resolved.credit.author,
      license: resolved.credit.license,
      sourceUrl: resolved.credit.sourceUrl,
      title: resolved.credit.title,
    };
    scene.props.cues = cues;
  }
}

function applyUserFileToSlot(scene: RenderScene, id: string, subIdx: number, file: string, query: string): void {
  if (id.startsWith('s:')) {
    const images = (scene.props.images as string[]) ?? [];
    const focalPoints = (scene.props.focalPoints as ({ x: number; y: number } | null)[]) ?? [];
    const imageTones = (scene.props.imageTones as (string | null)[]) ?? [];
    const imageMeta = (scene.props.imageMeta as ImageMeta[]) ?? [];
    images[subIdx] = file;
    focalPoints[subIdx] = null;
    imageTones[subIdx] = null;
    imageMeta[subIdx] = { query, provider: 'user', license: 'User-provided', tone: null, focal: null };
    scene.props.images = images;
    scene.props.focalPoints = focalPoints;
    scene.props.imageTones = imageTones;
    scene.props.imageMeta = imageMeta;
  } else {
    const cues = (scene.props.cues as ResolvedCue[]) ?? [];
    cues[subIdx] = { ...cues[subIdx], image: file, query, provider: 'user', license: 'User-provided' };
    scene.props.cues = cues;
  }
}
