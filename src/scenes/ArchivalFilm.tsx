import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate } from 'remotion';
import { useMontage } from './useMontage';
import { useTheme } from '../theme';

/** Old-footage treatment: sepia, flicker, gate weave, grain — montage-aware. */
export const ArchivalFilm: React.FC<{
  images?: string[];
  intensity?: 'light' | 'medium' | 'heavy';
  focalPoints?: ({ x: number; y: number } | null)[];
}> = ({ images = [], intensity = 'medium', focalPoints }) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const imgs = images.length > 0 ? images : ['placeholder.jpg'];
  const m = useMontage(imgs.length);

  const steppedFrame = Math.floor(frame / 2) * 2;
  const flicker = interpolate(steppedFrame % 6, [0, 2, 4, 6], [0.92, 1, 0.96, 1]);
  // gate weave: tiny vertical jitter like a projector
  const weave = Math.sin(frame * 0.9) * 1.5 + Math.sin(frame * 0.23) * 1.2;
  const grainOpacity = intensity === 'heavy' ? 0.4 : intensity === 'medium' ? 0.25 : 0.12;

  const renderLayer = (index: number, localFrame: number, opacity: number) => {
    const p = localFrame / m.perImage;
    const fp = focalPoints?.[index] ?? null;
    // anchored at height-fit: every zoom starts from the fitted state
    const scale = 1.0 + 0.15 * p;
    const panX = fp ? (0.5 - fp.x) * 90 * p : (index % 2 === 0 ? 1 : -1) * 34 * p;
    const origin = fp ? `${fp.x * 100}% ${fp.y * 100}%` : '50% 50%';
    return (
      <AbsoluteFill key={index} style={{ opacity }}>
        <Img
          src={staticFile(imgs[index])}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: `${theme.archivalFilter} brightness(0.35) blur(35px)`,
            transform: 'scale(1.15)',
          }}
        />
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
          <Img
            src={staticFile(imgs[index])}
            style={{
              height: '100%',
              width: 'auto',
              filter: `${theme.archivalFilter} brightness(0.92)`,
              transform: `scale(${scale}) translate(${panX}px, ${weave}px)`,
              transformOrigin: origin,
            }}
          />
        </AbsoluteFill>
      </AbsoluteFill>
    );
  };

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      <AbsoluteFill style={{ opacity: flicker }}>
        {renderLayer(m.base.index, m.base.localFrame, 1)}
        {m.overlay && renderLayer(m.overlay.index, m.overlay.localFrame, m.overlay.opacity)}
      </AbsoluteFill>
      <AbsoluteFill
        style={{ background: 'radial-gradient(circle, transparent 25%, rgba(0,0,0,0.75) 100%)', pointerEvents: 'none' }}
      />
      <AbsoluteFill style={{ opacity: grainOpacity, mixBlendMode: 'screen', pointerEvents: 'none' }}>
        <svg width="100%" height="100%">
          <filter id="archivalGrain">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" seed={Math.floor(frame / 2)} />
            <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2 1.5" />
          </filter>
          <rect width="100%" height="100%" filter="url(#archivalGrain)" />
        </svg>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
