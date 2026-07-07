/**
 * Channel-weighted scene variations. High-frequency "workhorse" components get
 * a few genuinely distinct visual treatments; a channel biases which ones it
 * reaches for (see channels/<name>.json → "variants"). Selection is:
 *  - deterministic (seeded by scene narration) so re-renders are stable and the
 *    scene cache key is reproducible, and
 *  - weighted per channel, so one channel leans "framed/editorial" while another
 *    leans "fullbleed/cinematic" — variety WITHIN a channel that also reinforces
 *    the identity ACROSS channels.
 *
 * Only components listed here have variants; everything else renders its single
 * default. A component must treat an unknown variant string as its default.
 */
export const VARIANTS: Record<string, readonly string[]> = {
  // KenBurns: the montage workhorse (appears many times per video).
  //  classic   — blurred side-fill + height-fit contained image (the original look)
  //  fullbleed — image fills the frame, stronger zoom, heavy edge vignette (cinematic)
  //  framed    — image inset with an accent border on a solid ground (editorial)
  KenBurns: ['classic', 'fullbleed', 'framed'],
  // SplitScreen: the comparison workhorse.
  //  classic  — angled glowing divider + circular VS badge (dramatic)
  //  straight — vertical seam, no badge (clean side-by-side)
  SplitScreen: ['classic', 'straight'],
  // MacroScreenFocus: the punchy-headline workhorse.
  //  classic — grayscale photo + highlighter block behind the headline
  //  band    — full-colour photo + headline on a solid accent band
  //  plate   — darkened photo + a big centred typographic statement + accent rule
  MacroScreenFocus: ['classic', 'band', 'plate'],
  // Map: geography/invasion/trade-route workhorse. All 3 share the exact same
  // camera/projection math (src/scenes/MapScene.tsx) — only surface styling differs.
  //  classic    — dark ocean, glowing routes, pulsing dots (current)
  //  tactical   — HUD/ops-room: screen-space grid, scanline texture, crosshair
  //               reticles, bracketed "[ LABEL ]" chips
  //  parchment  — old-atlas: paper ground, ink strokes, serif labels, no glow
  Map: ['classic', 'tactical', 'parchment'],
};

// FNV-1a — small, fast, deterministic string hash → non-negative 32-bit int.
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Pick a variant for `component`, biased by per-channel `weights`
 * (e.g. { KenBurns: { fullbleed: 3, classic: 1 } }). Returns undefined for
 * components without variants (they render their default). Missing weights
 * default to 1 (uniform); a weight of 0 excludes that variant.
 */
export function pickVariant(
  component: string,
  seed: string,
  weights?: Record<string, Record<string, number>>,
): string | undefined {
  const options = VARIANTS[component];
  if (!options || options.length === 0) return undefined;
  const w = weights?.[component];
  const bag: string[] = [];
  for (const opt of options) {
    const n = Math.max(0, Math.round(w?.[opt] ?? 1));
    for (let i = 0; i < n; i++) bag.push(opt);
  }
  const pool = bag.length > 0 ? bag : [...options];
  return pool[hashStr(`${component}|${seed}`) % pool.length];
}
