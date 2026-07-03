import path from 'path';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { enableTailwind } from '@remotion/tailwind-v4';
import { ROOT } from './config';


let bundleUrlPromise: Promise<string> | null = null;

/** Bundle the Remotion project once per process; reuse across videos. */
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

export async function renderVideo(
  props: Record<string, unknown>,
  outputLocation: string,
  compositionId: 'Main' | 'Shorts' = 'Main',
): Promise<void> {
  const serveUrl = await getBundle();

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

export async function renderThumbnail(props: { title: string; image: string; theme?: string }, outputLocation: string): Promise<void> {
  const serveUrl = await getBundle();
  // transient DNS/browser failures (e.g. fonts.gstatic.com not resolving) — retry
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const composition = await selectComposition({ serveUrl, id: 'Thumbnail', inputProps: props });
      await renderStill({ serveUrl, composition, output: outputLocation, inputProps: props });
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`  thumbnail attempt ${attempt + 1} failed: ${(err as Error).message.slice(0, 100)} — retrying...`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  throw lastErr;
}
