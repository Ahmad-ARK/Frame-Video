import { structuredCall } from './llm';
import { PlanSchema, type Plan } from './types';

/**
 * Stage 2 — visual direction. Maps each script beat to a scene component,
 * component-specific props, image search queries and WORD-SYNCED CUES.
 * Called once per act so long-form plans stay within output limits.
 */
export async function planScenes(opts: {
  videoTitle: string;
  beats: { narration: string }[];
  isFirstAct: boolean;
  actLabel?: string;
}): Promise<Plan> {
  const { videoTitle, beats, isFirstAct, actLabel } = opts;
  console.log(`🎬 Planning scenes${actLabel ? ` (${actLabel})` : ''}...`);
  const beatList = beats.map((b, i) => `Beat ${i + 1}: ${b.narration}`).join('\n');

  return structuredCall({
    schema: PlanSchema,
    system:
      'You are a documentary visual director for a retention-obsessed YouTube channel. ' +
      'You map narration beats to visual scenes. You never change the narration text — copy each beat verbatim into its scene. ' +
      'Your #1 rule: the viewer must never stare at a static frame. Something meaningful changes on screen at least every 3 seconds.',
    user:
      `VIDEO TITLE: ${videoTitle}\n${actLabel ? `SECTION: ${actLabel}\n` : ''}\nSCRIPT BEATS:\n${beatList}\n\n` +
      `Create exactly one scene per beat, in order.\n\n` +
      `## COMPONENTS (choose per beat)\n` +
      `Imagery-led:\n` +
      `- KenBurns: default photo/painting montage. Give it 2-4 image queries so it can cut every ~4s.\n` +
      `- ArchivalFilm: sepia/grain old-footage montage; pre-1950 history or somber moments.\n` +
      `- SplitScreen: exactly two contrasted subjects (needs 2 image queries). Optional centerLabel badge ("VS") for direct rivalries; omit it for exchanges/flows.\n` +
      `- Map: geography, invasions, trade routes. ISO alpha-3 codes; routes for journeys, connections for directed actions.\n` +
      `  Map accuracy rules: route points MUST list every principal modern country the historical route passed through — do not skip transit countries (e.g. the overland Silk Road crosses Pakistan and Uzbekistan, not just its endpoints) — and MUST be ordered in actual travel sequence so the drawn line never zigzags back on itself.\n` +
      `  Each route leg must connect NEIGHBORING or near-neighboring countries — add the intermediate stops instead of one long jump (sea routes hop along the coasts: CHN→VNM→IDN→LKA→IND→OMN→EGY, never CHN→IDN direct). Every focus country must sit on a route or connection — no orphaned highlighted countries.\n` +
      `- Timeline: 2-5 dated events; labels MAX 3 WORDS (they are UI chips).\n` +
      `- StatCounter: one striking number counts up (year, distance, death toll, percentage).\n` +
      `- CinematicFire: epic/grand moments — war, disaster, collapse, turning points. Embers + fire wipe over a wide shot.\n` +
      `Typography-led (use for emphasis beats, max ~1 in 3 scenes):\n` +
      (isFirstAct
        ? `- HookTitle: ONLY beat 1. A drifting footage montage (give it 2-3 image queries); the title card appears ON the narration's key word — set titleTrigger to that exact word (the revelation moment of the hook, not the first word).\n`
        : `- (HookTitle is NOT available in this section — it is reserved for the video opening.)\n`) +
      `- MacroScreenFocus: one punchy 3-5 word headline (revelation/turning point).\n` +
      `- QuoteOverlay: a real quotation with speakerName.\n` +
      `- StatueReveal: contemplative close-up of a person/statue/artifact, narration types out.\n` +
      `- GlitchGrid: modern/tech/conflict energy spike; optional mirrored one-word subtitle.\n` +
      `- EditorialPaper: newspaper layout for verdicts/announcements/findings.\n` +
      `- GrungeCollage: aggressive punk/war/revolution manifesto card (title + fragment).\n` +
      `- InvestigationOpener: true-crime/mystery case-file scrapbook (title + clinical caseFileText).\n` +
      `- NewspaperAnnotation: academic breakdown — image circled in red marker, headline underlined.\n` +
      `- FontRollDecoder: kinetic typography, words scramble-decode in one by one. For rapid-fire hooks/summaries. Use words FROM the narration so they sync to the voice.\n` +
      `- SocialJustice: giant image-filled matte word + foreground fragment; movements, uprisings, systemic themes.\n\n` +
      `## WORD-SYNCED CUES (the retention weapon — use them a LOT)\n` +
      `Any scene can carry up to 6 cues. A cue fires at the exact moment the narrator speaks its trigger word.\n` +
      `- popText: a big word slams on screen. Use for enumerations, names, dates, numbers, punchlines.\n` +
      `- popImage: a polaroid-style photo punches in. Use when a specific person/place/object is named mid-sentence.\n` +
      `RULES:\n` +
      `- "trigger" must be copied VERBATIM from that scene's narration (one word, or two consecutive words).\n` +
      `- Enumerations MUST become cue sequences. Example — narration "Buddhism, Islam and Christianity spread along these roads":\n` +
      `  cues: [{trigger:"Buddhism", action:"popText", text:"BUDDHISM"}, {trigger:"Islam", action:"popText", text:"ISLAM"}, {trigger:"Christianity", action:"popText", text:"CHRISTIANITY"}]\n` +
      `  (or popImage with an imageQuery per faith if imagery serves better)\n` +
      `- Put cues on imagery-led scenes. Do NOT put cues on typography-led scenes (they are already text-dense).\n` +
      `- Use popText for abstractions, popImage for concrete nameable things. Mix them.\n\n` +
      `## IMAGE QUERY CRAFT (think like a photo archive librarian)\n` +
      `- Every query must carry the video's GLOBAL context, not just the sentence. Bad: "temple". Good: "Buddhist stupa Dunhuang China".\n` +
      `- Prefer named entities: specific paintings, people, buildings, artifacts, events. They search 10x better than concepts.\n` +
      `- kind "entity" = named historical things (Wikimedia). kind "broll" = cinematic texture ("sand dunes golden hour", "storm clouds timelapse sky") — stock sites.\n` +
      `- Never repeat a query across scenes. Never use abstract queries like "history", "trade", "ideas".\n\n` +
      `## PACING RULES\n` +
      `- Never two identical components back-to-back (except KenBurns).\n` +
      `- HARD RULE: no single visual may sit on screen longer than ~4 seconds. Any scene longer than one short sentence MUST have 2+ image queries (montage scenes) or 2+ cues (all others) — no dead air, ever.\n` +
      `- Vary energy: after a loud scene (GlitchGrid/GrungeCollage/FontRollDecoder), go calm (KenBurns/Map/EditorialPaper).`,
  });
}
