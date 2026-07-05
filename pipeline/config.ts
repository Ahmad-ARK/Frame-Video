import 'dotenv/config';
import path from 'path';
import os from 'os';

export const ROOT = path.resolve(__dirname, '..');
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const OUT_DIR = path.join(ROOT, 'out');

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

/** Frames of visual overlap between scenes (fade transition). */
export const TRANSITION_FRAMES = 12;
/** A still should never sit on screen longer than this (retention). */
export const MAX_SECONDS_PER_IMAGE = 4;
/** Seconds of the credits end card. */
export const CREDITS_SECONDS = 4;

export const SCENE_MODEL = process.env.SCENE_MODEL || 'claude-sonnet-5';
export const VISION_MODEL = process.env.VISION_MODEL || 'claude-haiku-4-5-20251001';

// Planning LLM (scene direction). When DEEPSEEK_API_KEY is set, planning routes to
// DeepSeek (V4-Flash) via its Anthropic-COMPATIBLE endpoint, so the existing
// Anthropic-SDK structuredCall is reused with just a different client. Vision
// (verify + QA) always stays on the real Anthropic key with VISION_MODEL.
// PLAN_MODEL overrides the model id (verify the exact string on your DeepSeek dashboard —
// 'deepseek-chat' is the non-thinking chat model; V4-Flash-specific ids also work).
export const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/anthropic';
export const PLAN_MODEL = process.env.PLAN_MODEL || (process.env.DEEPSEEK_API_KEY ? 'deepseek-chat' : SCENE_MODEL);

export const TTS_VOICE = process.env.TTS_VOICE || 'en-US-GuyNeural';
/** 'auto' prefers the Chatterbox endpoint when configured; 'edge' forces the free fallback. */
export const TTS_PROVIDER = process.env.TTS_PROVIDER || 'auto';
export const CHATTERBOX_ENDPOINT =
  process.env.CHATTERBOX_ENDPOINT || 'https://arkjutt08--chatterbox-tts-chatterbox-synthesize.modal.run';
/** 0 = flat delivery, 1 = theatrical; ~0.4 suits documentary narration. */
export const CHATTERBOX_EXAGGERATION = Number(process.env.CHATTERBOX_EXAGGERATION || 0.4);

/** Channel-wide visual theme; per-topic THEME: lines override, mood decides if unset. */
export const DEFAULT_THEME = process.env.DEFAULT_THEME || '';

/** Target script length in words (~ 155 words ≈ 60s of narration). */
export const TARGET_SCRIPT_WORDS = Number(process.env.TARGET_SCRIPT_WORDS || 170);

export const KEYS = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  deepseek: process.env.DEEPSEEK_API_KEY,
  pixabay: process.env.PIXABAY_API_KEY,
  pexels: process.env.PEXELS_API_KEY,
  fluxModalKey: process.env.FLUX_MODAL_KEY,
  fluxModalSecret: process.env.FLUX_MODAL_SECRET,
  // shared-secret auth for the Chatterbox endpoint (Modal Secret "tts-auth")
  chatterboxToken: process.env.CHATTERBOX_AUTH_TOKEN,
};

export const FLUX_ENDPOINT =
  process.env.FLUX_ENDPOINT || 'https://ahmadkhalid236997--flux-api-model-web.modal.run';

// ---------- Render performance ----------
// #1 Concurrency: parallel headless-Chrome workers. Remotion defaults to ~50% of
// cores; using all logical cores roughly doubles throughput when RAM allows.
// Each worker is a Chrome tab (~0.3-0.8 GB on blur/3D-heavy scenes) — if the
// machine starts swapping or crashing, set RENDER_CONCURRENCY lower (e.g. half).
export const RENDER_CONCURRENCY = process.env.RENDER_CONCURRENCY
  ? Math.max(1, Number(process.env.RENDER_CONCURRENCY))
  : Math.max(1, os.cpus().length);
// #2 GPU: 'angle' uses the real GPU (D3D on Windows) to accelerate the blur/3D
// filters that dominate per-frame cost. If headless GPU init fails on this
// machine, set RENDER_GL=swiftshader to force software rendering.
export const RENDER_GL = process.env.RENDER_GL || 'angle';
