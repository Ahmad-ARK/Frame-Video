import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { useTheme, gradeFilter } from '../theme';

const norm180 = (deg: number): number => {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
};

const Ring: React.FC<{
  images: string[];
  imageTones: (string | null)[];
  n: number;
  anglePerPhoto: number;
  radius: number;
  rotY: number;
  theme: ReturnType<typeof useTheme>;
}> = ({ images, imageTones, n, anglePerPhoto, radius, rotY, theme }) => (
  <div style={{ transformStyle: 'preserve-3d', transform: `rotateY(${rotY}deg)`, width: 1, height: 1 }}>
    {Array.from({ length: n }).map((_, i) => {
      const worldAngle = norm180(i * anglePerPhoto + rotY);
      const brightness = interpolate(Math.abs(worldAngle), [0, anglePerPhoto], [1, 0.7], { extrapolateRight: 'clamp' });
      return (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: 560,
            height: 560,
            left: -280,
            top: -280,
            transform: `rotateY(${i * anglePerPhoto}deg) translateZ(${radius}px)`,
            backgroundColor: theme.paper,
            padding: 14,
            boxSizing: 'border-box',
            boxShadow: '0 30px 60px rgba(0,0,0,0.5)',
          }}
        >
          <Img
            src={staticFile(images[i % images.length] ?? 'placeholder.jpg')}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: `${gradeFilter(theme, imageTones[i % imageTones.length])} brightness(${brightness})`,
            }}
          />
        </div>
      );
    })}
  </div>
);

/**
 * A ring of photos on a 3D cylinder that snaps from one to the next rather
 * than spinning continuously — use for a named series ("the artifacts",
 * "the faces") that the narration enumerates.
 *
 * No `overflow`/`filter` on any ancestor of a preserve-3d element — see the
 * gotcha documented in ParallaxDeep.tsx. The floor reflection is a second,
 * independent preserve-3d structure flipped with `scaleY(-1)` (a transform,
 * not filter/overflow, so it doesn't flatten either copy) and faded out with
 * a plain 2D gradient overlay drawn on top of it.
 */
export const PhotoCarousel3D: React.FC<{
  images?: string[];
  imageTones?: (string | null)[];
}> = ({ images = [], imageTones = [] }) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const n = Math.max(3, images.length || 3);
  const anglePerPhoto = 360 / n;
  const radius = 560 / (2 * Math.tan(Math.PI / n)) + 40;

  const segFrames = durationInFrames / n;
  const activeIndex = Math.min(n - 1, Math.floor(frame / segFrames));
  const segStartFrame = activeIndex * segFrames;
  const snap = spring({ frame: frame - segStartFrame, fps, config: { damping: 18, mass: 0.6 } });
  const prevAngle = -Math.max(0, activeIndex - 1) * anglePerPhoto;
  const targetAngle = -activeIndex * anglePerPhoto;
  const rotY = activeIndex === 0 ? 0 : interpolate(snap, [0, 1], [prevAngle, targetAngle]);

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <AbsoluteFill style={{ perspective: 1400, justifyContent: 'center', alignItems: 'center' }}>
        <Ring images={images} imageTones={imageTones} n={n} anglePerPhoto={anglePerPhoto} radius={radius} rotY={rotY} theme={theme} />
      </AbsoluteFill>

      <AbsoluteFill style={{ perspective: 1400, justifyContent: 'center', alignItems: 'center', transform: 'scaleY(-1) translateY(6%)', opacity: 0.18 }}>
        <Ring images={images} imageTones={imageTones} n={n} anglePerPhoto={anglePerPhoto} radius={radius} rotY={rotY} theme={theme} />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `linear-gradient(to bottom, transparent 55%, ${theme.bg} 92%)`,
          pointerEvents: 'none',
        }}
      />

      <AbsoluteFill style={{ background: 'radial-gradient(circle, transparent 50%, rgba(0,0,0,0.55) 100%)', pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};
