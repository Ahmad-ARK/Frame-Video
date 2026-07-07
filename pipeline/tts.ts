import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import axios from 'axios';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { TTS_VOICE, TTS_PROVIDER, CHATTERBOX_ENDPOINT, CHATTERBOX_EXAGGERATION, KEYS } from './config';
import { channelVoice } from './channel';
import type { WordStamp } from './types';

const TICKS_PER_SECOND = 10_000_000; // Edge WordBoundary offsets are in 100ns ticks

/** Effective edge-tts voice: the selected channel's narrator, else the global default. */
const activeVoice = (): string => channelVoice() ?? TTS_VOICE;

export interface TtsResult {
  words: WordStamp[];
  durationSec: number;
}

/** Cache-key component: switching provider/voice must invalidate scene caches. */
export function ttsSignature(): string {
  // v2: whisper alignment fixed (16 kHz resample) — invalidates pre-fix caches.
  // The active voice is in the key so different channels don't share cached audio.
  return chatterboxAvailable() ? `chatterbox-v2:${CHATTERBOX_EXAGGERATION}` : `edge:${activeVoice()}`;
}

function chatterboxAvailable(): boolean {
  return TTS_PROVIDER !== 'edge' && Boolean(CHATTERBOX_ENDPOINT && KEYS.chatterboxToken);
}

function probeDurationSec(audioFile: string): number | null {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', audioFile],
      { encoding: 'utf-8' },
    );
    const dur = parseFloat(out.trim());
    return Number.isFinite(dur) ? dur : null;
  } catch {
    return null;
  }
}

/** Loudness-normalize (−15 LUFS) and encode to mp3 in one ffmpeg pass. */
function normalizeToMp3(inputFile: string, outPath: string): boolean {
  try {
    const tmp = `${outPath}.tmp.mp3`;
    execFileSync('ffmpeg', [
      '-y', '-loglevel', 'error', '-i', inputFile,
      '-af', 'loudnorm=I=-15:TP=-1.5:LRA=11',
      '-ar', '24000', '-b:a', '96k', tmp,
    ]);
    fs.copyFileSync(tmp, outPath);
    fs.unlinkSync(tmp);
    return true;
  } catch {
    return false;
  }
}

// ---------- Chatterbox (self-hosted on Modal, MIT model, whisper-aligned words) ----------

async function synthesizeChatterbox(text: string, outPath: string): Promise<TtsResult> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await axios.post(
        CHATTERBOX_ENDPOINT,
        { text, exaggeration: CHATTERBOX_EXAGGERATION, cfg: 0.5, token: KEYS.chatterboxToken },
        { timeout: 480_000 }, // cold start downloads models on first call
      );
      if (res.data?.error) throw new Error(res.data.error);
      const { audio_b64: audioB64, words, duration } = res.data ?? {};
      if (!audioB64 || !Array.isArray(words) || words.length === 0) {
        throw new Error('chatterbox returned no audio/words');
      }
      const tmpWav = path.join(os.tmpdir(), `cbx_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);
      fs.writeFileSync(tmpWav, Buffer.from(audioB64, 'base64'));
      if (!normalizeToMp3(tmpWav, outPath)) {
        // ffmpeg missing: ship raw wav bytes under the requested name
        fs.copyFileSync(tmpWav, outPath);
      }
      fs.rmSync(tmpWav, { force: true });
      const stamps: WordStamp[] = [];
      for (const w of words) {
        if (typeof w.text !== 'string' || !w.text.trim()) continue;
        const text = w.text.trim();
        const prev = stamps[stamps.length - 1];
        // whisper splits "5,000" into "5" + ",000" — glue punctuation-led tokens back
        if (prev && /^[^a-zA-Z0-9]/.test(text)) {
          prev.text += text;
          prev.end = Number(w.end);
        } else {
          stamps.push({ text, start: Number(w.start), end: Number(w.end) });
        }
      }
      return { words: stamps, durationSec: probeDurationSec(outPath) ?? Number(duration) ?? stamps[stamps.length - 1].end + 0.4 };
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw lastErr;
}

// ---------- Edge neural TTS (free fallback, native WordBoundary timing) ----------

async function synthesizeEdge(text: string, outPath: string, voice: string): Promise<TtsResult> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const tts = new MsEdgeTTS();
    try {
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, {
        wordBoundaryEnabled: true,
      });
      const { audioStream, metadataStream } = tts.toStream(text);

      const audioChunks: Buffer[] = [];
      const words: WordStamp[] = [];

      audioStream.on('data', (c: Buffer) => audioChunks.push(c));
      metadataStream?.on('data', (chunk: Buffer) => {
        try {
          const msg = JSON.parse(chunk.toString());
          for (const entry of msg.Metadata ?? []) {
            if (entry?.Type !== 'WordBoundary') continue;
            const d = entry.Data;
            const wordText: unknown = d?.text?.Text;
            if (typeof wordText === 'string' && wordText.trim()) {
              words.push({
                text: wordText.trim(),
                start: d.Offset / TICKS_PER_SECOND,
                end: (d.Offset + (d.Duration ?? 0)) / TICKS_PER_SECOND,
              });
            }
          }
        } catch {
          // ignore malformed metadata chunks
        }
      });

      await new Promise<void>((resolve, reject) => {
        audioStream.once('close', () => resolve());
        audioStream.once('error', reject);
        setTimeout(() => reject(new Error('TTS stream timeout (60s)')), 60_000);
      });
      await new Promise((r) => setTimeout(r, 300));

      if (audioChunks.length === 0) throw new Error('TTS returned no audio');
      if (words.length === 0) throw new Error('TTS returned no word boundaries');

      const tmpRaw = `${outPath}.raw.mp3`;
      fs.writeFileSync(tmpRaw, Buffer.concat(audioChunks));
      if (!normalizeToMp3(tmpRaw, outPath)) fs.copyFileSync(tmpRaw, outPath);
      fs.rmSync(tmpRaw, { force: true });
      const probed = probeDurationSec(outPath);
      return { words, durationSec: probed ?? words[words.length - 1].end + 0.5 };
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1500));
    } finally {
      try {
        tts.close();
      } catch {
        /* already closed */
      }
    }
  }
  throw new Error(`TTS failed after 3 attempts: ${lastErr}`);
}

/**
 * Synthesize narration to `outPath` (mp3, loudness-normalized) with word-level
 * timestamps. Prefers the self-hosted Chatterbox endpoint; falls back to Edge
 * neural TTS so the pipeline never blocks on the GPU endpoint.
 */
export async function synthesize(text: string, outPath: string, voice: string = activeVoice()): Promise<TtsResult> {
  if (chatterboxAvailable()) {
    try {
      return await synthesizeChatterbox(text, outPath);
    } catch (err) {
      console.warn(`  chatterbox TTS failed (${(err as Error).message?.slice(0, 80)}) — falling back to edge`);
    }
  }
  return synthesizeEdge(text, outPath, voice);
}
