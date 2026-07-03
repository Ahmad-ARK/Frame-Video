import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion';
import { oswald, playfair } from '../fonts';
import { useTheme } from '../theme';

/** Jagged stop-motion time: quantize the clock to N-frame steps. */
const useSteppedFrame = (step = 2) => {
  const frame = useCurrentFrame();
  return Math.floor(frame / step) * step;
};

const fitFont = (text: string, budget: number, min: number, max: number) =>
  Math.round(Math.min(max, Math.max(min, budget / Math.max(text.length, 1))));

// ---------- GrungeCollage: punk manifesto card (stop-motion, accent wipe) ----------

export const GrungeCollage: React.FC<{
  images?: string[];
  title: string;
  bodyText: string;
  accentColor?: string;
}> = ({ images = [], title, bodyText, accentColor }) => {
  const theme = useTheme();
  const accent = accentColor ?? theme.accent;
  const steppedFrame = useSteppedFrame(2);
  const img = images[0] ?? 'placeholder.jpg';

  // projector gate weave
  const weaveX = Math.sin(steppedFrame * 0.8) * 1.5 + Math.sin(steppedFrame * 0.3);
  const weaveY = Math.cos(steppedFrame * 0.6) * 1.5 + Math.cos(steppedFrame * 0.4);
  const flicker = interpolate(steppedFrame % 4, [0, 1, 2, 3, 4], [0.85, 1, 0.92, 1, 0.88]);

  const titleVisible = steppedFrame > 8 ? 1 : 0;
  const bodyVisible = steppedFrame > 18 ? 1 : 0;
  const blockWipe = interpolate(steppedFrame, [10, 24], [0, 100], {
    easing: Easing.out(Easing.ease),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#050505', opacity: flicker, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `translate(${weaveX}px, ${weaveY}px)` }}>
        <Img
          src={staticFile(img)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(100%) contrast(1.25) brightness(0.7)' }}
        />
        <AbsoluteFill style={{ background: 'radial-gradient(circle, transparent 30%, rgba(0,0,0,0.92) 100%)' }} />
      </AbsoluteFill>

      {/* accent block wipe behind the title */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div
          style={{
            position: 'absolute',
            height: 120,
            width: `${blockWipe}%`,
            backgroundColor: accent,
            transform: 'translateY(6px)',
            mixBlendMode: 'multiply',
          }}
        />
      </AbsoluteFill>

      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', transform: `translate(${weaveX}px, ${weaveY}px)`, padding: '0 6%' }}>
        <h1
          style={{
            fontFamily: oswald,
            fontWeight: 700,
            fontSize: fitFont(title, 2100, 90, 180),
            color: '#FFFFFF',
            margin: 0,
            opacity: titleVisible,
            textTransform: 'uppercase',
            letterSpacing: '-2px',
            lineHeight: 0.9,
            textAlign: 'center',
            textShadow: '3px 3px 0px rgba(0,0,0,0.6)',
            zIndex: 2,
          }}
        >
          {title}
        </h1>
        <p
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 26,
            fontWeight: 700,
            color: '#FFFFFF',
            opacity: bodyVisible * 0.9,
            maxWidth: '56%',
            marginTop: 26,
            textAlign: 'center',
            zIndex: 2,
            mixBlendMode: 'difference',
          }}
        >
          {bodyText}
        </p>
      </AbsoluteFill>

      {/* film grain */}
      <AbsoluteFill style={{ opacity: 0.25, mixBlendMode: 'screen', pointerEvents: 'none' }}>
        <svg width="100%" height="100%">
          <filter id="grungeNoise">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2 1.5" />
          </filter>
          <rect width="100%" height="100%" filter="url(#grungeNoise)" />
        </svg>
      </AbsoluteFill>

      {/* scratch flashes */}
      {steppedFrame % 30 < 2 ? (
        <AbsoluteFill style={{ mixBlendMode: 'screen', opacity: 0.6 }}>
          <div style={{ position: 'absolute', left: '40%', top: '10%', width: 2, height: '80%', background: 'white', transform: 'rotate(5deg)' }} />
          <div style={{ position: 'absolute', left: '70%', top: 0, width: 1, height: '100%', background: 'white', transform: 'rotate(-2deg)' }} />
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

// ---------- InvestigationOpener: case-file scrapbook (jitter camera, taped photo) ----------

const ScrapItem: React.FC<{
  children: React.ReactNode;
  delay: number;
  rotation: number;
  top: string;
  left: string;
  width: string;
  zIndex: number;
}> = ({ children, delay, rotation, top, left, width, zIndex }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = frame < delay ? 0.8 : interpolate(frame, [delay, durationInFrames], [1.0, 1.05], { easing: Easing.linear });
  return (
    <div style={{ position: 'absolute', top, left, width, transform: `rotate(${rotation}deg) scale(${scale})`, zIndex, opacity: frame < delay ? 0 : 1 }}>
      {children}
    </div>
  );
};

export const InvestigationOpener: React.FC<{ images?: string[]; title: string; caseFileText: string }> = ({
  images = [],
  title,
  caseFileText,
}) => {
  const theme = useTheme();
  const steppedFrame = useSteppedFrame(2);
  const img = images[0] ?? 'placeholder.jpg';

  // jitter camera: fake perlin via overlapping sines
  const jx = Math.sin(steppedFrame * 1.3) * 4 + Math.cos(steppedFrame * 2.1) * 3;
  const jy = Math.cos(steppedFrame * 1.8) * 4 + Math.sin(steppedFrame * 2.5) * 2;
  const jr = Math.sin(steppedFrame * 0.7) * 0.8;

  const flicker = interpolate(steppedFrame % 6, [0, 2, 4, 6], [0.6, 0.9, 0.7, 1.0]);
  const vignetteOpacity = interpolate(steppedFrame % 8, [0, 4, 8], [0.8, 0.6, 0.9]);
  const rgbSplit = steppedFrame % 10 < 2 ? 3 : 1;

  return (
    <AbsoluteFill style={{ backgroundColor: theme.paperAged, overflow: 'hidden' }}>
      {/* aged paper stains */}
      <AbsoluteFill style={{ opacity: 0.6, mixBlendMode: 'multiply' }}>
        <svg width="100%" height="100%">
          <filter id="paperStains">
            <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="5" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.5" />
            </feComponentTransfer>
          </filter>
          <rect width="100%" height="100%" filter="url(#paperStains)" fill={theme.paper} />
        </svg>
      </AbsoluteFill>

      <AbsoluteFill style={{ transform: `translate(${jx}px, ${jy}px) rotate(${jr}deg)` }}>
        {/* photo */}
        <ScrapItem delay={5} rotation={-4} top="16%" left="30%" width="38%" zIndex={2}>
          <div style={{ border: `14px solid ${theme.ink}`, boxShadow: '6px 6px 14px rgba(0,0,0,0.35)', overflow: 'hidden', aspectRatio: '4 / 3' }}>
            <Img
              src={staticFile(img)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(100%) sepia(0.4) contrast(1.2) brightness(0.9)' }}
            />
          </div>
        </ScrapItem>

        {/* title bar */}
        <ScrapItem delay={9} rotation={3} top="9%" left="9%" width="46%" zIndex={3}>
          <div style={{ backgroundColor: theme.ink, padding: '6px 18px', display: 'inline-block' }}>
            <h1
              style={{
                fontFamily: playfair,
                fontWeight: 700,
                fontSize: fitFont(title, 900, 44, 74),
                color: theme.paper,
                margin: 0,
                textShadow: `${rgbSplit}px 0 rgba(255,0,0,0.7), ${-rgbSplit}px 0 rgba(0,255,255,0.7)`,
                whiteSpace: 'nowrap',
              }}
            >
              {title}
            </h1>
          </div>
        </ScrapItem>

        {/* case file text */}
        <ScrapItem delay={14} rotation={-2} top="66%" left="46%" width="40%" zIndex={4}>
          <div style={{ backgroundColor: theme.ink, width: '60%', height: 5, marginBottom: 10 }} />
          <p
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 26,
              fontWeight: 700,
              color: theme.ink,
              margin: 0,
              backgroundColor: `${theme.paper}d9`,
              padding: 8,
              lineHeight: 1.25,
            }}
          >
            {caseFileText}
          </p>
        </ScrapItem>
      </AbsoluteFill>

      {/* film dirt */}
      <AbsoluteFill style={{ opacity: flicker * 0.5, mixBlendMode: 'multiply', pointerEvents: 'none' }}>
        <svg width="100%" height="100%">
          <filter id="filmDirt">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch" />
            <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2 1.5" />
          </filter>
          <rect width="100%" height="100%" filter="url(#filmDirt)" />
        </svg>
        <div style={{ position: 'absolute', left: `${20 + (steppedFrame % 10) * 3}%`, top: 0, width: 2, height: '100%', background: theme.ink, opacity: 0.7 }} />
        <div style={{ position: 'absolute', left: `${80 - (steppedFrame % 8) * 2}%`, top: 0, width: 1, height: '100%', background: theme.ink, opacity: 0.5 }} />
      </AbsoluteFill>

      <AbsoluteFill
        style={{ background: 'radial-gradient(circle, transparent 30%, rgba(0,0,0,0.9) 100%)', opacity: vignetteOpacity, pointerEvents: 'none' }}
      />

      {/* projector exposure flash */}
      {steppedFrame % 40 < 2 ? <AbsoluteFill style={{ backgroundColor: theme.paper, opacity: 0.5, mixBlendMode: 'overlay' }} /> : null}
    </AbsoluteFill>
  );
};

// ---------- NewspaperAnnotation: academic red-marker breakdown ----------

const HandDrawn: React.FC<{ type: 'circle' | 'underline'; delay: number }> = ({ type, delay }) => {
  const theme = useTheme();
  const steppedFrame = useSteppedFrame(2);
  const drawProgress = interpolate(steppedFrame, [delay, delay + 15], [100, 0], {
    easing: Easing.out(Easing.ease),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <svg
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
      viewBox={type === 'circle' ? '0 0 100 100' : '0 0 100 20'}
      preserveAspectRatio="none"
    >
      <g stroke={theme.marker} strokeWidth={type === 'circle' ? 3 : 4} fill="none" strokeLinecap="round" filter="url(#roughen)">
        {type === 'circle' ? (
          <ellipse cx="50" cy="50" rx="45" ry="44" pathLength={100} strokeDasharray={100} strokeDashoffset={drawProgress} transform="rotate(-5 50 50)" />
        ) : (
          <path d="M 4 10 Q 50 4, 96 11" pathLength={100} strokeDasharray={100} strokeDashoffset={drawProgress} />
        )}
      </g>
    </svg>
  );
};

export const NewspaperAnnotation: React.FC<{
  images?: string[];
  headline: string;
  bodyText: string;
  caption?: string;
}> = ({ images = [], headline, bodyText, caption }) => {
  const theme = useTheme();
  const steppedFrame = useSteppedFrame(2);
  const img = images[0] ?? 'placeholder.jpg';

  const scale = interpolate(steppedFrame, [0, 60], [1.0, 1.05], { extrapolateRight: 'clamp' });
  const imageVisible = steppedFrame > 5 ? 1 : 0;
  const textVisible = steppedFrame > 10 ? 1 : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: theme.paper, overflow: 'hidden' }}>
      {/* shared roughen filter for the hand-drawn marks */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <filter id="roughen">
            <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="4" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      {/* graph paper */}
      <AbsoluteFill
        style={{
          backgroundColor: theme.paper,
          backgroundImage:
            `linear-gradient(${theme.ink}1f 1px, transparent 1px), linear-gradient(90deg, ${theme.ink}1f 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
          transform: `scale(${scale})`,
        }}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          height: '100%',
          width: '100%',
          padding: '6% 8%',
          boxSizing: 'border-box',
          gap: 60,
          transform: `scale(${scale})`,
          position: 'absolute',
        }}
      >
        {/* image with red circle */}
        <div style={{ position: 'relative', opacity: imageVisible, display: 'flex', alignItems: 'center' }}>
          <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', boxShadow: '3px 3px 8px rgba(0,0,0,0.3)' }}>
            <Img src={staticFile(img)} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(100%) contrast(1.1)' }} />
            <div style={{ position: 'absolute', top: '18%', left: '20%', width: '45%', height: '55%' }}>
              <HandDrawn type="circle" delay={20} />
            </div>
            {caption ? (
              <p style={{ fontFamily: '"Times New Roman", serif', fontSize: 20, color: theme.ink, margin: '10px 0 0 0', fontStyle: 'italic' }}>{caption}</p>
            ) : null}
          </div>
        </div>

        {/* headline + body */}
        <div style={{ opacity: textVisible, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ position: 'relative', display: 'inline-block', marginBottom: 34, width: 'fit-content' }}>
            <h1
              style={{
                fontFamily: '"Times New Roman", Georgia, serif',
                fontWeight: 700,
                fontSize: fitFont(headline, 1300, 52, 84),
                color: theme.ink,
                margin: 0,
                lineHeight: 1.05,
              }}
            >
              {headline}
            </h1>
            <div style={{ position: 'absolute', bottom: -16, left: 0, width: '100%', height: 20 }}>
              <HandDrawn type="underline" delay={32} />
            </div>
          </div>
          <p style={{ fontFamily: '"Times New Roman", Georgia, serif', fontSize: 27, color: theme.ink, lineHeight: 1.5, margin: 0, textAlign: 'justify' }}>
            {bodyText}
          </p>
        </div>
      </div>

      {/* paper grain */}
      <AbsoluteFill style={{ opacity: 0.1, mixBlendMode: 'multiply', pointerEvents: 'none' }}>
        <svg width="100%" height="100%">
          <filter id="npTexture">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#npTexture)" />
        </svg>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
