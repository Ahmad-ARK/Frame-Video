import React, { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from 'remotion';
import { geoNaturalEarth1, geoPath, type GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import type { FeatureCollection, Feature } from 'geojson';
import worldTopo from 'world-atlas/countries-110m.json';
import countriesMeta from 'world-countries';
import { inter, oswald } from '../fonts';
import { useTheme } from '../theme';

// ---------- static data, built once ----------
const world = feature(worldTopo as any, (worldTopo as any).objects.countries) as unknown as FeatureCollection;
const byCca3 = new Map<string, { feature: Feature | null; name: string }>();
for (const c of countriesMeta as any[]) {
  const f = world.features.find((wf) => String(wf.id).padStart(3, '0') === String(c.ccn3).padStart(3, '0')) ?? null;
  byCca3.set(c.cca3, { feature: f, name: c.name.common });
}

const W = 1920;
const H = 1080;

export interface MapConnection {
  from: string;
  to: string;
  type: 'invasion' | 'trade' | 'aid' | 'migration';
  label?: string;
}
export interface MapRoute {
  points: string[];
  label?: string;
}

const CONN_COLORS: Record<MapConnection['type'], string> = {
  invasion: '#e74c3c',
  trade: '#f1c40f',
  aid: '#3498db',
  migration: '#2ecc71',
};

/**
 * Vector map on real country geometry (world-atlas TopoJSON, d3-geo).
 * The camera starts on the world view and eases into the bounding box of the
 * focus countries; every overlay is computed from the SAME projection each
 * frame, so nothing drifts while the camera moves.
 */
export const MapScene: React.FC<{
  focusCountries?: string[];
  connections?: MapConnection[];
  routes?: MapRoute[];
}> = ({ focusCountries = [], connections = [], routes = [] }) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Every country touched by a route or connection is part of the story —
  // color and label it even if the planner forgot to list it in focus.
  const focus = useMemo(() => {
    const codes = new Set(focusCountries.map((c) => c.toUpperCase()));
    for (const r of routes) for (const p of r.points) codes.add(p.toUpperCase());
    for (const c of connections) {
      codes.add(c.from.toUpperCase());
      codes.add(c.to.toUpperCase());
    }
    return [...codes]
      .map((code) => {
        const entry = byCca3.get(code);
        return entry?.feature ? { ...entry, cca3: code } : null;
      })
      .filter((x): x is { feature: Feature; name: string; cca3: string } => x !== null);
  }, [focusCountries, routes, connections]);

  // world-fit and focus-fit projection parameters
  const { s0, t0, s1, t1 } = useMemo(() => {
    const world0 = geoNaturalEarth1().fitExtent(
      [
        [-W * 0.05, -H * 0.05],
        [W * 1.05, H * 1.05],
      ],
      { type: 'Sphere' } as any,
    );
    const start = { s0: world0.scale(), t0: world0.translate() };
    if (focus.length === 0) return { ...start, s1: world0.scale(), t1: world0.translate() };
    const fc: FeatureCollection = { type: 'FeatureCollection', features: focus.map((f) => f.feature!) };
    const zoomed = geoNaturalEarth1().fitExtent(
      [
        [260, 160],
        [W - 260, H - 160],
      ],
      fc as any,
    );
    // don't over-zoom on a single small country
    const s1 = Math.min(zoomed.scale(), start.s0 * 7);
    // recompute translate for the clamped scale by re-centering on the bbox center
    const center = geoPath(geoNaturalEarth1().scale(1).translate([0, 0])).centroid(fc as any);
    const t1: [number, number] = [W / 2 - s1 * center[0], H / 2 - s1 * center[1]];
    return { ...start, s1, t1 };
  }, [focus]);

  // camera: ease world → focus, then keep drifting in slightly
  const t = interpolate(frame, [12, 80], [0, 1], {
    easing: Easing.inOut(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const drift = interpolate(frame, [80, durationInFrames], [1, 1.05], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const scale = (s0 + (s1 - s0) * t) * drift;
  const tx = W / 2 + ((t0[0] - W / 2) + ((t1[0] - W / 2) - (t0[0] - W / 2)) * t) * (scale / (s0 + (s1 - s0) * t));
  const ty = H / 2 + ((t0[1] - H / 2) + ((t1[1] - H / 2) - (t0[1] - H / 2)) * t) * (scale / (s0 + (s1 - s0) * t));

  const projection: GeoProjection = useMemo(
    () => geoNaturalEarth1().scale(scale).translate([tx, ty]),
    [scale, tx, ty],
  );
  const path = useMemo(() => geoPath(projection), [projection]);

  const centroidOf = (cca3: string): [number, number] | null => {
    const entry = byCca3.get(cca3.toUpperCase());
    if (!entry) return null;
    if (entry.feature) {
      const c = path.centroid(entry.feature as any);
      if (Number.isFinite(c[0])) return c as [number, number];
    }
    const meta = (countriesMeta as any[]).find((m) => m.cca3 === cca3.toUpperCase());
    if (meta?.latlng) {
      const p = projection([meta.latlng[1], meta.latlng[0]]);
      if (p) return p as [number, number];
    }
    return null;
  };

  const focusSet = new Set(focus.map((f) => String(f.feature!.id)));

  // curved path through points with a perpendicular arc
  const arcPath = (pts: [number, number][], lift = 0.11): string => {
    if (pts.length < 2) return '';
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i - 1];
      const [x2, y2] = pts[i];
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      // perpendicular, biased upward
      let px = -dy / len;
      let py = dx / len;
      if (py > 0) {
        px = -px;
        py = -py;
      }
      d += ` Q ${mx + px * len * lift} ${my + py * len * lift} ${x2} ${y2}`;
    }
    return d;
  };

  return (
    <AbsoluteFill style={{ backgroundColor: theme.map.ocean, overflow: 'hidden' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
        {/* countries */}
        {world.features.map((f) => {
          const isFocus = focusSet.has(String(f.id));
          const focusIdx = isFocus ? focus.findIndex((x) => String(x.feature!.id) === String(f.id)) : -1;
          const reveal = isFocus ? spring({ frame: frame - 18 - focusIdx * 6, fps, config: { damping: 200 } }) : 0;
          return (
            <path
              key={String(f.id)}
              d={path(f as any) ?? undefined}
              fill={isFocus ? theme.map.focus : theme.map.land}
              fillOpacity={isFocus ? 0.25 + reveal * 0.55 : 1}
              stroke={isFocus ? theme.map.focusStroke : theme.map.landStroke}
              strokeWidth={isFocus ? 2 : 0.8}
            />
          );
        })}

        {/* trade / journey routes */}
        {routes.map((route, rIdx) => {
          const pts = route.points.map((p) => centroidOf(p)).filter((p): p is [number, number] => p !== null);
          if (pts.length < 2) return null;
          const reveal = interpolate(frame, [30 + rIdx * 18, 95 + rIdx * 18], [100, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          return (
            <g key={`r-${rIdx}`}>
              <path
                d={arcPath(pts)}
                fill="none"
                stroke={theme.map.route}
                strokeWidth={5}
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray={100}
                strokeDashoffset={reveal}
                opacity={0.9}
                style={{ filter: `drop-shadow(0 0 8px ${theme.map.route}b0)` }}
              />
            </g>
          );
        })}

        {/* directed connections with arrowheads */}
        {connections.map((conn, cIdx) => {
          const from = centroidOf(conn.from);
          const to = centroidOf(conn.to);
          if (!from || !to) return null;
          const color = CONN_COLORS[conn.type] ?? '#3498db';
          const reveal = interpolate(frame, [40 + cIdx * 14, 85 + cIdx * 14], [100, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const done = reveal <= 2;
          // arrow direction from the quadratic's control point toward the target
          const mx = (from[0] + to[0]) / 2;
          const my = (from[1] + to[1]) / 2 - Math.hypot(to[0] - from[0], to[1] - from[1]) * 0.18;
          const ang = Math.atan2(to[1] - my, to[0] - mx);
          const a = 16;
          const tip = to;
          const left: [number, number] = [tip[0] - a * Math.cos(ang - 0.45), tip[1] - a * Math.sin(ang - 0.45)];
          const right: [number, number] = [tip[0] - a * Math.cos(ang + 0.45), tip[1] - a * Math.sin(ang + 0.45)];
          return (
            <g key={`c-${cIdx}`}>
              <path
                d={`M ${from[0]} ${from[1]} Q ${mx} ${my} ${to[0]} ${to[1]}`}
                fill="none"
                stroke={color}
                strokeWidth={4.5}
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray={100}
                strokeDashoffset={reveal}
                style={{ filter: `drop-shadow(0 0 6px ${color})` }}
              />
              {done ? <polygon points={`${tip[0]},${tip[1]} ${left[0]},${left[1]} ${right[0]},${right[1]}`} fill={color} /> : null}
            </g>
          );
        })}

        {/* dots + labels for focus countries */}
        {focus.map((entry, i) => {
          const c = centroidOf(entry.cca3);
          if (!c) return null;
          const pulse = Math.sin(frame * 0.16 + i * 1.4) * 0.25 + 0.75;
          const reveal = spring({ frame: frame - 22 - i * 6, fps, config: { damping: 200 } });
          return (
            <g key={entry.name} opacity={reveal}>
              <circle cx={c[0]} cy={c[1]} r={9 * pulse + 4} fill={`${theme.map.route}40`} />
              <circle cx={c[0]} cy={c[1]} r={7} fill={theme.map.route} style={{ filter: `drop-shadow(0 0 8px ${theme.map.route})` }} />
              <text
                x={c[0]}
                y={c[1] + 42}
                textAnchor="middle"
                fill={theme.map.label}
                stroke={theme.map.ocean}
                strokeWidth={5}
                paintOrder="stroke"
                style={{ fontFamily: oswald, fontWeight: 700, fontSize: 30, letterSpacing: '0.06em' }}
              >
                {entry.name.toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>

      {/* route label chip */}
      {routes[0]?.label ? (
        <div
          style={{
            position: 'absolute',
            top: '7%',
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: inter,
            fontWeight: 700,
            fontSize: 30,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: theme.map.route,
            backgroundColor: `${theme.map.ocean}c0`,
            border: `1px solid ${theme.map.route}66`,
            padding: '12px 34px',
            borderRadius: 6,
            opacity: interpolate(frame, [25, 45], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}
        >
          {routes[0].label}
        </div>
      ) : null}

      <AbsoluteFill
        style={{ background: 'radial-gradient(circle, transparent 45%, rgba(0,0,0,0.55) 100%)', pointerEvents: 'none' }}
      />
    </AbsoluteFill>
  );
};
