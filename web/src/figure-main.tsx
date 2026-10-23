import "./iso/kit/iso.css";
import "./iso/voltra/voltra.css";
// Standalone page for the Anatomy checks (capture.mjs, lines.mjs): /figure.html?subsystem=brakes
import { createRoot } from "react-dom/client";
import { VoltraBench } from "./iso/voltra/figure";
import { SUBSYSTEMS, type Subsystem } from "./iso/voltra/model";

const q = new URLSearchParams(location.search);
const sub = (q.get("subsystem") as Subsystem) || "battery";
const subsystem = SUBSYSTEMS.includes(sub) ? sub : "battery";
const before = Number(q.get("before") ?? 64.2);
const after = Number(q.get("after") ?? 68.7);

createRoot(document.getElementById("root")!).render(
  <VoltraBench
    spec={{ subsystem, metric: q.get("metric") ?? "range per charge", before, after, unit: q.get("unit") ?? "km" }}
    cause={q.get("cause") ?? "FW 4.2 adaptive thermal management"}
    note={q.get("note") ?? undefined}
  />,
);
