import { Plate } from "../kit/react/draw";
import { BenchLive } from "./live";
import { readoutOf, valueText, type Spec, type Subsystem } from "./model";

const PART: Record<Subsystem, string> = {
  battery: "Battery pack",
  controller: "Motor controller",
  motor: "Hub motor",
  brakes: "Brake caliper",
  app: "Rider app",
  backend: "Cloud backend",
};

const LIT_KEY: Record<Subsystem, string> = {
  battery: "The battery pack, with its thermal strip",
  controller: "The controller's firmware cartridge",
  motor: "The hub motor on the dyno",
  brakes: "The brake caliper on the disc",
  app: "The handlebar display (rider app)",
  backend: "The display and the controller's link lights",
};

export function VoltraBench({ spec, cause, note, fig = "Fig 1" }: { spec: Spec; cause: string; note?: string; fig?: string }) {
  const label =
    `A Voltra e-bike powertrain on a dyno test bench: a battery pack, a motor controller with a firmware cartridge, ` +
    `a hub motor with a brake disc and caliper, a handlebar display and a dial gauge. The ${PART[spec.subsystem].toLowerCase()} is lit. ` +
    `${cause} moved ${spec.metric} from ${valueText(spec.before, spec)} to ${valueText(spec.after, spec)}.`;
  return (
    <div className="iso vb-wrap" data-theme="light">
      <Plate
        fig={fig}
        title={PART[spec.subsystem]}
        hint="Hover · before → after"
        readout={readoutOf(spec, 0)}
        keys={[
          { mark: "lit", label: LIT_KEY[spec.subsystem] },
          { mark: "edge", label: `Gauge: ${spec.metric}` },
        ]}
        caption={
          <>
            <strong>{cause}</strong>: {spec.metric} {valueText(spec.before, spec)} → {valueText(spec.after, spec)}.
            {note ? ` ${note}` : ""}
          </>
        }
      >
        <BenchLive spec={spec} label={label} />
      </Plate>
    </div>
  );
}
