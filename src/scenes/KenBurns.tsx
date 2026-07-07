import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { useMontage } from './useMontage';
import { useTheme, gradeFilter } from '../theme';

/**
 * The montage workhorse. Three channel-selectable visual languages (see
 * pipeline/variants.ts), all sharing the same montage timing + focal motion:
 *  - classic   — blurred side-fill + height-fit contained image (default)
 *  - fullbleed — image fills the frame, stronger zoom, heavy edge vignette
 *  - framed    — image inset with an accent border on a solid ground (editorial)
 * Direction alternates by image index so consecutive stills never move the same way.
 */
export const KenBurns: React.FC<{
  images?: string[];
  focalPoints?: ({ x: number; y: number } | null)[];
  imageTones?: (string | null)[];
  variant?: string;
}> = ({ images = [], focalPoints, imageTones, variant }) => {
  const theme = useTheme();
  const imgs = images.length > 0 ? images : ['placeholder.jpg'];
  const m = useMontage(imgs.length);
  const v = variant === 'fullbleed' || variant === 'framed' ? variant : 'classic';

  // With a known focal point the camera zooms INTO the subject and drifts
  // toward it; without one it falls back to alternating blind moves.
  const motion = (index: number, localFrame: number) => {
    const p = localFrame / m.perImage;
    const fp = focalPoints?.[index] ?? null;
    const zoomIn = index % 2 === 0;
    // anchored at the height-fit state: zoom-in starts at 1.0, zoom-out ends at 1.0
    const scale = zoomIn ? 1.0 + 0.16 * p : 1.16 - 0.16 * p;
    const panX = fp ? (0.5 - fp.x) * 110 * p : (index % 3 === 0 ? 1 : -1) * 52 * p;
    const panY = fp ? (0.5 - fp.y) * 50 * p : (index % 2 === 0 ? -1 : 1) * 22 * p;
    const rot = (index % 2 === 0 ? -1 : 1) * 0.7 * p; // subtle drift keeps stills alive
    return {
      transform: `scale(${scale}) translate(${panX}px, ${panY}px) rotate(${rot}deg)`,
      transformOrigin: fp ? `${fp.x * 100}% ${fp.y * 100}%` : '50% 50%',
    };
  };

  const renderLayer = (index: number, localFrame: number, opacity: number) => {
    const grade = gradeFilter(theme, imageTones?.[index]);
    const mo = motion(index, localFrame);

    if (v === 'fullbleed') {
      // image fills the whole frame — immersive/cinematic
      return (
        <AbsoluteFill key={index} style={{ opacity }}>
          <Img src={staticFile(imgs[index])} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: grade, ...mo }} />
        </AbsoluteFill>
      );
    }

    if (v === 'framed') {
      // inset image with an accent border on the theme ground — editorial/gallery
      return (
        <AbsoluteFill key={index} style={{ opacity, backgroundColor: theme.bg }}>
          <AbsoluteFill
            style={{
              margin: '5.5% 6%',
              overflow: 'hidden',
              borderRadius: 4,
              border: `2px solid ${theme.accent}`,
              boxShadow: '0 30px 90px rgba(0,0,0,0.55)',
            }}
          >
            <Img src={staticFile(imgs[index])} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: grade, ...mo }} />
          </AbsoluteFill>
        </AbsoluteFill>
      );
    }

    // classic (default): blurred side-fill + height-fit contained foreground
    return (
      <AbsoluteFill key={index} style={{ opacity }}>
        <Img
          src={staticFile(imgs[index])}
          style={{ width: '100%', height: '100%', objectFit: 'cover', filter: `${grade} blur(45px) brightness(0.45)`, transform: 'scale(1.15)' }}
        />
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
          <Img
            src={staticFile(imgs[index])}
            style={{ height: '100%', width: 'auto', filter: grade, ...mo, boxShadow: '0 30px 90px rgba(0,0,0,0.6)' }}
          />
        </AbsoluteFill>
      </AbsoluteFill>
    );
  };

  const vignette =
    v === 'fullbleed'
      ? 'radial-gradient(circle, transparent 40%, rgba(0,0,0,0.72) 100%)'
      : v === 'framed'
        ? null
        : 'radial-gradient(circle, transparent 55%, rgba(0,0,0,0.5) 100%)';

  return (
    <AbsoluteFill style={{ backgroundColor: v === 'framed' ? theme.bg : '#000', overflow: 'hidden' }}>
      {renderLayer(m.base.index, m.base.localFrame, 1)}
      {m.overlay && renderLayer(m.overlay.index, m.overlay.localFrame, m.overlay.opacity)}
      {vignette && <AbsoluteFill style={{ background: vignette, pointerEvents: 'none' }} />}
    </AbsoluteFill>
  );
};
