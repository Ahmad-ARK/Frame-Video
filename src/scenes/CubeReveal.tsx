import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { inter } from '../fonts';
import { useTheme, gradeFilter } from '../theme';
import { Sfx } from '../Sfx';

const Face: React.FC<{
  image: string;
  tone: string | null;
  label: string;
  rotateY: number;
  radius: number;
  theme: ReturnType<typeof useTheme>;
}> = ({ image, tone, label, rotateY, radius, theme }) => (
  <AbsoluteFill style={{ transform: `rotateY(${rotateY}deg) translateZ(${radius}px)` }}>
    <Img src={staticFile(image)} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: gradeFilter(theme, tone) }} />
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: '18px 40px',
        backgroundColor: theme.paper,
      }}
    >
      <div style={{ fontFamily: inter, fontWeight: 700, fontSize: 30, color: theme.ink, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </div>
    </div>
  </AbsoluteFill>
);

/**
 * A hard before/after pivot: two full-bleed cube faces (front + right) that
 * swap places on one spring-driven rotateY flip. `flipFrame` (pipeline-set
 * from the scene's first cue trigger, else duration*0.45) is when the flip
 * fires. No `overflow`/`filter` on the perspective/preserve-3d ancestors —
 * see the gotcha documented in ParallaxDeep.tsx.
 */
export const CubeReveal: React.FC<{
  images?: string[];
  imageTones?: (string | null)[];
  faceLabels: [string, string];
  flipFrame?: number;
}> = ({ images = [], imageTones = [], faceLabels, flipFrame }) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { fps, width, durationInFrames } = useVideoConfig();
  const trigger = flipFrame ?? durationInFrames * 0.45;

  const flip = spring({ frame: frame - trigger, fps, config: { damping: 16 } });
  const rotY = interpolate(flip, [0, 1], [0, -90]);
  const breathe = Math.sin(frame * 0.05) * 2;
  const radius = width / 2;
  // translateZ(radius) on a face facing the camera magnifies it by perspective/(perspective-radius) —
  // with radius pinned to half the viewport width (required so adjoining faces meet edge-to-edge with
  // no gap), perspective must be several times larger than radius or the faces blow up into an
  // unrecognizable close-up with no visible cube corner. 4x width keeps the zoom to a subtle ~14%.
  const perspective = width * 4;

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <AbsoluteFill style={{ perspective }}>
        <AbsoluteFill style={{ transformStyle: 'preserve-3d', transform: `rotateX(${2 + breathe}deg) rotateY(${rotY}deg)` }}>
          <Face image={images[0] ?? 'placeholder.jpg'} tone={imageTones[0] ?? null} label={faceLabels[0]} rotateY={0} radius={radius} theme={theme} />
          <Face image={images[1] ?? images[0] ?? 'placeholder.jpg'} tone={imageTones[1] ?? null} label={faceLabels[1]} rotateY={90} radius={radius} theme={theme} />
        </AbsoluteFill>
      </AbsoluteFill>

      <Sfx name="whoosh" at={Math.round(trigger)} volume={0.5} />
      <AbsoluteFill style={{ background: 'radial-gradient(circle, transparent 50%, rgba(0,0,0,0.55) 100%)', pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};
