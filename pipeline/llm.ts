import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { KEYS, SCENE_MODEL } from './config';

export const anthropic = new Anthropic({ apiKey: KEYS.anthropic });

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
  const { schema, system, user, model = SCENE_MODEL, maxTokens = 8000 } = opts;
  const jsonSchema = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;

  let feedback = '';
  const MAX_ATTEMPTS = 4;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const msg = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      // system as a content-block array (not a bare string) so it can carry a
      // cache_control breakpoint. Tools render before system in the prompt, so
      // this one marker caches the tool's JSON schema + this whole system text
      // together — reused verbatim across every planScenes call, in every video.
      // Forcing tool_choice below only invalidates the messages tier (per-request
      // variable content), never this cached tools+system prefix.
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
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
