import React from 'react';

/**
 * Video-wide visual identity. RULE: every scene component must work in every
 * theme — themes re-skin via these tokens, they never exclude scenes.
 * The image grade is what makes arbitrary stock/CC images look like one film.
 */
export interface Theme {
  name: string;

  // core palette
  accent: string; // rules, dots, dividers, underlines
  accentGlow: string; // box-shadow / glow rgba
  captionActive: string; // karaoke active word
  textPrimary: string;
  textSecondary: string;
  bg: string; // dark card/scene background
  paper: string; // EditorialPaper / NewspaperAnnotation surface
  paperAged: string; // InvestigationOpener case-file surface
  ink: string; // text on paper

  // image grade (the unifier for fetched imagery)
  imageFilter: string; // base CSS filter for content images
  imageFilterBright: string; // stronger variant for images vision tagged "bright"
  archivalFilter: string; // ArchivalFilm identity filter per theme
  wash: { color: string; blend: string; opacity: number }; // global tint overlay
  grain: number; // global grain opacity 0..1

  // component accents
  map: { ocean: string; land: string; landStroke: string; focus: string; focusStroke: string; route: string; label: string };
  hud: string; // GlitchGrid scanline/dots
  marker: string; // NewspaperAnnotation hand-drawn marker
  highlighter: string; // MacroScreenFocus highlight block
  fire: { main: string; glow: string }; // CinematicFire embers/wipe
  duotone: { warm: string; cool: string; gold: string }; // SocialJustice washes
}

export const THEMES: Record<string, Theme> = {
  gold: {
    name: 'gold',
    accent: '#D4AF37',
    accentGlow: 'rgba(212,175,55,0.8)',
    captionActive: '#FFD700',
    textPrimary: '#F5F1E8',
    textSecondary: '#b9b9bf',
    bg: '#0b0b0e',
    paper: '#ECECEC',
    paperAged: '#D1C7B3',
    ink: '#1A1A1A',
    imageFilter: 'saturate(0.92) contrast(1.05)',
    imageFilterBright: 'saturate(0.85) contrast(1.08) brightness(0.82)',
    archivalFilter: 'sepia(0.45) contrast(1.2)',
    wash: { color: '#D4AF37', blend: 'soft-light', opacity: 0.08 },
    grain: 0.05,
    map: {
      ocean: '#081120',
      land: '#16324f',
      landStroke: 'rgba(160,200,255,0.14)',
      focus: '#D4AF37',
      focusStroke: '#ffd97a',
      route: '#f1c40f',
      label: '#ffffff',
    },
    hud: '#FF0000',
    marker: '#E31818',
    highlighter: '#FFEE00',
    fire: { main: '#FF4500', glow: '#FF8C00' },
    duotone: { warm: '#FF4500', cool: '#00BFFF', gold: '#D4AF37' },
  },

  noir: {
    name: 'noir',
    accent: '#D64541',
    accentGlow: 'rgba(214,69,65,0.7)',
    captionActive: '#D64541',
    textPrimary: '#F2F0EB',
    textSecondary: '#9a9a9a',
    bg: '#0a0a0a',
    paper: '#E8E6E1',
    paperAged: '#CFCCC4',
    ink: '#141414',
    imageFilter: 'grayscale(1) contrast(1.18) brightness(0.95)',
    imageFilterBright: 'grayscale(1) contrast(1.25) brightness(0.8)',
    archivalFilter: 'grayscale(1) contrast(1.35)',
    wash: { color: '#8a93a5', blend: 'soft-light', opacity: 0.07 },
    grain: 0.12,
    map: {
      ocean: '#0b0d10',
      land: '#23272c',
      landStroke: 'rgba(255,255,255,0.12)',
      focus: '#d9d5cc',
      focusStroke: '#f2f0eb',
      route: '#D64541',
      label: '#ffffff',
    },
    hud: '#D64541',
    marker: '#D64541',
    highlighter: '#FFFFFF',
    fire: { main: '#C9683F', glow: '#9aa3ad' },
    duotone: { warm: '#8a7a6a', cool: '#6a7a8a', gold: '#918a77' },
  },

  vintage: {
    name: 'vintage',
    accent: '#C8A165',
    accentGlow: 'rgba(200,161,101,0.75)',
    captionActive: '#E9B44C',
    textPrimary: '#F2E8D5',
    textSecondary: '#b8a98c',
    bg: '#171310',
    paper: '#E9DFC8',
    paperAged: '#D7C7A5',
    ink: '#2A211A',
    imageFilter: 'sepia(0.5) saturate(0.75) contrast(1.08) brightness(0.96)',
    imageFilterBright: 'sepia(0.55) saturate(0.7) contrast(1.1) brightness(0.85)',
    archivalFilter: 'sepia(0.65) contrast(1.15)',
    wash: { color: '#C8A165', blend: 'soft-light', opacity: 0.12 },
    grain: 0.1,
    map: {
      ocean: '#1a140e',
      land: '#4a3a26',
      landStroke: 'rgba(242,232,213,0.15)',
      focus: '#C8A165',
      focusStroke: '#E9B44C',
      route: '#E9B44C',
      label: '#F2E8D5',
    },
    hud: '#B4552D',
    marker: '#8f3b2a',
    highlighter: '#E4C878',
    fire: { main: '#D2691E', glow: '#E9B44C' },
    duotone: { warm: '#B4552D', cool: '#6a7a5a', gold: '#C8A165' },
  },
};

const ThemeContext = React.createContext<Theme>(THEMES.gold);
export const ThemeProvider = ThemeContext.Provider;
export const useTheme = (): Theme => React.useContext(ThemeContext);

export const resolveTheme = (name?: string): Theme => THEMES[name ?? ''] ?? THEMES.gold;

/** Grade filter for a fetched image; `tone` comes from the vision pass. */
export const gradeFilter = (t: Theme, tone?: string | null, extra = ''): string =>
  `${tone === 'bright' ? t.imageFilterBright : t.imageFilter}${extra ? ` ${extra}` : ''}`;
