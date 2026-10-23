// Animated renderers for the OpenUI component library.
import { marked } from "marked";
import { animate, motion, type Variants } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import embed from "vega-embed";
import { VoltraBench } from "../iso/voltra/figure";
import type { Subsystem } from "../iso/voltra/model";
import { useAsk, useDataset, type Row } from "./context";

const spring = { type: "spring", stiffness: 260, damping: 26, mass: 0.9 } as const;

export const cardVariants: Variants = {
  hidden: { opacity: 0, y: 22, clipPath: "inset(0 0 100% 0)" },
  show: { opacity: 1, y: 0, clipPath: "inset(0 0 0% 0)", transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};

/** A sheet on the report: hairline border, registration corners (CSS), quiet lift on hover. */
function Card({ span, className = "", children }: { span: number; className?: string; children: ReactNode }) {
  return (
    <motion.div
      layout
      variants={cardVariants}
      initial="hidden"
      animate="show"
      whileHover={{ y: -2 }}
      className={`card ${className}`}
      style={{ gridColumn: `span ${Math.max(2, Math.min(12, span))}` }}
    >
      {children}
    </motion.div>
  );
}

// ---------- Dashboard ----------

export function DashboardView({ title, subtitle, children }: { title?: string; subtitle?: string; children: ReactNode }) {
  const words = (title || "").split(" ");
  return (
    <div className="dash">
      <header className="dash-head">
        <h2>
          {words.map((w, i) => (
            <motion.span
              key={`${i}-${w}`}
              initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ ...spring, delay: i * 0.045 }}
              style={{ display: "inline-block", marginRight: "0.28em" }}
            >
              {w}
            </motion.span>
          ))}
        </h2>
        {subtitle && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25, duration: 0.6 }}>
            {subtitle}
          </motion.p>
        )}
      </header>
      <motion.div className="grid" initial="hidden" animate="show" transition={{ staggerChildren: 0.08 }}>
        {children}
      </motion.div>
    </div>
  );
}

// ---------- KPI ----------

const NUM = /-?[\d,]*\.?\d+/;

function CountUp({ value }: { value: string }) {
  const match = value.match(NUM);
  const [shown, setShown] = useState(match ? value.replace(NUM, "0") : value);
  const from = useRef(0);
  useEffect(() => {
    if (!match) {
      setShown(value);
      return;
    }
    const raw = match[0];
    const target = parseFloat(raw.replace(/,/g, ""));
    const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
    const commas = raw.includes(",");
    const controls = animate(from.current, target, {
      duration: 1.3,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        from.current = v;
        const s = commas
          ? v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
          : v.toFixed(decimals);
        setShown(value.replace(NUM, s));
      },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <>{shown}</>;
}

function Sparkline({ rows, field, tone }: { rows: Row[]; field: string; tone: string }) {
  const values = rows.map((r) => Number(r[field])).filter((v) => Number.isFinite(v));
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const w = 120;
  const h = 36;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / (max - min || 1)) * (h - 6)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const color = tone === "bad" ? "var(--bad)" : tone === "good" ? "var(--good)" : "var(--accent)";
  const id = `sg-${field}-${values.length}`;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d={`${d} L${w},${h} L0,${h} Z`}
        fill={`url(#${id})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.6 }}
      />
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.4, ease: "easeInOut", delay: 0.2 }}
      />
    </svg>
  );
}

export function KpiView(p: {
  label?: string;
  value?: string;
  delta?: string;
  tone?: string;
  sparkDataset?: string;
  sparkField?: string;
  width?: number;
}) {
  const ds = useDataset(p.sparkDataset);
  const tone = p.tone || "neutral";
  return (
    <Card span={p.width ?? 3} className={`kpi ${tone}`}>
      <div className="kpi-label">{p.label}</div>
      <div className="kpi-row">
        <div className="kpi-value">{p.value ? <CountUp value={p.value} /> : <span className="shimmer">——</span>}</div>
        {ds && p.sparkField && <Sparkline rows={ds.rows} field={p.sparkField} tone={tone} />}
      </div>
      {p.delta && (
        <motion.div className="kpi-delta" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }}>
          {tone === "good" ? "▲ " : tone === "bad" ? "▼ " : ""}
          {p.delta}
        </motion.div>
      )}
    </Card>
  );
}

// ---------- Chart ----------

const PALETTE = ["#ff4f1a", "#16150f", "#2f5bd3", "#c48a1d", "#6f7f2e", "#8a5a9e", "#85837a", "#b5b2a7"];

function vegaTheme() {
  return {
    background: null,
    font: "IBM Plex Sans",
    view: { stroke: null },
    axis: {
      labelColor: "#3f3d35",
      titleColor: "#85837a",
      gridColor: "rgba(22,21,15,.08)",
      domainColor: "#16150f",
      tickColor: "#16150f",
      labelFont: "IBM Plex Mono",
      labelFontSize: 10.5,
      titleFont: "IBM Plex Mono",
      titleFontSize: 10.5,
      titleFontWeight: 500,
      labelPadding: 6,
    },
    legend: { labelColor: "#3f3d35", titleColor: "#85837a", labelFont: "IBM Plex Sans", labelFontSize: 11.5, titleFont: "IBM Plex Mono", titleFontSize: 10.5, symbolType: "square" },
    title: { color: "#16150f", fontSize: 13, fontWeight: 600, anchor: "start" },
    header: { labelColor: "#3f3d35", titleColor: "#85837a" },
    range: { category: PALETTE },
    mark: { color: PALETTE[0] },
    bar: { cornerRadiusEnd: 0 },
    line: { strokeWidth: 2, interpolate: "monotone" },
    point: { filled: true, size: 42 },
    area: { opacity: 0.8, color: "#b5b2a7" },
    rule: { color: "#16150f" },
  };
}

function isHorizontal(spec: Record<string, any>) {
  const enc = spec.encoding || spec.layer?.[0]?.encoding || {};
  return enc.x?.type === "quantitative" && (enc.y?.type === "nominal" || enc.y?.type === "ordinal");
}

/** Temporal fields are parsed to Dates before transforms, so `datum.D < '2026-10-01'` filters out every row. */
function fixDateFilters(node: any): any {
  if (Array.isArray(node)) return node.map(fixDateFilters);
  if (!node || typeof node !== "object") return node;
  const out: any = {};
  for (const [k, v] of Object.entries(node)) {
    out[k] =
      k === "filter" && typeof v === "string"
        ? v.replace(/(datum\.\w+|datum\[['"][^'"]+['"]\])\s*(<=|>=|<|>|==|===|!=)\s*'(\d{4}-\d{2}-\d{2}[^']*)'/g, "time($1) $2 time('$3')")
        : fixDateFilters(v);
  }
  return out;
}

/** Stagger an entrance animation across the rendered SVG marks. */
function animateMarks(root: HTMLElement) {
  root.querySelectorAll<SVGElement>(".mark-rect path, .mark-arc path, .mark-symbol path, .mark-area path").forEach((el, i) => {
    el.style.animationDelay = `${Math.min(i * 22, 900)}ms`;
  });
  root.querySelectorAll<SVGPathElement>(".mark-line path").forEach((el, i) => {
    // Measured lengths can be stale if Vega re-fits the chart, so the dash pattern is dropped once the line has drawn.
    const len = (el.getTotalLength?.() || 2000) * 1.2;
    el.style.strokeDasharray = `${len}`;
    el.style.strokeDashoffset = `${len}`;
    el.style.animationDelay = `${i * 120}ms`;
    el.addEventListener("animationend", () => {
      el.style.strokeDasharray = "";
      el.style.strokeDashoffset = "";
      el.style.animation = "none";
    }, { once: true });
  });
  root.classList.add("drawn");
}

export function ChartView(p: { title?: string; dataset?: string; spec?: Record<string, any>; caption?: string; width?: number }) {
  const ds = useDataset(p.dataset);
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const key = useMemo(() => JSON.stringify(p.spec ?? null) + (ds ? ds.rows.length : "-"), [p.spec, ds]);

  useEffect(() => {
    if (!ref.current || !p.spec || !ds) return;
    let view: { finalize: () => void } | undefined;
    let cancelled = false;
    // Debounce: the spec streams in token by token; render once it settles.
    const t = setTimeout(async () => {
      const spec: Record<string, any> = fixDateFilters(p.spec!);
      delete spec.$schema;
      spec.data = { values: ds.rows };
      const composite = ["hconcat", "vconcat", "concat", "facet", "repeat"].some((k) => k in spec);
      if (!composite) {
        spec.width = "container";
        spec.height = spec.height || 280;
        spec.autosize = { type: "fit", contains: "padding" };
      }
      spec.config = { ...vegaTheme(), ...(spec.config || {}) };
      try {
        const res = await embed(ref.current!, spec as any, { actions: false, renderer: "svg" });
        if (cancelled) return res.view.finalize();
        view = res.view;
        setError(null);
        animateMarks(ref.current!);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
      view?.finalize();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <Card span={p.width ?? 6} className="chart">
      {p.title && <h3>{p.title}</h3>}
      {!ds && <div className="chart-wait shimmer" />}
      <div ref={ref} className={`chart-body ${p.spec && isHorizontal(p.spec) ? "horizontal" : ""}`} />
      {error && <div className="chart-err">Chart error: {error}</div>}
      {p.caption && (
        <motion.div className="caption" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
          {p.caption}
        </motion.div>
      )}
    </Card>
  );
}

// ---------- Table ----------

const fmt = (v: unknown) =>
  typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 3 }) : v === null || v === undefined ? "—" : String(v);

export function TableView(p: { title?: string; dataset?: string; columns?: string[]; width?: number }) {
  const ds = useDataset(p.dataset);
  const cols = p.columns?.length ? p.columns : ds?.columns || [];
  const rows = ds?.rows.slice(0, 300) || [];
  return (
    <Card span={p.width ?? 12} className="table">
      {p.title && <h3>{p.title}</h3>}
      <div className="tbl">
        <table>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c}>{c.replace(/_/g, " ")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <motion.tr
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i * 0.025, 0.8) }}
              >
                {cols.map((c) => (
                  <td key={c} className={typeof r[c] === "number" ? "num" : ""}>
                    {fmt(r[c])}
                  </td>
                ))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------- Insight ----------

const TONE_ICON: Record<string, string> = { finding: "◆", caveat: "!", action: "→" };

export function InsightView(p: { title?: string; markdown?: string; tone?: string; width?: number }) {
  const tone = p.tone || "finding";
  return (
    <Card span={p.width ?? 12} className={`insight ${tone}`}>
      <h3>
        <span className="tone-icon">{TONE_ICON[tone] ?? "◆"}</span>
        {p.title}
      </h3>
      <div className="md" dangerouslySetInnerHTML={{ __html: marked.parse(p.markdown || "", { async: false }) as string }} />
    </Card>
  );
}

// ---------- Quotes ----------

export function QuotesView({ title, width, children }: { title?: string; width?: number; children: ReactNode }) {
  return (
    <Card span={width ?? 6} className="quotes">
      {title && <h3>{title}</h3>}
      <motion.div initial="hidden" animate="show" transition={{ staggerChildren: 0.12, delayChildren: 0.2 }}>
        {children}
      </motion.div>
    </Card>
  );
}

export function QuoteView({ text, attribution }: { text?: string; attribution?: string }) {
  return (
    <motion.figure className="quote" variants={{ hidden: { opacity: 0, x: -12 }, show: { opacity: 1, x: 0, transition: spring } }}>
      <blockquote>{text}</blockquote>
      {attribution && <figcaption>{attribution}</figcaption>}
    </motion.figure>
  );
}

// ---------- Follow-ups ----------

export function FollowUpsView({ questions }: { questions?: string[] }) {
  const ask = useAsk();
  return (
    <motion.div className="followups" variants={cardVariants} style={{ gridColumn: "span 12" }}>
      <span className="followups-label">Ask next</span>
      {(questions || []).map((q, i) => (
        <motion.button
          key={q}
          className="chip"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 * i }}
          whileHover={{ y: -2, scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => ask(q)}
        >
          {q}
        </motion.button>
      ))}
    </motion.div>
  );
}

// ---------- Mechanism (Anatomy figure) ----------

export function MechanismView(p: {
  title?: string;
  subsystem?: string;
  cause?: string;
  metric?: string;
  before?: number;
  after?: number;
  unit?: string;
  note?: string;
  width?: number;
}) {
  const ready = p.subsystem && p.metric && typeof p.before === "number" && typeof p.after === "number";
  return (
    <motion.div
      layout
      variants={cardVariants}
      initial="hidden"
      animate="show"
      className="mechanism"
      style={{ gridColumn: `span ${Math.max(4, Math.min(12, p.width ?? 7))}` }}
    >
      {p.title && <h3 className="mechanism-title">{p.title}</h3>}
      {ready ? (
        <VoltraBench
          fig="Mechanism"
          spec={{ subsystem: p.subsystem as Subsystem, metric: p.metric!, before: p.before!, after: p.after!, unit: p.unit }}
          cause={p.cause || "The change"}
          note={p.note}
        />
      ) : (
        <div className="chart-wait shimmer" style={{ height: 360 }} />
      )}
    </motion.div>
  );
}

// ---------- Verdicts (causal verdict board) ----------

type VerdictProps = { change?: string; verdict?: string; effect?: number; ciLow?: number; ciHigh?: number; evidence?: string };

const VERDICT_LABEL: Record<string, string> = { cause: "Cause", contributor: "Contributor", "ruled out": "Ruled out", "no effect": "No effect" };

const num = (v: number) => {
  const a = Math.abs(v);
  return v.toLocaleString(undefined, { maximumFractionDigits: a >= 100 ? 0 : a >= 10 ? 1 : 2 });
};

export function VerdictsView({ title, metric, verdicts, width }: { title?: string; metric?: string; verdicts?: { props?: VerdictProps }[]; width?: number }) {
  const rows: VerdictProps[] = (verdicts || []).map((v) => v?.props || {}).filter((v) => v.change);
  const values = rows.flatMap((r) => [r.effect, r.ciLow, r.ciHigh].filter((v): v is number => typeof v === "number"));
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const pad = (hi - lo || 1) * 0.08;
  const domain = [lo - pad, hi + pad];
  const x = (v: number) => ((v - domain[0]) / (domain[1] - domain[0])) * 100;
  const zero = x(0);
  return (
    <Card span={width ?? 12} className="verdicts">
      <div className="verdicts-head">
        {title && <h3>{title}</h3>}
        {metric && <span className="verdicts-metric">effect on {metric} · 95% CI</span>}
      </div>
      <motion.div className="verdict-list" initial="hidden" animate="show" transition={{ staggerChildren: 0.12, delayChildren: 0.15 }}>
        {rows.map((r, i) => {
          const kind = (r.verdict || "no effect").replace(" ", "-");
          const has = typeof r.effect === "number";
          const ciL = typeof r.ciLow === "number" ? r.ciLow : r.effect;
          const ciH = typeof r.ciHigh === "number" ? r.ciHigh : r.effect;
          return (
            <motion.div
              key={`${i}-${r.change}`}
              className={`verdict ${kind}`}
              variants={{ hidden: { opacity: 0, x: -16, filter: "blur(6px)" }, show: { opacity: 1, x: 0, filter: "blur(0px)", transition: spring } }}
            >
              <div className="verdict-text">
                <div className="verdict-top">
                  {r.verdict === "cause" ? (
                    <motion.span
                      className="stamp"
                      initial={{ scale: 2.4, opacity: 0, rotate: -18 }}
                      animate={{ scale: 1, opacity: 1, rotate: -5 }}
                      transition={{ type: "spring", stiffness: 520, damping: 18, delay: 0.5 + i * 0.12 }}
                    >
                      CAUSE
                    </motion.span>
                  ) : (
                    <span className={`badge ${kind}`}>{VERDICT_LABEL[r.verdict || "no effect"] ?? r.verdict}</span>
                  )}
                  <span className="verdict-change">{r.change}</span>
                </div>
                <div className="verdict-evidence">{r.evidence}</div>
              </div>
              <div className="verdict-plot">
                <div className="zero" style={{ left: `${zero}%` }} />
                {has && typeof ciL === "number" && typeof ciH === "number" && (
                  <>
                    <motion.div
                      className="ci"
                      style={{ left: `${x(Math.min(ciL, ciH))}%`, width: `${Math.abs(x(ciH) - x(ciL))}%`, originX: (zero - x(Math.min(ciL, ciH))) / Math.max(0.0001, Math.abs(x(ciH) - x(ciL))) }}
                      initial={{ scaleX: 0, opacity: 0 }}
                      animate={{ scaleX: 1, opacity: 1 }}
                      transition={{ duration: 0.9, delay: 0.3 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
                    />
                    <motion.div
                      className="point"
                      initial={{ left: `${zero}%`, scale: 0 }}
                      animate={{ left: `${x(r.effect!)}%`, scale: 1 }}
                      transition={{ type: "spring", stiffness: 140, damping: 16, delay: 0.35 + i * 0.12 }}
                    />
                    <motion.span
                      className="point-label"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.9 + i * 0.12 }}
                      style={{ left: `${x(r.effect!)}%` }}
                    >
                      {r.effect! > 0 ? "+" : ""}
                      {num(r.effect!)}
                    </motion.span>
                  </>
                )}
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </Card>
  );
}
