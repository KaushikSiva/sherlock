import { Renderer } from "@openuidev/react-lang";
import { animate, AnimatePresence, motion, useInView, useMotionValue, useSpring, useTransform } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentFlow, toolLabel } from "./AgentFlow";
import { VoltraBench } from "./iso/voltra/figure";
import { AskContext, DataContext, type Dataset } from "./openui/context";
import { library } from "./openui/library";

type StepKind = "thinking" | "sql" | "tool" | "note" | "error";
type Step = { id: number; kind: StepKind; title: string; text: string; status: "running" | "done" | "error"; meta?: string; tool?: string; rows?: number; turn?: number; at: number };
type Answer = { dataset: string; question: string; ui: string; pending: string; streaming: boolean; steps: Step[]; status: string; started: number; ended?: number };
type DatasetInfo = { id: string; name: string; tagline: string; starters: string[]; mcp_server: string; scope: string; tools: string[]; available: boolean };
type Config = { model: string; default_dataset: string; datasets: DatasetInfo[] };
type Stats = { counts: { label: string; value: number }[]; events: { date: string; kind: string; label: string }[] };

// Only Voltra is shown for now; Stoweaway stays available in the backend.
const VISIBLE = new Set(["voltra"]);
const ease = [0.22, 1, 0.36, 1] as const;

const stripFences = (s: string) => s.replace(/^\s*```[a-z-]*\n?/i, "").replace(/```\s*$/, "");
const looksLikeUI = (s: string) => /\broot\s*=\s*Dashboard\(/.test(s);
const stamp = (since: number, at: number) => {
  const s = Math.max(0, (at - since) / 1000);
  return `+${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;
};
let stepSeq = 0;

export function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [dataset, setDataset] = useState("voltra");
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [active, setActive] = useState(-1);
  const [datasets, setDatasets] = useState<Record<string, Dataset>>({});
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const sessions = useRef<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c: Config) => {
        const visible = c.datasets.filter((d) => VISIBLE.has(d.id));
        setConfig({ ...c, datasets: visible });
        const pick = visible.find((d) => d.available) ?? visible[0];
        if (pick) setDataset(pick.id);
      })
      .catch(() => {});
    fetch("/api/stats?dataset=voltra")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => s && setStats(s))
      .catch(() => {});
  }, []);

  const info = config?.datasets.find((d) => d.id === dataset);
  const mine = answers.map((a, i) => ({ a, i })).filter(({ a }) => a.dataset === dataset);
  const current = active >= 0 && answers[active]?.dataset === dataset ? answers[active] : undefined;

  const update = useCallback((fn: (a: Answer) => Answer) => {
    setAnswers((prev) => (prev.length ? [...prev.slice(0, -1), fn(prev[prev.length - 1])] : prev));
  }, []);

  const handle = useCallback(
    (ev: any) => {
      const at = Date.now();
      switch (ev.type) {
        case "session":
          update((a) => {
            sessions.current[a.dataset] = ev.session_id;
            return a;
          });
          break;
        case "status":
          update((a) => ({ ...a, status: ev.text.replace(/…$/, "") }));
          break;
        case "thinking_delta":
          update((a) => {
            const last = a.steps[a.steps.length - 1];
            if (last?.kind === "thinking" && last.turn === ev.turn) return { ...a, steps: [...a.steps.slice(0, -1), { ...last, text: last.text + ev.text }] };
            return { ...a, status: "Reasoning", steps: [...a.steps, { id: ++stepSeq, kind: "thinking", title: "Reasoning", text: ev.text, status: "done", turn: ev.turn, at }] };
          });
          break;
        case "text_delta":
          update((a) => ({ ...a, pending: a.pending + ev.text, status: looksLikeUI(a.pending) ? "Drafting the report" : a.status }));
          break;
        case "turn_end":
          update((a) => {
            if (ev.stop_reason === "tool_use") {
              const note = a.pending.trim();
              return { ...a, pending: "", steps: note ? [...a.steps, { id: ++stepSeq, kind: "note", title: "Note", text: note, status: "done", at }] : a.steps };
            }
            return { ...a, ui: stripFences(a.pending), pending: "" };
          });
          break;
        case "sql":
          update((a) => ({
            ...a,
            status: "Querying Snowflake",
            steps: [...a.steps, { id: ++stepSeq, kind: "sql", title: `SQL → ${ev.id}`, text: ev.sql, status: "running", meta: ev.id, tool: ev.tool || "sql_exec", at }],
          }));
          break;
        case "sql_result":
          if (!ev.error) setDatasets((d) => ({ ...d, [ev.id]: { columns: ev.columns, rows: ev.rows, sql: "", queryId: ev.query_id } }));
          update((a) => ({
            ...a,
            steps: a.steps.map((s) =>
              s.kind === "sql" && s.meta === ev.id
                ? { ...s, status: ev.error ? "error" : "done", rows: ev.error ? 0 : ev.rows.length, meta: ev.error ? ev.error : `${ev.rows.length} rows · ${ev.columns.length} cols` }
                : s,
            ),
          }));
          break;
        case "tool":
          update((a) => ({
            ...a,
            status: `Calling ${toolLabel(ev.name)}`,
            steps: [...a.steps, { id: ++stepSeq, kind: "tool", title: toolLabel(ev.name), text: ev.input.message || ev.input.query || JSON.stringify(ev.input), status: "running", tool: ev.name, at }],
          }));
          break;
        case "tool_result":
          update((a) => {
            const idx = a.steps.map((s) => s.kind === "tool" && s.status === "running" && s.tool === ev.name).lastIndexOf(true);
            if (idx < 0) return a;
            const steps = [...a.steps];
            steps[idx] = { ...steps[idx], status: ev.error ? "error" : "done", meta: ev.error ? ev.preview : "returned" };
            return { ...a, steps };
          });
          break;
        case "error":
          update((a) => ({ ...a, steps: [...a.steps, { id: ++stepSeq, kind: "error", title: "Error", text: ev.text, status: "error", at }] }));
          break;
      }
    },
    [update],
  );

  const ask = useCallback(
    async (question: string) => {
      question = question.trim();
      if (!question || busy) return;
      setBusy(true);
      setInput("");
      setAnswers((prev) => {
        setActive(prev.length);
        return [...prev, { dataset, question, ui: "", pending: "", streaming: true, steps: [], status: "Opening a session", started: Date.now() }];
      });
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, dataset, session_id: sessions.current[dataset] ?? null }),
        });
        const reader = res.body!.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const line = buf.slice(0, i);
            buf = buf.slice(i + 2);
            if (line.startsWith("data: ")) handle(JSON.parse(line.slice(6)));
          }
        }
      } catch (e) {
        handle({ type: "error", text: String(e) });
      }
      update((a) => ({ ...a, streaming: false, ended: Date.now(), ui: a.ui || (looksLikeUI(a.pending) ? stripFences(a.pending) : a.ui) }));
      setBusy(false);
    },
    [busy, dataset, handle, update],
  );

  const liveUI = current ? current.ui || (looksLikeUI(current.pending) ? stripFences(current.pending) : "") : "";
  const flow = useFlowState(current);
  const caseNo = (i: number) => String(mine.findIndex((m) => m.i === i) + 1).padStart(2, "0");
  const landing = !current;

  return (
    <AskContext.Provider value={ask}>
      <DataContext.Provider value={datasets}>
        <Blueprint />
        <div className={`app ${landing ? "is-landing" : "is-case"}`}>
          <Masthead config={config} info={info} busy={busy} onHome={() => !busy && setActive(-1)} cases={mine.length} />
          <AnimatePresence mode="wait">
            {landing ? (
              <Landing
                key="landing"
                info={info}
                stats={stats}
                onAsk={ask}
                composer={<Composer value={input} setValue={setInput} busy={busy} onSubmit={() => ask(input)} inline />}
              />
            ) : (
              <motion.div key="workspace" className="shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
                <motion.aside className="log" initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.6, ease }}>
                  <div className="log-schematic">
                    <AgentFlow tools={info?.tools ?? []} active={flow.active} counts={flow.counts} thinking={flow.thinking} rows={flow.rows} scope={info?.scope ?? ""} compact />
                  </div>
                  <InvestigationLog answer={current} />
                </motion.aside>
                <main className="stage">
                  {mine.length > 1 && (
                    <nav className="cases">
                      {mine.map(({ a, i }) => (
                        <button key={i} className={`case-tab ${i === active ? "on" : ""}`} onClick={() => setActive(i)}>
                          <span className="mono">CASE {caseNo(i)}</span>
                          <span className="case-q">{a.question}</span>
                          {i === active && <motion.span layoutId="case-line" className="case-line" />}
                        </button>
                      ))}
                    </nav>
                  )}
                  <AnimatePresence mode="wait">
                    {liveUI ? (
                      <motion.div key={`ui-${active}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
                        <ReportHeader answer={current!} flow={flow} caseNo={caseNo(active)} />
                        <Renderer response={liveUI} library={library} isStreaming={current!.streaming} />
                      </motion.div>
                    ) : (
                      <Investigation key={`work-${active}`} answer={current!} info={info} flow={flow} caseNo={caseNo(active)} />
                    )}
                  </AnimatePresence>
                  <div className="stage-spacer" />
                </main>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {!landing && <Composer value={input} setValue={setInput} busy={busy} onSubmit={() => ask(input)} />}
      </DataContext.Provider>
    </AskContext.Provider>
  );
}

function useFlowState(answer?: Answer) {
  return useMemo(() => {
    const counts: Record<string, number> = {};
    let rows = 0;
    let active: string | null = null;
    for (const s of answer?.steps ?? []) {
      if (s.tool) counts[s.tool] = (counts[s.tool] || 0) + 1;
      if (s.rows) rows += s.rows;
      if (s.status === "running" && s.tool) active = s.tool;
    }
    const last = answer?.steps.at(-1);
    const thinking = Boolean(answer?.streaming && !active && (!last || last.kind === "thinking" || last.status !== "running"));
    return { counts, rows, active, thinking, calls: Object.values(counts).reduce((a, b) => a + b, 0) };
  }, [answer]);
}

// ---------- background: a blueprint grid that plots itself in ----------

function Blueprint() {
  const cols = 14;
  const rows = 9;
  return (
    <div className="blueprint" aria-hidden>
      <svg viewBox="0 0 1400 900" preserveAspectRatio="none">
        {Array.from({ length: cols + 1 }, (_, i) => (
          <motion.line key={`c${i}`} x1={i * 100} x2={i * 100} y1={0} y2={900} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, delay: i * 0.04, ease }} />
        ))}
        {Array.from({ length: rows + 1 }, (_, i) => (
          <motion.line key={`r${i}`} x1={0} x2={1400} y1={i * 100} y2={i * 100} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, delay: 0.2 + i * 0.05, ease }} />
        ))}
      </svg>
      <div className="grain" />
    </div>
  );
}

// ---------- masthead ----------

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span>{now.toLocaleTimeString([], { hour12: false })}</span>;
}

function Wave({ busy }: { busy: boolean }) {
  return (
    <svg className={`wave ${busy ? "busy" : ""}`} viewBox="0 0 64 20" aria-hidden>
      <path d="M0 10 H10 L13 4 L17 16 L21 2 L25 18 L28 10 H36 L39 7 L42 13 L45 10 H64" />
    </svg>
  );
}

function Masthead({ config, info, busy, onHome, cases }: { config: Config | null; info?: DatasetInfo; busy: boolean; onHome: () => void; cases: number }) {
  return (
    <motion.header className="masthead" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6, ease }}>
      <button className="wordmark" onClick={onHome} title="Back to start">
        <span className="wm-mark" aria-hidden>
          <svg viewBox="0 0 26 26"><circle cx="11" cy="11" r="6" /><path d="M15.5 15.5l5.5 5.5" /></svg>
        </span>
        <span className="wm-name">SHERLOCK</span>
        <span className="wm-slash">/</span>
        <span className="wm-sub">Release Forensics</span>
        <Wave busy={busy} />
      </button>
      <div className="specs mono">
        <span className="client">CLIENT · VOLTRA MOBILITY</span>
        {cases > 0 && <span>{cases} CASE{cases > 1 ? "S" : ""}</span>}
        <span>
          <i className={`lamp ${info?.available ? "ok" : ""}`} /> SNOWFLAKE {info?.scope ?? "…"}
        </span>
        <span>MCP · {info ? `${info.tools.length} TOOLS` : "…"}</span>
        <span>{(config?.model ?? "claude").toUpperCase()}</span>
        <Clock />
      </div>
    </motion.header>
  );
}

// ---------- landing: the full-screen hero ----------

const HEADLINE: { w: string; em?: boolean }[] = [{ w: "Which" }, { w: "release" }, { w: "actually" }, { w: "moved", em: true }, { w: "the" }, { w: "needle?" }];

const CALLOUTS = [
  { k: "Firmware", v: "staged OTA rollouts", side: "l", top: "16%" },
  { k: "Hardware", v: "supplier & part revisions", side: "r", top: "24%" },
  { k: "Backend", v: "incidents & outages", side: "l", top: "52%" },
  { k: "Business", v: "orders, Care subscriptions", side: "r", top: "58%" },
];

function Landing({ info, stats, onAsk, composer }: { info?: DatasetInfo; stats: Stats | null; onAsk: (q: string) => void; composer: React.ReactNode }) {
  return (
    <motion.section className="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -30, filter: "blur(6px)" }} transition={{ duration: 0.45 }}>
      <div className="landing-main">
        <div className="hero-copy">
          <motion.div className="eyebrow" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15, duration: 0.6, ease }}>
            <span className="eyebrow-dot" /> Sherlock · the AI analyst for cause and effect · Claude on Snowflake
          </motion.div>
          <h1>
            {HEADLINE.map(({ w, em }, i) => (
              <span key={i} className="mask">
                <motion.span className={em ? "em" : ""} initial={{ y: "115%", rotate: 4 }} animate={{ y: "0%", rotate: 0 }} transition={{ duration: 1, delay: 0.25 + i * 0.07, ease }}>
                  {w}
                </motion.span>
              </span>
            ))}
            <motion.svg className="underline" viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden>
              <motion.path d="M4 14 C 80 4, 200 4, 296 12" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 1.05, duration: 0.8, ease }} />
            </motion.svg>
          </h1>
          <motion.p className="lede" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8, duration: 0.7, ease }}>
            Firmware, hardware revisions, app releases and campaigns ship in the same weeks. Claude tests every candidate against a control
            cohort inside Snowflake and files the evidence as a live report.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.95, duration: 0.6, ease }}>
            {composer}
          </motion.div>
          <div className="casefiles-label mono">Or open a sample case</div>
          <div className="casefiles">
            {(info?.starters ?? []).map((q, i) => (
              <motion.button
                key={q}
                className="casefile"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1 + i * 0.08, duration: 0.55, ease }}
                whileHover="hover"
                onClick={() => onAsk(q)}
              >
                <span className="cf-no mono">CASE {String(i + 1).padStart(2, "0")}</span>
                <span className="cf-q">{q}</span>
                <motion.span className="cf-arrow" variants={{ hover: { x: 5 } }}>
                  →
                </motion.span>
                <motion.span className="cf-line" variants={{ hover: { scaleX: 1 } }} initial={{ scaleX: 0 }} transition={{ duration: 0.35, ease }} />
              </motion.button>
            ))}
          </div>
        </div>

        <HeroFigure />
      </div>

      <StatsStrip stats={stats} />
      <Ticker stats={stats} />
    </motion.section>
  );
}

function HeroFigure() {
  // Gentle parallax tilt that follows the pointer.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-1, 1], [4, -4]), { stiffness: 80, damping: 18 });
  const ry = useSpring(useTransform(mx, [-1, 1], [-6, 6]), { stiffness: 80, damping: 18 });
  return (
    <motion.div
      className="hero-figure"
      initial={{ opacity: 0, y: 40, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.45, duration: 1.1, ease }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        mx.set(((e.clientX - r.left) / r.width) * 2 - 1);
        my.set(((e.clientY - r.top) / r.height) * 2 - 1);
      }}
      onPointerLeave={() => {
        mx.set(0);
        my.set(0);
      }}
      style={{ perspective: 1400 }}
    >
      <motion.div style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>
        <VoltraBench
          fig="Fig. 0"
          spec={{ subsystem: "battery", metric: "battery temp p95", before: 44.8, after: 38.7, unit: "°C" }}
          cause="Example · a firmware change"
          note="Illustration only. In a report, the bench lights the subsystem that caused the change, using numbers from the queries."
        />
      </motion.div>
      {CALLOUTS.map((c, i) => (
        <motion.div
          key={c.k}
          className={`callout ${c.side}`}
          style={{ top: c.top }}
          initial={{ opacity: 0, x: c.side === "l" ? -16 : 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1.3 + i * 0.18, duration: 0.6, ease }}
        >
          <span className="callout-k mono">{c.k}</span>
          <span className="callout-v">{c.v}</span>
        </motion.div>
      ))}
    </motion.div>
  );
}

function CountUp({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView || !ref.current) return;
    const node = ref.current;
    const controls = animate(0, to, { duration: 1.8, ease, onUpdate: (v) => (node.textContent = Math.round(v).toLocaleString()) });
    return () => controls.stop();
  }, [inView, to]);
  return <span ref={ref}>0</span>;
}

function StatsStrip({ stats }: { stats: Stats | null }) {
  const counts = stats?.counts ?? [];
  return (
    <motion.div className="stats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3, duration: 0.6 }}>
      {counts.length
        ? counts.map((c, i) => (
            <motion.div key={c.label} className="stat" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4 + i * 0.08, ease }}>
              <span className="stat-v">
                <CountUp to={c.value} />
              </span>
              <span className="stat-k mono">{c.label}</span>
            </motion.div>
          ))
        : Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="stat">
              <span className="stat-v muted">—</span>
              <span className="stat-k mono">loading from Snowflake</span>
            </div>
          ))}
    </motion.div>
  );
}

function Ticker({ stats }: { stats: Stats | null }) {
  const events = stats?.events ?? [];
  if (!events.length) return <div className="ticker" />;
  const row = [...events, ...events];
  return (
    <div className="ticker" aria-label="Release log">
      <div className="ticker-label mono">CHANGE LOG</div>
      <div className="ticker-window">
        <motion.div className="ticker-track" animate={{ x: ["0%", "-50%"] }} transition={{ duration: Math.max(30, events.length * 4), repeat: Infinity, ease: "linear" }}>
          {row.map((e, i) => (
            <span key={i} className={`tick-item ${e.kind}`}>
              <span className="mono">{e.date}</span>
              <span className="tick-kind mono">{e.kind}</span>
              {e.label}
            </span>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

// ---------- investigation log (left rail) ----------

const SQL_KW = /\b(SELECT|FROM|WHERE|GROUP BY|ORDER BY|JOIN|LEFT JOIN|ON|AS|WITH|SUM|AVG|COUNT|DISTINCT|CASE|WHEN|THEN|ELSE|END|AND|OR|NULLIF|IFF|DATE_TRUNC|LIMIT|HAVING|OVER|PARTITION BY|USING|CALL)\b/gi;
function SqlCode({ sql }: { sql: string }) {
  const html = sql.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/('[^']*')/g, '<span class="s">$1</span>').replace(SQL_KW, (m) => `<span class="k">${m}</span>`);
  return <pre className="sql" dangerouslySetInnerHTML={{ __html: html }} />;
}

function InvestigationLog({ answer }: { answer?: Answer }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Braces matter: scrollIntoView returns a Promise in newer browsers, which React would treat as a cleanup.
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [answer?.steps.length]);
  if (!answer) return null;
  return (
    <div className="log-body">
      <div className="log-head">
        <span className="eyebrow">Investigation log</span>
        <span className="mono muted">{answer.steps.length} entries</span>
      </div>
      <div className="log-q">
        <span className="mono">Q</span>
        {answer.question}
      </div>
      <AnimatePresence initial={false}>
        {answer.steps.map((s, i) => (
          <motion.div key={s.id} className={`entry ${s.kind} ${s.status}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease }}>
            <div className="entry-gutter mono">
              <span>{String(i + 1).padStart(2, "0")}</span>
              <span className="entry-time">{stamp(answer.started, s.at)}</span>
            </div>
            <div className="entry-main">
              <div className="entry-title">
                {s.status === "running" && <span className="spin" />}
                {s.title}
              </div>
              {s.kind === "sql" ? <SqlCode sql={s.text} /> : <div className={s.kind === "thinking" ? "entry-thought" : "entry-text"}>{s.text}</div>}
              {s.meta && <div className="entry-meta mono">{s.meta}</div>}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      {answer.streaming && (
        <div className="log-status mono">
          <span className="cursor" /> {answer.status}
        </div>
      )}
      <div ref={end} />
    </div>
  );
}

// ---------- investigation in progress ----------

function Elapsed({ since, until }: { since: number; until?: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (until) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [until]);
  return <span className="mono">{stamp(since, until ?? now)}</span>;
}

function Investigation({ answer, info, flow, caseNo }: { answer: Answer; info?: DatasetInfo; flow: ReturnType<typeof useFlowState>; caseNo: string }) {
  const tape = answer.steps.filter((s) => s.kind === "sql" || s.kind === "tool").slice(-5);
  return (
    <motion.section className="investigation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35 }}>
      <div className="inv-head">
        <span className="eyebrow">Case {caseNo} · investigation in progress</span>
        <h2>{answer.question}</h2>
      </div>
      <div className="inv-grid">
        <div className="inv-schematic">
          <div className="scanline" />
          <AgentFlow tools={info?.tools ?? []} active={flow.active} counts={flow.counts} thinking={flow.thinking} rows={flow.rows} scope={info?.scope ?? ""} />
        </div>
        <div className="inv-readouts">
          <Readout label="Elapsed" value={<Elapsed since={answer.started} />} />
          <Readout label="MCP calls" value={<Odo n={flow.calls} />} />
          <Readout label="Rows returned" value={<Odo n={flow.rows} />} />
          <Readout label="Status" value={<span className="status-word">{answer.status}</span>} />
        </div>
      </div>
      <div className="tape">
        <div className="tape-head mono">Evidence tape</div>
        <AnimatePresence initial={false}>
          {tape.map((s) => (
            <motion.div key={s.id} className={`tape-row ${s.status}`} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease }} layout>
              <span className="mono tape-time">{stamp(answer.started, s.at)}</span>
              <span className="tape-tool mono">{s.kind === "sql" ? "SQL" : s.title}</span>
              <span className="tape-text mono">{s.text.replace(/\s+/g, " ").slice(0, 140)}</span>
              <span className="tape-meta mono">{s.status === "running" ? <span className="spin" /> : s.meta}</span>
            </motion.div>
          ))}
        </AnimatePresence>
        {!tape.length && <div className="tape-row muted mono">Planning the analysis…</div>}
      </div>
    </motion.section>
  );
}

function Readout({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="readout">
      <span className="readout-label mono">{label}</span>
      <span className="readout-value">{value}</span>
    </div>
  );
}

function Odo({ n }: { n: number }) {
  return (
    <motion.span key={n} className="mono" initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.3, ease }}>
      {n.toLocaleString()}
    </motion.span>
  );
}

function ReportHeader({ answer, flow, caseNo }: { answer: Answer; flow: ReturnType<typeof useFlowState>; caseNo: string }) {
  return (
    <motion.div className="report-head" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <span className="eyebrow">
        Case {caseNo} · {answer.streaming ? "report printing" : "report filed"}
      </span>
      <span className="report-q">“{answer.question}”</span>
      <span className="report-meta mono">
        {flow.calls} MCP calls · {flow.rows.toLocaleString()} rows · <Elapsed since={answer.started} until={answer.ended} />
      </span>
    </motion.div>
  );
}

// ---------- composer ----------

function Composer({ value, setValue, busy, onSubmit, inline = false }: { value: string; setValue: (v: string) => void; busy: boolean; onSubmit: () => void; inline?: boolean }) {
  // Inline on the landing page; otherwise a fixed wrapper owns positioning and motion animates only the inner form.
  return (
    <div className={inline ? "composer-inline" : "composer-dock docked"}>
      <motion.form
        className={`composer ${busy ? "busy" : ""}`}
        initial={{ opacity: 0, y: inline ? 0 : 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <span className="composer-prompt mono">{busy ? "…" : "?"}</span>
        <textarea
          rows={1}
          value={value}
          placeholder={busy ? "Investigation in progress" : "Ask Sherlock what moved Voltra's numbers"}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
        <motion.button type="submit" disabled={busy || !value.trim()} whileTap={{ scale: 0.94 }} className="send">
          {busy ? <span className="spin light" /> : "Open case →"}
        </motion.button>
        {busy && <span className="composer-progress" />}
      </motion.form>
    </div>
  );
}
