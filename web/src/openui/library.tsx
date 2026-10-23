// OpenUI component library: the vocabulary Claude composes dashboards from.
// Zod key order is the positional argument order in OpenUI Lang.
import { createLibrary, defineComponent, useRenderNode } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { SUBSYSTEMS } from "../iso/voltra/model";
import {
  ChartView,
  MechanismView,
  VerdictsView,
  DashboardView,
  FollowUpsView,
  InsightView,
  KpiView,
  QuotesView,
  QuoteView,
  TableView,
} from "./views";

const width = z
  .number()
  .optional()
  .describe("Grid columns out of 12. Defaults: Kpi 3, Chart 6, Table 12, Insight 12, Quotes 6");

export const Kpi = defineComponent({
  name: "Kpi",
  description: "Headline metric tile with an animated count-up value and optional sparkline.",
  props: z.object({
    label: z.string().describe("Short metric name"),
    value: z.string().describe("Formatted value from a query result, e.g. '$1.2M', '94.8%', '3,412'"),
    delta: z.string().optional().describe("Comparison, e.g. '+4.1 pts vs Q2'"),
    tone: z.enum(["good", "bad", "neutral"]).optional(),
    sparkDataset: z.string().optional().describe("Dataset id (d1, d2, …) holding a time series for a sparkline"),
    sparkField: z.string().optional().describe("Numeric column in sparkDataset, rows already in time order"),
    width,
  }),
  component: ({ props }) => <KpiView {...props} />,
});

export const Chart = defineComponent({
  name: "Chart",
  description:
    "Vega-Lite v5 chart over a dataset. The dataset's rows are injected as the chart data, so the spec must NOT include data, $schema, width or autosize.",
  props: z.object({
    title: z.string(),
    dataset: z.string().describe("Dataset id returned by sql_exec, e.g. 'd2'"),
    spec: z
      .record(z.string(), z.any())
      .describe('Vega-Lite spec without data, e.g. {"mark": {"type": "line", "point": true}, "encoding": {...}}'),
    caption: z.string().optional().describe("One-line takeaway shown under the chart"),
    width,
  }),
  component: ({ props }) => <ChartView {...props} />,
});

export const Table = defineComponent({
  name: "Table",
  description: "Scrollable data table for a dataset (use for detail or exact numbers).",
  props: z.object({
    title: z.string(),
    dataset: z.string().describe("Dataset id"),
    columns: z.array(z.string()).optional().describe("Subset/order of columns to show; default all"),
    width,
  }),
  component: ({ props }) => <TableView {...props} />,
});

export const Insight = defineComponent({
  name: "Insight",
  description: "Narrative block in markdown: what the numbers mean, caveats, recommended next steps.",
  props: z.object({
    title: z.string(),
    markdown: z.string().describe("Concise markdown; bold the key facts"),
    tone: z.enum(["finding", "caveat", "action"]).optional(),
    width,
  }),
  component: ({ props }) => <InsightView {...props} />,
});

export const Quote = defineComponent({
  name: "Quote",
  description: "A verbatim customer quote from survey_search results.",
  props: z.object({
    text: z.string().describe("Exact text from a search result"),
    attribution: z.string().optional().describe("e.g. 'NPS 10 · Mar 2026'"),
  }),
  component: ({ props }) => <QuoteView {...props} />,
});

export const Quotes = defineComponent({
  name: "Quotes",
  description: "Voice-of-customer card with verbatim quotes. Only use text returned by survey_search.",
  props: z.object({
    title: z.string(),
    quotes: z.array(Quote.ref),
    width,
  }),
  component: ({ props }) => {
    const renderNode = useRenderNode();
    return (
      <QuotesView title={props.title} width={props.width}>
        {renderNode(props.quotes)}
      </QuotesView>
    );
  },
});

export const Mechanism = defineComponent({
  name: "Mechanism",
  description:
    "Live isometric figure of the Voltra powertrain on a dyno bench. It lights the subsystem that caused the change and animates the metric from before to after. Use it when the cause is a physical or firmware subsystem; before/after must come from tool results.",
  props: z.object({
    title: z.string(),
    subsystem: z.enum(SUBSYSTEMS as [string, ...string[]]).describe("battery | controller | motor | brakes | app | backend"),
    cause: z.string().describe("The change that caused it, e.g. 'FW 4.2 adaptive thermal management'"),
    metric: z.string().describe("Short metric name, e.g. 'battery overheat errors per 1k rides'"),
    before: z.number(),
    after: z.number(),
    unit: z.string().optional().describe("e.g. 'km', '%', '°C'; omit for counts"),
    note: z.string().optional().describe("One sentence on the evidence, e.g. the cohort comparison"),
    width: z.number().optional().describe("Grid columns out of 12; default 7"),
  }),
  component: ({ props }) => <MechanismView {...props} />,
});

export const Verdict = defineComponent({
  name: "Verdict",
  description: "One candidate cause and what the evidence says about it.",
  props: z.object({
    change: z.string().describe("Release/revision/incident/campaign name, e.g. 'FW 4.3 regen tuning'"),
    verdict: z.enum(["cause", "contributor", "ruled out", "no effect"]),
    effect: z.number().optional().describe("Estimated effect on the metric (from release_impact or a cohort query)"),
    ciLow: z.number().optional(),
    ciHigh: z.number().optional(),
    evidence: z.string().describe("One sentence: the cohort comparison or fact that decides it"),
  }),
  component: () => null,
});

export const Verdicts = defineComponent({
  name: "Verdicts",
  description:
    "Causal verdict board: ranks candidate causes for a metric change, each with a verdict badge and its effect ± 95% CI on a shared axis. Put the true cause first and include the decoys you ruled out.",
  props: z.object({
    title: z.string(),
    metric: z.string().describe("The metric the effects are measured in, with unit, e.g. 'overheat errors per 1k rides'"),
    verdicts: z.array(Verdict.ref),
    width: z.number().optional().describe("Grid columns out of 12; default 12"),
  }),
  component: ({ props }) => <VerdictsView title={props.title} metric={props.metric} verdicts={props.verdicts as never} width={props.width} />,
});

export const FollowUps = defineComponent({
  name: "FollowUps",
  description: "2-4 clickable next questions; place last.",
  props: z.object({ questions: z.array(z.string()) }),
  component: ({ props }) => <FollowUpsView questions={props.questions} />,
});

const Block = z.union([Kpi.ref, Chart.ref, Table.ref, Insight.ref, Quotes.ref, Mechanism.ref, Verdicts.ref, FollowUps.ref]);

export const Dashboard = defineComponent({
  name: "Dashboard",
  description: "Root: an answer dashboard laid out on a 12-column grid in reading order.",
  props: z.object({
    title: z.string(),
    subtitle: z.string().describe("One sentence headline answer with the key number"),
    blocks: z.array(Block),
  }),
  component: ({ props }) => {
    const renderNode = useRenderNode();
    return (
      <DashboardView title={props.title} subtitle={props.subtitle}>
        {renderNode(props.blocks)}
      </DashboardView>
    );
  },
});

export const library = createLibrary({
  components: [Dashboard, Kpi, Chart, Table, Insight, Quotes, Quote, Mechanism, Verdicts, Verdict, FollowUps],
  root: "Dashboard",
});
