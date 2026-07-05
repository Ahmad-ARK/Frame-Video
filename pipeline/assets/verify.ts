import { anthropic } from '../llm';
import { VISION_MODEL } from '../config';
import { httpClient, UA, withFetchSlot } from './providers';
import type { AssetCandidate } from '../types';

type ImageBlock = {
  type: 'image';
  source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; data: string };
};

async function fetchThumb(url: string): Promise<ImageBlock | null> {
  // compliant UA + retry: without these, one Wikimedia throttle made every
  // thumbnail unfetchable → "vision verify skipped" → unverified images
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await withFetchSlot(() =>
        httpClient.get(url, {
          responseType: 'arraybuffer',
          timeout: 20_000,
          maxContentLength: 4 * 1024 * 1024,
          headers: { 'User-Agent': UA },
        }),
      );
      const ct = String(res.headers['content-type'] ?? '');
      const media = ct.includes('png')
        ? 'image/png'
        : ct.includes('webp')
          ? 'image/webp'
          : ct.includes('gif')
            ? 'image/gif'
            : 'image/jpeg';
      return { type: 'image', source: { type: 'base64', media_type: media, data: Buffer.from(res.data).toString('base64') } };
    } catch (err) {
      if (attempt === 2) return null;
      const status = (err as { response?: { status?: number } }).response?.status;
      await new Promise((r) => setTimeout(r, (status === 429 ? 2000 : 700) * (attempt + 1)));
    }
  }
  return null;
}

export interface VerifyResult {
  /** Indices into the input candidates array, best first. Only acceptable ones. */
  ranked: number[];
  /** Subject location per accepted candidate index, as fractions of the image (0-1). */
  focals: Record<number, { x: number; y: number }>;
  /** Brightness per accepted candidate index — lets the theme grade adapt per image. */
  tones: Record<number, 'bright' | 'mid' | 'dark'>;
  /** What the focal point actually is — lets the thumbnail pick a cutout-worthy subject. */
  subjects: Record<number, 'person' | 'object' | 'scene'>;
}

/**
 * One cheap Haiku vision call per query: shows up to 4 candidate thumbnails and
 * asks which actually depict the query (ranked). ~$0.002 per call.
 */
export async function verifyCandidates(
  query: string,
  narration: string,
  candidates: AssetCandidate[],
): Promise<VerifyResult> {
  const thumbs = await Promise.all(candidates.map((c) => fetchThumb(c.thumbUrl)));
  const usable: { idx: number; block: ImageBlock }[] = [];
  thumbs.forEach((t, i) => {
    if (t) usable.push({ idx: i, block: t });
  });
  if (usable.length === 0) {
    // thumbnails unreachable (network hiccup) — fail open to score order
    // rather than starving the scene of images entirely
    console.warn(`  vision verify skipped for "${query}" (no thumbnails downloadable)`);
    return { ranked: candidates.map((_, i) => i), focals: {}, tones: {}, subjects: {} };
  }

  const content: any[] = [
    {
      type: 'text',
      text:
        `I am selecting an image for a documentary video.\n` +
        `Narration for the scene: "${narration}"\n` +
        `Image requirement: "${query}"\n\n` +
        `Below are ${usable.length} candidate images, numbered in order.`,
    },
  ];
  usable.forEach((u, n) => {
    content.push({ type: 'text', text: `Candidate ${n + 1}:` });
    content.push(u.block);
  });
  content.push({
    type: 'text',
    text:
      'Which candidates genuinely depict the requirement and would look good full-screen in a documentary? ' +
      'Reject: book covers, text pages, logos, diagrams-with-tiny-text, watermarked images, irrelevant subjects. ' +
      'For each acceptable candidate also give the focal point — where the main subject (face/object of interest) sits — ' +
      'as fractions of image width and height from the top-left, its overall brightness ("bright", "mid" or "dark"), ' +
      'and what that focal subject IS: "person" (a human figure/face is the main subject — good for a cutout), ' +
      '"object" (a distinct artifact/item is the main subject — also cutout-able), or "scene" (a landscape/wide shot with ' +
      'no single isolatable subject). ' +
      'Reply with ONLY JSON: {"acceptable": [<candidate numbers, best first>], "focus": {"<number>": [x, y]}, ' +
      '"tones": {"<number>": "bright"|"mid"|"dark"}, "subjects": {"<number>": "person"|"object"|"scene"}} — empty acceptable array if none are usable.',
  });

  try {
    const msg = await anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content }],
    });
    const text = msg.content.find((b) => b.type === 'text');
    const raw = text && text.type === 'text' ? text.text : '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { ranked: [], focals: {}, tones: {}, subjects: {} };
    const parsed = JSON.parse(match[0]);
    const nums: number[] = Array.isArray(parsed.acceptable) ? parsed.acceptable : [];
    const ranked = nums
      .map((n) => usable[n - 1]?.idx)
      .filter((i): i is number => typeof i === 'number');
    const focals: Record<number, { x: number; y: number }> = {};
    for (const [num, pt] of Object.entries(parsed.focus ?? {})) {
      const origIdx = usable[Number(num) - 1]?.idx;
      if (origIdx === undefined || !Array.isArray(pt) || pt.length < 2) continue;
      const x = Number(pt[0]);
      const y = Number(pt[1]);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        focals[origIdx] = { x: Math.min(Math.max(x, 0), 1), y: Math.min(Math.max(y, 0), 1) };
      }
    }
    const tones: Record<number, 'bright' | 'mid' | 'dark'> = {};
    for (const [num, tone] of Object.entries(parsed.tones ?? {})) {
      const origIdx = usable[Number(num) - 1]?.idx;
      if (origIdx !== undefined && (tone === 'bright' || tone === 'mid' || tone === 'dark')) {
        tones[origIdx] = tone;
      }
    }
    const subjects: Record<number, 'person' | 'object' | 'scene'> = {};
    for (const [num, subject] of Object.entries(parsed.subjects ?? {})) {
      const origIdx = usable[Number(num) - 1]?.idx;
      if (origIdx !== undefined && (subject === 'person' || subject === 'object' || subject === 'scene')) {
        subjects[origIdx] = subject;
      }
    }
    return { ranked, focals, tones, subjects };
  } catch (err) {
    console.warn(`  vision verify failed for "${query}": ${(err as Error).message}`);
    // fail open: keep score order rather than blocking the pipeline
    return { ranked: usable.map((u) => u.idx), focals: {}, tones: {}, subjects: {} };
  }
}
