// The one live component: a single loop eases the before→after mix, spins the disc and writes refs.
import * as React from "react";
import type { SolidPaths } from "../kit/iso-kit";
import { IsoFigure } from "../kit/react/draw";
import { follow, useInView, useLoop, useReadout } from "../kit/react/live";
import { artFor } from "./art";
import { GAUGE_ART } from "./geometry";
import { Line } from "../kit/react/draw";
import { frameOf } from "./frame";
import { benchAt, readoutOf, tourMix, valueText, type Spec } from "./model";
import { HEIGHT, WIDTH } from "./view";

const TOUR_FIRST = 1.4;
const TOUR_BACK = 3.6;
const FOLLOW = 0.32;
const STEP = 0.1;

interface SolidNodes {
  fill: SVGPathElement | null;
  shades: (SVGPathElement | null)[];
  top: SVGPathElement | null;
  edge: SVGPathElement | null;
}

const emptySolid = (): SolidNodes => ({ fill: null, shades: [null, null, null, null], top: null, edge: null });

function writeSolid(nodes: SolidNodes, paths: SolidPaths) {
  nodes.fill?.setAttribute("d", paths.fill);
  paths.shades.forEach((d, i) => nodes.shades[i]?.setAttribute("d", d || ""));
  nodes.top?.setAttribute("d", paths.top);
  nodes.edge?.setAttribute("d", paths.outline);
}

function LiveSolid({ nodes, tone, lit }: { nodes: SolidNodes; tone: string; lit?: boolean }) {
  return (
    <g className="iso-solid" data-lit={lit ? "" : undefined}>
      <path className="iso-fill" ref={(n) => void (nodes.fill = n)} />
      {[0, 1, 2, 3].map((i) => (
        <path key={i} className="iso-shade" data-shade={i} ref={(n) => void (nodes.shades[i] = n)} />
      ))}
      <path className="iso-top" ref={(n) => void (nodes.top = n)} />
      <path className="iso-line iso-edge" data-tone={tone} ref={(n) => void (nodes.edge = n)} />
    </g>
  );
}

export function BenchLive({ spec, label }: { spec: Spec; label: string }) {
  const { anchor, say } = useReadout<HTMLDivElement>();
  const visible = useInView(anchor);
  const art = React.useMemo(() => artFor(spec.subsystem), [spec.subsystem]);
  const first = React.useMemo(() => frameOf(benchAt(spec, 0), 0), [spec]);

  const s = React.useRef({ mix: 0, target: 0, theta: 0, clock: 0, idle: TOUR_FIRST, touring: true, jitter: 0 });
  const needle = React.useRef<SVGPathElement>(null);
  const cartridge = React.useRef<SVGGElement>(null);
  const caliper = React.useRef<SVGGElement>(null);
  const vents = React.useRef<(SVGCircleElement | null)[]>([]);
  const bolts = React.useRef<(SVGCircleElement | null)[]>([]);
  const strip = React.useRef<SolidNodes>(emptySolid());
  const bars = React.useRef<SolidNodes[]>(first.bars.map(emptySolid));

  const specRef = React.useRef(spec);
  specRef.current = spec;

  const draw = React.useCallback(() => {
    const st = s.current;
    const state = benchAt(specRef.current, st.mix);
    const f = frameOf(state, st.theta);
    needle.current?.setAttribute("d", f.needle);
    cartridge.current?.setAttribute("transform", f.cartridge);
    f.vents.forEach(([x, y], i) => {
      vents.current[i]?.setAttribute("cx", x.toFixed(1));
      vents.current[i]?.setAttribute("cy", y.toFixed(1));
    });
    f.bolts.forEach(([x, y], i) => {
      bolts.current[i]?.setAttribute("cx", x.toFixed(1));
      bolts.current[i]?.setAttribute("cy", y.toFixed(1));
    });
    writeSolid(strip.current, f.strip);
    f.bars.forEach((paths, i) => bars.current[i] && writeSolid(bars.current[i], paths));
    const shake = state.squeal * 0.7 * Math.sin(st.jitter);
    caliper.current?.setAttribute("transform", shake ? `translate(${shake.toFixed(2)} ${(shake * 0.4).toFixed(2)})` : "");
    say(readoutOf(specRef.current, st.mix));
  }, [say]);

  React.useEffect(() => {
    s.current.mix = 0;
    s.current.target = 0;
    s.current.clock = 0;
    s.current.touring = true;
    s.current.idle = TOUR_FIRST;
    draw();
  }, [spec, draw]);

  const kick = useLoop((dt, calm) => {
    const st = s.current;
    if (st.idle > 0) st.idle -= dt;
    else if (st.touring) {
      st.clock += dt;
      st.target = tourMix(st.clock);
    }
    if (calm && st.touring && st.idle <= 0) st.target = 1;
    st.mix = follow(st.mix, st.target, dt, FOLLOW, calm);
    const state = benchAt(specRef.current, st.mix);
    if (!calm) {
      st.theta += dt * state.rpm * Math.PI * 2;
      st.jitter += dt * 2 * Math.PI * 23;
    }
    draw();
    return !calm || st.mix !== st.target;
  }, visible);

  const pause = () => {
    s.current.touring = false;
    s.current.idle = TOUR_BACK;
  };
  const resume = () => {
    s.current.touring = true;
    s.current.idle = TOUR_BACK;
    s.current.clock = s.current.mix > 0.5 ? 3.6 : 0;
    kick();
  };
  const setTarget = (mix: number) => {
    pause();
    s.current.target = Math.min(1, Math.max(0, mix));
    kick();
  };

  return (
    <div
      ref={anchor}
      className="vb"
      tabIndex={0}
      role="slider"
      aria-label={`${label} Hover or use arrow keys to move between before and after.`}
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuetext={`${spec.metric}: ${valueText(spec.before, spec)} before, ${valueText(spec.after, spec)} after`}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setTarget((e.clientX - r.left - r.width * 0.15) / (r.width * 0.7));
      }}
      onPointerLeave={resume}
      onKeyDown={(e) => {
        const t = s.current.target;
        const big = e.shiftKey ? 3 : 1;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") setTarget(t + STEP * big);
        else if (e.key === "ArrowLeft" || e.key === "ArrowDown") setTarget(t - STEP * big);
        else if (e.key === "Home") setTarget(0);
        else if (e.key === "End") setTarget(1);
        else if (e.key === "Escape") resume();
        else return;
        e.preventDefault();
      }}
      onBlur={resume}
    >
      <IsoFigure width={WIDTH} height={HEIGHT} label={label}>
        {art.BASE}
        {art.BATTERY}
        <g key="strip" className="vb-strip">
          <LiveSolid nodes={strip.current} tone={spec.subsystem === "battery" ? "lit" : "mid"} lit={spec.subsystem === "battery"} />
        </g>
        {art.CONTROLLER}
        <g key="cartridge-move" ref={cartridge} transform={first.cartridge}>
          {art.CARTRIDGE}
        </g>
        {art.HARNESS}
        {art.DISPLAY}
        <g key="bars" className="vb-bars">
          {first.bars.map((_, i) => (
            <LiveSolid key={i} nodes={bars.current[i]} tone={spec.subsystem === "app" || spec.subsystem === "backend" ? "hi" : "lo"} />
          ))}
        </g>
        {art.MOTOR_LOW}
        <g key="vents" className="iso-dots" data-tone="lo">
          {first.vents.map(([x, y], i) => (
            <circle key={i} ref={(n) => void (vents.current[i] = n)} cx={x.toFixed(1)} cy={y.toFixed(1)} r={0.75} />
          ))}
        </g>
        <g key="bolts" className="iso-dots" data-tone="mid">
          {first.bolts.map(([x, y], i) => (
            <circle key={i} ref={(n) => void (bolts.current[i] = n)} cx={x.toFixed(1)} cy={y.toFixed(1)} r={0.6} />
          ))}
        </g>
        {art.HUB}
        {art.BRACKET}
        <g key="caliper-move" ref={caliper}>
          {art.CALIPER}
        </g>
        {art.GAUGE}
        <path key="needle" ref={needle} className="iso-line vb-needle" data-tone="lit" d={first.needle} />
        <Line key="gauge-hub" d={GAUGE_ART.hub} tone="hi" />
      </IsoFigure>
    </div>
  );
}
