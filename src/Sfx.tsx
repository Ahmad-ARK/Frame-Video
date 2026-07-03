import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';

export type SfxName = 'whoosh' | 'whoosh_short' | 'hit' | 'tick' | 'riser';

/** One-shot sound effect starting at a local frame. */
export const Sfx: React.FC<{ name: SfxName; at: number; volume?: number }> = ({ name, at, volume = 0.45 }) => {
  if (at < 0) return null;
  return (
    <Sequence from={at} durationInFrames={60} name={`sfx-${name}`}>
      <Audio src={staticFile(`sfx/${name}.mp3`)} volume={volume} />
    </Sequence>
  );
};

/**
 * Micro camera-shake that fires on impact frames (popText slams). A 6-frame
 * decaying jolt — enough to sell the hit without being nauseating.
 */
export const ImpactShake: React.FC<{ shakeFrames: number[]; children: React.ReactNode }> = ({ shakeFrames, children }) => {
  const frame = useCurrentFrame();
  let dx = 0;
  let dy = 0;
  for (const sf of shakeFrames) {
    const t = frame - sf;
    if (t >= 0 && t < 5) {
      // gentle: ~3px first frame, eased out — a nudge, not an earthquake
      const decay = Math.pow(1 - t / 5, 2) * 3;
      dx += Math.sin(t * 2.2) * decay;
      dy += Math.cos(t * 2.7) * decay * 0.5;
    }
  }
  const moving = dx !== 0 || dy !== 0;
  return (
    <AbsoluteFill style={moving ? { transform: `translate(${dx}px, ${dy}px)` } : undefined}>
      {children}
    </AbsoluteFill>
  );
};
