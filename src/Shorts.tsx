import React, { useMemo } from 'react';
import { AbsoluteFill, Img, Sequence, Audio, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { playfair, inter, oswald } from './fonts';
import { Bgm } from './Bgm';
import { Sfx } from './Sfx';
import type { Word } from './Captions';
import type { CueData } from './CueOverlay';
import type { SceneData } from './Root';
import { ThemeProvider, resolveTheme, useTheme, gradeFilter } from './theme';
import { GradeWash } from './GradeWash';

export interface ShortsProps {
  scenes: SceneData[];
  title: string;
  totalDuration: number;
  hasBgm?: boolean;
  bgmPath?: string;
  theme?: string;
  [key: string]: unknown;
}

const END_CARD_FRAMES = 45;

// ---------- vertical cover montage (every scene becomes this treatment) ----------

const VerticalMontage: React.FC<{ images: string[]; focalPoints?: ({ x: number; y: number } | null)[]; imageTones?: (string | null)[] }> = ({
  images,
  focalPoints,
  imageTones,
}) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const imgs = images.length > 0 ? images : ['placeholder.jpg'];
  const perImage = Math.max(1, Math.ceil(durationInFrames / imgs.length));
  const idx = Math.min(Math.floor(frame / perImage), imgs.length - 1);
  const local = frame - idx * perImage;
  const p = local / perImage;

  const fp = focalPoints?.[idx] ?? null;
  const zoomIn = idx % 2 === 0;
  const scale = zoomIn ? 1.0 + 0.14 * p : 1.14 - 0.14 * p;
  const panX = fp ? (0.5 - fp.x) * 70 * p : (idx % 2 === 0 ? 1 : -1) * 26 * p;
  const fade = Math.min(1, local / 8);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Img
        src={staticFile(imgs[idx])}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: fade,
          filter: gradeFilter(theme, imageTones?.[idx]),
          transform: `scale(${scale}) translateX(${panX}px)`,
          transformOrigin: fp ? `${fp.x * 100}% ${fp.y * 100}%` : '50% 50%',
        }}
      />
      <AbsoluteFill style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, transparent 25%, transparent 60%, rgba(0,0,0,0.55) 100%)' }} />
    </AbsoluteFill>
  );
};

// ---------- big vertical captions ----------

const ShortsCaptions: React.FC<{ words?: Word[] }> = ({ words }) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const chunks = useMemo(() => {
    if (!words || words.length === 0) return [];
    const out: number[][] = [];
    let cur: number[] = [];
    for (let i = 0; i < words.length; i++) {
      cur.push(i);
      const end = /[.!?;:]$/.test(words[i].text);
      if (cur.length >= 3 || end || i === words.length - 1) {
        out.push(cur);
        cur = [];
      }
    }
    return out;
  }, [words]);
  if (!words || words.length === 0) return null;

  const t = frame / fps;
  if (t < words[0].start) return null;
  let active = 0;
  for (let i = 0; i < words.length; i++) {
    if (words[i].start <= t) active = i;
    else break;
  }
  const chunk = chunks.find((c) => c.includes(active)) ?? chunks[chunks.length - 1];

  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: '22%', pointerEvents: 'none', zIndex: 100 }}>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '90%' }}>
        {chunk.map((gi) => {
          const w = words[gi];
          const isActive = gi === active;
          const pop = isActive ? spring({ frame: frame - Math.round(w.start * fps), fps, config: { damping: 13, stiffness: 280 } }) : 0;
          return (
            <span
              key={gi}
              style={{
                fontFamily: inter,
                fontSize: 64,
                fontWeight: 800,
                textTransform: 'uppercase',
                color: isActive ? theme.captionActive : '#FFFFFF',
                transform: `scale(${1 + pop * 0.1})`,
                display: 'inline-block',
                textShadow: '0 4px 14px rgba(0,0,0,0.95), 0 0 40px rgba(0,0,0,0.5)',
                WebkitTextStroke: '1.5px rgba(0,0,0,0.6)',
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ---------- vertical cue pops ----------

const ShortsCues: React.FC<{ cues?: CueData[] }> = ({ cues }) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!cues || cues.length === 0) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 50 }}>
      {cues.map((cue, i) => {
        const next = cues[i + 1];
        const end = Math.min(next ? next.frame : cue.frame + 70, cue.frame + 70);
        if (frame < cue.frame || frame > end) return null;
        const local = frame - cue.frame;
        const pop = spring({ frame: local, fps, config: { damping: 13, stiffness: 240 } });
        const exit = interpolate(frame, [end - 6, end], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        if (cue.action === 'popText' && cue.text) {
          const fontSize = Math.round(Math.min(110, Math.max(56, 1000 / Math.max(cue.text.length, 4))));
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: '50%',
                top: '30%',
                transform: `translate(-50%, -50%) rotate(${i % 2 === 0 ? -2 : 2}deg) scale(${1.5 - 0.5 * pop})`,
                opacity: Math.min(1, local / 2) * exit,
                textAlign: 'center',
              }}
            >
              <div style={{ fontFamily: oswald, fontWeight: 700, fontSize, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.05em', textShadow: '0 4px 24px rgba(0,0,0,0.95)', whiteSpace: 'nowrap' }}>
                {cue.text}
              </div>
              <div style={{ height: 6, width: '70%', margin: '8px auto 0', backgroundColor: theme.accent, transform: `scaleX(${pop})` }} />
            </div>
          );
        }
        if (cue.action === 'popImage' && cue.image) {
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: '50%',
                top: '32%',
                width: '72%',
                transform: `translate(-50%, -50%) rotate(${i % 2 === 0 ? -3 : 3}deg) scale(${1.3 - 0.3 * pop})`,
                opacity: Math.min(1, local / 2) * exit,
                backgroundColor: '#F5F1E8',
                padding: 12,
                paddingBottom: 18,
                boxShadow: '0 24px 70px rgba(0,0,0,0.75)',
              }}
            >
              <Img src={staticFile(cue.image)} style={{ width: '100%', maxHeight: 560, objectFit: 'cover', display: 'block', filter: gradeFilter(theme) }} />
            </div>
          );
        }
        return null;
      })}
    </AbsoluteFill>
  );
};

// ---------- title overlay for the hook scene ----------

const ShortsTitle: React.FC<{ title: string; appearFrame: number }> = ({ title, appearFrame }) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hold = 75;
  if (frame < appearFrame || frame > appearFrame + hold) return null;
  const local = frame - appearFrame;
  const reveal = spring({ frame: local, fps, config: { damping: 200 } });
  const exit = interpolate(local, [hold - 10, hold], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 7%', zIndex: 60, opacity: exit }}>
      <Sfx name="hit" at={appearFrame} volume={0.5} />
      <div style={{ width: 100, height: 3, backgroundColor: theme.accent, transform: `scaleX(${reveal})`, marginBottom: 26 }} />
      <h1
        style={{
          fontFamily: playfair,
          fontWeight: 700,
          fontSize: Math.min(110, 1500 / Math.max(title.length, 10) + 40),
          color: theme.textPrimary,
          margin: 0,
          textAlign: 'center',
          lineHeight: 1.12,
          textShadow: '0 4px 30px rgba(0,0,0,0.95)',
          opacity: reveal,
          transform: `translateY(${(1 - reveal) * 30}px)`,
        }}
      >
        {title}
      </h1>
    </AbsoluteFill>
  );
};

// ---------- the composition ----------

const ShortsInner: React.FC<ShortsProps> = ({ scenes, title, totalDuration, hasBgm = true, bgmPath }) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  if (scenes.length === 0) return <AbsoluteFill style={{ backgroundColor: '#000' }} />;
  const endCardStart = totalDuration - END_CARD_FRAMES;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {scenes.map((scene, i) => (
        <Sequence key={i} from={scene.startFrame} durationInFrames={scene.durationInFrames} name={`Short ${i}`}>
          <VerticalMontage
            images={(scene.props.images as string[]) ?? []}
            focalPoints={scene.props.focalPoints as ({ x: number; y: number } | null)[] | undefined}
            imageTones={scene.props.imageTones as (string | null)[] | undefined}
          />
          <GradeWash />
          {scene.audioPath ? <Audio src={staticFile(scene.audioPath)} /> : null}
          <ShortsCues cues={scene.props.cues as CueData[] | undefined} />
          {i === 0 ? (
            <ShortsTitle title={title} appearFrame={Math.min((scene.props.titleAppearFrame as number) ?? 12, Math.max(6, scene.durationInFrames - 85))} />
          ) : null}
          <ShortsCaptions words={scene.wordTimestamps} />
          {(scene.props.cues as CueData[] | undefined)?.map((cue, c) =>
            cue.action === 'popText' ? <Sfx key={c} name="hit" at={cue.frame} volume={0.6} /> : <Sfx key={c} name="whoosh_short" at={cue.frame} volume={0.5} />,
          )}
        </Sequence>
      ))}

      {/* end card */}
      <Sequence from={endCardStart} durationInFrames={END_CARD_FRAMES} name="EndCard">
        <AbsoluteFill style={{ backgroundColor: theme.bg, justifyContent: 'center', alignItems: 'center', padding: '0 10%' }}>
          <div style={{ fontFamily: inter, fontWeight: 700, fontSize: 34, color: theme.accent, letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 26, opacity: interpolate(frame - endCardStart, [3, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
            Full story
          </div>
          <h1 style={{ fontFamily: playfair, fontWeight: 700, fontSize: 66, color: theme.textPrimary, margin: 0, textAlign: 'center', lineHeight: 1.15 }}>{title}</h1>
          <div style={{ fontFamily: inter, fontWeight: 600, fontSize: 30, color: theme.textSecondary, marginTop: 30 }}>watch on the channel</div>
        </AbsoluteFill>
      </Sequence>

      {hasBgm ? <Bgm scenes={scenes} bgmPath={bgmPath} /> : null}
    </AbsoluteFill>
  );
};

export const ShortsVideo: React.FC<ShortsProps> = (props) => (
  <ThemeProvider value={resolveTheme(props.theme)}>
    <ShortsInner {...props} />
  </ThemeProvider>
);
