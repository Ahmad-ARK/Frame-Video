import React from 'react';
import { AbsoluteFill, useCurrentFrame, random } from 'remotion';
import { useTheme } from '../theme';

/**
 * Slow-drifting dust motes — keeps long static-feeling shots alive. Shared
 * across HookTitle and the premium 3D scenes. `depth` offsets the seed and
 * speed so two layers at different z-depths never look identical.
 */
export const DustLayer: React.FC<{ count?: number; depth?: number }> = ({ count = 26, depth = 0 }) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {Array.from({ length: count }).map((_, i) => {
        const seed = random(`dust-${depth}-${i}`);
        const speed = 0.15 + seed * 0.25;
        const y = (((seed * 100 - frame * speed * 0.22) % 110) + 110) % 110 - 5;
        const x = seed * 100 + Math.sin(frame * 0.015 + i * 2.1) * 2.5;
        const size = 1.5 + seed * 3;
        const tw = 0.25 + Math.sin(frame * 0.05 + i * 1.7) * 0.2;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${x}%`,
              top: `${y}%`,
              width: size,
              height: size,
              borderRadius: '50%',
              backgroundColor: theme.textPrimary,
              opacity: Math.max(0, tw),
              filter: 'blur(0.6px)',
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
