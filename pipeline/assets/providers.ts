import axios from 'axios';
import http from 'http';
import https from 'https';
import { KEYS } from '../config';
import type { AssetCandidate } from '../types';

const UA = 'documentary-pipeline/1.0 (personal project; contact: ahmadkhalid236997@gmail.com)';

// keep-alive: reuse connections → far fewer DNS lookups (flaky on Windows)
export const httpClient = axios.create({
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true }),
});

async function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await httpClient.get(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json', ...headers },
        timeout: 20_000,
      });
      return res.data;
    } catch (err) {
      lastErr = err; // transient DNS/5xx happen; brief backoff then retry
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
    }
  }
  throw lastErr;
}

const stripHtml = (s: unknown): string | undefined =>
  typeof s === 'string' ? s.replace(/<[^>]*>/g, '').trim() || undefined : undefined;

/** Wiki-meta and non-content graphics that full-text search loves to return. */
const JUNK_TITLE = /barnstar|wikipedia|wikimedia|wikimania|wiktionary|logo|icon\b|userbox|award|ribbon|flag of|coat of arms|diagram|screenshot|banner/i;
export const isJunkTitle = (title?: string) => Boolean(title && JUNK_TITLE.test(title));

// ---------- Wikimedia Commons (best for named historical entities) ----------

export async function searchWikimedia(query: string): Promise<AssetCandidate[]> {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*' +
    '&generator=search&gsrnamespace=6&gsrlimit=20' +
    `&gsrsearch=${encodeURIComponent(`${query} filetype:bitmap`)}` +
    '&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=1600';
  try {
    const data = await getJson(url);
    const pages = data?.query?.pages ? (Object.values(data.query.pages) as any[]) : [];
    return pages
      .map((p): AssetCandidate | null => {
        const info = p.imageinfo?.[0];
        if (!info) return null;
        if (!/^image\/(jpeg|png)$/.test(info.mime ?? '')) return null;
        if ((info.width ?? 0) < 700) return null;
        if (isJunkTitle(p.title)) return null;
        const meta = info.extmetadata ?? {};
        const full = info.thumburl || info.url;
        // derive a small thumb for cheap vision verification
        const thumb = /\/\d+px-/.test(full) ? full.replace(/\/\d+px-/, '/640px-') : full;
        return {
          provider: 'wikimedia',
          thumbUrl: thumb,
          fullUrl: full,
          width: Math.min(info.width ?? 0, info.thumbwidth ?? info.width ?? 0) || info.width,
          height: info.height ?? 0,
          title: p.title?.replace(/^File:/, ''),
          author: stripHtml(meta.Artist?.value),
          license: stripHtml(meta.LicenseShortName?.value),
          sourceUrl: info.descriptionurl,
        };
      })
      .filter((c): c is AssetCandidate => c !== null);
  } catch (err) {
    console.warn(`  wikimedia search failed for "${query}": ${(err as Error).message}`);
    return [];
  }
}

// ---------- Openverse (CC aggregator, no key required) ----------

export async function searchOpenverse(query: string): Promise<AssetCandidate[]> {
  // commercial-safe licenses only: monetized YouTube use rules out NC/ND
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=20&license=by,by-sa,cc0,pdm`;
  try {
    const data = await getJson(url);
    return (data?.results ?? [])
      .filter((r: any) => (r.width ?? 0) >= 700 && r.url && r.thumbnail && !isJunkTitle(r.title))
      .map(
        (r: any): AssetCandidate => ({
          provider: 'openverse',
          thumbUrl: r.thumbnail,
          fullUrl: r.url,
          width: r.width ?? 0,
          height: r.height ?? 0,
          title: r.title,
          author: r.creator,
          license: r.license ? `CC ${String(r.license).toUpperCase()} ${r.license_version ?? ''}`.trim() : undefined,
          sourceUrl: r.foreign_landing_url,
        }),
      );
  } catch (err) {
    console.warn(`  openverse search failed for "${query}": ${(err as Error).message}`);
    return [];
  }
}

// ---------- Pixabay (stock b-roll; free key) ----------

export async function searchPixabay(query: string): Promise<AssetCandidate[]> {
  if (!KEYS.pixabay) return [];
  const url =
    `https://pixabay.com/api/?key=${KEYS.pixabay}&q=${encodeURIComponent(query)}` +
    '&image_type=photo&per_page=20&min_width=1200&safesearch=true';
  try {
    const data = await getJson(url);
    return (data?.hits ?? []).map(
      (h: any): AssetCandidate => ({
        provider: 'pixabay',
        thumbUrl: h.webformatURL,
        fullUrl: h.largeImageURL ?? h.webformatURL,
        width: h.imageWidth ?? 0,
        height: h.imageHeight ?? 0,
        title: h.tags,
        author: h.user,
        license: 'Pixabay Content License',
        sourceUrl: h.pageURL,
      }),
    );
  } catch (err) {
    console.warn(`  pixabay search failed for "${query}": ${(err as Error).message}`);
    return [];
  }
}

// ---------- Pexels (stock b-roll; free key) ----------

export async function searchPexels(query: string): Promise<AssetCandidate[]> {
  if (!KEYS.pexels) return [];
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=20`;
  try {
    const data = await getJson(url, { Authorization: KEYS.pexels });
    return (data?.photos ?? []).map(
      (p: any): AssetCandidate => ({
        provider: 'pexels',
        thumbUrl: p.src?.medium ?? p.src?.small,
        fullUrl: p.src?.large2x ?? p.src?.original,
        width: p.width ?? 0,
        height: p.height ?? 0,
        title: p.alt,
        author: p.photographer,
        license: 'Pexels License',
        sourceUrl: p.url,
      }),
    );
  } catch (err) {
    console.warn(`  pexels search failed for "${query}": ${(err as Error).message}`);
    return [];
  }
}

/** Provider order depends on what kind of image we need. */
export function providerCascade(kind: 'entity' | 'broll') {
  return kind === 'entity'
    ? [searchWikimedia, searchOpenverse, searchPexels, searchPixabay]
    : [searchPexels, searchPixabay, searchOpenverse, searchWikimedia];
}

/** Score candidates: resolution (capped) + landscape-ish aspect preference. */
export function scoreCandidate(c: AssetCandidate): number {
  const res = Math.min(c.width, 2400) / 2400;
  const aspect = c.height > 0 ? c.width / c.height : 1;
  const aspectScore = 1 - Math.min(Math.abs(aspect - 16 / 9) / 2, 1);
  return res * 0.6 + aspectScore * 0.4;
}
