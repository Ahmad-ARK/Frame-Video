import { useCurrentFrame, useVideoConfig } from 'remotion';

export interface MontageLayer {
  /** index into the images array */
  index: number;
  /** frames since this image's own window began (drives its motion) */
  localFrame: number;
  opacity: number;
}

export interface Montage {
  perImage: number;
  /** fully opaque image underneath */
  base: MontageLayer;
  /** image fading in on top during a crossfade, else null */
  overlay: MontageLayer | null;
}

/**
 * Shared multi-image timing for montage scenes.
 *
 * Fixes the "crossfade pop" of the old implementation: each image's motion is
 * driven by its OWN window clock. The outgoing image keeps moving past the end
 * of its window while the incoming one fades in already running its own
 * motion from zero — no scale snap at the boundary.
 */
export function useMontage(imageCount: number, fadeFrames = 12): Montage {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const count = Math.max(1, imageCount);
  const perImage = Math.max(1, Math.ceil(durationInFrames / count));
  const idx = Math.min(Math.floor(frame / perImage), count - 1);
  const intoWindow = frame - idx * perImage;
  const crossfading = idx > 0 && intoWindow < fadeFrames;

  if (!crossfading) {
    return {
      perImage,
      base: { index: idx, localFrame: intoWindow, opacity: 1 },
      overlay: null,
    };
  }
  return {
    perImage,
    base: { index: idx - 1, localFrame: frame - (idx - 1) * perImage, opacity: 1 },
    overlay: { index: idx, localFrame: intoWindow, opacity: intoWindow / fadeFrames },
  };
}
