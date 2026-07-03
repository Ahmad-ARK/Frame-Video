import React, { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring } from 'remotion';
import { inter } from './fonts';
import { useTheme } from './theme';

export interface Word {
  text: string;
  start: number;
  end: number;
}

const MAX_CHUNK = 4;
const PAUSE_BREAK_SEC = 0.6;

/** Group words into caption chunks, breaking on sentence ends and long pauses. */
function chunkWords(words: Word[]): number[][] {
  const chunks: number[][] = [];
  let current: number[] = [];
  for (let i = 0; i < words.length; i++) {
    current.push(i);
    const w = words[i];
    const next = words[i + 1];
    const sentenceEnd = /[.!?;:]$/.test(w.text);
    const longPause = next ? next.start - w.end > PAUSE_BREAK_SEC : false;
    if (current.length >= MAX_CHUNK || sentenceEnd || longPause || !next) {
      chunks.push(current);
      current = [];
    }
  }
  return chunks;
}

/**
 * Karaoke captions, rebuilt:
 * - bottom-center (the old version set row-axis flex values on a column
 *   container and rendered middle-right)
 * - chunks respect sentence ends and pauses instead of blind 4-word groups
 * - exactly ONE active word (last word whose start has passed)
 * - frame-based spring pop instead of CSS transitions (which do nothing in
 *   deterministic rendering)
 */
export const Captions: React.FC<{ words?: Word[] }> = ({ words }) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const chunks = useMemo(() => (words && words.length > 0 ? chunkWords(words) : []), [words]);
  if (!words || words.length === 0) return null;

  const t = frame / fps;
  if (t < words[0].start) return null;

  let activeWordIdx = 0;
  for (let i = 0; i < words.length; i++) {
    if (words[i].start <= t) activeWordIdx = i;
    else break;
  }
  const chunk = chunks.find((c) => c.includes(activeWordIdx)) ?? chunks[chunks.length - 1];

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 54,
        pointerEvents: 'none',
        zIndex: 100,
      }}
    >
      <div
        style={{
          backgroundColor: 'rgba(0,0,0,0.6)',
          padding: '14px 34px',
          borderRadius: 10,
          display: 'flex',
          gap: 14,
          justifyContent: 'center',
          maxWidth: '78%',
          flexWrap: 'wrap',
        }}
      >
        {chunk.map((globalIdx) => {
          const word = words[globalIdx];
          const isActive = globalIdx === activeWordIdx;
          const startFrame = Math.round(word.start * fps);
          const pop = isActive ? spring({ frame: frame - startFrame, fps, config: { damping: 14, stiffness: 260 } }) : 0;
          return (
            <span
              key={globalIdx}
              style={{
                fontFamily: inter,
                fontSize: 40,
                fontWeight: 800,
                color: isActive ? theme.captionActive : '#FFFFFF',
                transform: `scale(${1 + pop * 0.08})`,
                display: 'inline-block',
                textShadow: '0 2px 6px rgba(0,0,0,0.9)',
              }}
            >
              {word.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
