import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from 'remotion';
import { oswald, inter } from '../fonts';
import { Sfx } from '../Sfx';
import { useTheme, gradeFilter } from '../theme';

export interface TimelineEvent {
  year: string;
  label: string;
}

/**
 * Rebuilt timeline: the active event is TIME-DRIVEN (the old version took a
 * static currentIndex that never moved). Progress sweeps the full bar across
 * the scene; each event activates with a spring as the sweep reaches it.
 */
export const Timeline: React.FC<{
  images?: string[];
  events: TimelineEvent[];
  imageTones?: (string | null)[];
  /** scene-local frames at which each event's year is SPOKEN (from word timestamps) */
  eventFrames?: number[];
}> = ({ images = [], events, imageTones, eventFrames }) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const img = images[0] ?? 'placeholder.jpg';

  const n = events.length;
  // event i sits at its dot position; it activates when the sweep passes it
  const posOf = (i: number) => (n === 1 ? 0.5 : i / (n - 1));

  // voice-synced activations when the pipeline matched the years in the
  // narration (must be strictly increasing for the piecewise sweep)
  const synced =
    eventFrames &&
    eventFrames.length === n &&
    eventFrames.every((f, i) => i === 0 || f > eventFrames[i - 1]) &&
    eventFrames[n - 1] < durationInFrames - 12
      ? eventFrames
      : null;
  const activationFrame = (i: number) => (synced ? synced[i] : 10 + posOf(i) * (durationInFrames - 25));

  // the bar reaches each dot exactly when its year is spoken
  const progress = synced
    ? interpolate(frame, [Math.max(0, synced[0] - 15), ...synced, durationInFrames - 10], [0, ...events.map((_, i) => posOf(i)), 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : interpolate(frame, [10, durationInFrames - 15], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });

  const zoom = interpolate(frame, [0, durationInFrames], [1.05, 1.14], { easing: Easing.linear });

  return (
    <AbsoluteFill style={{ backgroundColor: '#0b0b0e', overflow: 'hidden' }}>
      <Img
        src={staticFile(img)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55, filter: gradeFilter(theme, imageTones?.[0]), transform: `scale(${zoom})` }}
      />
      <AbsoluteFill style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.25) 45%, rgba(0,0,0,0.35) 100%)' }} />

      {events.map((_, i) => (
        <Sfx key={`t-${i}`} name="tick" at={Math.round(activationFrame(i))} volume={0.55} />
      ))}

      <div style={{ position: 'absolute', bottom: '12%', left: '7%', right: '7%' }}>
        {/* track */}
        <div style={{ position: 'relative', height: 4, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 2 }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              width: `${progress * 100}%`,
              backgroundColor: theme.accent,
              borderRadius: 2,
              boxShadow: `0 0 14px ${theme.accentGlow}`,
            }}
          />
          {/* dots on the track */}
          {events.map((_, i) => {
            const active = frame >= activationFrame(i);
            const pop = spring({ frame: frame - activationFrame(i), fps, config: { damping: 12, stiffness: 180 } });
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${posOf(i) * 100}%`,
                  top: '50%',
                  transform: `translate(-50%, -50%) scale(${active ? 0.8 + pop * 0.5 : 0.8})`,
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  backgroundColor: active ? theme.accent : '#3a3a3f',
                  border: '3px solid #0b0b0e',
                  boxShadow: active ? `0 0 18px ${theme.accentGlow}` : 'none',
                }}
              />
            );
          })}
        </div>
        {/* labels under the dots */}
        {events.map((ev, i) => {
          const active = frame >= activationFrame(i);
          const reveal = spring({ frame: frame - activationFrame(i), fps, config: { damping: 200 } });
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${posOf(i) * 100}%`,
                top: 26,
                transform: `translateX(${posOf(i) < 0.15 ? '0%' : posOf(i) > 0.85 ? '-100%' : '-50%'})`,
                textAlign: posOf(i) < 0.15 ? 'left' : posOf(i) > 0.85 ? 'right' : 'center',
                opacity: 0.35 + reveal * 0.65,
                width: 300,
              }}
            >
              <div style={{ fontFamily: oswald, fontWeight: 700, fontSize: 40, color: active ? theme.accent : '#9a9aa0', lineHeight: 1 }}>
                {ev.year}
              </div>
              <div
                style={{
                  fontFamily: inter,
                  fontWeight: 600,
                  fontSize: 22,
                  color: active ? '#FFF' : '#77777d',
                  marginTop: 8,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                {ev.label}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
