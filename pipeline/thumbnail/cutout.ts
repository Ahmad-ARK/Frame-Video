import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { removeBackground } from '@imgly/background-removal-node';

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/**
 * Subject cutout for the thumbnail "subject" layout. Runs locally on CPU
 * (ONNX model, downloaded + cached on first use — allow a couple of minutes
 * the very first time). Fails soft: any error/timeout returns false and the
 * caller falls back to a non-cutout thumbnail layout.
 */
export async function removeBackgroundToFile(inputAbs: string, outputAbsPng: string): Promise<boolean> {
  const TIMEOUT_MS = 90_000;
  try {
    // Pass a Blob with an explicit MIME type, not a path string or raw bytes:
    // on Windows an absolute path like "C:\Users\..." gets misparsed as a URL
    // with scheme "c:" ("Unsupported protocol: c:") if handed to
    // removeBackground() directly, and a bare Uint8Array/ArrayBuffer carries
    // no MIME type for the library's internal decoder ("Unsupported format: ").
    const mimeType = MIME_BY_EXT[path.extname(inputAbs).toLowerCase()] ?? 'image/jpeg';
    const inputBlob = new Blob([fs.readFileSync(inputAbs)], { type: mimeType });
    const blob = await Promise.race([
      removeBackground(inputBlob, { model: 'small', output: { format: 'image/png', quality: 1 } }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('cutout timeout')), TIMEOUT_MS)),
    ]);
    const buf = Buffer.from(await blob.arrayBuffer());
    const rawOut = `${outputAbsPng}.raw.png`;
    fs.writeFileSync(rawOut, buf);
    // Re-encode as a plain (non-indexed) RGBA PNG in a SEPARATE process via
    // ffmpeg: the library's own PNG output can come back as color-type-3
    // (palette + tRNS), which Chrome's headless <img> decoder has been
    // observed to reject outright ("EncodingError: The source image cannot
    // be decoded") even though ffprobe/most viewers read it fine. Re-encoding
    // in-process with `sharp` (already a transitive dep here) caused a
    // native-library segfault when called right after the ONNX-based bg
    // removal in the same process — ffmpeg as a subprocess sidesteps that.
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', rawOut, '-pix_fmt', 'rgba', outputAbsPng]);
    fs.rmSync(rawOut, { force: true });
    return true;
  } catch (err) {
    console.warn(`  cutout failed (non-fatal): ${(err as Error).message?.slice(0, 120)}`);
    return false;
  }
}
