import axios from 'axios';
import fs from 'fs';
import { FLUX_ENDPOINT, KEYS } from '../config';

export function fluxAvailable(): boolean {
  return Boolean(KEYS.fluxModalKey && KEYS.fluxModalSecret);
}

/**
 * Last-resort AI image generation on the self-hosted FLUX.1-dev Modal endpoint.
 * Documentary style guard: painterly/archival illustration, never fake photojournalism.
 */
export async function generateFluxImage(query: string, narration: string, outFile: string, style?: string): Promise<boolean> {
  if (!fluxAvailable()) return false;
  const prompt =
    `${query}. Context: ${narration}. ` +
    (style ??
      'Cinematic documentary illustration, painterly archival style, muted earthy tones, ' +
        'dramatic soft lighting, high detail, no text, no watermark, no modern elements.');
  try {
    console.log(`  🎨 FLUX generating: "${query}" (may take ~30s on cold start)...`);
    const res = await axios.post(
      FLUX_ENDPOINT,
      { prompt, width: 1344, height: 768, steps: 28, guidance: 4 },
      {
        headers: { 'Modal-Key': KEYS.fluxModalKey!, 'Modal-Secret': KEYS.fluxModalSecret! },
        responseType: 'arraybuffer',
        timeout: 180_000,
      },
    );
    fs.writeFileSync(outFile, Buffer.from(res.data));
    return true;
  } catch (err) {
    console.warn(`  flux generation failed for "${query}": ${(err as Error).message}`);
    return false;
  }
}
