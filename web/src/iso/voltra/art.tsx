// Static parts of the bench as JSX, built once per lit subsystem and handed to the live component.
import * as React from "react";
import { Dots, FaceText, Line, Solid, Wire } from "../kit/react/draw";
import {
  BASE_ART,
  BATTERY_ART,
  CALIPER_ART,
  CARTRIDGE_ART,
  CONTROLLER_ART,
  DISPLAY_ART,
  GAUGE_ART,
  MOTOR_ART,
  WIRES,
} from "./geometry";
import type { Subsystem } from "./model";

export function artFor(lit: Subsystem) {
  const BASE = (
    <g key="base">
      <path className="iso-halo" d={BASE_ART.halo} />
      {BASE_ART.feet.map((parts, i) => (
        <g key={i}>
          {parts.map((paths, part) => (
            <Solid key={part} paths={paths} tone={part ? "mid" : "lo"} crease="faint" />
          ))}
        </g>
      ))}
      <Solid paths={BASE_ART.slab} tone="mid" crease="faint" />
      <Line d={BASE_ART.groove} tone="lo" />
      <Line d={BASE_ART.screwRings} tone="lo" />
      <Dots points={BASE_ART.screws} size={0.5} tone="mid" />
      <Solid paths={BASE_ART.ruler} tone="lo" crease="none" />
      <Line d={BASE_ART.ticks.minor} tone="lo" />
      <Line d={BASE_ART.ticks.major} tone="mid" />
      <Solid paths={BASE_ART.plate} tone="lo" crease="none" />
      <Line d={BASE_ART.plateLine} tone="faint" />
      <Line d={BASE_ART.plateRule} tone="lo" free />
      <Dots points={BASE_ART.plateScrews} size={0.45} tone="mid" />
      <FaceText transform={BASE_ART.label} size={2.6} tone="lo">
        VOLTRA · DYNO 02
      </FaceText>
    </g>
  );

  const BATTERY = (
    <g key="battery" data-part="battery">
      <path className="iso-halo" d={BATTERY_ART.halo} />
      <Solid paths={BATTERY_ART.tray} tone="lo" crease="faint" />
      <Dots points={BATTERY_ART.trayScrews} size={0.45} tone="mid" />
      <Solid paths={BATTERY_ART.pack} tone={lit === "battery" ? "hi" : "mid"} crease="faint" inner={<Line d={BATTERY_ART.seams} tone="faint" />} />
      <Dots points={BATTERY_ART.vents} size={0.55} tone="lo" />
      <Line d={BATTERY_ART.window} tone="lo" />
      {BATTERY_ART.straps.map((paths, i) => (
        <Solid key={i} paths={paths} tone="mid" crease="none" />
      ))}
      <Dots points={BATTERY_ART.strapScrews} size={0.45} tone="mid" />
      {BATTERY_ART.terminals.map((parts, i) => (
        <g key={i}>
          <Solid paths={parts[0]} tone="mid" crease="faint" />
          <Solid paths={parts[1]} tone="mid" crease="faint" />
        </g>
      ))}
      <Line d={BATTERY_ART.terminalCaps} tone="mid" />
      <Solid paths={BATTERY_ART.latch} tone="mid" crease="faint" />
      <Line d={BATTERY_ART.latchKnurl} tone="lo" />
      <Solid paths={BATTERY_ART.plug} tone="mid" crease="faint" />
      <Dots points={BATTERY_ART.plugPins} size={0.5} tone="hi" />
    </g>
  );

  const CONTROLLER = (
    <g key="controller" data-part="controller">
      <path className="iso-halo" d={CONTROLLER_ART.halo} />
      <Solid paths={CONTROLLER_ART.plate} tone="lo" crease="faint" />
      <Dots points={CONTROLLER_ART.plateScrews} size={0.45} tone="mid" />
      <Solid paths={CONTROLLER_ART.housing} tone={lit === "controller" ? "hi" : "mid"} crease="faint" inner={<Line d={CONTROLLER_ART.seam} tone="faint" />} />
      <Line d={CONTROLLER_ART.finBase} tone="faint" />
      {CONTROLLER_ART.fins.map((paths, i) => (
        <Solid key={i} paths={paths} tone="mid" crease="none" />
      ))}
      <Line d={CONTROLLER_ART.slot} tone="lo" />
      <Line d={CONTROLLER_ART.slotInner} tone="faint" />
      <Line d={CONTROLLER_ART.ledRings} tone="lo" />
      <Dots points={CONTROLLER_ART.leds} size={0.75} tone="hi" pulse={lit === "backend" || lit === "controller"} />
      <Dots points={CONTROLLER_ART.housingScrews} size={0.45} tone="mid" />
      {CONTROLLER_ART.connectors.map((paths, i) => (
        <Solid key={i} paths={paths} tone="mid" crease="faint" />
      ))}
      <Dots points={CONTROLLER_ART.connectorPins} size={0.45} tone="hi" />
    </g>
  );

  const CARTRIDGE = (
    <g key="cartridge">
      <Solid paths={CARTRIDGE_ART.body} tone={lit === "controller" ? "hi" : "mid"} lit={lit === "controller"} crease="lo" />
      <Line d={CARTRIDGE_ART.grip} tone="lo" />
      <Line d={CARTRIDGE_ART.label} tone="faint" />
    </g>
  );

  const HARNESS = (
    <g key="harness">
      {WIRES.map((w, i) => (
        <Wire key={i} from={w.from} via={w.via} to={w.to} tone={i === 1 && lit === "motor" ? "hi" : "lo"} size={1.1} />
      ))}
    </g>
  );

  const DISPLAY = (
    <g key="display" data-part="display">
      <Solid paths={DISPLAY_ART.foot} tone="lo" crease="faint" />
      <Dots points={DISPLAY_ART.footScrews} size={0.45} tone="mid" />
      <Solid paths={DISPLAY_ART.post} tone="mid" crease="none" />
      <Line d={DISPLAY_ART.postMarks} tone="lo" />
      <Solid paths={DISPLAY_ART.clamp} tone="mid" crease="faint" />
      <Solid paths={DISPLAY_ART.clampScrew} tone="mid" crease="faint" />
      <Solid paths={DISPLAY_ART.housing} tone={lit === "app" || lit === "backend" ? "hi" : "mid"} lit={lit === "app" || lit === "backend"} crease="faint" />
      <Line d={DISPLAY_ART.screen} tone="lo" />
      <Line d={DISPLAY_ART.screenInner} tone="faint" />
      {DISPLAY_ART.buttons.map((paths, i) => (
        <Solid key={i} paths={paths} tone="mid" crease="faint" />
      ))}
    </g>
  );

  const MOTOR_LOW = (
    <g key="motor-low" data-part="motor">
      <path className="iso-halo" d={MOTOR_ART.halo} />
      <Solid paths={MOTOR_ART.flange} tone="lo" crease="faint" />
      <Line d={MOTOR_ART.flangeRing} tone="faint" />
      <Dots points={MOTOR_ART.flangeBolts} size={0.5} tone="mid" />
      <Solid paths={MOTOR_ART.drum} tone={lit === "motor" ? "hi" : "mid"} lit={lit === "motor"} crease="lo" inner={<Line d={MOTOR_ART.drumSeams} tone="faint" />} />
      <Line d={MOTOR_ART.ribs} tone="lo" />
      <Solid paths={MOTOR_ART.disc} tone="mid" crease="faint" />
      <Line d={MOTOR_ART.discRing} tone="faint" />
    </g>
  );

  const HUB = (
    <g key="hub">
      <Solid paths={MOTOR_ART.hub} tone="mid" crease="faint" />
      <Line d={MOTOR_ART.hubRing} tone="lo" />
      <Solid paths={MOTOR_ART.nut} tone="mid" crease="faint" />
    </g>
  );

  const CALIPER = (
    <g key="caliper" data-part="brakes">
      <Solid paths={CALIPER_ART.body} tone={lit === "brakes" ? "hi" : "mid"} lit={lit === "brakes"} crease="faint" inner={<Line d={CALIPER_ART.seam} tone="faint" />} />
      <Solid paths={CALIPER_ART.piston} tone="mid" crease="faint" />
      <Line d={CALIPER_ART.pistonRing} tone="lo" />
      <Solid paths={CALIPER_ART.bleed} tone="mid" crease="none" />
      <Dots points={CALIPER_ART.bolts} size={0.5} tone="mid" />
    </g>
  );

  const BRACKET = (
    <g key="bracket">
      <Solid paths={CALIPER_ART.bracket} tone="mid" crease="faint" />
      <Dots points={CALIPER_ART.bracketScrews} size={0.45} tone="mid" />
    </g>
  );

  const GAUGE = (
    <g key="gauge">
      <Solid paths={GAUGE_ART.stand} tone="lo" crease="faint" />
      <Dots points={GAUGE_ART.standScrews} size={0.45} tone="mid" />
      <Solid paths={GAUGE_ART.post} tone="mid" crease="none" />
      <Solid paths={GAUGE_ART.crown} tone="mid" crease="faint" />
      <Solid paths={GAUGE_ART.crownCap} tone="mid" crease="faint" />
      <Solid paths={GAUGE_ART.puck} tone="hi" crease="lo" />
      <Line d={GAUGE_ART.band} tone="faint" />
      <Line d={GAUGE_ART.knurl} tone="faint" />
      <Line d={GAUGE_ART.bezel} tone="lo" />
      <Line d={GAUGE_ART.minor} tone="lo" />
      <Line d={GAUGE_ART.major} tone="mid" />
    </g>
  );

  return { BASE, BATTERY, CONTROLLER, CARTRIDGE, HARNESS, DISPLAY, MOTOR_LOW, HUB, BRACKET, CALIPER, GAUGE };
}
