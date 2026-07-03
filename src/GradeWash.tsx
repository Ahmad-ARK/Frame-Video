import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { useTheme } from './theme';

/**
 * Global grade layer: a low-opacity color wash + living grain applied over the
 * whole visual track. This is what makes images from four different stock
 * sites read as one film. Sits above scenes, below captions/cues.
 */
export const GradeWash: React.FC = () => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  return (
    <>
      <AbsoluteFill
        style={{
          backgroundColor: theme.wash.color,
          mixBlendMode: theme.wash.blend as React.CSSProperties['mixBlendMode'],
          opacity: theme.wash.opacity,
          pointerEvents: 'none',
        }}
      />
      {theme.grain > 0 ? (
        <AbsoluteFill style={{ opacity: theme.grain, mixBlendMode: 'overlay', pointerEvents: 'none' }}>
          <svg width="100%" height="100%">
            <filter id="globalGrain">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" seed={Math.floor(frame / 2)} />
              <feColorMatrix type="saturate" values="0" />
            </filter>
            <rect width="100%" height="100%" filter="url(#globalGrain)" />
          </svg>
        </AbsoluteFill>
      ) : null}
    </>
  );
};
