// Paths for the parts that move or change shape, rebuilt from the model each frame.
import * as k from "../kit/iso-kit";
import type { Flat, Plan } from "../kit/iso-kit";
import { GAUGE_CENTER, STRIP_PLAN } from "./geometry";
import type { BenchState } from "./model";
import { BOLTS, BOLT_R, CARTRIDGE_LIFT, DISC_TOP, DISPLAY_TOP, GAUGE_R, GAUGE_TOP, MOTOR_C, P, SCREEN, VENTS, VENT_R, at } from "./view";

export function needleOf(angle: number) {
  const [cx, cy] = GAUGE_CENTER;
  const sx = Math.sin(angle);
  const sy = -Math.cos(angle);
  return k.lineOnTop([cx - sx * 1.6, cy - sy * 1.6], [cx + sx * (GAUGE_R - 4.2), cy + sy * (GAUGE_R - 4.2)], GAUGE_TOP + 0.2, P);
}

const ringOfDots = (count: number, radius: number, theta: number): Flat[] =>
  Array.from({ length: count }, (_, i) => {
    const a = theta + (i / count) * Math.PI * 2;
    return at([MOTOR_C[0] + Math.cos(a) * radius, MOTOR_C[1] + Math.sin(a) * radius, DISC_TOP]);
  });

export const ventsOf = (theta: number) => ringOfDots(VENTS, VENT_R, theta);
export const boltsOf = (theta: number) => ringOfDots(BOLTS, BOLT_R, theta * 1);

export function stripOf(fill: number) {
  const plan: Plan = { ...STRIP_PLAN, w: Math.max(2.4, STRIP_PLAN.w * fill) };
  return k.slabOf(plan, 33, 0.8, P, 3);
}

const BAR_PROFILE = [0.55, 0.8, 0.65, 1, 0.75, 0.9];
export function barsOf(level: number) {
  return BAR_PROFILE.map((f, i) => {
    const len = Math.max(1.2, (0.25 + 0.75 * f) * level * (SCREEN.d - 5));
    const plan: Plan = { x: SCREEN.x + 3 + i * 5.4, y: SCREEN.y + SCREEN.d - 2.5 - len, w: 3.4, d: len, r: 0.4 };
    return k.slabOf(plan, DISPLAY_TOP, 0.5, P, 2);
  });
}

export const cartridgeAt = (seated: number) => k.translateAlong(P, [0, 0, (1 - seated) * CARTRIDGE_LIFT]);

export interface Frame {
  needle: string;
  vents: Flat[];
  bolts: Flat[];
  strip: k.SolidPaths;
  bars: k.SolidPaths[];
  cartridge: string;
}

export function frameOf(state: BenchState, theta: number): Frame {
  return {
    needle: needleOf(state.needle),
    vents: ventsOf(theta),
    bolts: boltsOf(theta),
    strip: stripOf(state.strip),
    bars: barsOf(state.bars),
    cartridge: cartridgeAt(state.seated),
  };
}
