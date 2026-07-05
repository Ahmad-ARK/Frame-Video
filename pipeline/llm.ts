import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { KEYS, PLAN_MODEL, DEEPSEEK_BASE_URL } from './config';

// Real Anthropic client — used by the VISION role (verify.ts / qa.ts import this).
export const anthropic = new Anthropic({ apiKey: KEYS.anthropic });

// Planning client — DeepSeek's Anthropic-compatible endpoint when DEEPSEEK_API_KEY
// is set, else the real Anthropic client. Same SDK surface, different base URL/key,
// so structuredCall's logic is shared verbatim between the two providers.
const USING_DEEPSEEK = Boolean(KEYS.deepseek);
export const planClient = USING_DEEPSEEK
  ? new Anthropic({ apiKey: KEYS.deepseek, baseURL: DEEPSEEK_BASE_URL })
  : anthropic;

/**
 * Structured LLM call: forces a tool invocation whose input matches the zod
 * schema, validates the result, and retries with the validation error fed
 * back each time. 4 attempts, not 2 — the model occasionally drops a
 * required field (e.g. title/subtitle) on the FIRST scene of a call, and
 * with prompt caching a retry only costs output tokens plus a cache read
 * (~10% of input price), so extra attempts are cheap insurance against a
 * whole-video failure.
 */
export async function structuredCall<T>(opts: {
  schema: z.ZodType<T>;
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
}): Promise<T> {
  const { schema, system, user, model = PLAN_MODEL, maxTokens = 8000 } = opts;
  const jsonSchema = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;

  // Anthropic prompt caching: system as a content-block array carrying a
  // cache_control breakpoint. Tools render before system, so this one marker
  // caches the tool's JSON schema + system text together, reused across every
  // planScenes call. DeepSeek's endpoint caches automatically (no cache_control),
  // so we send a plain system string there to avoid any proxy quirk.
  const systemParam = USING_DEEPSEEK
    ? system
    : [{ type: 'text' as const, text: system, cache_control: { type: 'ephemeral' as const } }];

  let feedback = '';
  const MAX_ATTEMPTS = 4;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const msg = await planClient.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemParam,
      messages: [{ role: 'user', content: feedback ? `${user}\n\nYour previous output was invalid: ${feedback}\nEmit a corrected result.` : user }],
      tools: [
        {
          name: 'emit',
          description: 'Emit the structured result',
          input_schema: jsonSchema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: 'emit' },
    });

    const { cache_read_input_tokens, cache_creation_input_tokens } = msg.usage;
    if (cache_read_input_tokens || cache_creation_input_tokens) {
      console.log(
        `  💰 cache: ${cache_read_input_tokens ?? 0} read (~90% cheaper), ${cache_creation_input_tokens ?? 0} written this call`,
      );
    }

    const toolUse = msg.content.find((b) => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      feedback = 'No tool call was made.';
      continue;
    }
    const parsed = schema.safeParse(toolUse.input);
    if (parsed.success) return parsed.data;
    feedback =
      `You omitted required field(s) — re-emit the COMPLETE result with every required field filled in, ` +
      `especially on the first item: ${JSON.stringify(parsed.error.issues.slice(0, 5))}`;
  }
  throw new Error(`LLM structured call failed validation after ${MAX_ATTEMPTS} attempts: ${feedback}`);
}
