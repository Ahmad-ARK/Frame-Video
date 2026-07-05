import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { useTheme, gradeFilter } from '../theme';
import { DustLayer } from './DustLayer';

/**
 * The 2.5D flagship: a true depth composition using native CSS 3D transforms
 * (perspective + preserve-3d) — no WebGL. Three planes at increasing Z:
 * blurred backdrop, sharp mid-ground with a slow camera dolly (rotateY +
 * translateZ around the focal point), and — when the subject is a cutout-
 * worthy person/object — a foreground cutout that separates for real
 * parallax.
 *
 * CHROME GOTCHA: `overflow` or `filter` on an ancestor of a
 * `transform-style: preserve-3d` element (or on that element itself)
 * flattens all 3D children back to 2D. So neither the perspective root nor
 * the preserve-3d group below may carry those properties — every filter
 * (grade, blur) lives on the leaf <Img> instead. Remotion's capture is
 * bounded to the composition frame regardless, so no clipping is needed for
 * correctness; leaf layers are simply oversized enough that their edges
 * never enter view at the max Z-translation used here.
 */
export const ParallaxDeep: React.FC<{
  images?: string[];
  imageTones?: (string | null)[];
  focalPoints?: ({ x: number; y: number } | null)[];
  cutouts?: (string | null)[];
}> = ({ images = [], imageTones = [], focalPoints = [], cutouts = [] }) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const img = images[0] ?? 'placeholder.jpg';
  const tone = imageTones[0] ?? null;
  const fp = focalPoints[0] ?? { x: 0.5, y: 0.5 };
  const cutout = cutouts[0] ?? null;
  const p = Math.min(1, frame / durationInFrames);

  const bgDriftX = interpolate(p, [0, 1], [0, -30]);
  const rotY = interpolate(p, [0, 1], [-3, 3]);
  const midZ = interpolate(p, [0, 1], [0, 90]);
  const cutZ = interpolate(p, [0, 1], [140, 220]);
  const cutScale = interpolate(p, [0, 1], [1.05, 1.18]);
  const sweepX = interpolate(p, [0, 1], [-60, 160]);

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <AbsoluteFill style={{ perspective: 1200 }}>
        <AbsoluteFill style={{ transformStyle: 'preserve-3d' }}>
          {/* backdrop: blurred, slow drift */}
          <AbsoluteFill style={{ transform: `translateZ(-220px) translateX(${bgDriftX}px) scale(1.3)` }}>
            <Img
              src={staticFile(img)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', filter: `${gradeFilter(theme, tone)} blur(10px) brightness(0.55)` }}
            />
          </AbsoluteFill>

          {/* mid-ground: sharp, camera dolly around the focal point */}
          <AbsoluteFill
            style={{
              transform: `rotateY(${rotY}deg) translateZ(${midZ}px) scale(1.12)`,
              transformOrigin: `${fp.x * 100}% ${fp.y * 100}%`,
            }}
          >
            <Img src={staticFile(img)} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: gradeFilter(theme, tone) }} />
          </AbsoluteFill>

          {/* foreground cutout: true parallax separation */}
          {cutout ? (
            <AbsoluteFill style={{ transform: `translateZ(${cutZ}px) scale(${cutScale})`, justifyContent: 'center', alignItems: 'center' }}>
              <Img src={staticFile(cutout)} style={{ maxHeight: '92%', maxWidth: '92%', objectFit: 'contain', filter: `drop-shadow(0 30px 60px rgba(0,0,0,0.6))` }} />
            </AbsoluteFill>
          ) : null}
        </AbsoluteFill>
      </AbsoluteFill>

      <DustLayer depth={0} count={20} />
      <DustLayer depth={1} count={14} />

      {/* single diagonal light sweep across the scene */}
      <AbsoluteFill
        style={{
          background: 'linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.5) 50%, transparent 60%)',
          mixBlendMode: 'screen',
          opacity: 0.1,
          transform: `translateX(${sweepX}%)`,
          pointerEvents: 'none',
        }}
      />
      <AbsoluteFill style={{ background: 'radial-gradient(circle, transparent 45%, rgba(0,0,0,0.5) 100%)', pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};
