// Pure model for the Voltra dyno bench. Every moving part and the readout come from here.
// The only inputs are the analysis numbers Claude passes in (before → after); nothing is invented.

export type Subsystem = "battery" | "controller" | "motor" | "brakes" | "app" | "backend";

export const SUBSYSTEMS: Subsystem[] = ["battery", "controller", "motor", "brakes", "app", "backend"];

export interface Spec {
  subsystem: Subsystem;
  metric: string;
  before: number;
  after: number;
  unit?: string;
}

export interface Scale {
  lo: number;
  hi: number;
}

/** Gauge scale: both readings sit inside it with a margin, rounded to a tidy step. */
export function scaleOf({ before, after }: Spec): Scale {
  const low = Math.min(before, after);
  const high = Math.max(before, after);
  const span = Math.max(high - low, Math.abs(high) * 0.05, 1e-6);
  const step = 10 ** Math.floor(Math.log10(span));
  return { lo: Math.floor((low - span * 0.6) / step) * step, hi: Math.ceil((high + span * 0.6) / step) * step };
}

export const SWEEP = (270 * Math.PI) / 180;
export const SWEEP_FROM = (-135 * Math.PI) / 180;

export interface BenchState {
  mix: number; // 0 = before the change, 1 = after
  value: number; // the metric at this mix
  norm: number; // value placed on the gauge scale, 0..1
  needle: number; // needle angle, radians
  rpm: number; // disc turns per second
  strip: number; // battery thermal strip fill, 0..1
  seated: number; // firmware cartridge seated, 0 (lifted) .. 1
  squeal: number; // caliper vibration amplitude, 0..1
  bars: number; // display level, 0..1
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function benchAt(spec: Spec, mix: number): BenchState {
  const scale = scaleOf(spec);
  const value = spec.before + (spec.after - spec.before) * mix;
  const norm = clamp01((value - scale.lo) / (scale.hi - scale.lo));
  const { subsystem } = spec;
  return {
    mix,
    value,
    norm,
    needle: SWEEP_FROM + norm * SWEEP,
    rpm: subsystem === "motor" ? 0.25 + norm * 0.9 : 0.35,
    strip: subsystem === "battery" ? 0.08 + norm * 0.9 : 0.5,
    seated: subsystem === "controller" || subsystem === "battery" ? mix : 1,
    squeal: subsystem === "brakes" ? norm : 0,
    bars: subsystem === "app" || subsystem === "backend" ? 0.1 + norm * 0.9 : 0.55,
  };
}

/** Short value text: keeps the precision the inputs carry. */
export function valueText(value: number, spec: Spec) {
  const places = Math.min(
    3,
    Math.max(...[spec.before, spec.after].map((n) => (String(n).split(".")[1] ?? "").length)),
  );
  const text = value.toLocaleString(undefined, { minimumFractionDigits: places, maximumFractionDigits: places });
  return spec.unit ? (/^[%°]/.test(spec.unit) ? `${text}${spec.unit}` : `${text} ${spec.unit}`) : text;
}

export function readoutOf(spec: Spec, mix: number) {
  const state = benchAt(spec, mix);
  const phase = mix < 0.004 ? "before" : mix > 0.996 ? "after" : "changing";
  return `${phase} · ${spec.metric} ${valueText(state.value, spec)}`;
}

/** Idle tour: hold before, ease to after, hold, ease back. Seconds. */
export const LOOP = 9;
const ease = (t: number) => {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
};
export function tourMix(t: number) {
  const at = t % LOOP;
  if (at < 1.8) return 0;
  if (at < 3.6) return ease((at - 1.8) / 1.8);
  if (at < 7.2) return 1;
  return 1 - ease((at - 7.2) / 1.8);
}
