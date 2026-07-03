import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { KEYS, SCENE_MODEL } from './config';

export const anthropic = new Anthropic({ apiKey: KEYS.anthropic });

/**
 * Structured LLM call: forces a tool invocation whose input matches the zod
 * schema, validates the result, and retries once with the validation error.
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
  for (let attempt = 0; attempt < 2; attempt++) {
    const msg = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system,
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

    const toolUse = msg.content.find((b) => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      feedback = 'No tool call was made.';
      continue;
    }
    const parsed = schema.safeParse(toolUse.input);
    if (parsed.success) return parsed.data;
    feedback = JSON.stringify(parsed.error.issues.slice(0, 5));
  }
  throw new Error(`LLM structured call failed validation twice: ${feedback}`);
}
