// Generates the OpenUI Lang system prompt from the component library; the Python agent reads it.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { library } from "../src/openui/library";

const prompt = library.prompt({
  preamble:
    "FINAL ANSWER FORMAT: when your research is done, your final message must be ONLY an OpenUI Lang program " +
    "(no prose before or after, no code fences). It renders live, as you stream it, into the user's dashboard.",
  additionalRules: [
    "Write `root = Dashboard(...)` first, then blocks in reading order: KPIs, charts, quotes, insight, then FollowUps last.",
    "Datasets are referenced by the ids returned from sql_exec (d1, d2, …). Never inline data rows.",
    "Every number and quote must come from a tool result in this conversation.",
    "KPI widths in a row should add up to 12 (e.g. four KPIs at width 3); pair charts at width 6 or use 12 for one wide chart.",
    "Chart specs: set encoding field types explicitly, readable axis titles, number formats like \"$,.0f\" or \".1%\", and a tooltip encoding. Column names are UPPERCASE.",
    "Never use a log scale on bar or area marks; for wide-ranging values use points with a log scale or a sorted linear bar chart.",
    "For any 'what caused…', 'why did…' or 'did X work' question, include a Verdicts block: the true cause first, then contributors, then every decoy you ruled out, each with its effect and 95% CI from release_impact or a cohort query.",
    "Use Mechanism (Voltra data only) when the cause lives in a product subsystem: battery, controller (firmware), motor, brakes, app or backend. Its before/after are the cohort-comparison numbers from your tools. One Mechanism per dashboard.",
    "When you ran forecast_metric, add a forecast Chart over its dataset: x WEEK (temporal), y VALUE, color SCENARIO, as a layer of an area mark for LOWER/UPPER (filtered to SCENARIO 'do nothing', low opacity) under a line mark; plus a Kpi for the value of acting (totals.difference and difference_usd).",
    "Filter rows in SQL, not in Vega-Lite. Temporal fields are parsed to Date objects before transforms run, so a filter like datum.MONTH < '2026-10-01' drops every row; if you must, compare with time(datum.MONTH) < time('2026-10-01').",
  ],
  examples: [
    `root = Dashboard("Retention is up 2 pts", "Monthly churn fell from 3.5% to 1.5% as recurring-deposit adoption rose to 52%.", [k1, k2, k3, k4, c1, c2, q1, i1, f1])
k1 = Kpi("Monthly churn", "1.49%", "-2.0 pts vs Q2'25", "good", "d1", "CHURN_RATE")
k2 = Kpi("On recurring deposits", "52.0%", "+11.8 pts", "good")
k3 = Kpi("Churn: recurring vs not", "0.18% vs 2.92%", "16x gap", "neutral")
k4 = Kpi("Pilot retention lift", "+20.4 pts", "91.7% vs 71.3%", "good")
c1 = Chart("Monthly churn by recurring status", "d1", {"mark": {"type": "line", "point": true}, "encoding": {"x": {"field": "MONTH", "type": "temporal", "title": "Month"}, "y": {"field": "CHURN_RATE", "type": "quantitative", "title": "Churn", "axis": {"format": ".1%"}}, "color": {"field": "GROUP", "type": "nominal", "title": null}, "tooltip": [{"field": "MONTH", "type": "temporal"}, {"field": "CHURN_RATE", "type": "quantitative", "format": ".2%"}]}}, "Non-recurring churn is ~16x higher.", 8)
c2 = Chart("Recurring share by quarter", "d2", {"mark": "bar", "encoding": {"x": {"field": "QUARTER", "type": "ordinal", "title": null}, "y": {"field": "RECURRING_SHARE", "type": "quantitative", "title": "Share", "axis": {"format": ".0%"}}}}, null, 4)
q1 = Quotes("In their words", [qa, qb])
qa = Quote("The recurring deposit prompt during onboarding is why I am still here.", "NPS 10")
qb = Quote("Set it and forget it. My balance grows without me thinking.", "NPS 9")
i1 = Insight("What it means", "**Recurring deposits drive retention.** ...", "finding", 6)
f1 = FollowUps(["Which segments haven't automated yet?", "What did the Auto-Invest pilot change?"])`,
    `root = Dashboard("Battery warranty claims fell 41% because of FW 4.2", "Bikes that got FW 4.2 early ran 6°C cooler and filed 41% fewer battery claims than late installers over the same weeks; autumn cooling explains only a small part.", [k1, k2, k3, v1, m1, c1, i1, f1])
k1 = Kpi("Battery claims / 1k bike-weeks", "0.62", "-41% vs late installers", "good")
k2 = Kpi("Battery temp p95", "-6.1°C", "early vs late cohort", "good")
k3 = Kpi("Range per charge", "+7.0%", "same weeks, same weather", "good")
v1 = Verdicts("What moved battery claims?", "battery claims per 1k bike-weeks", [va, vb, vc])
va = Verdict("FW 4.2 adaptive thermal management", "cause", -0.43, -0.55, -0.31, "Early-stage installers diverge from late-stage bikes within 4–8 weeks, in every region.")
vb = Verdict("Autumn cooling", "contributor", -0.08, -0.15, -0.01, "Claims fall slightly in cooler weeks for both cohorts alike.")
vc = Verdict("Battery cell supplier B", "no effect", 0.01, -0.06, 0.08, "Supplier A and B bikes track each other before and after.")
m1 = Mechanism("Where it happened", "battery", "FW 4.2 adaptive thermal management", "battery temp p95", 44.8, 38.7, "°C", "Early vs late installers over the same three weeks.", 7)
c1 = Chart("Claims by rollout cohort", "d3", {"mark": {"type": "line", "point": true}, "encoding": {"x": {"field": "WEEK", "type": "temporal", "title": null}, "y": {"field": "CLAIMS_PER_1K", "type": "quantitative", "title": "Claims / 1k bike-weeks"}, "color": {"field": "COHORT", "type": "nominal", "title": null}}}, "Early installers drop first; late installers follow after their update.", 5)
i1 = Insight("Ruled out", "**FW 4.2 is the cause.** ...", "finding", 12)
f1 = FollowUps(["How much warranty cost did FW 4.2 save?", "Did FW 4.2 change ride frequency?"])`,
  ],
});

const out = fileURLToPath(new URL("../../openui_prompt.txt", import.meta.url));
writeFileSync(out, prompt);
console.log(`wrote ${out} (${prompt.length} chars)`);
