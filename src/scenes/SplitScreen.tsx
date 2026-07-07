import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, spring } from 'remotion';
import { oswald } from '../fonts';
import { useTheme, gradeFilter } from '../theme';

/**
 * Comparison scene, rebuilt to actually read as a comparison:
 * - blurred-fill behind each contained image (museum-white shots no longer wash the panel)
 * - angled glowing divider + center badge ("VS" or a ⇄ exchange mark)
 * - warm/cool tint per side to encode the contrast
 * - strong opposing motion inside each panel
 */
export const SplitScreen: React.FC<{
  images?: string[];
  leftLabel?: string;
  rightLabel?: string;
  centerLabel?: string;
  variant?: string;
}> = ({ images = [], leftLabel, rightLabel, centerLabel, variant }) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const leftSrc = images[0] ?? 'placeholder.jpg';
  const rightSrc = images[1] ?? leftSrc;
  // straight = vertical seam + no center badge (clean); classic = angled + badge
  const straight = variant === 'straight';
  const dividerRotate = straight ? 0 : 6;

  const slide = spring({ frame, fps, config: { damping: 18, stiffness: 90 } });
  const dividerScale = spring({ frame: frame - 6, fps, config: { damping: 200 } });
  const badgePop = spring({ frame: frame - 14, fps, config: { damping: 11, stiffness: 200 } });
  const labelReveal = spring({ frame: frame - 20, fps, config: { damping: 200 } });
  const p = frame / durationInFrames;

  const panel = (src: string, dir: 1 | -1, label?: string, tint?: string) => {
    // opposing motion: one side zooms in while the other pulls back
    const scale = dir === -1 ? 1.06 + 0.16 * p : 1.22 - 0.16 * p;
    const panX = dir * 38 * p;
    const panY = dir * -14 * p;
    return (
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', transform: `translateX(${(1 - slide) * 100 * dir * -1}%)` }}>
        {/* blurred fill so contained images never sit on raw white */}
        <Img
          src={staticFile(src)}
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: `${gradeFilter(theme)} blur(40px) brightness(0.4)`,
            transform: 'scale(1.2)',
          }}
        />
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
          <Img
            src={staticFile(src)}
            style={{
              maxWidth: '86%',
              maxHeight: '80%',
              objectFit: 'contain',
              filter: gradeFilter(theme),
              transform: `scale(${scale}) translate(${panX}px, ${panY}px)`,
              boxShadow: '0 26px 70px rgba(0,0,0,0.65)',
            }}
          />
        </AbsoluteFill>
        {/* side tint encodes the contrast */}
        <AbsoluteFill style={{ backgroundColor: tint, mixBlendMode: 'overlay', opacity: 0.35, pointerEvents: 'none' }} />
        <AbsoluteFill
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 28%)', pointerEvents: 'none' }}
        />
        {label ? (
          <div
            style={{
              position: 'absolute',
              bottom: 46,
              left: dir === -1 ? 46 : undefined,
              right: dir === 1 ? 46 : undefined,
              fontFamily: oswald,
              fontWeight: 700,
              fontSize: 46,
              color: '#fff',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              opacity: labelReveal,
              transform: `translateY(${(1 - labelReveal) * 30}px)`,
              textShadow: '0 3px 12px rgba(0,0,0,0.9)',
              borderBottom: `3px solid ${theme.accent}`,
              paddingBottom: 6,
            }}
          >
            {label}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <AbsoluteFill style={{ display: 'flex', flexDirection: 'row', backgroundColor: '#000', overflow: 'hidden' }}>
      {panel(leftSrc, -1, leftLabel, theme.accent)}
      {panel(rightSrc, 1, rightLabel, theme.duotone.cool)}

      {/* angled glowing divider */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '-10%',
          width: 6,
          height: '120%',
          backgroundColor: theme.accent,
          transform: `translateX(-50%) rotate(${dividerRotate}deg) scaleY(${dividerScale})`,
          transformOrigin: 'center',
          boxShadow: `0 0 ${24 + Math.sin(frame * 0.15) * 8}px ${theme.accentGlow}`,
          zIndex: 2,
        }}
      />

      {/* center badge (classic only) */}
      {!straight && (
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', zIndex: 3, pointerEvents: 'none' }}>
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: '50%',
            backgroundColor: theme.bg,
            border: `3px solid ${theme.accent}`,
            boxShadow: `0 0 34px ${theme.accentGlow}, 0 12px 40px rgba(0,0,0,0.8)`,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            transform: `scale(${badgePop})`,
          }}
        >
          {centerLabel ? (
            <span style={{ fontFamily: oswald, fontWeight: 700, fontSize: centerLabel.length > 2 ? 38 : 52, color: theme.accent, letterSpacing: '0.04em' }}>
              {centerLabel.toUpperCase()}
            </span>
          ) : (
            <svg width="62" height="62" viewBox="0 0 60 60">
              <g stroke={theme.accent} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M 12 22 H 44 M 38 14 L 46 22 L 38 30" />
                <path d="M 48 40 H 16 M 22 32 L 14 40 L 22 48" />
              </g>
            </svg>
          )}
        </div>
      </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
