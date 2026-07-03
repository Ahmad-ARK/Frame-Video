/**
 * Theme verification harness: renders one still per scene per theme from the
 * showcase props (run `npm run showcase` once first to build them).
 * Usage: npx tsx pipeline/themecheck.ts [gold noir vintage]
 * Output: out/themecheck/<theme>/<idx>_<component>.png
 */
import fs from 'fs';
import path from 'path';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { enableTailwind } from '@remotion/tailwind-v4';
import { ROOT, OUT_DIR, PUBLIC_DIR } from './config';
import { THEME_NAMES } from './themes';
import type { RenderProps, RenderScene } from './types';

async function main() {
  const themes = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const targets = themes.length > 0 ? themes : [...THEME_NAMES];

  const propsPath = path.join(PUBLIC_DIR, 'props_showcase.json');
  if (!fs.existsSync(propsPath)) {
    console.error('❌ public/props_showcase.json not found — run `npm run showcase` once first.');
    process.exit(1);
  }
  const baseProps = JSON.parse(fs.readFileSync(propsPath, 'utf-8')) as RenderProps;

  console.log('📦 Bundling once...');
  const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'src', 'index.ts'), webpackOverride: enableTailwind });

  for (const theme of targets) {
    const dir = path.join(OUT_DIR, 'themecheck', theme);
    fs.mkdirSync(dir, { recursive: true });
    const props = { ...baseProps, theme };
    const composition = await selectComposition({ serveUrl, id: 'Main', inputProps: props });

    for (let i = 0; i < props.scenes.length; i++) {
      const s: RenderScene = props.scenes[i];
      const frame = s.startFrame + Math.round(s.durationInFrames * 0.6);
      const output = path.join(dir, `${String(i).padStart(2, '0')}_${s.component}.png`);
      await renderStill({ serveUrl, composition, frame, output, inputProps: props });
      process.stdout.write(`  ${theme}: ${i + 1}/${props.scenes.length}\r`);
    }
    console.log(`\n✅ ${theme} → ${dir}`);
  }
  process.exit(0);
}

main();
