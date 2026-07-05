import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { playfair, inter } from '../fonts';
import { Sfx } from '../Sfx';
import { useMontage } from './useMontage';
import { useTheme, gradeFilter } from '../theme';
import { DustLayer } from './DustLayer';

const TITLE_HOLD_FRAMES = 80; // ~2.7s on screen, then the footage takes over again

/**
 * Cold-open: a full-bleed drifting montage carries the scene; the title card
 * enters ON the narration's trigger word, holds ~2.7s and exits. Footage
 * breathes before and after instead of a frozen card.
 */
export const HookTitle: React.FC<{
  images?: string[];
  title: string;
  subtitle?: string;
  /** scene-local frame at which the title appears (matched from narration) */
  titleAppearFrame?: number;
  imageTones?: (string | null)[];
}> = ({ images = [], title, subtitle, titleAppearFrame = 12, imageTones }) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const imgs = images.length > 0 ? images : ['placeholder.jpg'];
  const m = useMontage(imgs.length, 14);

  const appear = Math.min(titleAppearFrame, Math.max(10, durationInFrames - TITLE_HOLD_FRAMES - 10));
  const exit = Math.min(appear + TITLE_HOLD_FRAMES, durationInFrames - 6);
  const local = frame - appear;

  // full-bleed montage: cover-fit, continuous zoom + diagonal drift per image
  const renderLayer = (index: number, localFrame: number, opacity: number) => {
    const p = localFrame / m.perImage;
    const zoom = 1.08 + 0.14 * p;
    const dx = (index % 2 === 0 ? -1 : 1) * 48 * p;
    const dy = (index % 3 === 0 ? -1 : 1) * 20 * p;
    return (
      <AbsoluteFill key={index} style={{ opacity }}>
        <Img
          src={staticFile(imgs[index])}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: `${gradeFilter(theme, imageTones?.[index])} brightness(0.55)`,
            transform: `scale(${zoom}) translate(${dx}px, ${dy}px)`,
          }}
        />
      </AbsoluteFill>
    );
  };

  const words = title.split(/\s+/);
  const ruleScale = spring({ frame: local, fps, config: { damping: 200 } });
  const subtitleOpacity = interpolate(local, [words.length * 4 + 8, words.length * 4 + 24], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // whole card fades/blurs out after its hold
  const cardExit = interpolate(frame, [exit - 12, exit], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const cardVisible = frame >= appear && frame <= exit;

  // vignette deepens while the title is up, relaxes after
  const vignette = interpolate(cardVisible ? cardExit : 0, [0, 1], [0.55, 0.8]);
  const titleSize = Math.min(150, 2300 / Math.max(title.length, 8));

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      <Sfx name="hit" at={appear} volume={0.5} />
      {renderLayer(m.base.index, m.base.localFrame, 1)}
      {m.overlay && renderLayer(m.overlay.index, m.overlay.localFrame, m.overlay.opacity)}
      <DustLayer />
      <AbsoluteFill style={{ background: `radial-gradient(circle, transparent 30%, rgba(0,0,0,${vignette}) 100%)` }} />

      {cardVisible ? (
        <AbsoluteFill
          style={{
            justifyContent: 'center',
            alignItems: 'center',
            padding: '0 8%',
            opacity: cardExit,
            filter: `blur(${(1 - cardExit) * 6}px)`,
            transform: `scale(${1 + (1 - cardExit) * 0.03})`,
          }}
        >
          <div
            style={{ width: 120, height: 3, backgroundColor: theme.accent, transform: `scaleX(${ruleScale})`, marginBottom: 36, boxShadow: `0 0 12px ${theme.accentGlow}` }}
          />
          <h1
            style={{
              fontFamily: playfair,
              fontWeight: 700,
              fontSize: titleSize,
              color: theme.textPrimary,
              margin: 0,
              textAlign: 'center',
              lineHeight: 1.1,
              textShadow: '0 4px 30px rgba(0,0,0,0.9)',
            }}
          >
            {words.map((w, i) => {
              const reveal = spring({ frame: local - i * 4, fps, config: { damping: 200 } });
              return (
                <span
                  key={i}
                  style={{
                    display: 'inline-block',
                    opacity: reveal,
                    transform: `translateY(${(1 - reveal) * 40}px)`,
                    filter: `blur(${(1 - reveal) * 8}px)`,
                    marginRight: '0.28em',
                  }}
                >
                  {w}
                </span>
              );
            })}
          </h1>
          {subtitle ? (
            <p
              style={{
                fontFamily: inter,
                fontWeight: 600,
                fontSize: 30,
                color: theme.accent,
                margin: '34px 0 0 0',
                textTransform: 'uppercase',
                letterSpacing: '0.32em',
                opacity: subtitleOpacity,
                textAlign: 'center',
              }}
            >
              {subtitle}
            </p>
          ) : null}
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
