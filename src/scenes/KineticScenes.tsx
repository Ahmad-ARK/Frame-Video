import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, Easing, random } from 'remotion';
import { oswald, playfair, montserrat, inter } from '../fonts';
import { useTheme, gradeFilter } from '../theme';

// ---------- CinematicFire: embers + procedural fire wipe, epic transitions ----------

const useEmbers = (count: number) => {
  const frame = useCurrentFrame();
  return Array.from({ length: count }).map((_, i) => {
    const seed = random(`ember-${i}`);
    const duration = 60 + seed * 60;
    const startFrame = (seed * 100) % 120;
    const progress = (((frame - startFrame) % duration) + duration) % duration / duration;
    return {
      id: i,
      x: seed * 100,
      y: interpolate(progress, [0, 1], [108, -8]),
      size: 2 + seed * 4,
      opacity: interpolate(progress, [0, 0.2, 0.8, 1], [0, 1, 1, 0]),
      drift: Math.sin(progress * Math.PI * 2 + i) * 8,
    };
  });
};

export const CinematicFire: React.FC<{ images?: string[]; title: string; subtitle: string }> = ({
  images = [],
  title,
  subtitle,
}) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const img = images[0] ?? 'placeholder.jpg';
  const embers = useEmbers(40);

  const scale = interpolate(frame, [0, durationInFrames], [1.0, 1.15], { easing: Easing.linear, extrapolateRight: 'clamp' });
  const panX = interpolate(frame, [0, durationInFrames], [0, -30], { easing: Easing.linear });

  // fire flares on entry and exit
  const fireIn = interpolate(frame, [0, 15, 30], [1, 0.8, 0], { extrapolateRight: 'clamp' });
  const fireOut = interpolate(frame, [durationInFrames - 30, durationInFrames - 15, durationInFrames], [0, 0.8, 1], { extrapolateLeft: 'clamp' });
  const fireIntensity = Math.max(fireIn, fireOut);

  const textDelay = 20;
  const textOpacity = interpolate(frame, [textDelay, textDelay + 40], [0, 1], { easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const textY = interpolate(frame, [textDelay, textDelay + 40], [20, 0], { easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `scale(${scale}) translateX(${panX}px)` }}>
        <Img
          src={staticFile(img)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', filter: `${gradeFilter(theme)} brightness(0.55) contrast(1.15)` }}
        />
      </AbsoluteFill>

      {/* procedural fire wipe */}
      {fireIntensity > 0.01 ? (
        <AbsoluteFill style={{ opacity: fireIntensity, mixBlendMode: 'screen' }}>
          <svg width="100%" height="100%" preserveAspectRatio="none">
            <defs>
              <linearGradient id="fireGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stopColor={theme.fire.main} />
                <stop offset="50%" stopColor={theme.fire.glow} />
                <stop offset="100%" stopColor="#000000" />
              </linearGradient>
              <filter id="fireWipe">
                <feTurbulence type="fractalNoise" baseFrequency="0.02 0.05" numOctaves="3" seed={Math.floor(frame / 2)} stitchTiles="stitch" />
                <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 0.3  0 0 0 0 0  0 0 0 -3 1.5" />
              </filter>
            </defs>
            <rect width="100%" height="100%" fill="url(#fireGrad)" filter="url(#fireWipe)" />
          </svg>
        </AbsoluteFill>
      ) : null}

      {/* floating embers */}
      <AbsoluteFill style={{ mixBlendMode: 'screen' }}>
        {embers.map((e) => (
          <div
            key={e.id}
            style={{
              position: 'absolute',
              left: `${e.x + e.drift}%`,
              top: `${e.y}%`,
              width: e.size,
              height: e.size,
              backgroundColor: theme.fire.glow,
              borderRadius: '50%',
              boxShadow: `0 0 8px ${theme.fire.main}`,
              opacity: e.opacity,
            }}
          />
        ))}
      </AbsoluteFill>

      {/* lower-left title */}
      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'flex-start', padding: '8%', opacity: textOpacity, transform: `translateY(${textY}px)` }}>
        <h1 style={{ fontFamily: playfair, fontWeight: 700, fontSize: 78, color: theme.textPrimary, margin: 0, textShadow: '0 2px 14px rgba(0,0,0,0.9)', maxWidth: '62%', lineHeight: 1.1 }}>
          {title}
        </h1>
        <p style={{ fontFamily: inter, fontWeight: 600, fontSize: 30, color: theme.fire.main, margin: '14px 0 0 0', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          {subtitle}
        </p>
      </AbsoluteFill>

      <AbsoluteFill style={{ background: 'radial-gradient(circle, transparent 30%, rgba(0,0,0,0.9) 100%)', pointerEvents: 'none' }} />
      <AbsoluteFill style={{ opacity: 0.12, mixBlendMode: 'overlay', pointerEvents: 'none' }}>
        <svg width="100%" height="100%">
          <filter id="fireGrain">
            <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#fireGrain)" />
        </svg>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- FontRollDecoder: kinetic typography, scramble-decode per word ----------

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%&*';
const ACCENT_COLORS = ['#00FFFF', '#FF00FF', '#FFFF00'];

const RollingWord: React.FC<{
  word: string;
  index: number;
  size: number;
  isAccent?: boolean;
  delay: number;
  fonts: string[];
  accents: string[];
}> = ({ word, index, size, isAccent, delay, fonts, accents }) => {
  const frame = useCurrentFrame();
  const steppedFrame = Math.floor(frame / 3); // 10fps roll keeps the decode readable

  const isEntered = frame > delay;
  const scale = !isEntered ? 0 : frame < delay + 2 ? 1.5 : 1.0;

  const jitterX = Math.sin(steppedFrame * 1.3 + index) * 4;
  const jitterY = Math.cos(steppedFrame * 1.8 + index) * 4;
  const rotate = Math.sin(steppedFrame * 0.9 + index) * 2;

  const currentFont = fonts[(steppedFrame + index) % fonts.length];
  const color = isAccent ? accents[(steppedFrame + index) % accents.length] : '#FFFFFF';

  const isGlitching = steppedFrame % 12 < 2;
  const shadow = isGlitching ? '3px 0 #FF00FF, -3px 0 #00FFFF' : 'none';

  // decoder: letters lock in left-to-right over 15 frames after entry
  const revealProgress = interpolate(frame, [delay, delay + 15], [0, word.length], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.linear,
  });
  const displayed = word
    .split('')
    .map((char, i) => (i < Math.floor(revealProgress) ? char : CHARS[Math.floor(((steppedFrame + i) * 7) % CHARS.length)]))
    .join('');

  return (
    <span
      style={{
        display: 'inline-block',
        fontFamily: currentFont,
        fontSize: size,
        color,
        margin: '0 12px',
        transform: `translate(${jitterX}px, ${jitterY}px) rotate(${rotate}deg) scale(${scale})`,
        textShadow: shadow,
        verticalAlign: 'middle',
        textTransform: 'uppercase',
        minWidth: `${word.length * 0.55}em`, // hold space while fonts roll
        textAlign: 'center',
      }}
    >
      {displayed}
    </span>
  );
};

export const FontRollDecoder: React.FC<{
  words: Array<{ text: string; size: number; isAccent?: boolean }>;
  /** scene-local frames at which each word enters (from real narration timing) */
  wordDelays?: number[];
}> = ({ words, wordDelays }) => {
  const theme = useTheme();
  const kineticAccents = theme.name === 'gold' ? ACCENT_COLORS : [theme.accent, theme.captionActive, theme.textPrimary];
  const frame = useCurrentFrame();
  const steppedFrame = Math.floor(frame / 2);
  const fonts = [oswald, playfair, '"Courier New", monospace', montserrat, 'Georgia, serif'];

  const isWiping = steppedFrame % 25 < 2;
  const wipeX = isWiping ? (steppedFrame % 2 === 0 ? 60 : -60) : 0;
  const isFlashing = steppedFrame % 50 === 0 && frame > 10;

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ transform: `translateX(${wipeX}px)`, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', maxWidth: '88%' }}>
        {words.map((w, i) => (
          <RollingWord key={i} word={w.text} size={w.size} isAccent={w.isAccent} index={i} delay={wordDelays?.[i] ?? i * 6} fonts={fonts} accents={kineticAccents} />
        ))}
      </div>

      {isFlashing ? <AbsoluteFill style={{ backgroundColor: '#B30000', zIndex: 10, mixBlendMode: 'multiply' }} /> : null}

      {/* drifting light leak */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${interpolate(frame, [0, 90], [-20, 120], { extrapolateRight: 'clamp' })}% 50%, rgba(255,100,0,0.45) 0%, transparent 40%)`,
          mixBlendMode: 'screen',
          pointerEvents: 'none',
        }}
      />

      <AbsoluteFill style={{ opacity: 0.28, mixBlendMode: 'overlay', pointerEvents: 'none' }}>
        <svg width="100%" height="100%">
          <filter id="rollGrain">
            <feTurbulence type="fractalNoise" baseFrequency="1.5" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#rollGrain)" />
        </svg>
      </AbsoluteFill>

      {/* dust flashes */}
      {steppedFrame % 12 < 1 ? (
        <AbsoluteFill style={{ opacity: 0.5, mixBlendMode: 'screen', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: '10%', left: '30%', width: 2, height: '70%', background: 'white', transform: 'rotate(10deg)' }} />
          <div style={{ position: 'absolute', top: '40%', left: '80%', width: 1, height: '50%', background: 'white', transform: 'rotate(-5deg)' }} />
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

// ---------- SocialJustice: alpha-matte word window + duotone chapter ----------

// duotone palette now comes from the active theme

export const SocialJustice: React.FC<{
  images?: string[];
  matteText: string;
  words: Array<{ text: string; size: number; type: 'serif' | 'sans' }>;
  duotone?: 'warm' | 'cool' | 'gold';
}> = ({ images = [], matteText, words, duotone = 'warm' }) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const img = images[0] ?? 'placeholder.jpg';
  const color = theme.duotone[duotone] ?? theme.duotone.warm;

  const cameraScale = interpolate(frame, [0, durationInFrames], [1.0, 1.15], { easing: Easing.linear, extrapolateRight: 'clamp' });
  const tracking = interpolate(frame, [0, durationInFrames], [0, 12], { easing: Easing.linear, extrapolateRight: 'clamp' });
  const textScale = interpolate(frame, [0, 4], [1.5, 1.0], { easing: Easing.bezier(0.1, 0.9, 0.2, 1), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const isGlitching = frame < 5 || frame % 30 < 3;
  const rgbOffset = isGlitching ? 4 : 0;
  const leakX = interpolate(frame, [0, durationInFrames], [-50, 150], { easing: Easing.linear });

  const matteSize = Math.min(520, Math.round((2400 / Math.max(matteText.length, 4)) * 1.1));

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      {/* the giant word acting as an image window */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', transform: `scale(${cameraScale})` }}>
        <h1
          style={{
            fontFamily: playfair,
            fontWeight: 700,
            fontSize: matteSize,
            margin: 0,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            backgroundImage: `url(${staticFile(img)})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundColor: color,
            backgroundBlendMode: 'multiply',
            textShadow: rgbOffset ? `${rgbOffset}px 0 rgba(255,0,0,0.5), ${-rgbOffset}px 0 rgba(0,255,255,0.5)` : 'none',
            whiteSpace: 'nowrap',
            textTransform: 'uppercase',
          }}
        >
          {matteText}
        </h1>
      </AbsoluteFill>

      {/* duotone wash */}
      <AbsoluteFill style={{ backgroundColor: color, mixBlendMode: 'color', opacity: 0.65, pointerEvents: 'none' }} />

      {/* foreground fragment */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '5% 10%', opacity: frame < 2 ? 0 : 1 }}>
        <div
          style={{
            transform: `scale(${textScale})`,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'baseline',
            maxWidth: '90%',
            letterSpacing: `${tracking}px`,
          }}
        >
          {words.map((w, i) => (
            <span
              key={i}
              style={{
                display: 'inline-block',
                margin: '0 14px',
                color: '#FFFFFF',
                textShadow: `0 3px 20px rgba(0,0,0,0.9)${rgbOffset ? `, ${rgbOffset}px 0 rgba(255,0,0,0.5), ${-rgbOffset}px 0 rgba(0,255,255,0.5)` : ''}`,
                fontFamily: w.type === 'serif' ? playfair : montserrat,
                fontWeight: w.type === 'serif' ? 500 : 800,
                fontStyle: w.type === 'serif' ? 'italic' : 'normal',
                fontSize: w.size,
                lineHeight: 1.1,
              }}
            >
              {w.text}
            </span>
          ))}
        </div>
      </AbsoluteFill>

      {/* light leak + grain */}
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${leakX}% 50%, rgba(255,255,255,0.35) 0%, transparent 40%)`, mixBlendMode: 'screen', pointerEvents: 'none' }} />
      <AbsoluteFill style={{ opacity: 0.12, mixBlendMode: 'overlay', pointerEvents: 'none' }}>
        <svg width="100%" height="100%">
          <filter id="sjNoise">
            <feTurbulence type="fractalNoise" baseFrequency="1.5" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#sjNoise)" />
        </svg>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
