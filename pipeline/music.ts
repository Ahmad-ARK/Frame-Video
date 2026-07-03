import fs from 'fs';
import path from 'path';
import { PUBLIC_DIR } from './config';
import type { Credit } from './types';

export type Mood = 'somber' | 'epic' | 'tense' | 'curious' | 'uplifting';

/** Kevin MacLeod tracks (incompetech.com), CC BY 4.0 — attribution required and auto-added to credits. */
const TRACKS: Record<Mood, { file: string; title: string }> = {
  somber: { file: 'music/somber.mp3', title: 'Long Note Two' },
  epic: { file: 'music/epic.mp3', title: 'Five Armies' },
  tense: { file: 'music/tense.mp3', title: 'Darkest Child' },
  curious: { file: 'music/curious.mp3', title: 'Deliberate Thought' },
  uplifting: { file: 'music/uplifting.mp3', title: 'Wholesome' },
};

export function pickMusic(mood: string | undefined): { bgmPath: string; credit: Credit } | null {
  const track = TRACKS[(mood as Mood) ?? 'curious'] ?? TRACKS.curious;
  if (!fs.existsSync(path.join(PUBLIC_DIR, track.file))) {
    // library missing → caller falls back to public/bgm.mp3 with no credit line
    return null;
  }
  return {
    bgmPath: track.file,
    credit: {
      provider: 'incompetech',
      author: 'Kevin MacLeod (incompetech.com)',
      license: 'CC BY 4.0',
      title: `Music: "${track.title}"`,
      sourceUrl: 'https://incompetech.com',
    },
  };
}
