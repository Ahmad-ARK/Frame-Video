import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { oswald } from './fonts';
import { resolveTheme, gradeFilter, type Theme } from './theme';

export type ThumbnailLayout = 'subject' | 'split' | 'full';

export interface ThumbnailProps {
  title: string;
  image: string;
  thumbText?: string;
  /** background-removed PNG (public-relative) — enables the 'subject' layout */
  cutout?: string;
  theme?: string;
  layout?: ThumbnailLayout;
  [key: string]: unknown;
}

const STOPWORDS = new Set(['THE', 'A', 'AN', 'OF', 'AND', 'THAT', 'THIS', 'TO', 'IN', 'ON', 'FOR', 'WITH', 'BY']);

/** Fall back to a stopword-trimmed title when no thumbText was written. */
function deriveWords(title: string, thumbText?: string): string[] {
  if (thumbText && thumbText.trim()) return thumbText.trim().toUpperCase().split(/\s+/).slice(0, 4);
  const words = title.toUpperCase().split(/\s+/).slice(0, 6);
  while (words.length > 2 && STOPWORDS.has(words[words.length - 1])) words.pop();
  return words.slice(0, 5);
}

/** Shrink-to-fit: shorter text → bigger type, longer text → smaller, both clamped. */
function fitSize(words: string[], budget: number, min: number, max: number): number {
  const text = words.join(' ');
  const lineCount = words.length;
  return Math.round(Math.min(max, budget / Math.max(text.length, 10), (720 - 120) / Math.max(lineCount, 1) / 1.15, max));
}

const STROKE = '7px rgba(0,0,0,0.65)';
const HEADLINE_SHADOW = '0 8px 34px rgba(0,0,0,0.9)';

/** Big headline shared across layouts: all-white except the last word in the theme's caption-active color. */
const Headline: React.FC<{ words: string[]; fontSize: number; maxWidth: string; theme: Theme; align?: 'left' | 'center' }> = ({
  words,
  fontSize,
  maxWidth,
  theme,
  align = 'left',
}) => {
  const lastWord = words.length > 1 ? words[words.length - 1] : null;
  const rest = lastWord ? words.slice(0, -1) : words;
  return (
    <h1
      style={{
        fontFamily: oswald,
        fontWeight: 700,
        fontSize,
        color: '#FFFFFF',
        margin: 0,
        lineHeight: 1.03,
        textTransform: 'uppercase',
        maxWidth,
        textAlign: align,
        textShadow: HEADLINE_SHADOW,
        WebkitTextStroke: STROKE,
        paintOrder: 'stroke fill',
      }}
    >
      {rest.join(' ')}
      {lastWord ? (
        <>
          {rest.length > 0 ? ' ' : ''}
          <span style={{ color: theme.captionActive }}>{lastWord}</span>
        </>
      ) : null}
    </h1>
  );
};

const Kicker: React.FC<{ theme: Theme }> = ({ theme }) => (
  <div
    style={{
      display: 'inline-block',
      backgroundColor: theme.accent,
      color: theme.ink,
      fontFamily: oswald,
      fontWeight: 700,
      fontSize: 26,
      letterSpacing: '0.22em',
      padding: '8px 18px',
      marginBottom: 22,
      textTransform: 'uppercase',
    }}
  >
    Documentary
  </div>
);

/**
 * 1280x720 thumbnail. Three layouts, auto-selected: 'subject' when a
 * background-removed cutout is supplied (a hero pop with an accent outline),
 * else 'full' (graded full-bleed image + headline). 'split' is available as
 * an explicit choice for future two-image or portrait-source thumbnails.
 */
export const Thumbnail: React.FC<ThumbnailProps> = ({ title, image, thumbText, cutout, theme: themeName, layout }) => {
  const theme = resolveTheme(themeName);
  const words = deriveWords(title, thumbText);
  const resolvedLayout: ThumbnailLayout = layout ?? (cutout ? 'subject' : 'full');

  if (resolvedLayout === 'subject' && cutout) {
    const fontSize = fitSize(words, 2000, 110, 150);
    // outline trick: a solid-accent silhouette behind the cutout, built from
    // four cardinal drop-shadows of the transparent PNG's alpha channel
    const outlineFilter = [1, -1].flatMap((sx) => [1, -1].map((sy) => `drop-shadow(${6 * sx}px ${6 * sy}px 0 ${theme.accent})`)).join(' ');
    return (
      <AbsoluteFill style={{ backgroundColor: theme.bg }}>
        <Img
          src={staticFile(image)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', filter: `${gradeFilter(theme)} blur(10px) brightness(0.45)`, transform: 'scale(1.1)' }}
        />
        <AbsoluteFill style={{ background: 'radial-gradient(circle, transparent 30%, rgba(0,0,0,0.6) 100%)' }} />
        {/* silhouette outline, then the real cutout on top */}
        <div style={{ position: 'absolute', right: '2%', bottom: 0, height: '108%', display: 'flex', alignItems: 'flex-end' }}>
          <Img src={staticFile(cutout)} style={{ height: '100%', width: 'auto', filter: outlineFilter, position: 'absolute', right: 0, bottom: 0 }} />
          <Img src={staticFile(cutout)} style={{ height: '100%', width: 'auto', position: 'relative' }} />
        </div>
        <AbsoluteFill style={{ justifyContent: 'center', padding: '0 5% 0 6%' }}>
          <div style={{ maxWidth: '58%' }}>
            <Kicker theme={theme} />
            <Headline words={words} fontSize={fontSize} maxWidth="100%" theme={theme} />
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  if (resolvedLayout === 'split') {
    const fontSize = fitSize(words, 1650, 100, 130);
    return (
      <AbsoluteFill style={{ backgroundColor: theme.bg }}>
        <AbsoluteFill style={{ display: 'flex', flexDirection: 'row' }}>
          <div style={{ width: '55%', position: 'relative', backgroundColor: theme.bg }}>
            <AbsoluteFill style={{ justifyContent: 'center', padding: '0 7%' }}>
              {/* plain block wrapper: Kicker's inline-block sizing only works
                  outside a flex context, else it stretches to the column width */}
              <div>
                <Kicker theme={theme} />
                <Headline words={words} fontSize={fontSize} maxWidth="100%" theme={theme} />
              </div>
            </AbsoluteFill>
          </div>
          <div style={{ width: '45%', position: 'relative', overflow: 'hidden' }}>
            <Img
              src={staticFile(image)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', filter: `${gradeFilter(theme)} saturate(1.2) contrast(1.2)` }}
            />
          </div>
        </AbsoluteFill>
        {/* diagonal accent seam between the panels */}
        <div
          style={{
            position: 'absolute',
            left: '55%',
            top: 0,
            width: 14,
            height: '100%',
            backgroundColor: theme.accent,
            transform: 'skewX(-8deg) translateX(-50%)',
            boxShadow: `0 0 30px ${theme.accentGlow}`,
          }}
        />
      </AbsoluteFill>
    );
  }

  // full: graded full-bleed image + gradient + headline (the safe default)
  const fontSize = fitSize(words, 2400, 120, 150);
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <Img
        src={staticFile(image)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', filter: `${gradeFilter(theme)} saturate(1.25) contrast(1.15)` }}
      />
      <AbsoluteFill style={{ background: 'linear-gradient(100deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 42%, transparent 68%)' }} />
      <AbsoluteFill style={{ background: 'radial-gradient(circle, transparent 55%, rgba(0,0,0,0.5) 100%)' }} />
      <AbsoluteFill style={{ justifyContent: 'center', padding: '0 6%' }}>
        <div style={{ width: 110, height: 8, backgroundColor: theme.accent, marginBottom: 26 }} />
        <Headline words={words} fontSize={fontSize} maxWidth="66%" theme={theme} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
