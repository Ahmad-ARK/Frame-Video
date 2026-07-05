import { z } from 'zod';

// ---------- Stage 1: Script ----------

const BeatSchema = z.object({
  narration: z
    .string()
    .describe('1-3 spoken sentences for this beat. Written for the ear, not the eye.'),
});

const MoodSchema = z
  .enum(['somber', 'epic', 'tense', 'curious', 'uplifting'])
  .describe('overall emotional register of the video — drives the background music choice');

const ThumbTextSchema = z
  .string()
  .describe(
    'Thumbnail hook text, 2-4 words, UPPERCASE, a curiosity punch distinct from the title — ' +
      'e.g. "NEVER FOUND", "THEY LIED", "300 DIED". This is what viewers see on the thumbnail, not the title.',
  );

export const ScriptSchema = z.object({
  title: z.string().describe('Video title, max 8 words'),
  mood: MoodSchema,
  thumbText: ThumbTextSchema,
  beats: z.array(BeatSchema).min(3).max(8).describe('Story beats. Beat 1 is the cold-open hook.'),
});

/** Long-form variant: the script is structured into acts with mini-hooks. */
export const LongScriptSchema = z.object({
  title: z.string().describe('Video title, max 8 words'),
  mood: MoodSchema,
  thumbText: ThumbTextSchema,
  acts: z
    .array(
      z.object({
        title: z.string().describe('act title, max 4 words, evocative'),
        beats: z.array(BeatSchema).min(3).max(8),
      }),
    )
    .min(2)
    .max(6),
});

/** Normalized shape used by the rest of the pipeline. */
export interface Script {
  title: string;
  mood?: string;
  thumbText?: string;
  acts: { title?: string; beats: { narration: string }[] }[];
}

// ---------- Stage 2: Scene plan ----------

export const ImageQuerySchema = z.object({
  query: z.string().describe('Image search query, 2-6 words, must carry the video\'s global context'),
  kind: z
    .enum(['entity', 'broll'])
    .describe(
      '"entity" = a specific named person/place/event/artifact (searched on Wikimedia). "broll" = generic cinematic footage-style imagery (searched on stock sites).',
    ),
});
export type ImageQuery = z.infer<typeof ImageQuerySchema>;

/**
 * Word-synced cue: fires the moment the narrator speaks the trigger word.
 * This is the main retention tool — enumerations, names and numbers become
 * on-beat visual events instead of dead air.
 */
export const CueSchema = z.object({
  trigger: z
    .string()
    .describe('EXACT word or 2-word phrase copied verbatim from this scene\'s narration that fires the cue'),
  action: z.enum(['popText', 'popImage']),
  text: z.string().optional().describe('popText only: 1-3 words to slam on screen, uppercase'),
  imageQuery: ImageQuerySchema.optional().describe('popImage only: the image to punch in'),
});
export type Cue = z.infer<typeof CueSchema>;

const common = {
  narration: z.string().describe('The exact narration text this scene covers (copied from the beat)'),
  imageQueries: z.array(ImageQuerySchema).min(1).max(4),
  cues: z
    .array(CueSchema)
    .max(6)
    .optional()
    .describe('word-synced visual events layered over the scene'),
};

export const ScenePlanSchema = z.discriminatedUnion('component', [
  z.object({
    component: z.literal('HookTitle'),
    ...common,
    title: z.string().describe('max 6 words'),
    subtitle: z.string().describe('max 10 words'),
    titleTrigger: z
      .string()
      .describe('the EXACT narration word at which the title appears on screen (pick the key moment of the hook sentence)'),
  }),
  z.object({ component: z.literal('KenBurns'), ...common }),
  z.object({ component: z.literal('ArchivalFilm'), ...common }),
  z.object({ component: z.literal('MacroScreenFocus'), ...common, headline: z.string().describe('max 5 words, punchy') }),
  z.object({
    component: z.literal('SplitScreen'),
    ...common,
    leftLabel: z.string().describe('max 3 words'),
    rightLabel: z.string().describe('max 3 words'),
    centerLabel: z.string().optional().describe('center badge, max 4 chars, e.g. "VS" — omit for a ⇄ exchange mark'),
  }),
  z.object({ component: z.literal('QuoteOverlay'), ...common, quoteText: z.string().describe('the quote, max 20 words'), speakerName: z.string().optional() }),
  z.object({ component: z.literal('StatueReveal'), ...common }),
  z.object({
    component: z.literal('Timeline'),
    ...common,
    events: z
      .array(z.object({ year: z.string().describe('e.g. "399 BC", "1969"'), label: z.string().describe('MAX 3 WORDS') }))
      .min(2)
      .max(5),
  }),
  z.object({ component: z.literal('GlitchGrid'), ...common, headline: z.string().describe('max 4 words'), subtitle: z.string().optional().describe('single word, will render mirrored') }),
  z.object({ component: z.literal('EditorialPaper'), ...common, headline: z.string().describe('max 4 words'), bodyText: z.string().describe('max 20 words') }),
  z.object({
    component: z.literal('Map'),
    ...common,
    focusCountries: z.array(z.string().length(3)).min(1).max(6).describe('ISO 3166-1 alpha-3 codes, e.g. USA, GRC, CHN'),
    connections: z
      .array(z.object({ from: z.string().length(3), to: z.string().length(3), type: z.enum(['invasion', 'trade', 'aid', 'migration']), label: z.string() }))
      .optional(),
    routes: z.array(z.object({ points: z.array(z.string().length(3)).min(2), label: z.string() })).optional(),
  }),
  z.object({ component: z.literal('StatCounter'), ...common, value: z.number(), prefix: z.string().optional(), suffix: z.string().optional(), label: z.string().describe('max 6 words') }),
  z.object({ component: z.literal('GrungeCollage'), ...common, title: z.string().describe('1-3 words, uppercase, punchy (e.g. "REVOLUTION")'), bodyText: z.string().describe('max 15 words, a fragmented thought') }),
  z.object({ component: z.literal('InvestigationOpener'), ...common, title: z.string().describe('1-2 words, uppercase (e.g. "CASE FILE")'), caseFileText: z.string().describe('max 20 words, clinical report language') }),
  z.object({ component: z.literal('CinematicFire'), ...common, title: z.string().describe('max 4 words (e.g. "The Fall of Rome")'), subtitle: z.string().describe('date/place/tag, max 3 words, uppercase') }),
  z.object({ component: z.literal('NewspaperAnnotation'), ...common, headline: z.string().describe('max 3 words, will be underlined in red'), bodyText: z.string().describe('max 25 words, newspaper style'), caption: z.string().optional().describe('short italic image caption') }),
  z.object({
    component: z.literal('FontRollDecoder'),
    ...common,
    words: z
      .array(z.object({ text: z.string().describe('a single display word'), size: z.number().min(40).max(180).describe('40-60 connector words, 120-180 impact words'), isAccent: z.boolean().optional() }))
      .min(3)
      .max(6)
      .describe('kinetic words forming one complete thought, ideally words spoken in the narration'),
  }),
  z.object({ component: z.literal('ParallaxDeep'), ...common }),
  z.object({
    component: z.literal('TitleParallax'),
    ...common,
    title: z.string().describe('max 4 words'),
    kicker: z.string().optional().describe('max 3 words, uppercase'),
  }),
  z.object({ component: z.literal('PhotoCarousel3D'), ...common }),
  z.object({
    component: z.literal('DocumentRig'),
    ...common,
    docTitle: z.string().describe('max 4 words'),
    stampText: z.string().optional().describe('max 2 words, uppercase (e.g. "CLASSIFIED", "GUILTY")'),
  }),
  z.object({
    component: z.literal('CubeReveal'),
    ...common,
    faceLabels: z.tuple([z.string(), z.string()]).describe('max 3 words each, e.g. ["BEFORE", "AFTER"]'),
  }),
  z.object({
    component: z.literal('SocialJustice'),
    ...common,
    matteText: z.string().describe('ONE thematic word, 3-8 letters, uppercase — becomes a giant image-filled word'),
    words: z
      .array(z.object({ text: z.string(), size: z.number().min(40).max(150), type: z.enum(['serif', 'sans']) }))
      .min(2)
      .max(5)
      .describe('foreground sentence fragment giving the matteText context'),
    duotone: z.enum(['warm', 'cool', 'gold']).optional(),
  }),
]);
export type ScenePlan = z.infer<typeof ScenePlanSchema>;

// min(1): a short VERBATIM paragraph can be a single-beat act, and a chunk of
// an oversized act is planned on its own — both may legitimately yield <3 scenes.
// The AI-written path still produces >=3 scenes (its script schema enforces >=3 beats).
export const PlanSchema = z.object({ scenes: z.array(ScenePlanSchema).min(1).max(8) });
export type Plan = z.infer<typeof PlanSchema>;

// ---------- Assets ----------

export interface AssetCandidate {
  provider: 'wikimedia' | 'openverse' | 'pixabay' | 'pexels' | 'flux';
  thumbUrl: string; // small version for vision verification
  fullUrl: string; // download target
  width: number;
  height: number;
  title?: string;
  author?: string;
  license?: string;
  sourceUrl?: string; // page to credit
  /** subject location (fractions 0-1), set by vision verification */
  focal?: { x: number; y: number };
  /** overall brightness, set by vision verification — drives adaptive grading */
  tone?: 'bright' | 'mid' | 'dark';
  /** what the focal point actually is — lets the thumbnail pick a cutout-worthy subject */
  subject?: 'person' | 'object' | 'scene';
}

export interface Credit {
  provider: string;
  author?: string;
  license?: string;
  sourceUrl?: string;
  title?: string;
}

export interface ResolvedImage {
  file: string; // path relative to public/
  credit: Credit;
  query: string;
  focal?: { x: number; y: number };
  tone?: 'bright' | 'mid' | 'dark';
  subject?: 'person' | 'object' | 'scene';
}

// ---------- Final props consumed by Remotion ----------

export interface WordStamp {
  text: string;
  start: number; // seconds, relative to scene audio start
  end: number;
}

export interface ResolvedCue {
  frame: number; // scene-local frame at which the cue fires
  action: 'popText' | 'popImage';
  text?: string;
  image?: string; // path relative to public/
  // provenance for popImage cues (review UI + credits rebuild)
  query?: string;
  provider?: string;
  author?: string;
  license?: string;
  sourceUrl?: string;
  title?: string;
}

/** Per-image provenance, kept alongside `images: string[]` so the review UI
 * can show/edit what produced each slot and credits can be rebuilt after edits. */
export interface ImageMeta {
  query: string;
  provider: string;
  author?: string;
  license?: string;
  sourceUrl?: string;
  title?: string;
  tone?: 'bright' | 'mid' | 'dark' | null;
  focal?: { x: number; y: number } | null;
  subject?: 'person' | 'object' | 'scene' | null;
}

export interface RenderScene {
  component: string;
  props: Record<string, unknown>; // component-specific, includes images: string[] and cues?: ResolvedCue[]
  narration: string;
  audioPath?: string; // relative to public/; absent for silent scenes (ChapterCard)
  wordTimestamps: WordStamp[];
  startFrame: number;
  durationInFrames: number;
  /** original image queries, kept so the QA repair pass can re-resolve */
  queries?: ImageQuery[];
}

export interface RenderProps {
  scenes: RenderScene[];
  credits: Credit[];
  creditsDurationInFrames: number;
  totalDuration: number;
  hasBgm: boolean;
  /** mood-matched music file relative to public/ (falls back to bgm.mp3) */
  bgmPath?: string;
  /** every image URL used in this video — seeds the ban list for QA repairs */
  usedUrls?: string[];
  [key: string]: unknown;
}

// ---------- QA ----------

export interface QaFinding {
  sceneIndex: number;
  ok: boolean;
  problem?: 'irrelevant' | 'broken' | 'text' | 'other';
  note?: string;
}
