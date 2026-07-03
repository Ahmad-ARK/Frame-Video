import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from 'remotion';
import { oswald, inter } from '../fonts';
import { Sfx } from '../Sfx';
import { useTheme, gradeFilter } from '../theme';

/** One striking number counts up on screen (year, casualty count, percentage…). */
export const StatCounter: React.FC<{
  images?: string[];
  value: number;
  prefix?: string;
  suffix?: string;
  label: string;
}> = ({ images = [], value, prefix = '', suffix = '', label }) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const img = images[0] ?? 'placeholder.jpg';

  const zoom = interpolate(frame, [0, durationInFrames], [1.04, 1.14], { easing: Easing.linear });
  const countP = interpolate(frame, [8, Math.min(75, durationInFrames * 0.55)], [0, 1], {
    easing: Easing.out(Easing.exp),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const isInt = Number.isInteger(value);
  const current = value * countP;
  const display = isInt ? Math.round(current).toLocaleString('en-US') : current.toFixed(1);

  const labelReveal = spring({ frame: frame - 30, fps, config: { damping: 200 } });
  const rule = spring({ frame: frame - 24, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      <Sfx name="riser" at={6} volume={0.4} />
      <Img
        src={staticFile(img)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', filter: `${gradeFilter(theme)} brightness(0.32)`, transform: `scale(${zoom})` }}
      />
      <AbsoluteFill style={{ background: 'radial-gradient(circle, transparent 35%, rgba(0,0,0,0.8) 100%)' }} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div
          style={{
            fontFamily: oswald,
            fontWeight: 700,
            fontSize: 210,
            color: theme.textPrimary,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            textShadow: '0 6px 40px rgba(0,0,0,0.9)',
          }}
        >
          {prefix}
          {display}
          {suffix}
        </div>
        <div style={{ width: 160, height: 3, backgroundColor: theme.accent, transform: `scaleX(${rule})`, margin: '30px 0' }} />
        <div
          style={{
            fontFamily: inter,
            fontWeight: 600,
            fontSize: 34,
            color: theme.accent,
            textTransform: 'uppercase',
            letterSpacing: '0.3em',
            opacity: labelReveal,
            transform: `translateY(${(1 - labelReveal) * 24}px)`,
            textAlign: 'center',
            maxWidth: '80%',
          }}
        >
          {label}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
