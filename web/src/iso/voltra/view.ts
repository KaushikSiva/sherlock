// World layout and camera for the Voltra dyno bench (world units ≈ px, x/y on the floor, z up).
import { boxCorners, fitProjection, iso, type Plan, type Point3 } from "../kit/iso-kit";

export const WIDTH = 640;
export const HEIGHT = 380;
export const AZIMUTH = 50;

export const BASE: Plan = { x: -152, y: -82, w: 304, d: 164, r: 9 };
export const BASE_H = 10;
export const FOOT_H = 5;

// Battery pack, back left.
export const TRAY: Plan = { x: -138, y: -70, w: 124, d: 58, r: 4 };
export const TRAY_H = 3;
export const PACK: Plan = { x: -132, y: -64, w: 112, d: 46, r: 6 };
export const PACK_Z = TRAY_H;
export const PACK_TOP = 33;
export const WINDOW: Plan = { x: -110, y: -30, w: 54, d: 7, r: 1.5 };

// Controller, back right.
export const CTRL_PLATE: Plan = { x: 12, y: -70, w: 112, d: 56, r: 3 };
export const CTRL: Plan = { x: 18, y: -64, w: 100, d: 46, r: 4 };
export const CTRL_Z = 2;
export const CTRL_TOP = 22;
export const FIN_COUNT = 8;
export const FIN_TOP = 29;
export const SLOT: Plan = { x: 100, y: -58, w: 12, d: 16, r: 1.5 };
export const CARTRIDGE: Plan = { x: 101, y: -57, w: 10, d: 14, r: 1 };
export const CARTRIDGE_H = 9;
export const CARTRIDGE_LIFT = 9;

// Hub motor on the dyno, front centre, with its brake disc and caliper.
export const MOTOR_C: [number, number] = [0, 30];
export const FLANGE_R = 34;
export const DRUM_R = 24;
export const DRUM_TOP = 24;
export const DISC_R = 36;
export const DISC_TOP = 26;
export const HUB_R = 10;
export const HUB_TOP = 30;
export const VENTS = 24;
export const VENT_R = 31;
export const BOLTS = 6;
export const BOLT_R = 13.5;

export const CALIPER: Plan = { x: 24, y: 20, w: 18, d: 20, r: 3 };
export const CALIPER_Z = 20;
export const CALIPER_TOP = 31;
export const BRACKET: Plan = { x: 38, y: 24, w: 10, d: 12, r: 1.5 };

// Dial gauge, front right.
export const GAUGE_C: [number, number] = [110, 40];
export const GAUGE_R = 16;
export const GAUGE_Z = 9;
export const GAUGE_TOP = 17;

// Handlebar display on a pedestal, front left.
export const DISPLAY_C: [number, number] = [-100, 37];
export const DISPLAY: Plan = { x: -126, y: 22, w: 52, d: 30, r: 3 };
export const DISPLAY_Z = 20;
export const DISPLAY_TOP = 27;
export const SCREEN: Plan = { x: -121, y: 26, w: 36, d: 22, r: 1.5 };

export const RULER: Plan = { x: -128, y: 64, w: 190, d: 7, r: 1 };
export const LABEL_PLATE: Plan = { x: 78, y: 60, w: 58, d: 12, r: 2 };

const tallest: Point3[] = [
  [PACK.x, PACK.y, PACK_TOP + 4],
  [CARTRIDGE.x + CARTRIDGE.w, CARTRIDGE.y, CTRL_TOP + CARTRIDGE_H + CARTRIDGE_LIFT],
  [MOTOR_C[0], MOTOR_C[1], HUB_TOP + 3],
];

export const P = fitProjection([...boxCorners(BASE, -BASE_H - FOOT_H, 0), ...tallest], WIDTH, HEIGHT, { pad: 26, azimuth: AZIMUTH });

export const at = (point: Point3) => iso(point, P);
