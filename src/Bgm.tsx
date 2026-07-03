import React from 'react';
import { Audio, staticFile, interpolate, useVideoConfig } from 'remotion';

const BGM_DUCKED = 0.065;
const BGM_SWELL = 0.17;

interface SpeechScene {
  wordTimestamps: { start: number; end: number }[];
  startFrame: number;
}

/**
 * Background music with sidechain-style ducking: quiet while the narrator is
 * speaking, swelling in pauses and between scenes. Speech intervals come from
 * the real word timestamps. Track is selected per video mood (bgmPath).
 */
export const Bgm: React.FC<{ scenes: SpeechScene[]; bgmPath?: string }> = ({ scenes, bgmPath }) => {
  const { durationInFrames, fps } = useVideoConfig();

  const intervals = React.useMemo(() => {
    const raw: { start: number; end: number }[] = [];
    for (const s of scenes) {
      for (const w of s.wordTimestamps) {
        raw.push({
          start: s.startFrame + Math.round(w.start * fps) - 3,
          end: s.startFrame + Math.round(w.end * fps) + 6,
        });
      }
    }
    raw.sort((a, b) => a.start - b.start);
    const merged: { start: number; end: number }[] = [];
    const joinGap = Math.round(0.35 * fps); // pauses shorter than this stay ducked
    for (const cur of raw) {
      const last = merged[merged.length - 1];
      if (last && cur.start <= last.end + joinGap) last.end = Math.max(last.end, cur.end);
      else merged.push({ ...cur });
    }
    return merged;
  }, [scenes, fps]);

  const volumeAt = (f: number): number => {
    let dist = Infinity;
    for (const iv of intervals) {
      if (f >= iv.start && f <= iv.end) {
        dist = 0;
        break;
      }
      dist = Math.min(dist, f < iv.start ? iv.start - f : f - iv.end);
    }
    // swell toward full level over ~0.6s of silence, duck back near speech
    const duck = dist === 0 ? BGM_DUCKED : Math.min(BGM_SWELL, BGM_DUCKED + (dist / 18) * (BGM_SWELL - BGM_DUCKED));
    const master = interpolate(f, [0, 30, durationInFrames - 70, durationInFrames - 10], [0, 1, 1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    return duck * master;
  };

  return <Audio src={staticFile(bgmPath ?? 'bgm.mp3')} loop volume={volumeAt} />;
};
