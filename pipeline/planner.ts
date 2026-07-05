import { structuredCall } from './llm';
import { PlanSchema, type Plan } from './types';

// Everything below is IDENTICAL across every planScenes call for a given
// isFirstAct value (only 2 variants total) — moved into `system` so it forms
// a stable, cacheable prefix instead of being re-sent as fresh `user` tokens
// on every one of the ~10 planning calls per video (and across every video).
// Only per-call specifics (title, beats, seam hint) stay in `user` — see
// pipeline/llm.ts's structuredCall for the cache_control placement.
function buildDirectorPrompt(isFirstAct: boolean): string {
  return (
    'You are a documentary visual director for a retention-obsessed YouTube channel. ' +
    'You map narration beats to visual scenes. You never change the narration text — copy each beat verbatim into its scene. ' +
    'Your #1 rule: the viewer must never stare at a static frame. Something meaningful changes on screen at least every 3 seconds.\n\n' +
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
      `- ParallaxDeep: true 3D depth shot (camera dolly + parallax) on the single most emotionally important image of the beat/act — a portrait, a decisive artifact, a defining place. Use sparingly (its power comes from rarity) and give it exactly 1 image query on your BEST candidate.\n` +
      `- PhotoCarousel3D: a 3D ring of 3-5 photos that snaps from one to the next. Use when the narration ENUMERATES a series of artifacts, faces or places named together (give it one image query per item named).\n` +
      `- DocumentRig: a document/portrait on a desk that the camera picks up and reads, with a highlight sweep and an optional stamp (docTitle required; stampText only for verdicts/classifications, e.g. "GUILTY", "CLASSIFIED"). Use for treaties, letters, verdicts, records.\n` +
      `- CubeReveal: a hard before/after or cause/effect pivot — the frame physically rotates from one image to the other (needs exactly 2 image queries + faceLabels like ["BEFORE","AFTER"] or ["CAUSE","EFFECT"]).\n` +
      `Typography-led (use for emphasis beats, max ~1 in 3 scenes):\n` +
      `- TitleParallax: premium emphasis card — a short title (max 4 words) with an optional 3-word kicker line above it, floating in 3D. Use for the single most important standalone statement of an act (not for regular narrated beats).\n` +
      (isFirstAct
        ? `- HookTitle: ONLY beat 1. A drifting footage montage (give it 2-3 image queries). REQUIRES ALL THREE: title (max 6 words, the video's hook headline), subtitle (max 10 words, a supporting line), AND titleTrigger set to the EXACT narration word at which the title card appears (the revelation moment of the hook, not the first word). Never omit title or subtitle.\n`
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
      `- Vary energy: after a loud scene (GlitchGrid/GrungeCollage/FontRollDecoder), go calm (KenBurns/Map/EditorialPaper).\n` +
      `- Prefer a premium scene (ParallaxDeep / PhotoCarousel3D / DocumentRig / CubeReveal) at least once per act; never twice in a row.`
  );
}

/**
 * Stage 2 — visual direction. Maps each script beat to a scene component,
 * component-specific props, image search queries and WORD-SYNCED CUES.
 * Called once per act (or per <=8-beat chunk of an oversized act) so
 * long-form plans stay within output limits.
 */
export async function planScenes(opts: {
  videoTitle: string;
  beats: { narration: string }[];
  isFirstAct: boolean;
  actLabel?: string;
  /** component of the scene immediately before beat 1 (previous chunk of the same act), if any */
  prevComponent?: string;
}): Promise<Plan> {
  const { videoTitle, beats, isFirstAct, actLabel, prevComponent } = opts;
  console.log(`🎬 Planning scenes${actLabel ? ` (${actLabel})` : ''}...`);
  const beatList = beats.map((b, i) => `Beat ${i + 1}: ${b.narration}`).join('\n');

  return structuredCall({
    schema: PlanSchema,
    system: buildDirectorPrompt(isFirstAct),
    user:
      `VIDEO TITLE: ${videoTitle}\n${actLabel ? `SECTION: ${actLabel}\n` : ''}\nSCRIPT BEATS:\n${beatList}\n` +
      (prevComponent && prevComponent !== 'KenBurns'
        ? `\nThe scene right before beat 1 (earlier in this same video) was a ${prevComponent} — do NOT use ${prevComponent} for beat 1, to avoid a jarring repeat across the seam.\n`
        : ''),
  });
}
