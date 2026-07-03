import { structuredCall } from './llm';
import { ScriptSchema, LongScriptSchema, type Script } from './types';
import { TARGET_SCRIPT_WORDS } from './config';

const RULES =
  `- Each beat is one clear idea, 15-40 words, written for the ear: short sentences, concrete nouns, active voice.\n` +
  `- Build a curiosity gap early and pay it off near the end.\n` +
  `- Prefer concrete numbers, dates and names from the reference facts over vague phrasing.\n` +
  `- No headings, no stage directions — narration text only.`;

/**
 * Stage 1 — scriptwriting. Turns a raw topic/idea into narration built for
 * retention. Short targets produce a single act; long targets produce a
 * multi-act structure with a mini-hook opening every act.
 * If the input starts with "VERBATIM:", it is used as-is.
 */
export async function writeScript(topic: string, research = '', targetWords = TARGET_SCRIPT_WORDS): Promise<Script> {
  if (topic.trim().toUpperCase().startsWith('VERBATIM:')) {
    const text = topic.trim().slice('VERBATIM:'.length).trim();
    const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
    const beats: { narration: string }[] = [];
    for (let i = 0; i < sentences.length; i += 2) {
      beats.push({ narration: sentences.slice(i, i + 2).join(' ').trim() });
    }
    return { title: text.split(/\s+/).slice(0, 6).join(' '), mood: 'curious', acts: [{ beats }] };
  }

  const referenceBlock = research
    ? `\n\nREFERENCE FACTS (from Wikipedia — trust these over memory):\n${research}\n`
    : '';

  const system =
    'You are a documentary scriptwriter for a faceless YouTube channel. ' +
    'You write narration that is spoken aloud by a single narrator. ' +
    'Every claim must be historically accurate — silently correct any factual errors in the prompt.';

  if (targetWords <= 260) {
    console.log('✍️  Writing script...');
    const script = await structuredCall({
      schema: ScriptSchema,
      system,
      user:
        `Write a mini-documentary script about:\n\n${topic}${referenceBlock}\n\n` +
        `Rules:\n` +
        `- Total length ~${targetWords} words across 4-7 beats.\n` +
        `- Beat 1 is a COLD-OPEN HOOK: a startling fact, question, or stake — max 2 short sentences. Never start with "In [year]".\n` +
        RULES +
        `\n- End with a resonant closing line, not a summary.`,
    });
    return { title: script.title, mood: script.mood, acts: [{ beats: script.beats }] };
  }

  const actCount = Math.min(6, Math.max(2, Math.round(targetWords / 220)));
  console.log(`✍️  Writing long-form script (~${targetWords} words, ${actCount} acts)...`);
  const script = await structuredCall({
    schema: LongScriptSchema,
    system,
    maxTokens: 12_000,
    user:
      `Write a documentary script about:\n\n${topic}${referenceBlock}\n\n` +
      `Rules:\n` +
      `- Total length ~${targetWords} words, structured into ${actCount} acts of 4-7 beats each.\n` +
      `- Act 1 beat 1 is a COLD-OPEN HOOK: a startling fact, question, or stake — max 2 short sentences. Never start with "In [year]".\n` +
      `- EVERY act opens with a mini-hook beat that re-grabs attention ("But that was only the beginning...", a new question, a twist) — retention drops every 60-90 seconds without one.\n` +
      `- Each act covers one chapter of the story; acts must flow in sequence with rising stakes.\n` +
      RULES +
      `\n- The final act ends with a resonant closing line, not a summary.`,
  });
  return { title: script.title, mood: script.mood, acts: script.acts };
}
