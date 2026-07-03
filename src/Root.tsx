import React from 'react';
import { Composition, Still, AbsoluteFill, Sequence, Audio, staticFile } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { KenBurns } from './scenes/KenBurns';
import { ArchivalFilm } from './scenes/ArchivalFilm';
import { HookTitle } from './scenes/HookTitle';
import { Timeline } from './scenes/Timeline';
import { MapScene } from './scenes/MapScene';
import { SplitScreen } from './scenes/SplitScreen';
import { StatCounter } from './scenes/StatCounter';
import { Credits, type Credit } from './scenes/Credits';
import { ChapterCard } from './scenes/ChapterCard';
import { MacroScreenFocus, QuoteOverlay, StatueReveal, GlitchGrid, EditorialPaper } from './scenes/TextScenes';
import { GrungeCollage, InvestigationOpener, NewspaperAnnotation } from './scenes/GrungeScenes';
import { CinematicFire, FontRollDecoder, SocialJustice } from './scenes/KineticScenes';
import { Captions, type Word } from './Captions';
import { CueOverlay, type CueData } from './CueOverlay';
import { Sfx, ImpactShake } from './Sfx';
import { Thumbnail, type ThumbnailProps } from './Thumbnail';
import { Bgm } from './Bgm';
import { ShortsVideo, type ShortsProps } from './Shorts';
import { ThemeProvider, resolveTheme } from './theme';
import { GradeWash } from './GradeWash';

const TRANSITION_FRAMES = 12;

const COMPONENTS: Record<string, React.FC<any>> = {
  HookTitle,
  KenBurns,
  ArchivalFilm,
  MacroScreenFocus,
  SplitScreen,
  QuoteOverlay,
  StatueReveal,
  Timeline,
  GlitchGrid,
  EditorialPaper,
  Map: MapScene,
  StatCounter,
  GrungeCollage,
  InvestigationOpener,
  NewspaperAnnotation,
  CinematicFire,
  FontRollDecoder,
  SocialJustice,
  ChapterCard,
};

/** Scenes that put narration text on screen themselves — captions would double it. */
const TEXT_SCENES = new Set([
  'HookTitle',
  'MacroScreenFocus',
  'QuoteOverlay',
  'StatueReveal',
  'EditorialPaper',
  'GlitchGrid',
  'GrungeCollage',
  'InvestigationOpener',
  'NewspaperAnnotation',
  'CinematicFire',
  'FontRollDecoder',
  'SocialJustice',
  'ChapterCard',
]);

export interface SceneData {
  component: string;
  props: Record<string, unknown>;
  narration: string;
  /** absent for silent scenes (ChapterCard) */
  audioPath?: string;
  wordTimestamps: Word[];
  startFrame: number;
  durationInFrames: number;
}

export interface DocumentaryProps {
  scenes: SceneData[];
  credits: Credit[];
  creditsDurationInFrames: number;
  totalDuration: number;
  hasBgm?: boolean;
  bgmPath?: string;
  theme?: string;
  [key: string]: unknown;
}

// Bgm lives in its own module so the Shorts composition can share it.

const DocumentaryVideo: React.FC<DocumentaryProps> = ({ scenes, credits, creditsDurationInFrames, hasBgm = true, bgmPath, theme }) => {
  if (scenes.length === 0) {
    return <AbsoluteFill style={{ backgroundColor: '#000' }} />;
  }

  const hasCredits = credits.length > 0 && creditsDurationInFrames > 0;

  // Visual track: TransitionSeries. Each scene is padded by the transition
  // length (except the final series item) so the audio timeline — plain
  // cumulative startFrames — stays perfectly aligned with the visuals.
  const seriesItems: React.ReactNode[] = [];
  scenes.forEach((scene, i) => {
    const SceneComponent = COMPONENTS[scene.component] ?? KenBurns;
    const isLastItem = i === scenes.length - 1 && !hasCredits;
    seriesItems.push(
      <TransitionSeries.Sequence
        key={`s-${i}`}
        durationInFrames={scene.durationInFrames + (isLastItem ? 0 : TRANSITION_FRAMES)}
      >
        {/* words/narration first so scene props (e.g. FontRollDecoder's own `words`) win on collision */}
        <SceneComponent words={scene.wordTimestamps} narration={scene.narration} {...scene.props} />
      </TransitionSeries.Sequence>,
    );
    if (!isLastItem) {
      seriesItems.push(
        <TransitionSeries.Transition
          key={`t-${i}`}
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
        />,
      );
    }
  });
  if (hasCredits) {
    seriesItems.push(
      <TransitionSeries.Sequence key="credits" durationInFrames={creditsDurationInFrames}>
        <Credits credits={credits} />
      </TransitionSeries.Sequence>,
    );
  }

  // popText slams shake the whole camera for a few frames
  const shakeFrames = scenes.flatMap((s) =>
    ((s.props.cues as CueData[] | undefined) ?? [])
      .filter((c) => c.action === 'popText')
      .map((c) => s.startFrame + c.frame),
  );

  return (
    <ThemeProvider value={resolveTheme(theme)}>
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <ImpactShake shakeFrames={shakeFrames}>
        <TransitionSeries>{seriesItems}</TransitionSeries>
        <GradeWash />
      </ImpactShake>

      {/* Audio, word-synced cues and captions live on the absolute timeline, independent of transitions */}
      {scenes.map((scene, i) => {
        const cues = (scene.props.cues as CueData[] | undefined) ?? [];
        return (
          <Sequence key={`a-${i}`} from={scene.startFrame} durationInFrames={scene.durationInFrames} name={`Audio ${i}`}>
            {scene.audioPath ? <Audio src={staticFile(scene.audioPath)} /> : null}
            {cues.map((cue, c) => (
              <Sfx key={`cs-${c}`} name={cue.action === 'popText' ? 'hit' : 'whoosh_short'} at={cue.frame} volume={cue.action === 'popText' ? 0.65 : 0.5} />
            ))}
            <CueOverlay cues={cues} />
            {!TEXT_SCENES.has(scene.component) && <Captions words={scene.wordTimestamps} />}
          </Sequence>
        );
      })}

      {/* transition whooshes at every scene boundary (and into credits) */}
      {scenes.slice(1).map((scene, i) => (
        <Sfx key={`tw-${i}`} name="whoosh" at={scene.startFrame - 8} volume={0.3} />
      ))}
      {hasCredits ? (
        <Sfx name="whoosh" at={scenes[scenes.length - 1].startFrame + scenes[scenes.length - 1].durationInFrames - 8} volume={0.3} />
      ) : null}

      {hasBgm ? <Bgm scenes={scenes} bgmPath={bgmPath} /> : null}
    </AbsoluteFill>
    </ThemeProvider>
  );
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Main"
        component={DocumentaryVideo}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ scenes: [], credits: [], creditsDurationInFrames: 0, totalDuration: 300 } as DocumentaryProps}
        calculateMetadata={({ props }) => ({
          durationInFrames: props.totalDuration || 300,
        })}
      />
      <Composition
        id="Shorts"
        component={ShortsVideo}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ scenes: [], title: '', totalDuration: 300 } as ShortsProps}
        calculateMetadata={({ props }) => ({
          durationInFrames: props.totalDuration || 300,
        })}
      />
      <Still
        id="Thumbnail"
        component={Thumbnail}
        width={1280}
        height={720}
        defaultProps={{ title: 'Documentary', image: 'placeholder.jpg' } as ThumbnailProps}
      />
    </>
  );
};
