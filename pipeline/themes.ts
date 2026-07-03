/** Pipeline-side theme knowledge (the visual tokens live in src/theme.ts). */

export const THEME_NAMES = ['gold', 'noir', 'vintage'] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

export function isTheme(s: string): s is ThemeName {
  return (THEME_NAMES as readonly string[]).includes(s);
}

/** When no theme is set anywhere, derive one from the script's mood. */
export function themeFromMood(mood?: string): ThemeName {
  switch (mood) {
    case 'tense':
      return 'noir';
    case 'somber':
      return 'vintage';
    default:
      return 'gold';
  }
}

/** FLUX prompts get a per-theme style suffix so generated images are born on-theme. */
export const FLUX_STYLES: Record<ThemeName, string> = {
  gold: 'Cinematic documentary illustration, painterly archival style, muted earthy tones, dramatic soft lighting, high detail, no text, no watermark, no modern elements.',
  noir: 'High-contrast black and white documentary photograph, film noir lighting, deep shadows, heavy grain, dramatic chiaroscuro, no text, no watermark, no modern elements.',
  vintage: 'Aged sepia archival photograph, early 20th century plate camera look, warm parchment tones, soft vignette, scratches and dust, no text, no watermark, no modern elements.',
};
