import fs from 'fs';
import path from 'path';
import { providerCascade, scoreCandidate, httpClient } from './providers';
import { verifyCandidates } from './verify';
import { generateFluxImage, fluxAvailable } from './flux';
import type { AssetCandidate, ImageQuery, ResolvedImage } from '../types';

async function downloadImage(url: string, destNoExt: string): Promise<string | null> {
  try {
    const res = await httpClient.get(url, {
      responseType: 'arraybuffer',
      timeout: 60_000,
      maxContentLength: 30 * 1024 * 1024,
      headers: { 'User-Agent': 'documentary-pipeline/1.0', Referer: url },
    });
    const ct = String(res.headers['content-type'] ?? '');
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
    const file = `${destNoExt}.${ext}`;
    fs.writeFileSync(file, Buffer.from(res.data));
    return file;
  } catch {
    return null;
  }
}

/**
 * Resolve `count` images for one scene.
 * Router: entity queries hit Wikimedia first, b-roll hits stock sites first.
 * Every query's top candidates go through one cheap vision check; if every
 * source fails, falls back to FLUX generation, then to reusing what we have.
 */
export async function resolveImages(opts: {
  queries: ImageQuery[];
  count: number;
  narration: string;
  destDirAbs: string; // absolute dir inside public/
  publicRel: string; // same dir relative to public/ (posix separators)
  usedUrls: Set<string>;
  counter: { n: number };
  /** theme-specific style suffix for FLUX generations */
  fluxStyle?: string;
}): Promise<ResolvedImage[]> {
  const { queries, count, narration, destDirAbs, publicRel, usedUrls, counter, fluxStyle } = opts;
  fs.mkdirSync(destDirAbs, { recursive: true });

  // Per query: a vision-verified ranked list, plus the best unverified
  // candidates as an emergency reserve (a mediocre image beats a placeholder).
  // Queries that return nothing are progressively simplified ("Black Death
  // plague medieval illustration" → "Black Death plague") — full-text search
  // requires every term to match.
  const perQuery = await Promise.all(
    queries.map(async (q) => {
      const words = q.query.split(/\s+/);
      const variants = [q.query, words.slice(0, 3).join(' '), words.slice(0, 2).join(' ')].filter(
        (v, i, arr) => v && arr.indexOf(v) === i,
      );
      const fallback: AssetCandidate[] = [];
      for (const variant of variants) {
        for (const search of providerCascade(q.kind)) {
          const found = (await search(variant)).filter((c) => !usedUrls.has(c.fullUrl));
          if (found.length === 0) continue;
          const top = found.sort((a, b) => scoreCandidate(b) - scoreCandidate(a)).slice(0, 4);
          if (fallback.length === 0) fallback.push(...top);
          const { ranked, focals, tones } = await verifyCandidates(q.query, narration, top);
          if (ranked.length > 0) return { ranked: ranked.map((i) => ({ ...top[i], focal: focals[i], tone: tones[i] })), fallback };
          console.warn(`  ✗ all ${top.length} ${top[0].provider} candidates rejected for "${variant}"`);
        }
        if (variant !== variants[variants.length - 1]) {
          console.log(`  ↻ simplifying query "${variant}"`);
        }
      }
      return { ranked: [] as AssetCandidate[], fallback };
    }),
  );
  const rankedPerQuery = perQuery.map((p) => p.ranked);
  const fallbackPerQuery = perQuery.map((p) => p.fallback);

  const results: ResolvedImage[] = [];

  for (let slot = 0; slot < count; slot++) {
    const qIdx = slot % queries.length;
    const query = queries[qIdx];
    let resolved: ResolvedImage | null = null;

    const tryPools = async (pools: AssetCandidate[][]): Promise<void> => {
      for (const pool of pools) {
        while (pool.length > 0 && !resolved) {
          const cand = pool.shift()!;
          if (usedUrls.has(cand.fullUrl)) continue;
          const file = await downloadImage(cand.fullUrl, path.join(destDirAbs, `img_${counter.n}`));
          if (!file) {
            console.warn(`  ✗ download failed: ${cand.fullUrl.slice(0, 90)}`);
            continue;
          }
          usedUrls.add(cand.fullUrl);
          counter.n++;
          resolved = {
            file: `${publicRel}/${path.basename(file)}`,
            query: query.query,
            focal: cand.focal,
            tone: cand.tone,
            credit: {
              provider: cand.provider,
              author: cand.author,
              license: cand.license,
              sourceUrl: cand.sourceUrl,
              title: cand.title,
            },
          };
        }
        if (resolved) break;
      }
    };

    // 1) vision-verified candidates: this query first, then other queries' leftovers
    await tryPools([rankedPerQuery[qIdx], ...rankedPerQuery.filter((_, i) => i !== qIdx)]);

    // 2) AI generation
    if (!resolved && fluxAvailable()) {
      const file = path.join(destDirAbs, `img_${counter.n}.png`);
      if (await generateFluxImage(query.query, narration, file, fluxStyle)) {
        counter.n++;
        resolved = {
          file: `${publicRel}/${path.basename(file)}`,
          query: query.query,
          credit: { provider: 'flux', title: query.query, license: 'AI-generated (FLUX.1-dev)' },
        };
      }
    }

    // 3) best unverified candidates — a mediocre on-topic image beats a placeholder
    if (!resolved) {
      await tryPools([fallbackPerQuery[qIdx], ...fallbackPerQuery.filter((_, i) => i !== qIdx)]);
      if (resolved) console.warn(`  ⚠️ using unverified image for "${query.query}"`);
    }

    // last resort: reuse an image we already placed in this scene (never placeholder.jpg mid-video)
    if (!resolved && results.length > 0) {
      resolved = results[results.length - 1];
      console.warn(`  ⚠️ no image found for "${query.query}" — reusing previous`);
    }
    if (!resolved) {
      resolved = {
        file: 'placeholder.jpg',
        query: query.query,
        credit: { provider: 'placeholder' },
      };
      console.warn(`  ⚠️ no image found at all for "${query.query}" — placeholder`);
    }
    results.push(resolved);
  }

  // de-duplicate consecutive repeats in the credit ledger later; here return slots as planned
  return results;
}
