import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { oswald } from './fonts';
import { useTheme, gradeFilter } from './theme';

export interface CueData {
  frame: number; // scene-local frame at which the cue fires
  action: 'popText' | 'popImage';
  text?: string;
  image?: string;
}

const MAX_LIFE = 80; // frames a cue stays if no successor replaces it

// deterministic position/rotation variety so consecutive pops never overlap
const TEXT_SPOTS = [
  { left: '50%', top: '36%', rot: -2.5 },
  { left: '32%', top: '30%', rot: 2 },
  { left: '68%', top: '31%', rot: -1.5 },
  { left: '50%', top: '25%', rot: 2.5 },
];
const IMAGE_SPOTS = [
  { left: '30%', top: '40%', rot: -4 },
  { left: '70%', top: '40%', rot: 4 },
  { left: '35%', top: '34%', rot: 3 },
  { left: '65%', top: '36%', rot: -3 },
];

/**
 * Word-synced visual events layered over any scene: big text slams and
 * polaroid image punch-ins that fire exactly when the narrator speaks their
 * trigger word. Each cue lives until the next one replaces it.
 */
export const CueOverlay: React.FC<{ cues?: CueData[] }> = ({ cues }) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!cues || cues.length === 0) return null;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 50 }}>
      {cues.map((cue, i) => {
        const next = cues[i + 1];
        const end = Math.min(next ? next.frame : cue.frame + MAX_LIFE, cue.frame + MAX_LIFE);
        if (frame < cue.frame || frame > end) return null;

        const local = frame - cue.frame;
        const pop = spring({ frame: local, fps, config: { damping: 13, stiffness: 240 } });
        const exit = interpolate(frame, [end - 6, end], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const drift = 1 + Math.min(local / MAX_LIFE, 1) * 0.04; // slow push after the pop

        if (cue.action === 'popText' && cue.text) {
          const spot = TEXT_SPOTS[i % TEXT_SPOTS.length];
          const fontSize = Math.round(Math.min(120, Math.max(56, 1500 / Math.max(cue.text.length, 4))));
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: spot.left,
                top: spot.top,
                transform: `translate(-50%, -50%) rotate(${spot.rot}deg) scale(${(1.55 - 0.55 * pop) * drift})`,
                opacity: Math.min(1, local / 2) * exit,
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontFamily: oswald,
                  fontWeight: 700,
                  fontSize,
                  color: '#FFFFFF',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  lineHeight: 1,
                  textShadow: '0 4px 24px rgba(0,0,0,0.95), 0 0 60px rgba(0,0,0,0.6)',
                  whiteSpace: 'nowrap',
                }}
              >
                {cue.text}
              </div>
              <div
                style={{
                  height: 6,
                  width: '76%',
                  margin: '10px auto 0',
                  backgroundColor: theme.accent,
                  transform: `scaleX(${pop})`,
                  boxShadow: `0 0 14px ${theme.accentGlow}`,
                }}
              />
            </div>
          );
        }

        if (cue.action === 'popImage' && cue.image) {
          const spot = IMAGE_SPOTS[i % IMAGE_SPOTS.length];
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: spot.left,
                top: spot.top,
                width: '30%',
                transform: `translate(-50%, -50%) rotate(${spot.rot}deg) scale(${(1.35 - 0.35 * pop) * drift})`,
                opacity: Math.min(1, local / 2) * exit,
                backgroundColor: '#F5F1E8',
                padding: 14,
                paddingBottom: 20,
                boxShadow: '0 24px 70px rgba(0,0,0,0.75)',
              }}
            >
              <Img
                src={staticFile(cue.image)}
                style={{ width: '100%', maxHeight: 480, objectFit: 'cover', display: 'block', filter: gradeFilter(theme) }}
              />
            </div>
          );
        }
        return null;
      })}
    </AbsoluteFill>
  );
};
