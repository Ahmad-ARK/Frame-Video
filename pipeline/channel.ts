import fs from 'fs';
import path from 'path';
import { ROOT } from './config';

/**
 * Per-channel identity. For a network of channels driven by one pipeline, each
 * channel gets a config file at `channels/<name>.json` and is selected with
 * `--channel <name>` (or the CHANNEL env var). This is the primary
 * differentiation lever — it makes N channels look like N distinct shows rather
 * than one content farm: a different narrator VOICE, a base THEME, and a
 * signature ACCENT colour per channel. `niche` is documentation only.
 */
export interface ChannelConfig {
  name: string;
  theme?: string; // base theme: gold | noir | vintage (per-topic THEME: still overrides)
  voice?: string; // edge-tts narrator voice id, e.g. "en-US-ChristopherNeural"
  accent?: string; // hex signature colour, overrides the theme accent (see resolveTheme)
  niche?: string; // e.g. "military history" — for your own reference, not used at runtime
  // per-component variant weights, e.g. { "KenBurns": { "fullbleed": 3, "classic": 1 } }.
  // Biases which visual treatment this channel reaches for (see pipeline/variants.ts).
  variants?: Record<string, Record<string, number>>;
}

function loadChannel(): ChannelConfig | null {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--channel');
  const name = i >= 0 ? argv[i + 1] : process.env.CHANNEL;
  if (!name) return null;
  const file = path.join(ROOT, 'channels', `${name}.json`);
  if (!fs.existsSync(file)) {
    console.warn(`⚠️  channel config not found: channels/${name}.json — using defaults`);
    return null;
  }
  try {
    const cfg = JSON.parse(fs.readFileSync(file, 'utf-8')) as ChannelConfig;
    cfg.name = name;
    return cfg;
  } catch (err) {
    console.warn(`⚠️  channel config channels/${name}.json is invalid JSON — using defaults`);
    return null;
  }
}

/** Resolved once at startup from `--channel`/CHANNEL; null when none selected. */
export const CHANNEL = loadChannel();

export const channelVoice = (): string | undefined => CHANNEL?.voice;
export const channelTheme = (): string | undefined => CHANNEL?.theme;
export const channelAccent = (): string | undefined => CHANNEL?.accent;
export const channelVariantWeights = (): Record<string, Record<string, number>> | undefined => CHANNEL?.variants;
