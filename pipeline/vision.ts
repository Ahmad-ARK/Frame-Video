import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';
import { anthropic } from './llm';
import { KEYS, VISION_MODEL, GEMINI_VISION_MODEL } from './config';

/**
 * Provider-agnostic vision call. Callers (verify.ts, qa.ts) build a plain
 * ordered list of text/image parts and get back raw text — they already
 * tolerantly regex a `{...}` JSON blob out of that text, so no per-provider
 * JSON parsing is needed here. Routes to Gemini when GEMINI_API_KEY is set,
 * else the real Anthropic vision model (VISION_MODEL, e.g. Haiku).
 */
export type VisionPart = { type: 'text'; text: string } | { type: 'image'; mimeType: string; base64: string };

const USING_GEMINI = Boolean(KEYS.gemini);

export async function visionCall(parts: VisionPart[], maxTokens = 1500): Promise<string> {
  return USING_GEMINI ? geminiVisionCall(parts, maxTokens) : anthropicVisionCall(parts, maxTokens);
}

async function anthropicVisionCall(parts: VisionPart[], maxTokens: number): Promise<string> {
  const content: Anthropic.Messages.ContentBlockParam[] = parts.map((p) =>
    p.type === 'text'
      ? { type: 'text', text: p.text }
      : { type: 'image', source: { type: 'base64', media_type: p.mimeType as any, data: p.base64 } },
  );
  const msg = await anthropic.messages.create({ model: VISION_MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content }] });
  const block = msg.content.find((b) => b.type === 'text');
  return block && block.type === 'text' ? block.text : '';
}

async function geminiVisionCall(parts: VisionPart[], maxTokens: number): Promise<string> {
  const geminiParts = parts.map((p) =>
    p.type === 'text' ? { text: p.text } : { inline_data: { mime_type: p.mimeType, data: p.base64 } },
  );
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VISION_MODEL}:generateContent`;
  // light retry: free-tier Gemini can 429 under burst load (many verify calls per scene)
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await axios.post(
        url,
        { contents: [{ parts: geminiParts }], generationConfig: { maxOutputTokens: maxTokens, responseMimeType: 'application/json' } },
        { headers: { 'x-goog-api-key': KEYS.gemini, 'Content-Type': 'application/json' }, timeout: 30_000 },
      );
      const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      return typeof text === 'string' ? text : '';
    } catch (err) {
      lastErr = err;
      const status = (err as { response?: { status?: number } }).response?.status;
      if (attempt === 2) throw lastErr;
      await new Promise((r) => setTimeout(r, (status === 429 ? 3000 : 1000) * (attempt + 1)));
    }
  }
  throw lastErr;
}
