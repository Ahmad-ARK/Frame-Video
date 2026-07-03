import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from 'remotion';
import { playfair, oswald, montserrat, inter } from '../fonts';
import type { Word } from '../Captions';
import { useTheme, gradeFilter } from '../theme';

/** Fit a headline into the frame: shorter text → bigger type, capped. */
const fitFont = (text: string, budget: number, min: number, max: number) =>
  Math.round(Math.min(max, Math.max(min, budget / Math.max(text.length, 1))));

// ---------- MacroScreenFocus: punchy highlighted headline over drifting image ----------

export const MacroScreenFocus: React.FC<{ images?: string[]; headline: string }> = ({ images = [], headline }) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const img = images[0] ?? 'placeholder.jpg';

  const driftX = interpolate(frame, [0, durationInFrames], [0, -40], { easing: Easing.linear });
  const scale = interpolate(frame, [0, durationInFrames], [1.1, 1.16], { easing: Easing.linear });
  const highlightScale = interpolate(frame, [8, 22], [0, 1], {
    easing: Easing.bezier(0.25, 1, 0.5, 1),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fontSize = fitFont(headline, 2600, 60, 130);

  return (
    <AbsoluteFill style={{ backgroundColor: theme.paper, overflow: 'hidden' }}>
      <AbsoluteFill style={{ filter: 'grayscale(100%)' }}>
        <Img
          src={staticFile(img)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(14px) brightness(0.55)', transform: `translateX(${driftX}px) scale(${scale})` }}
        />
        <AbsoluteFill
          style={{
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 12%, black 38%, black 62%, transparent 88%)',
            maskImage: 'linear-gradient(to bottom, transparent 12%, black 38%, black 62%, transparent 88%)',
          }}
        >
          <Img src={staticFile(img)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `translateX(${driftX}px) scale(${scale})` }} />
        </AbsoluteFill>
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: 'center', padding: '0 6%' }}>
        <div style={{ position: 'relative', display: 'inline-block', maxWidth: '92%' }}>
          <div
            style={{
              position: 'absolute',
              top: '12%',
              left: 0,
              width: '100%',
              height: '76%',
              backgroundColor: theme.highlighter,
              transform: `scaleX(${highlightScale})`,
              transformOrigin: 'left center',
              mixBlendMode: 'multiply',
            }}
          />
          <h1
            style={{
              fontFamily: playfair,
              fontWeight: 700,
              fontSize,
              lineHeight: 1.05,
              color: theme.ink,
              margin: 0,
              position: 'relative',
              textShadow: '2px 0 rgba(0,191,255,0.6), -2px 0 rgba(255,0,0,0.6)',
            }}
          >
            {headline}
          </h1>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: 'radial-gradient(circle, transparent 50%, rgba(0,0,0,0.4) 100%)', pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};

// ---------- QuoteOverlay: attributed quotation, word-staggered reveal ----------

export const QuoteOverlay: React.FC<{ images?: string[]; quoteText: string; speakerName?: string }> = ({
  images = [],
  quoteText,
  speakerName,
}) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const img = images[0] ?? 'placeholder.jpg';
  const zoom = interpolate(frame, [0, durationInFrames], [1.0, 1.09], { easing: Easing.linear });
  const words = quoteText.split(/\s+/);
  const perWordDelay = Math.min(5, (durationInFrames * 0.4) / Math.max(words.length, 1));

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      <Img src={staticFile(img)} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: `${gradeFilter(theme)} brightness(0.55)`, transform: `scale(${zoom})` }} />
      <AbsoluteFill style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 55%)' }} />
      <AbsoluteFill style={{ justifyContent: 'flex-end', padding: '8%' }}>
        <div style={{ borderLeft: `4px solid ${theme.accent}`, paddingLeft: 28, maxWidth: '75%' }}>
          <h2 style={{ fontFamily: playfair, fontSize: fitFont(quoteText, 5200, 34, 58), color: theme.textPrimary, margin: 0, fontWeight: 400, fontStyle: 'italic', lineHeight: 1.3 }}>
            {'“'}
            {words.map((w, i) => {
              const reveal = spring({ frame: frame - 12 - i * perWordDelay, fps, config: { damping: 200 } });
              return (
                <span key={i} style={{ opacity: 0.15 + reveal * 0.85 }}>
                  {w}{' '}
                </span>
              );
            })}
            {'”'}
          </h2>
          {speakerName ? (
            <p
              style={{
                fontFamily: inter,
                fontSize: 26,
                color: theme.accent,
                margin: '18px 0 0 0',
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                fontWeight: 700,
                opacity: interpolate(frame, [words.length * perWordDelay + 15, words.length * perWordDelay + 35], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              }}
            >
              — {speakerName}
            </p>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- StatueReveal: contemplative artifact close-up with typewriter ----------

export const StatueReveal: React.FC<{ images?: string[]; words?: Word[]; narration?: string }> = ({
  images = [],
  words,
  narration = '',
}) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const img = images[0] ?? 'placeholder.jpg';

  const scale = interpolate(frame, [0, durationInFrames], [1.55, 1.02], { easing: Easing.out(Easing.quad) });

  let displayText = '';
  if (words && words.length > 0) {
    const t = frame / fps;
    displayText = words
      .filter((w) => t >= w.start)
      .map((w) => w.text)
      .join(' ');
  } else {
    const chars = Math.floor(interpolate(frame, [20, durationInFrames - 20], [0, narration.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
    displayText = narration.slice(0, chars);
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#111', overflow: 'hidden' }}>
      <Img src={staticFile(img)} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(40px) brightness(0.35)', transform: 'scale(1.12)' }} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Img
          src={staticFile(img)}
          style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', transform: `scale(${scale})`, filter: 'grayscale(100%) contrast(1.12)' }}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, transparent 45%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '9%', left: '8%', width: '58%', maxHeight: '26%', overflow: 'hidden' }}>
        <p style={{ fontFamily: inter, fontSize: 32, fontWeight: 500, color: theme.textPrimary, margin: 0, lineHeight: 1.45, textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}>
          {displayText}
          <span style={{ opacity: Math.floor(frame / 15) % 2 === 0 ? 1 : 0, color: theme.accent }}>▍</span>
        </p>
      </div>
    </AbsoluteFill>
  );
};

// ---------- GlitchGrid: energetic tiled reveal with autofit headline ----------

export const GlitchGrid: React.FC<{ images?: string[]; headline: string; subtitle?: string; gridCols?: number; gridRows?: number }> = ({
  images = [],
  headline,
  subtitle,
  gridCols = 3,
  gridRows = 3,
}) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const steppedFrame = Math.floor(frame / 2) * 2;
  const img = images[0] ?? 'placeholder.jpg';
  const cols = Math.max(2, gridCols);
  const rows = Math.max(2, gridRows);
  const isGlitching = steppedFrame < 15 || steppedFrame % 40 < 3;
  const glitchOffsetX = isGlitching ? (steppedFrame % 5) * 8 - 16 : 0;
  const glitchShadow = isGlitching ? '3px 0 #FF0000, -3px 0 #00FFFF' : 'none';

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      <AbsoluteFill style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', transform: `translateX(${glitchOffsetX}px)` }}>
        {Array.from({ length: cols * rows }).map((_, index) => {
          const colIndex = index % cols;
          const rowIndex = Math.floor(index / cols);
          return (
            <div
              key={index}
              style={{
                width: `${100 / cols}%`,
                height: `${100 / rows}%`,
                backgroundColor: '#000',
                opacity: steppedFrame > index * 2 ? 1 : 0,
                backgroundImage: `url(${staticFile(img)})`,
                backgroundSize: `${cols * 100}% ${rows * 100}%`,
                backgroundPosition: `${(colIndex / (cols - 1)) * 100}% ${(rowIndex / (rows - 1)) * 100}%`,
                filter: 'grayscale(100%) contrast(1.1)',
                border: '1px solid #111',
                boxSizing: 'border-box',
              }}
            />
          );
        })}
      </AbsoluteFill>
      {/* HUD: red scanline border + marquee dots */}
      <AbsoluteFill style={{ border: `1px solid ${theme.hud}4d`, boxShadow: `inset 0 0 0 1px ${theme.hud}1a`, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: 20, left: 20, display: 'flex', gap: 8 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: theme.hud, opacity: steppedFrame % 8 === i * 2 ? 1 : 0.2 }} />
        ))}
      </div>

      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        {subtitle ? (
          <div
            style={{
              fontFamily: montserrat,
              fontSize: 26,
              color: '#FFF',
              transform: 'scaleX(-1)',
              marginBottom: 14,
              opacity: steppedFrame > 6 ? 0.8 : 0,
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              textShadow: glitchShadow,
            }}
          >
            {subtitle}
          </div>
        ) : null}
        <div
          style={{
            backgroundColor: '#111',
            padding: '18px 44px',
            maxWidth: '88%',
            opacity: steppedFrame > 10 ? 1 : 0,
            textShadow: glitchShadow,
          }}
        >
          <h1
            style={{
              fontFamily: montserrat,
              fontWeight: 800,
              fontSize: fitFont(headline, 2100, 54, 110),
              color: '#FFF',
              margin: 0,
              textTransform: 'uppercase',
              letterSpacing: '0.16em',
              textAlign: 'center',
            }}
          >
            {headline}
          </h1>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: 0.08, mixBlendMode: 'overlay' }}>
        <svg width="100%" height="100%">
          <filter id="digNoise">
            <feTurbulence type="fractalNoise" baseFrequency="1.5" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#digNoise)" />
        </svg>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- EditorialPaper: newspaper layout with reveals ----------

export const EditorialPaper: React.FC<{ images?: string[]; headline: string; bodyText: string }> = ({
  images = [],
  headline,
  bodyText,
}) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const img = images[0] ?? 'placeholder.jpg';
  const cameraScale = interpolate(frame, [0, durationInFrames], [1.12, 1.0], { easing: Easing.linear, extrapolateRight: 'clamp' });
  const revealText = (delay: number) => {
    const value = interpolate(frame, [delay, delay + 15], [100, 0], { easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return `inset(${value}% 0 0 0)`;
  };
  const revealImage = (delay: number) => {
    const value = interpolate(frame, [delay, delay + 20], [100, 0], { easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return `inset(0 ${value}% 0 0)`;
  };

  return (
    <AbsoluteFill style={{ backgroundColor: theme.paper, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `scale(${cameraScale})` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr', gridTemplateRows: '1fr 2fr 1fr', height: '100%', width: '100%', padding: '5%', boxSizing: 'border-box' }}>
          <div style={{ gridColumn: 3, gridRow: '1 / 4', borderLeft: `1px solid ${theme.ink}`, padding: 10, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ width: '100%', height: '70%', clipPath: revealImage(25), overflow: 'hidden' }}>
              <Img src={staticFile(img)} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(100%) contrast(1.2)' }} />
            </div>
          </div>
          <div style={{ gridColumn: 2, gridRow: 2, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 20px' }}>
            <h1
              style={{
                fontFamily: oswald,
                fontWeight: 700,
                fontSize: fitFont(headline, 2000, 56, 100),
                color: theme.ink,
                margin: 0,
                lineHeight: 0.95,
                textTransform: 'uppercase',
                clipPath: revealText(10),
              }}
            >
              {headline}
            </h1>
            <div
              style={{
                height: 1,
                backgroundColor: theme.ink,
                width: '100%',
                margin: '20px 0',
                transform: `scaleX(${interpolate(frame, [20, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })})`,
                transformOrigin: 'left',
              }}
            />
            <p style={{ fontFamily: inter, fontSize: 24, color: theme.ink, lineHeight: 1.45, margin: 0, maxWidth: '85%', clipPath: revealText(30) }}>{bodyText}</p>
          </div>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: 0.35, mixBlendMode: 'multiply', pointerEvents: 'none' }}>
        <svg width="100%" height="100%">
          <filter id="paperGrain">
            <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="4" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#paperGrain)" />
        </svg>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
