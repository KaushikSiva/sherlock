// Every static path of the Voltra dyno bench, computed once at module load.
import * as k from "../kit/iso-kit";
import type { Flat, Plan, Plane, Point3 } from "../kit/iso-kit";
import {
  BASE,
  BASE_H,
  BRACKET,
  CALIPER,
  CALIPER_TOP,
  CALIPER_Z,
  CARTRIDGE,
  CARTRIDGE_H,
  CTRL,
  CTRL_PLATE,
  CTRL_TOP,
  CTRL_Z,
  DISC_R,
  DISC_TOP,
  DISPLAY,
  DISPLAY_C,
  DISPLAY_TOP,
  DISPLAY_Z,
  DRUM_R,
  DRUM_TOP,
  FIN_COUNT,
  FIN_TOP,
  FLANGE_R,
  FOOT_H,
  GAUGE_C,
  GAUGE_R,
  GAUGE_TOP,
  GAUGE_Z,
  HUB_R,
  HUB_TOP,
  LABEL_PLATE,
  MOTOR_C,
  P,
  PACK,
  PACK_TOP,
  PACK_Z,
  RULER,
  SCREEN,
  SLOT,
  TRAY,
  TRAY_H,
  WINDOW,
  at,
} from "./view";
import { SWEEP, SWEEP_FROM } from "./model";

const solid = (plan: Plan, z: number, h: number, steps = 6, bevel = 0) => k.slabOf(plan, z, h, P, steps, bevel);
const cyl = (cx: number, cy: number, r: number, z: number, h: number, steps = 32, bevel = 0) => k.cylinder(cx, cy, r, z, h, P, steps, bevel);
const ring = (cx: number, cy: number, r: number, z: number, steps = 40) => k.ring(cx, cy, r, z, P, steps);
const seg = (a: Point3, b: Point3) => k.segment(a, b, P);
const join = (paths: string[]) => paths.join("");
const byDepth = <T extends Plane>(pts: T[]) => [...pts].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const screwsOn = (plan: Plan, z: number, inset: number): Flat[] => k.corners(plan, inset).map(([x, y]) => at([x, y, z]));

// ---------- base ----------
const FEET = byDepth(k.corners(BASE, 22));
export const BASE_ART = {
  halo: k.haloOf(BASE, -BASE_H - FOOT_H, BASE_H, P),
  feet: FEET.map(([x, y]) => [cyl(x, y, 8, -BASE_H - FOOT_H, 1.6, 28), cyl(x, y, 6, -BASE_H - FOOT_H + 1.6, FOOT_H - 1.6, 28)]),
  slab: solid(BASE, -BASE_H, BASE_H, 8, 1.6),
  groove: k.planOutline(k.insetPlan(BASE, 5), 0, P),
  screwRings: join(k.corners(BASE, 10).map(([x, y]) => ring(x, y, 2.2, 0, 16))),
  screws: screwsOn(BASE, 0, 10),
  ruler: solid(RULER, 0, 0.6, 3),
  ticks: k.topTicks(RULER.x + 4, RULER.x + RULER.w - 4, 4, 5, RULER.y + 0.6, 0.6, [2, 3.6], P),
  plate: solid(LABEL_PLATE, 0, 0.8, 4),
  plateLine: k.planOutline(k.insetPlan(LABEL_PLATE, 1.6), 0.8, P),
  plateRule: join([0, 1].map((row) => k.lineOnTop([LABEL_PLATE.x + 6, LABEL_PLATE.y + 7.4 + row * 2], [LABEL_PLATE.x + (row ? 30 : 44), LABEL_PLATE.y + 7.4 + row * 2], 0.8, P))),
  plateScrews: [at([LABEL_PLATE.x + 3, LABEL_PLATE.y + LABEL_PLATE.d / 2, 0.8]), at([LABEL_PLATE.x + LABEL_PLATE.w - 3, LABEL_PLATE.y + LABEL_PLATE.d / 2, 0.8])],
  label: k.topMatrix([LABEL_PLATE.x + 6, LABEL_PLATE.y + 4.6], 0.8, P),
};

// ---------- battery pack ----------
const STRAPS: Plan[] = [-121, -50].map((x) => ({ x, y: PACK.y - 1, w: 6, d: PACK.d + 2, r: 1 }));
const TERMINALS: Plane[] = [
  [-32, -55],
  [-32, -44],
];
export const BATTERY_ART = {
  halo: k.haloOf(TRAY, 0, TRAY_H, P),
  tray: solid(TRAY, 0, TRAY_H, 6, 0.6),
  trayScrews: screwsOn(TRAY, TRAY_H, 3.5),
  pack: solid(PACK, PACK_Z, PACK_TOP - PACK_Z, 8, 1.2),
  seams: join([10, 26].map((z) => k.sideSeam(PACK, z, P, 8))),
  vents: k.dotGrid(PACK.x + 8, PACK.y + 6, 13, 4, 6.5, PACK_TOP, P),
  window: k.planOutline(WINDOW, PACK_TOP, P, 4),
  straps: STRAPS.map((plan) => solid(plan, PACK_TOP, 1.4, 3)),
  strapScrews: STRAPS.flatMap((plan) => [at([plan.x + 3, plan.y + 2, PACK_TOP + 1.4]), at([plan.x + 3, plan.y + plan.d - 2, PACK_TOP + 1.4])]),
  terminals: TERMINALS.map(([x, y]) => [cyl(x, y, 3.4, PACK_TOP, 1.2, 24), cyl(x, y, 2.2, PACK_TOP + 1.2, 3, 20)]),
  terminalCaps: join(TERMINALS.map(([x, y]) => ring(x, y, 1.1, PACK_TOP + 4.2, 12))),
  latch: cyl(-30, -27, 3.6, PACK_TOP, 3.4, 28),
  latchKnurl: k.knurl(-30, -27, 3.6, PACK_TOP, PACK_TOP + 3.4, 22, P),
  plug: solid({ x: PACK.x + PACK.w, y: -36, w: 5, d: 12, r: 1 }, 8, 8, 3, 0.4),
  plugPins: [at([PACK.x + PACK.w + 5, -33, 12]), at([PACK.x + PACK.w + 5, -27, 12])],
};
export const STRIP_PLAN: Plan = { x: WINDOW.x + 1, y: WINDOW.y + 1, w: WINDOW.w - 2, d: WINDOW.d - 2, r: 1 };

// ---------- controller ----------
const FINS: Plan[] = Array.from({ length: FIN_COUNT }, (_, i) => ({ x: CTRL.x + 6 + i * 9, y: CTRL.y + 4, w: 3.2, d: 30, r: 0.6 }));
const CONNECTORS: Plan[] = [26, 56].map((x) => ({ x, y: CTRL.y + CTRL.d, w: 12, d: 4, r: 1 }));
export const CONTROLLER_ART = {
  halo: k.haloOf(CTRL_PLATE, 0, 2, P),
  plate: solid(CTRL_PLATE, 0, CTRL_Z, 5, 0.5),
  plateScrews: screwsOn(CTRL_PLATE, CTRL_Z, 3),
  housing: solid(CTRL, CTRL_Z, CTRL_TOP - CTRL_Z, 6, 1),
  seam: k.sideSeam(CTRL, 7, P, 6),
  fins: FINS.map((plan) => solid(plan, CTRL_TOP, FIN_TOP - CTRL_TOP, 2, 0.3)),
  finBase: k.planOutline({ x: CTRL.x + 4, y: CTRL.y + 2, w: FIN_COUNT * 9 - 2, d: 34, r: 1 }, CTRL_TOP, P, 3),
  slot: k.planOutline(SLOT, CTRL_TOP, P, 3),
  slotInner: k.planOutline(k.insetPlan(SLOT, 0.6), CTRL_TOP, P, 3),
  leds: [0, 1, 2].map((i) => at([CTRL.x + 84 + i * 4.5, CTRL.y + CTRL.d - 5, CTRL_TOP])),
  ledRings: join([0, 1, 2].map((i) => ring(CTRL.x + 84 + i * 4.5, CTRL.y + CTRL.d - 5, 1.3, CTRL_TOP, 12))),
  connectors: CONNECTORS.map((plan) => solid(plan, 6, 8, 3, 0.4)),
  connectorPins: CONNECTORS.flatMap((plan) => [at([plan.x + 4, plan.y + 4, 10]), at([plan.x + 8, plan.y + 4, 10])]),
  housingScrews: screwsOn(CTRL, CTRL_TOP, 3),
};
export const CARTRIDGE_ART = {
  body: solid(CARTRIDGE, CTRL_TOP, CARTRIDGE_H, 3, 0.4),
  grip: join([2.5, 4.5, 6.5].map((dy) => k.lineOnTop([CARTRIDGE.x, CARTRIDGE.y + dy], [CARTRIDGE.x + CARTRIDGE.w, CARTRIDGE.y + dy], CTRL_TOP + CARTRIDGE_H, P))),
  label: k.planOutline({ x: CARTRIDGE.x + 2, y: CARTRIDGE.y + 8.5, w: CARTRIDGE.w - 4, d: 4, r: 0.6 }, CTRL_TOP + CARTRIDGE_H, P, 2),
};

// ---------- hub motor on the dyno ----------
const [MX, MY] = MOTOR_C;
export const MOTOR_ART = {
  halo: k.haloOf({ x: MX - FLANGE_R, y: MY - FLANGE_R, w: FLANGE_R * 2, d: FLANGE_R * 2, r: FLANGE_R }, 0, 3, P),
  flange: cyl(MX, MY, FLANGE_R, 0, 3, 64, 0.6),
  flangeBolts: Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return at([MX + Math.cos(a) * (FLANGE_R - 4), MY + Math.sin(a) * (FLANGE_R - 4), 3]);
  }),
  flangeRing: ring(MX, MY, FLANGE_R - 6.5, 3, 64),
  drum: cyl(MX, MY, DRUM_R, 3, DRUM_TOP - 3, 64, 0.8),
  drumSeams: join([8, 19].map((z) => k.sideArc(MX, MY, DRUM_R, z, P, 40))),
  ribs: k.knurl(MX, MY, DRUM_R, 8, 19, 56, P, 0),
  disc: cyl(MX, MY, DISC_R, DRUM_TOP, DISC_TOP - DRUM_TOP, 72, 0.3),
  discRing: ring(MX, MY, DISC_R - 9, DISC_TOP, 72),
  hub: cyl(MX, MY, HUB_R, DISC_TOP, HUB_TOP - DISC_TOP, 40, 0.6),
  hubRing: ring(MX, MY, HUB_R - 2.4, HUB_TOP, 32),
  nut: k.extrude(k.circleRing(MX, MY, 4.6, 6), HUB_TOP, 3, P),
};

export const CALIPER_ART = {
  bracket: solid(BRACKET, 0, CALIPER_Z + 2, 3, 0.5),
  bracketScrews: [at([BRACKET.x + 5, BRACKET.y + 3, CALIPER_Z + 2]), at([BRACKET.x + 5, BRACKET.y + BRACKET.d - 3, CALIPER_Z + 2])],
  body: solid(CALIPER, CALIPER_Z, CALIPER_TOP - CALIPER_Z, 4, 0.8),
  seam: k.sideSeam(CALIPER, DISC_TOP - 0.5, P, 4),
  piston: cyl(31, 30, 4.4, CALIPER_TOP, 1.4, 28),
  pistonRing: ring(31, 30, 2.6, CALIPER_TOP + 1.4, 20),
  bleed: cyl(38, 24.5, 1.3, CALIPER_TOP, 3.2, 16),
  bolts: [at([CALIPER.x + 3, CALIPER.y + 3, CALIPER_TOP]), at([CALIPER.x + 3, CALIPER.y + CALIPER.d - 3, CALIPER_TOP])],
};

// ---------- dial gauge ----------
const [GX, GY] = GAUGE_C;
const STAND: Plan = { x: GX - 14, y: GY - 12, w: 28, d: 24, r: 3 };
const GAUGE_TICKS = k.radialTicks(GX, GY, GAUGE_R - 3, 40, 5, GAUGE_TOP, [1.3, 2.8], P, SWEEP_FROM, SWEEP);
export const GAUGE_ART = {
  stand: solid(STAND, 0, 4, 4, 0.6),
  standScrews: screwsOn(STAND, 4, 3),
  post: cyl(GX, GY, 3.2, 4, GAUGE_Z - 4, 20),
  puck: cyl(GX, GY, GAUGE_R, GAUGE_Z, GAUGE_TOP - GAUGE_Z, 64, 0.8),
  knurl: k.knurl(GX, GY, GAUGE_R, GAUGE_TOP - 3.4, GAUGE_TOP, 84, P, 0.3),
  band: k.sideArc(GX, GY, GAUGE_R, GAUGE_TOP - 3.4, P, 40),
  bezel: ring(GX, GY, GAUGE_R - 2.2, GAUGE_TOP, 64),
  minor: GAUGE_TICKS.minor,
  major: GAUGE_TICKS.major,
  crown: solid({ x: GX + GAUGE_R - 0.5, y: GY - 2, w: 4, d: 4, r: 1 }, GAUGE_Z + 2, 4, 3),
  crownCap: cyl(GX + GAUGE_R + 5, GY, 2.4, GAUGE_Z + 1.6, 4.8, 20),
  hub: ring(GX, GY, 1.6, GAUGE_TOP, 16),
};
export const GAUGE_CENTER: Plane = [GX, GY];

// ---------- handlebar display ----------
const [DX, DY] = DISPLAY_C;
const CLAMP: Plan = { x: DX - 6, y: DY - 6, w: 12, d: 12, r: 2 };
const BUTTONS: Plane[] = [
  [DISPLAY.x + DISPLAY.w - 6, DISPLAY.y + 7],
  [DISPLAY.x + DISPLAY.w - 6, DISPLAY.y + 15],
  [DISPLAY.x + DISPLAY.w - 6, DISPLAY.y + 23],
];
export const DISPLAY_ART = {
  foot: cyl(DX, DY, 9, 0, 2, 32, 0.4),
  footScrews: [0, 1, 2].map((i) => {
    const a = (i / 3) * Math.PI * 2 + 0.6;
    return at([DX + Math.cos(a) * 6.4, DY + Math.sin(a) * 6.4, 2]);
  }),
  post: cyl(DX, DY, 3, 2, DISPLAY_Z - 6, 20),
  postMarks: join([7, 10].map((z) => k.sideArc(DX, DY, 3, z, P, 12))),
  clamp: solid(CLAMP, DISPLAY_Z - 4, 4, 3, 0.5),
  clampScrew: cyl(DX + 6.6, DY, 1.6, DISPLAY_Z - 3.2, 2.4, 14),
  housing: solid(DISPLAY, DISPLAY_Z, DISPLAY_TOP - DISPLAY_Z, 5, 1),
  screen: k.planOutline(SCREEN, DISPLAY_TOP, P, 3),
  screenInner: k.planOutline(k.insetPlan(SCREEN, 1.2), DISPLAY_TOP, P, 3),
  buttons: BUTTONS.map(([x, y]) => cyl(x, y, 2, DISPLAY_TOP, 1.2, 18)),
};

// ---------- harness (wires on the floor, ending on connectors) ----------
export const WIRES: { from: Flat; via: Flat[]; to: Flat }[] = [
  { from: at([PACK.x + PACK.w + 5, -30, 12]), via: [at([-8, -30, 0.4]), at([-8, -10, 0.4]), at([32, -10, 0.4])], to: at([32, CTRL.y + CTRL.d + 4, 10]) },
  { from: at([62, CTRL.y + CTRL.d + 4, 10]), via: [at([62, -9, 0.4]), at([16, -9, 0.4])], to: at([13, -1.5, 3]) },
  { from: at([28, CTRL.y + CTRL.d + 4, 7]), via: [at([28, -13, 0.4]), at([-66, -13, 0.4]), at([-86, 30, 0.4])], to: at([DX + 8.6, DY - 2, 2]) },
];
