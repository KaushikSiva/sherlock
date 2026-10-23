// The agent as a wiring schematic: Claude on a bus, the Snowflake MCP tools above it, the warehouse below.
// Wires plot themselves in on mount; while a tool runs, square packets ride Claude → tool → side rail → Snowflake.
import { motion } from "motion/react";

export const TOOL_LABEL: Record<string, string> = {
  sql_exec: "SQL",
  stoweaway_analyst: "Cortex Analyst",
  voltra_analyst: "Cortex Analyst",
  survey_search: "Cortex Search",
  voltra_search: "Cortex Search",
  growth_analyst_agent: "Cortex Agent",
  release_impact: "Release Impact",
  forecast_metric: "Forecast",
};
export const toolLabel = (t: string) => TOOL_LABEL[t] ?? t.replace(/_/g, " ");
const TOOL_SUB: Record<string, string> = {
  sql_exec: "read-only",
  voltra_analyst: "semantic view",
  stoweaway_analyst: "semantic view",
  voltra_search: "text index",
  survey_search: "text index",
  release_impact: "diff-in-diff",
  forecast_metric: "snowflake ml",
  growth_analyst_agent: "agent",
};

const W = 800;
const H = 400;
const BUS_Y = 168;
const TOOL_Y = 84;
const CORE = { x: 400, y: 228, w: 200, h: 64 };
const SF = { x: 400, y: 346, w: 320, h: 46 };
const RAIL = 22;

const draw = (delay: number) => ({
  initial: { pathLength: 0, opacity: 0 },
  animate: { pathLength: 1, opacity: 1 },
  transition: { pathLength: { duration: 1.1, delay, ease: [0.65, 0, 0.35, 1] as const }, opacity: { duration: 0.2, delay } },
});

function Ticks({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const t = 6;
  const l = x - w / 2;
  const r = x + w / 2;
  const top = y - h / 2;
  const b = y + h / 2;
  return (
    <path
      className="sch-ticks"
      d={`M${l} ${top + t}V${top}H${l + t} M${r - t} ${top}H${r}V${top + t} M${r} ${b - t}V${b}H${r - t} M${l + t} ${b}H${l}V${b - t}`}
    />
  );
}

export function AgentFlow({
  tools,
  active,
  counts,
  thinking,
  rows,
  scope,
  compact = false,
}: {
  tools: string[];
  active: string | null;
  counts: Record<string, number>;
  thinking: boolean;
  rows: number;
  scope: string;
  compact?: boolean;
}) {
  const n = Math.max(tools.length, 1);
  const BW = Math.min(150, (W - 90) / n - 12); // tool box width shrinks as tools are added
  const span = Math.min(W - 90, BW * n + 24 * (n - 1));
  const xs = tools.map((_, i) => (n === 1 ? W / 2 : W / 2 - span / 2 + BW / 2 + (i * (span - BW)) / (n - 1)));
  const calls = Object.values(counts).reduce((a, b) => a + b, 0);
  const toCore = (x: number) => `M${CORE.x} ${CORE.y - CORE.h / 2} V${BUS_Y} H${x} V${TOOL_Y + 22}`;
  const toWarehouse = (x: number) => {
    const left = x < W / 2;
    const rail = left ? RAIL : W - RAIL;
    const sfEdge = left ? SF.x - SF.w / 2 : SF.x + SF.w / 2;
    return `M${x} ${TOOL_Y - 22} V${TOOL_Y - 46} H${rail} V${SF.y} H${sfEdge}`;
  };
  return (
    <svg className={`sch ${compact ? "compact" : ""}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Agent schematic: Claude calling Snowflake MCP tools">
      {/* bus + core link to warehouse */}
      <motion.path className="sch-wire" d={`M${xs[0] ?? W / 2} ${BUS_Y} H${xs[xs.length - 1] ?? W / 2}`} {...draw(0.1)} />
      <motion.path className={`sch-wire ${active ? "hot" : ""}`} d={`M${CORE.x} ${CORE.y + CORE.h / 2} V${SF.y - SF.h / 2}`} {...draw(0.2)} />

      {tools.map((t, i) => {
        const on = active === t;
        const used = (counts[t] || 0) > 0;
        return (
          <g key={t}>
            <motion.path className={`sch-wire ${on ? "hot" : used ? "used" : ""}`} d={toCore(xs[i])} {...draw(0.25 + i * 0.08)} />
            <motion.path className={`sch-wire dim ${on ? "hot" : ""}`} d={toWarehouse(xs[i])} {...draw(0.45 + i * 0.08)} />
            <motion.circle className="sch-node" cx={xs[i]} cy={BUS_Y} r={3} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.6 + i * 0.08 }} />
            {on &&
              [0, 0.45, 0.9].map((d) => (
                <rect key={d} className="sch-packet" x={-4} y={-4} width={8} height={8}>
                  <animateMotion dur="1.35s" begin={`${d}s`} repeatCount="indefinite" path={`${toCore(xs[i])} ${toWarehouse(xs[i]).replace(/^M[\d. ]+/, `L${xs[i]} ${TOOL_Y - 22}`)}`} />
                </rect>
              ))}
            <motion.g
              className={`sch-tool ${on ? "on" : ""} ${used ? "used" : ""}`}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 + i * 0.08, type: "spring", stiffness: 260, damping: 22 }}
            >
              <rect x={xs[i] - BW / 2} y={TOOL_Y - 22} width={BW} height={44} />
              <Ticks x={xs[i]} y={TOOL_Y} w={BW + 8} h={52} />
              <text x={xs[i] - BW / 2 + 10} y={TOOL_Y - 3} className="sch-label">
                {toolLabel(t)}
              </text>
              <text x={xs[i] - BW / 2 + 10} y={TOOL_Y + 12} className="sch-sub">
                {TOOL_SUB[t] ?? "mcp tool"}
              </text>
              <text x={xs[i] + BW / 2 - 8} y={TOOL_Y - 3} textAnchor="end" className="sch-count">
                {used ? `×${counts[t]}` : "—"}
              </text>
            </motion.g>
          </g>
        );
      })}

      {/* Claude */}
      <g className={`sch-core ${thinking ? "thinking" : ""} ${active ? "busy" : ""}`}>
        <rect x={CORE.x - CORE.w / 2} y={CORE.y - CORE.h / 2} width={CORE.w} height={CORE.h} />
        <Ticks x={CORE.x} y={CORE.y} w={CORE.w + 10} h={CORE.h + 10} />
        <circle className="sch-led" cx={CORE.x - CORE.w / 2 + 18} cy={CORE.y} r={5} />
        <text x={CORE.x - CORE.w / 2 + 34} y={CORE.y - 3} className="sch-core-label">
          Claude Opus 5.5
        </text>
        <text x={CORE.x - CORE.w / 2 + 34} y={CORE.y + 14} className="sch-sub">
          {thinking ? "reasoning…" : active ? `calling ${toolLabel(active)}` : "via Snowflake Cortex"}
        </text>
      </g>

      {/* warehouse */}
      <g className={`sch-sf ${active ? "on" : ""}`}>
        <rect x={SF.x - SF.w / 2} y={SF.y - SF.h / 2} width={SF.w} height={SF.h} />
        <text x={SF.x - SF.w / 2 + 14} y={SF.y - 3} className="sch-core-label">
          Snowflake · {scope || "—"}
        </text>
        <text x={SF.x - SF.w / 2 + 14} y={SF.y + 13} className="sch-sub">
          {calls} call{calls === 1 ? "" : "s"} · {rows.toLocaleString()} rows
        </text>
      </g>
    </svg>
  );
}
