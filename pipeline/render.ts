import fs from 'fs';
import path from 'path';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { enableTailwind } from '@remotion/tailwind-v4';
import { ROOT, PUBLIC_DIR, RENDER_CONCURRENCY, RENDER_GL } from './config';

// GPU-accelerate the blur/3D CSS filters that dominate per-frame render cost.
const chromiumOptions = { gl: RENDER_GL as 'angle' | 'swiftshader' | 'egl' | 'vulkan' };


let bundleUrlPromise: Promise<string> | null = null;

/**
 * Bundle the Remotion project once per process; reuse across videos.
 *
 * IMPORTANT: `bundle()` COPIES `public/` into the bundle's own output
 * directory ONE TIME (its return value, despite being passed around as
 * `serveUrl`, is actually that output directory's filesystem path — Windows
 * can't use the `symlinkPublicDir` option that would otherwise keep it live).
 * Any file written to the source `public/` after this first call — a
 * thumbnail cutout generated post-render, a QA-repaired image — physically
 * does not exist in the copy and 404s when a later render requests it
 * (surfacing as a confusing "EncodingError: The source image cannot be
 * decoded", since the 404 body isn't image data). Call `syncPublicFileToBundle`
 * for any such file before the render that needs to see it.
 */
function getBundle(): Promise<string> {
  if (!bundleUrlPromise) {
    console.log('📦 Bundling Remotion project (once)...');
    bundleUrlPromise = bundle({
      entryPoint: path.join(ROOT, 'src', 'index.ts'),
      webpackOverride: enableTailwind,
    });
  }
  return bundleUrlPromise;
}

/** Mirror a file (or every file in a directory) from the live `public/` into the already-bundled copy. See `getBundle` for why this is necessary. */
export async function syncPublicFileToBundle(relPath: string): Promise<void> {
  if (!bundleUrlPromise) return; // nothing bundled yet — the upcoming bundle will pick it up fresh
  const bundleOutDir = await bundleUrlPromise;
  const src = path.join(PUBLIC_DIR, relPath);
  const dest = path.join(bundleOutDir, 'public', relPath);
  if (!fs.existsSync(src)) return;
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      await syncPublicFileToBundle(path.join(relPath, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

export async function renderVideo(
  props: Record<string, unknown>,
  outputLocation: string,
  compositionId: 'Main' | 'Shorts' = 'Main',
): Promise<void> {
  const serveUrl = await getBundle();
  if (compositionId === 'Main') console.log(`  ⚙️  render: ${RENDER_CONCURRENCY} workers, GPU=${RENDER_GL}`);

  // headless-Chrome startup occasionally times out on Windows — retry once
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const composition = await selectComposition({ serveUrl, id: compositionId, inputProps: props });
      let lastLogged = -10;
      await renderMedia({
        serveUrl,
        composition,
        codec: 'h264',
        outputLocation,
        inputProps: props,
        concurrency: RENDER_CONCURRENCY, // #1 parallel workers
        chromiumOptions, // #2 GPU
        onProgress: ({ progress }) => {
          const pct = Math.floor(progress * 100);
          if (pct >= lastLogged + 10) {
            lastLogged = pct;
            process.stdout.write(`  render ${pct}%\r`);
          }
        },
      });
      process.stdout.write('\n');
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`  render attempt ${attempt + 1} failed: ${(err as Error).message.slice(0, 120)} — retrying...`);
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  throw lastErr;
}

export interface ThumbnailRenderProps {
  title: string;
  image: string;
  theme?: string;
  themeAccent?: string;
  thumbText?: string;
  cutout?: string;
  layout?: 'subject' | 'split' | 'full';
  [key: string]: unknown;
}

export async function renderThumbnail(props: ThumbnailRenderProps, outputLocation: string): Promise<void> {
  const serveUrl = await getBundle();
  // transient DNS/browser failures (e.g. fonts.gstatic.com not resolving) — retry
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const composition = await selectComposition({ serveUrl, id: 'Thumbnail', inputProps: props });
      await renderStill({ serveUrl, composition, output: outputLocation, inputProps: props, chromiumOptions });
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`  thumbnail attempt ${attempt + 1} failed: ${(err as Error).message.slice(0, 100)} — retrying...`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  throw lastErr;
}
