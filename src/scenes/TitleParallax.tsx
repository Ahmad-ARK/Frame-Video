import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { playfair, inter } from '../fonts';
import { useTheme } from '../theme';
import { DustLayer } from './DustLayer';

/**
 * Premium emphasis / chapter-divider card: the title rendered as three
 * stacked copies at different Z depths (blurred shadow behind, soft glow in
 * front) inside one preserve-3d group that drifts on rotateX. Doubles as the
 * act divider for long-form videos (see produceVideo's chapter insertion) —
 * `kicker` carries "PART II" there, or a planner-written 3-word line when
 * picked as a regular narrated scene.
 *
 * No `overflow`/`filter` on any ancestor of the preserve-3d group — see the
 * Chrome gotcha documented in ParallaxDeep.tsx.
 */
export const TitleParallax: React.FC<{ title: string; kicker?: string }> = ({ title, kicker }) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const reveal = spring({ frame: frame - 8, fps, config: { damping: 200 } });
  const kickerReveal = spring({ frame: frame - 2, fps, config: { damping: 200 } });
  const rotX = interpolate(frame, [0, durationInFrames], [8, 2]);
  const fontSize = Math.min(170, 3200 / Math.max(title.length, 8));

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, justifyContent: 'center', alignItems: 'center' }}>
      <AbsoluteFill
        style={{
          background: `conic-gradient(from 180deg at 50% -20%, transparent 0deg, ${theme.accent} 8deg, transparent 20deg)`,
          opacity: 0.12,
        }}
      />
      <DustLayer depth={2} count={18} />

      {kicker ? (
        <div
          style={{
            position: 'absolute',
            top: '38%',
            fontFamily: inter,
            fontWeight: 700,
            fontSize: 26,
            letterSpacing: '0.45em',
            textTransform: 'uppercase',
            color: theme.accent,
            opacity: kickerReveal,
            transform: `translateY(${(1 - kickerReveal) * 14}px)`,
          }}
        >
          {kicker}
        </div>
      ) : null}

      <AbsoluteFill style={{ perspective: 900, justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ transformStyle: 'preserve-3d', transform: `rotateX(${rotX}deg)`, position: 'relative', opacity: reveal }}>
          <h1
            style={{
              position: 'absolute',
              inset: 0,
              margin: 0,
              fontFamily: playfair,
              fontWeight: 700,
              fontSize,
              color: '#000',
              textAlign: 'center',
              transform: 'translateZ(-60px)',
              filter: 'blur(8px)',
              opacity: 0.5,
            }}
          >
            {title}
          </h1>
          <h1
            style={{
              position: 'absolute',
              inset: 0,
              margin: 0,
              fontFamily: playfair,
              fontWeight: 700,
              fontSize,
              color: theme.accent,
              textAlign: 'center',
              transform: 'translateZ(40px)',
              filter: 'blur(14px)',
              opacity: 0.25,
            }}
          >
            {title}
          </h1>
          <h1
            style={{
              margin: 0,
              fontFamily: playfair,
              fontWeight: 700,
              fontSize,
              color: theme.textPrimary,
              textAlign: 'center',
              maxWidth: 1400,
            }}
          >
            {title}
          </h1>
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ background: 'radial-gradient(circle, transparent 55%, rgba(0,0,0,0.6) 100%)', pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};
