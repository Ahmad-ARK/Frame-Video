import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { playfair, inter } from '../fonts';
import { useTheme, gradeFilter } from '../theme';
import { Sfx } from '../Sfx';

/**
 * A document lying on a dark desk, picked up by the camera: the sheet
 * rotates from a steep "on the table" angle to a near-frontal reading angle
 * over the scene. A highlight bar sweeps one line, and an optional stamp
 * punches in late. No `overflow`/`filter` on the perspective/preserve-3d
 * ancestors — see the gotcha documented in ParallaxDeep.tsx.
 */
export const DocumentRig: React.FC<{
  images?: string[];
  imageTones?: (string | null)[];
  docTitle: string;
  stampText?: string;
}> = ({ images = [], imageTones = [], docTitle, stampText }) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const p = Math.min(1, frame / durationInFrames);

  const rotX = interpolate(p, [0, 1], [38, 6]);
  const z = interpolate(p, [0, 1], [-80, 0]);
  const scale = interpolate(p, [0, 1], [0.9, 1.06]);

  const highlightStart = durationInFrames * 0.4;
  const highlightW = interpolate(frame, [highlightStart, highlightStart + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const stampFrame = durationInFrames * 0.7;
  const stampPop = spring({ frame: frame - stampFrame, fps, config: { damping: 12 } });

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, justifyContent: 'center', alignItems: 'center' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 60%, rgba(255,255,255,0.05) 0%, transparent 60%)' }} />

      <AbsoluteFill style={{ perspective: 900, justifyContent: 'center', alignItems: 'center' }}>
        <div
          style={{
            transformStyle: 'preserve-3d',
            transform: `rotateX(${rotX}deg) translateZ(${z}px) scale(${scale})`,
            width: 780,
            height: 1040,
            backgroundColor: theme.paper,
            padding: 24,
            boxSizing: 'border-box',
            boxShadow: '0 60px 120px rgba(0,0,0,0.6)',
            position: 'relative',
          }}
        >
          <Img
            src={staticFile(images[0] ?? 'placeholder.jpg')}
            style={{
              width: '100%',
              height: 780,
              objectFit: 'cover',
              filter: `${gradeFilter(theme, imageTones[0])} sepia(0.3)`,
            }}
          />

          <div style={{ position: 'relative', marginTop: 18 }}>
            <div
              style={{
                fontFamily: playfair,
                fontWeight: 700,
                fontSize: 34,
                color: theme.ink,
              }}
            >
              {docTitle}
            </div>
            <div
              style={{
                position: 'absolute',
                left: -6,
                right: `${(1 - highlightW) * 100}%`,
                top: -4,
                bottom: -8,
                backgroundColor: theme.marker,
                opacity: 0.35,
                mixBlendMode: 'multiply',
              }}
            />
          </div>

          {stampText ? (
            <div
              style={{
                position: 'absolute',
                right: 60,
                bottom: 90,
                fontFamily: inter,
                fontWeight: 800,
                fontSize: 40,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: theme.marker,
                border: `6px solid ${theme.marker}`,
                borderRadius: 8,
                padding: '10px 20px',
                transform: `rotate(-12deg) scale(${stampPop})`,
                opacity: Math.min(1, stampPop),
              }}
            >
              {stampText}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>

      {stampText ? <Sfx name="hit" at={Math.round(stampFrame)} volume={0.55} /> : null}
      <AbsoluteFill style={{ background: 'radial-gradient(circle, transparent 50%, rgba(0,0,0,0.55) 100%)', pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};
