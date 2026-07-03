import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { oswald, inter } from '../fonts';
import { useTheme } from '../theme';

export interface Credit {
  provider: string;
  author?: string;
  license?: string;
  sourceUrl?: string;
  title?: string;
}

const PROVIDER_NAMES: Record<string, string> = {
  wikimedia: 'Wikimedia Commons',
  openverse: 'Openverse',
  pixabay: 'Pixabay',
  pexels: 'Pexels',
  flux: 'AI-generated (FLUX.1-dev)',
};

/**
 * Attribution end card. CC BY / BY-SA imagery legally requires attribution —
 * this scene renders the ledger the pipeline collected.
 */
export const Credits: React.FC<{ credits?: Credit[] }> = ({ credits = [] }) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const shown = credits.slice(0, 14);
  const extra = credits.length - shown.length;
  const headerReveal = spring({ frame, fps, config: { damping: 200 } });

  const line = (c: Credit) => {
    const parts: string[] = [];
    if (c.author) parts.push(c.author);
    if (c.license) parts.push(c.license);
    parts.push(PROVIDER_NAMES[c.provider] ?? c.provider);
    return parts.join(' · ');
  };

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, justifyContent: 'center', alignItems: 'center', padding: '6%' }}>
      <div style={{ opacity: headerReveal, transform: `translateY(${(1 - headerReveal) * 20}px)`, textAlign: 'center', marginBottom: 44 }}>
        <div style={{ fontFamily: oswald, fontWeight: 700, fontSize: 44, color: theme.textPrimary, letterSpacing: '0.25em', textTransform: 'uppercase' }}>
          Sources & Credits
        </div>
        <div style={{ width: 120, height: 2, backgroundColor: theme.accent, margin: '18px auto 0' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: shown.length > 7 ? '1fr 1fr' : '1fr', columnGap: 70, rowGap: 14, maxWidth: '86%' }}>
        {shown.map((c, i) => {
          const reveal = interpolate(frame, [10 + i * 3, 25 + i * 3], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <div key={i} style={{ fontFamily: inter, fontSize: 21, color: theme.textSecondary, opacity: reveal, lineHeight: 1.4 }}>
              {c.title ? <span style={{ color: theme.textPrimary, fontWeight: 600 }}>{c.title.slice(0, 55)}</span> : null}
              {c.title ? ' — ' : ''}
              {line(c)}
            </div>
          );
        })}
      </div>
      {extra > 0 ? (
        <div style={{ fontFamily: inter, fontSize: 20, color: theme.textSecondary, marginTop: 24 }}>+ {extra} more</div>
      ) : null}
    </AbsoluteFill>
  );
};
