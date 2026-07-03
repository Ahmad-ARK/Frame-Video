import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { oswald } from './fonts';
import { resolveTheme } from './theme';

export interface ThumbnailProps {
  title: string;
  image: string;
  theme?: string;
  [key: string]: unknown;
}

/**
 * 1280x720 thumbnail: full-bleed image, hard left gradient, giant condensed
 * title with the last word in gold. Rendered via renderStill after the video.
 */
const STOPWORDS = new Set(['THE', 'A', 'AN', 'OF', 'AND', 'THAT', 'THIS', 'TO', 'IN', 'ON', 'FOR', 'WITH', 'BY']);

export const Thumbnail: React.FC<ThumbnailProps> = ({ title, image, theme: themeName }) => {
  const theme = resolveTheme(themeName);
  const words = title.toUpperCase().split(/\s+/).slice(0, 6);
  // never end the headline on a connector word ("...CONNECTED THE")
  while (words.length > 2 && STOPWORDS.has(words[words.length - 1])) words.pop();
  const lastWord = words.length > 1 ? words.pop()! : null;
  const shown = [...words, lastWord].filter(Boolean).join(' ');
  // worst case every word wraps to its own line: keep the stack inside 720px
  const lineCount = shown.split(' ').length;
  const fontSize = Math.round(Math.min(150, 3400 / Math.max(shown.length, 10) + 40, 520 / Math.max(lineCount, 1)));

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Img
        src={staticFile(image)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', filter: theme.name === 'gold' ? 'saturate(1.15) contrast(1.1)' : `${theme.imageFilter} contrast(1.12)` }}
      />
      <AbsoluteFill style={{ background: 'linear-gradient(100deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 42%, transparent 68%)' }} />
      <AbsoluteFill style={{ background: 'radial-gradient(circle, transparent 55%, rgba(0,0,0,0.5) 100%)' }} />
      <AbsoluteFill style={{ justifyContent: 'center', padding: '0 6%' }}>
        <div style={{ width: 110, height: 8, backgroundColor: theme.accent, marginBottom: 30 }} />
        <h1
          style={{
            fontFamily: oswald,
            fontWeight: 700,
            fontSize,
            color: '#FFFFFF',
            margin: 0,
            lineHeight: 1.02,
            textTransform: 'uppercase',
            maxWidth: '62%',
            textShadow: '0 6px 30px rgba(0,0,0,0.95)',
          }}
        >
          {words.join(' ')}
          {lastWord ? (
            <>
              {' '}
              <span style={{ color: theme.captionActive }}>{lastWord}</span>
            </>
          ) : null}
        </h1>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
