import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { anthropic } from './llm';
import { FPS, VISION_MODEL } from './config';
import type { QaFinding, RenderScene } from './types';

/**
 * Automated QA pass: one frame per scene → one Haiku vision call (~$0.01).
 * Flags scenes whose visuals are irrelevant to the narration, look broken
 * (placeholder/black/stretched), or have clipped/overflowing text.
 */
export async function qaVideo(videoPath: string, scenes: RenderScene[]): Promise<QaFinding[]> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
  try {
    const checkable: { idx: number; file: string }[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      if (s.component === 'ChapterCard') continue; // pure typography, nothing to misjudge
      // montage scenes rotate several images — sample each image's window
      const imageCount = Math.min(((s.props.images as string[]) ?? []).length, 4);
      const samples = Math.max(1, imageCount);
      for (let k = 0; k < samples; k++) {
        const at = (s.startFrame + s.durationInFrames * ((k + 0.55) / samples)) / FPS;
        const file = path.join(tmpDir, `f${i}_${k}.jpg`);
        try {
          execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', at.toFixed(2), '-i', videoPath, '-frames:v', '1', '-vf', 'scale=560:-1', file]);
          if (fs.existsSync(file)) checkable.push({ idx: i, file });
        } catch {
          // frame extraction failure is not a scene failure
        }
      }
    }
    if (checkable.length === 0) return [];

    const content: any[] = [
      {
        type: 'text',
        text:
          'You are QA-checking an automatically generated documentary video. Scenes may appear with SEVERAL ' +
          'sampled frames (montages rotate images) — judge each frame, but report ONE entry per sceneIndex ' +
          '(not ok if ANY of its frames has a real problem). Flag REAL problems only:\n' +
          '- "irrelevant": the imagery clearly does not belong with the narration (wrong subject, wrong era — e.g. modern crowds/cars/phones under ancient-history narration — or jarring tone)\n' +
          '- "broken": placeholder-looking/black/stretched/corrupted visuals\n' +
          '- "text": text CLIPPED by the frame edge or overflowing its container\n' +
          'Intentional, never flag: dark grading, grain, sepia, big typography, and PARTIALLY TYPED text — ' +
          'typewriter effects and karaoke captions reveal text progressively, so mid-word snapshots are normal. ' +
          'The "FontRollDecoder" scene specifically shows a hacker-style scramble-decode effect where letters ' +
          'resolve left-to-right and unrevealed letters show random garbage characters (e.g. "AMBITX%EL" mid-reveal ' +
          'of "AMBITION") — this is the intended effect, never flag it.',
      },
    ];
    for (const c of checkable) {
      const s = scenes[c.idx];
      content.push({
        type: 'text',
        text: `Scene ${c.idx} [${s.component}] narration: "${s.narration.slice(0, 140)}"`,
      });
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: fs.readFileSync(c.file).toString('base64') },
      });
    }
    content.push({
      type: 'text',
      text:
        'Reply with ONLY JSON: {"findings":[{"sceneIndex":<n>,"ok":true|false,"problem":"irrelevant"|"broken"|"text"|"other","note":"<short>"}]} ' +
        '— exactly ONE entry per distinct sceneIndex shown, ok:true when fine.',
    });

    const msg = await anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 1500,
      messages: [{ role: 'user', content }],
    });
    const textBlock = msg.content.find((b) => b.type === 'text');
    const raw = textBlock && textBlock.type === 'text' ? textBlock.text : '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    const findings: QaFinding[] = Array.isArray(parsed.findings) ? parsed.findings : [];
    // one finding per scene, keeping the failing one if the model returned duplicates
    const byScene = new Map<number, QaFinding>();
    for (const f of findings) {
      if (typeof f.sceneIndex !== 'number') continue;
      const existing = byScene.get(f.sceneIndex);
      if (!existing || (existing.ok && !f.ok)) byScene.set(f.sceneIndex, f);
    }
    return [...byScene.values()];
  } catch (err) {
    console.warn(`  QA pass failed (non-fatal): ${(err as Error).message}`);
    return [];
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
