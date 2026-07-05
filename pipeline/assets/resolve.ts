import fs from 'fs';
import path from 'path';
import { providerCascade, scoreCandidate, httpClient, UA, withFetchSlot } from './providers';
import { verifyCandidates } from './verify';
import { generateFluxImage, fluxAvailable } from './flux';
import type { AssetCandidate, ImageQuery, ResolvedImage } from '../types';

async function downloadImage(url: string, destNoExt: string): Promise<string | null> {
  // retry with backoff — a single throttle (429) or transient reset used to be a
  // permanent loss, collapsing the whole entity-image tier to FLUX on big jobs
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await withFetchSlot(() =>
        httpClient.get(url, {
          responseType: 'arraybuffer',
          timeout: 60_000,
          maxContentLength: 30 * 1024 * 1024,
          headers: { 'User-Agent': UA, Referer: url },
        }),
      );
      const ct = String(res.headers['content-type'] ?? '');
      const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
      const file = `${destNoExt}.${ext}`;
      fs.writeFileSync(file, Buffer.from(res.data));
      return file;
    } catch (err) {
      if (attempt === 2) return null;
      const status = (err as { response?: { status?: number } }).response?.status;
      await new Promise((r) => setTimeout(r, (status === 429 ? 2500 : 900) * (attempt + 1)));
    }
  }
  return null;
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
          const top = found.sort((a, b) => scoreCandidate(b) - scoreCandidate(a)).slice(0, 2);
          if (fallback.length === 0) fallback.push(...top);
          // broll is generic stock footage/texture — score order is reliable enough that
          // a vision call just burns cost without meaningfully improving the pick. Reserve
          // the vision check for "entity" queries, where mismatches (wrong person/place) matter.
          if (q.kind !== 'entity') return { ranked: top, fallback };
          const { ranked, focals, tones, subjects } = await verifyCandidates(q.query, narration, top);
          if (ranked.length > 0)
            return { ranked: ranked.map((i) => ({ ...top[i], focal: focals[i], tone: tones[i], subject: subjects[i] })), fallback };
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
          // reserve the slot synchronously — scenes download concurrently (mapPool)
          // and share this counter by reference; incrementing only after the await
          // let two scenes race for the same number and overwrite each other's file
          const n = counter.n++;
          const file = await downloadImage(cand.fullUrl, path.join(destDirAbs, `img_${n}`));
          if (!file) {
            console.warn(`  ✗ download failed: ${cand.fullUrl.slice(0, 90)}`);
            continue;
          }
          usedUrls.add(cand.fullUrl);
          resolved = {
            file: `${publicRel}/${path.basename(file)}`,
            query: query.query,
            focal: cand.focal,
            tone: cand.tone,
            subject: cand.subject,
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
      const n = counter.n++; // reserve synchronously — see race-condition note above
      const file = path.join(destDirAbs, `img_${n}.png`);
      if (await generateFluxImage(query.query, narration, file, fluxStyle)) {
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
