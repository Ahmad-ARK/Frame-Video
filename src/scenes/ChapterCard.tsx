import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { playfair, inter } from '../fonts';
import { Sfx } from '../Sfx';
import { useTheme } from '../theme';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

/** Silent act divider for long-form videos. Pure typography, no assets. */
export const ChapterCard: React.FC<{ actNumber: number; title?: string }> = ({ actNumber, title }) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const rule = spring({ frame: frame - 6, fps, config: { damping: 200 } });
  const numReveal = spring({ frame: frame - 10, fps, config: { damping: 200 } });
  const titleReveal = spring({ frame: frame - 18, fps, config: { damping: 200 } });
  const zoom = interpolate(frame, [0, durationInFrames], [1, 1.06]);

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
      <Sfx name="whoosh" at={2} volume={0.3} />
      <AbsoluteFill
        style={{
          background: 'radial-gradient(circle at 50% 45%, #1a2233 0%, #0b0b0e 65%)',
          transform: `scale(${zoom})`,
        }}
      />
      <div
        style={{
          fontFamily: inter,
          fontWeight: 700,
          fontSize: 30,
          color: theme.accent,
          letterSpacing: '0.5em',
          textTransform: 'uppercase',
          opacity: numReveal,
          transform: `translateY(${(1 - numReveal) * 20}px)`,
        }}
      >
        Part {ROMAN[actNumber - 1] ?? actNumber}
      </div>
      <div style={{ width: 140, height: 2, backgroundColor: theme.accent, margin: '28px 0', transform: `scaleX(${rule})` }} />
      {title ? (
        <h1
          style={{
            fontFamily: playfair,
            fontWeight: 700,
            fontSize: Math.min(110, 2200 / Math.max(title.length, 10)),
            color: theme.textPrimary,
            margin: 0,
            textAlign: 'center',
            maxWidth: '80%',
            lineHeight: 1.15,
            opacity: titleReveal,
            transform: `translateY(${(1 - titleReveal) * 26}px)`,
          }}
        >
          {title}
        </h1>
      ) : null}
      <AbsoluteFill style={{ background: 'radial-gradient(circle, transparent 55%, rgba(0,0,0,0.6) 100%)', pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};
