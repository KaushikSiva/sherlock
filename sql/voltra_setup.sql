-- Voltra Snowflake layer: semantic view, text search, causal RELEASE_IMPACT procedure and MCP server.
-- Statements are separated by lines containing only "-- @@" (procedure bodies contain semicolons).
-- Run: .venv/bin/python sql/run_sql.py sql/voltra_setup.sql
USE SCHEMA VOLTRA.CORE
-- @@
CREATE OR REPLACE SEMANTIC VIEW VOLTRA.CORE.VOLTRA_360
  TABLES (
    REG AS VOLTRA.CORE.REGIONS PRIMARY KEY (REGION) COMMENT = 'Sales regions with terrain/climate flags',
    CUST AS VOLTRA.CORE.CUSTOMERS PRIMARY KEY (CUSTOMER_ID) COMMENT = 'Consumers and delivery-fleet businesses',
    BIKE AS VOLTRA.CORE.BIKES PRIMARY KEY (BIKE_ID) COMMENT = 'Every bike with its hardware revisions and Hill Assist flag variant',
    TEL AS VOLTRA.CORE.TELEMETRY_WEEKLY PRIMARY KEY (BIKE_ID, WEEK_START) COMMENT = 'Weekly ride telemetry per bike',
    CLAIM AS VOLTRA.CORE.WARRANTY_CLAIMS PRIMARY KEY (CLAIM_ID) COMMENT = 'Warranty claims by part',
    TICKET AS VOLTRA.CORE.SERVICE_TICKETS PRIMARY KEY (TICKET_ID) COMMENT = 'Customer support tickets',
    SUB AS VOLTRA.CORE.SUBSCRIPTIONS PRIMARY KEY (SUBSCRIPTION_ID) COMMENT = 'Voltra Care subscriptions ($14.99/mo)',
    ORD AS VOLTRA.CORE.ORDERS PRIMARY KEY (ORDER_ID) COMMENT = 'Bike orders',
    FUNNEL AS VOLTRA.CORE.WEB_FUNNEL_DAILY PRIMARY KEY (FUNNEL_DATE, CHANNEL, PLATFORM, VARIANT) COMMENT = 'Daily shop funnel by channel, platform and checkout variant'
  )
  RELATIONSHIPS (
    BIKE (REGION) REFERENCES REG,
    BIKE (CUSTOMER_ID) REFERENCES CUST,
    TEL (BIKE_ID) REFERENCES BIKE,
    CLAIM (BIKE_ID) REFERENCES BIKE,
    TICKET (BIKE_ID) REFERENCES BIKE,
    SUB (BIKE_ID) REFERENCES BIKE,
    ORD (CUSTOMER_ID) REFERENCES CUST
  )
  FACTS (
    TEL.RIDES_F AS RIDES,
    TEL.KM_F AS KM,
    TEL.RANGE_F AS RANGE_KM,
    TEL.BATTERY_TEMP_F AS BATTERY_TEMP_P95,
    TEL.MOTOR_TEMP_F AS MOTOR_TEMP_P95,
    TEL.OVERHEAT_F AS OVERHEAT_ERRORS,
    TEL.MOTOR_OVERTEMP_F AS MOTOR_OVERTEMP_ERRORS,
    TEL.UNLOCK_TIMEOUT_F AS UNLOCK_TIMEOUTS,
    TEL.BIKE_WEEK_F AS 1,
    CLAIM.CLAIM_COST_F AS COST_USD,
    CLAIM.CLAIM_F AS 1,
    TICKET.TICKET_F AS 1,
    TICKET.CSAT_F AS CSAT,
    SUB.SUB_F AS 1,
    SUB.ACTIVE_F AS IFF(CANCELLED_AT IS NULL, 1, 0),
    SUB.CANCELLED_F AS IFF(CANCELLED_AT IS NOT NULL, 1, 0),
    SUB.MRR_ACTIVE_F AS IFF(CANCELLED_AT IS NULL, MRR_USD, 0),
    ORD.REVENUE_F AS REVENUE_USD,
    ORD.QTY_F AS QUANTITY,
    FUNNEL.SESSIONS_F AS SESSIONS,
    FUNNEL.CONFIG_F AS CONFIGURATOR_STARTS,
    FUNNEL.CHECKOUTS_F AS CHECKOUTS,
    FUNNEL.FUNNEL_ORDERS_F AS ORDERS
  )
  DIMENSIONS (
    REG.REGION AS REGION,
    REG.HILLY AS HILLY WITH SYNONYMS = ('hilly region', 'terrain'),
    REG.RAINY AS RAINY WITH SYNONYMS = ('rainy region', 'wet climate'),
    REG.CLOUD_CLUSTER AS CLOUD_CLUSTER,
    CUST.SEGMENT AS SEGMENT WITH SYNONYMS = ('consumer vs fleet', 'customer type'),
    CUST.ACQUISITION_CHANNEL AS ACQUISITION_CHANNEL,
    BIKE.MODEL AS MODEL,
    BIKE.FACTORY AS FACTORY,
    BIKE.BUILD_DATE AS BUILD_DATE,
    BIKE.DELIVERED_DATE AS DELIVERED_DATE,
    BIKE.CALIPER_REV AS CALIPER_REV WITH SYNONYMS = ('brake caliper revision', 'caliper'),
    BIKE.CALIPER_SUPPLIER AS CALIPER_SUPPLIER,
    BIKE.MOTOR_REV AS MOTOR_REV WITH SYNONYMS = ('motor revision'),
    BIKE.BATTERY_CELL_SUPPLIER AS BATTERY_CELL_SUPPLIER,
    BIKE.FRAME_REV AS FRAME_REV,
    BIKE.HILL_ASSIST_VARIANT AS HILL_ASSIST_VARIANT WITH SYNONYMS = ('hill assist flag', 'hill assist A/B'),
    TEL.WEEK_START AS WEEK_START WITH SYNONYMS = ('week'),
    TEL.FIRMWARE_VERSION AS FIRMWARE_VERSION WITH SYNONYMS = ('firmware', 'fw version'),
    CLAIM.CLAIM_DATE AS CLAIM_DATE,
    CLAIM.CLAIM_PART AS PART WITH SYNONYMS = ('warranty part'),
    CLAIM.FAILURE_MODE AS FAILURE_MODE,
    TICKET.TICKET_DATE AS TICKET_DATE,
    TICKET.TICKET_CATEGORY AS CATEGORY WITH SYNONYMS = ('support category', 'complaint type'),
    SUB.CARE_STARTED_AT AS STARTED_AT,
    SUB.CARE_CANCELLED_AT AS CANCELLED_AT,
    ORD.ORDER_DATE AS ORDER_DATE,
    ORD.ORDER_CHANNEL AS CHANNEL,
    ORD.ORDER_PLATFORM AS PLATFORM,
    ORD.ORDER_CHECKOUT_VARIANT AS CHECKOUT_VARIANT,
    ORD.ORDER_MODEL AS MODEL,
    FUNNEL.FUNNEL_DATE AS FUNNEL_DATE,
    FUNNEL.FUNNEL_CHANNEL AS CHANNEL,
    FUNNEL.FUNNEL_PLATFORM AS PLATFORM,
    FUNNEL.FUNNEL_VARIANT AS VARIANT WITH SYNONYMS = ('new checkout', 'checkout A/B')
  )
  METRICS (
    BIKE.BIKES AS COUNT(DISTINCT BIKE_ID),
    TEL.BIKE_WEEKS AS SUM(bike_week_f),
    TEL.TOTAL_RIDES AS SUM(rides_f),
    TEL.RIDES_PER_BIKE_WEEK AS AVG(rides_f) WITH SYNONYMS = ('engagement', 'usage'),
    TEL.AVG_RANGE_KM AS AVG(range_f) WITH SYNONYMS = ('range', 'range per charge'),
    TEL.AVG_BATTERY_TEMP_P95 AS AVG(battery_temp_f) WITH SYNONYMS = ('battery temperature'),
    TEL.OVERHEAT_ERRORS_PER_1K_RIDES AS 1000 * SUM(overheat_f) / NULLIF(SUM(rides_f), 0) WITH SYNONYMS = ('overheat rate', 'battery overheat errors'),
    TEL.MOTOR_OVERTEMP_PER_1K_RIDES AS 1000 * SUM(motor_overtemp_f) / NULLIF(SUM(rides_f), 0),
    TEL.TOTAL_UNLOCK_TIMEOUTS AS SUM(unlock_timeout_f),
    CLAIM.WARRANTY_CLAIMS AS SUM(claim_f) WITH SYNONYMS = ('claims', 'warranty count'),
    CLAIM.WARRANTY_COST AS SUM(claim_cost_f) WITH SYNONYMS = ('warranty spend', 'warranty cost'),
    TICKET.TICKETS AS SUM(ticket_f) WITH SYNONYMS = ('support tickets', 'complaints'),
    TICKET.AVG_CSAT AS AVG(csat_f) WITH SYNONYMS = ('CSAT', 'satisfaction'),
    SUB.CARE_SUBSCRIPTIONS AS SUM(sub_f),
    SUB.CARE_ACTIVE AS SUM(active_f),
    SUB.CARE_CANCELLATIONS AS SUM(cancelled_f) WITH SYNONYMS = ('Care churn', 'cancellations'),
    SUB.CARE_MRR AS SUM(mrr_active_f) WITH SYNONYMS = ('MRR', 'recurring revenue'),
    ORD.ORDER_COUNT AS COUNT(DISTINCT ORDER_ID) WITH SYNONYMS = ('orders', 'number of orders'),
    ORD.BIKES_SOLD AS SUM(qty_f),
    ORD.REVENUE AS SUM(revenue_f) WITH SYNONYMS = ('sales', 'bike revenue'),
    FUNNEL.TOTAL_SESSIONS AS SUM(sessions_f) WITH SYNONYMS = ('sessions', 'traffic'),
    FUNNEL.CONVERSION_RATE AS SUM(funnel_orders_f) / NULLIF(SUM(sessions_f), 0) WITH SYNONYMS = ('conversion', 'session to order'),
    FUNNEL.CHECKOUT_RATE AS SUM(checkouts_f) / NULLIF(SUM(config_f), 0) WITH SYNONYMS = ('configurator completion', 'configurator to checkout')
  )
  COMMENT = 'Voltra 360: bikes, hardware revisions, firmware, ride telemetry, warranty, support, Voltra Care, orders and shop funnel. For per-bike rates divide counts by BIKE_WEEKS.'
-- @@
CREATE OR REPLACE VIEW VOLTRA.CORE.TEXT_DOCS AS
SELECT RELEASE_ID AS DOC_ID, 'release_note' AS DOC_TYPE, RELEASE_DATE AS DOC_DATE, RELEASE_ID AS REF_ID,
       TITLE || ' (' || COMPONENT || ' ' || VERSION || ', ' || TO_VARCHAR(RELEASE_DATE) || '): ' || NOTES || ' Rollout: ' || ROLLOUT AS TEXT
FROM VOLTRA.CORE.RELEASES
UNION ALL
SELECT INCIDENT_ID, 'postmortem', STARTED_AT::DATE, INCIDENT_ID,
       INCIDENT_ID || ' ' || SEVERITY || ' ' || SERVICE || ' (' || TO_VARCHAR(STARTED_AT) || ' to ' || TO_VARCHAR(ENDED_AT) || '): ' || SUMMARY || '\n' || POSTMORTEM
FROM VOLTRA.CORE.INCIDENTS
UNION ALL
SELECT REVISION_ID, 'hardware_change', EFFECTIVE_BUILD_DATE, REVISION_ID,
       PART || ' rev ' || REV || ' from ' || SUPPLIER || ', builds from ' || TO_VARCHAR(EFFECTIVE_BUILD_DATE) || ': ' || CHANGE_DESCRIPTION
FROM VOLTRA.CORE.HARDWARE_REVISIONS
UNION ALL
SELECT TICKET_ID, 'support_ticket', TICKET_DATE, CATEGORY, DESCRIPTION || ' (CSAT ' || CSAT || ')'
FROM VOLTRA.CORE.SERVICE_TICKETS
UNION ALL
SELECT REVIEW_ID, 'app_review', REVIEW_DATE, 'app ' || APP_VERSION, RATING || ' stars: ' || REVIEW_TEXT
FROM VOLTRA.CORE.APP_REVIEWS
-- @@
CREATE OR REPLACE CORTEX SEARCH SERVICE VOLTRA.CORE.VOLTRA_TEXT
  ON TEXT
  ATTRIBUTES DOC_TYPE, DOC_DATE, REF_ID
  WAREHOUSE = DEFAULT_WH
  TARGET_LAG = '1 day'
  COMMENT = 'Release notes, incident postmortems, hardware change notices, support tickets and app reviews'
  AS SELECT DOC_ID, DOC_TYPE, DOC_DATE, REF_ID, TEXT FROM VOLTRA.CORE.TEXT_DOCS
-- @@
CREATE OR REPLACE PROCEDURE VOLTRA.CORE.RELEASE_IMPACT(CHANGE_ID STRING, METRIC STRING, WINDOW_WEEKS INT DEFAULT 6)
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.12'
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
COMMENT = 'Causal impact of a release, feature flag, hardware revision or incident on a metric (diff-in-diff / A-B / cohort comparison).'
AS
$$
import datetime as dt
import math

T = "VOLTRA.CORE."
TEL_METRICS = {
    "range_km": "AVG(t.RANGE_KM)",
    "battery_temp_p95": "AVG(t.BATTERY_TEMP_P95)",
    "motor_temp_p95": "AVG(t.MOTOR_TEMP_P95)",
    "rides": "AVG(t.RIDES)",
    "km": "AVG(t.KM)",
    "overheat_errors": "1000 * SUM(t.OVERHEAT_ERRORS) / NULLIF(SUM(t.RIDES), 0)",
    "motor_overtemp_errors": "1000 * SUM(t.MOTOR_OVERTEMP_ERRORS) / NULLIF(SUM(t.RIDES), 0)",
    "unlock_timeouts": "AVG(t.UNLOCK_TIMEOUTS)",
}
UNITS = {
    "range_km": "km per charge", "battery_temp_p95": "deg C", "motor_temp_p95": "deg C", "rides": "rides per bike-week",
    "km": "km per bike-week", "overheat_errors": "per 1k rides", "motor_overtemp_errors": "per 1k rides",
    "unlock_timeouts": "per bike-week", "warranty_claims": "per 1k bike-weeks", "tickets": "per 1k bike-weeks",
    "care_cancellations": "share of active subscribers cancelling in window", "conversion": "orders / sessions",
    "checkout_rate": "checkouts / configurator starts", "orders": "orders per day",
}
HW_COLUMN = {"Disc brake caliper": "CALIPER_REV", "Rear hub motor": "MOTOR_REV", "Battery cells": "BATTERY_CELL_SUPPLIER", "Frame": "FRAME_REV"}


def q(session, sql):
    return [r.as_dict() for r in session.sql(sql).collect()]


def lit(d):
    return "'" + str(d) + "'"


def monday(d):
    return d - dt.timedelta(days=d.weekday())


def per_bike_sql(metric, a, b):
    """SELECT BIKE_ID, V for bikes with telemetry in [a, b)."""
    base, _, sub = metric.partition(":")
    if base in TEL_METRICS:
        having = " AND SUM(t.RIDES) >= 10" if "NULLIF(SUM(t.RIDES)" in TEL_METRICS[base] else ""
        return (f"SELECT t.BIKE_ID, {TEL_METRICS[base]} AS V FROM {T}TELEMETRY_WEEKLY t "
                f"WHERE t.WEEK_START >= {lit(a)} AND t.WEEK_START < {lit(b)} GROUP BY 1 HAVING V IS NOT NULL{having}")
    if base in ("warranty_claims", "tickets"):
        tbl, dcol, ccol = ("WARRANTY_CLAIMS", "CLAIM_DATE", "PART") if base == "warranty_claims" else ("SERVICE_TICKETS", "TICKET_DATE", "CATEGORY")
        cond = f" AND e.{ccol} = {lit(sub)}" if sub else ""
        return (f"SELECT t.BIKE_ID, 1000 * COALESCE(MAX(e.N), 0) / COUNT(*) AS V FROM {T}TELEMETRY_WEEKLY t "
                f"LEFT JOIN (SELECT BIKE_ID, COUNT(*) N FROM {T}{tbl} e WHERE {dcol} >= {lit(a)} AND {dcol} < {lit(b)}{cond} GROUP BY 1) e "
                f"ON e.BIKE_ID = t.BIKE_ID WHERE t.WEEK_START >= {lit(a)} AND t.WEEK_START < {lit(b)} GROUP BY 1")
    raise ValueError(f"unsupported bike metric {metric}")


def subs_sql(a, b):
    """Per subscription active at a: did it cancel in [a, b)?"""
    return (f"SELECT s.BIKE_ID, IFF(s.CANCELLED_AT >= {lit(a)} AND s.CANCELLED_AT < {lit(b)}, 1, 0) AS V FROM {T}SUBSCRIPTIONS s "
            f"WHERE s.STARTED_AT < {lit(a)} AND (s.CANCELLED_AT IS NULL OR s.CANCELLED_AT >= {lit(a)})")


def unit_sql(metric, a, b):
    return subs_sql(a, b) if metric.startswith("care_cancellations") else per_bike_sql(metric, a, b)


def group_stats(session, cohort_sql, metric, a, b, segments=True):
    """cohort_sql yields BIKE_ID, GRP. Returns {grp: (n, mean, var)} overall and by HILLY/RAINY segment."""
    sql = (f"WITH c AS ({cohort_sql}), u AS ({unit_sql(metric, a, b)}) "
           f"SELECT c.GRP, r.HILLY, r.RAINY, COUNT(*) N, AVG(u.V) M, COALESCE(VAR_SAMP(u.V), 0) S2, SUM(u.V) TOT "
           f"FROM c JOIN u ON u.BIKE_ID = c.BIKE_ID JOIN {T}BIKES b ON b.BIKE_ID = c.BIKE_ID JOIN {T}REGIONS r ON r.REGION = b.REGION "
           f"GROUP BY 1, 2, 3")
    rows = q(session, sql)
    out = {}

    def add(key, r):
        n0, m0, s0 = out.get(key, (0, 0.0, 0.0))
        n1, m1, s1 = r["N"], float(r["M"] or 0), float(r["S2"] or 0)
        n = n0 + n1
        if n == 0:
            return
        m = (n0 * m0 + n1 * m1) / n
        # pooled variance (combine group moments)
        ss = (max(n0 - 1, 0) * s0 + n0 * (m0 - m) ** 2) + (max(n1 - 1, 0) * s1 + n1 * (m1 - m) ** 2)
        out[key] = (n, m, ss / max(n - 1, 1))

    for r in rows:
        add(("all", r["GRP"]), r)
        if segments:
            add(("hilly" if r["HILLY"] else "flat", r["GRP"]), r)
            add(("rainy" if r["RAINY"] else "dry", r["GRP"]), r)
    return out


def summarize(pre, post, treated, control, keys=("all", "hilly", "flat", "rainy", "dry"), cross_sectional=False):
    res = {}
    for k in keys:
        try:
            nT, mT1, vT1 = post[(k, treated)]
            nC, mC1, vC1 = post[(k, control)]
        except KeyError:
            continue
        if cross_sectional:
            eff = mT1 - mC1
            se = math.sqrt(vT1 / nT + vC1 / nC)
            cf = mC1
            pre_vals = None
        else:
            try:
                nT0, mT0, vT0 = pre[(k, treated)]
                nC0, mC0, vC0 = pre[(k, control)]
            except KeyError:
                continue
            eff = (mT1 - mT0) - (mC1 - mC0)
            se = math.sqrt(vT1 / nT + vC1 / nC + vT0 / nT0 + vC0 / nC0)
            cf = mT1 - eff
            pre_vals = {"treated": round(mT0, 4), "control": round(mC0, 4)}
        po_se = math.sqrt(vT1 / nT + vC1 / nC)
        po = mT1 - mC1
        res[k] = {
            "n_treated": nT, "n_control": nC,
            "pre_mean": pre_vals,
            "post_mean": {"treated": round(mT1, 4), "control": round(mC1, 4)},
            "effect": round(eff, 4),
            "ci95": [round(eff - 1.96 * se, 4), round(eff + 1.96 * se, 4)],
            "relative_effect": round(eff / cf, 4) if cf else None,
            "significant": abs(eff) > 1.96 * se,
        }
        if not cross_sectional:
            res[k]["post_only"] = {
                "effect": round(po, 4), "ci95": [round(po - 1.96 * po_se, 4), round(po + 1.96 * po_se, 4)],
                "relative_effect": round(po / mC1, 4) if mC1 else None, "significant": abs(po) > 1.96 * po_se,
            }
    return res


RARE = ("warranty_claims", "tickets", "care_cancellations")


def primary(metric):
    """Which estimate to lead with when cohorts were assigned at random."""
    if metric.split(":")[0] in RARE:
        return ("post_only: cohorts were randomized, and pre-period noise in rare-event rates inflates the "
                "diff-in-diff interval; use diff-in-diff as a balance check")
    return "diff_in_diff (effect / ci95)"


def concurrent(session, d0, exclude):
    a, b = d0 - dt.timedelta(days=7), d0 + dt.timedelta(days=7)
    ev = []
    for r in q(session, f"SELECT RELEASE_ID ID, TITLE, RELEASE_DATE D FROM {T}RELEASES WHERE RELEASE_DATE BETWEEN {lit(a)} AND {lit(b)}"):
        if r["ID"] != exclude:
            ev.append({"type": "release", "id": r["ID"], "title": r["TITLE"], "date": str(r["D"])})
    for r in q(session, f"SELECT REVISION_ID ID, CHANGE_DESCRIPTION TITLE, EFFECTIVE_BUILD_DATE D FROM {T}HARDWARE_REVISIONS WHERE EFFECTIVE_BUILD_DATE BETWEEN {lit(a)} AND {lit(b)}"):
        if r["ID"] != exclude:
            ev.append({"type": "hardware_revision", "id": r["ID"], "title": r["TITLE"], "date": str(r["D"])})
    for r in q(session, f"SELECT INCIDENT_ID ID, SUMMARY TITLE, STARTED_AT::DATE D FROM {T}INCIDENTS WHERE STARTED_AT::DATE BETWEEN {lit(a)} AND {lit(b)}"):
        if r["ID"] != exclude:
            ev.append({"type": "incident", "id": r["ID"], "title": r["TITLE"], "date": str(r["D"])})
    for r in q(session, f"SELECT CAMPAIGN ID, MIN(SPEND_DATE) S, MAX(SPEND_DATE) E FROM {T}MARKETING_SPEND WHERE CAMPAIGN <> 'Always-on' GROUP BY 1 HAVING S <= {lit(b)} AND E >= {lit(a)}"):
        ev.append({"type": "campaign", "id": r["ID"], "title": f"Marketing campaign {r['S']} to {r['E']}", "date": str(r["S"])})
    return ev


def weather(session, window):
    """Average weekly temperature and rain across regions in each window: the seasonal context."""
    out = {}
    for name, (a, b) in window.items():
        r = q(session, f"SELECT ROUND(AVG(AVG_TEMP_C), 1) T, ROUND(AVG(RAIN_MM), 1) R FROM {T}WEATHER_WEEKLY "
                       f"WHERE WEEK_START >= {lit(a)} AND WEEK_START < {lit(b)}")[0]
        out[name] = {"avg_temp_c": float(r["T"]) if r["T"] is not None else None, "avg_weekly_rain_mm": float(r["R"]) if r["R"] is not None else None}
    return out


def funnel(session, release, w):
    d0 = release["RELEASE_DATE"]
    d1 = d0 + dt.timedelta(weeks=w)
    rows = q(session, f"SELECT VARIANT, PLATFORM, SUM(SESSIONS) S, SUM(CONFIGURATOR_STARTS) CF, SUM(CHECKOUTS) CK, SUM(ORDERS) O "
                      f"FROM {T}WEB_FUNNEL_DAILY WHERE FUNNEL_DATE >= {lit(d0)} AND FUNNEL_DATE < {lit(d1)} GROUP BY 1, 2")
    agg = {}
    for r in rows:
        for key in (("all", r["VARIANT"]), (r["PLATFORM"], r["VARIANT"])):
            a = agg.setdefault(key, [0, 0, 0, 0])
            for i, c in enumerate(("S", "CF", "CK", "O")):
                a[i] += r[c]
    return agg, d0, d1


def run(session, change_id, metric, window_weeks):
    out = analyze(session, change_id, metric, window_weeks)
    win = out.get("window") or {}
    if win:
        out["weather_context"] = weather(session, {k: (v[0], v[1]) for k, v in win.items()})
        if "pre" in win:
            out["weather_context"]["note"] = ("Both cohorts share this weather, so diff-in-diff removes it; "
                                              "a plain before/after comparison would not.")
    return out


def analyze(session, change_id, metric, window_weeks):
    metric = (metric or "").strip().lower()
    w = int(window_weeks or 6)
    cid = change_id.strip()
    rel = q(session, f"SELECT * FROM {T}RELEASES WHERE RELEASE_ID = {lit(cid)} OR LOWER(FLAG_KEY) = LOWER({lit(cid)}) LIMIT 1")
    hw = q(session, f"SELECT * FROM {T}HARDWARE_REVISIONS WHERE REVISION_ID = {lit(cid)}")
    inc = q(session, f"SELECT * FROM {T}INCIDENTS WHERE INCIDENT_ID = {lit(cid)}")
    out = {"change_id": cid, "metric": metric, "unit": UNITS.get(metric.split(":")[0]), "window_weeks": w}

    if rel:
        r = rel[0]
        d0 = r["RELEASE_DATE"]
        out["change"] = f"{r['RELEASE_ID']} {r['TITLE']} ({r['COMPONENT']} {r['VERSION']}, {d0})"
        out["concurrent_events"] = concurrent(session, d0, r["RELEASE_ID"])
        flag = (r["FLAG_KEY"] or "").lower()
        if flag == "new_checkout":
            agg, a, b = funnel(session, r, w)
            num, den = {"conversion": (3, 0), "checkout_rate": (2, 1)}.get(metric, (3, 0))
            res = {}
            for k in sorted({k for k, _ in agg}):
                if (k, "control") not in agg or (k, "new_checkout") not in agg:
                    continue
                t, c = agg[(k, "new_checkout")], agg[(k, "control")]
                pt, pc = t[num] / max(t[den], 1), c[num] / max(c[den], 1)
                se = math.sqrt(pt * (1 - pt) / max(t[den], 1) + pc * (1 - pc) / max(c[den], 1))
                res[k] = {"n_treated": t[den], "n_control": c[den], "post_mean": {"treated": round(pt, 5), "control": round(pc, 5)},
                          "effect": round(pt - pc, 5), "ci95": [round(pt - pc - 1.96 * se, 5), round(pt - pc + 1.96 * se, 5)],
                          "relative_effect": round((pt - pc) / pc, 4) if pc else None, "significant": abs(pt - pc) > 1.96 * se}
            out.update(method="randomized A/B (flag new_checkout, 50/50 sessions)", treated="new_checkout variant", control="control variant",
                       window={"post": [str(a), str(b)]}, results=res)
            if metric not in ("conversion", "checkout_rate"):
                out["note"] = "For new_checkout use metric 'conversion' or 'checkout_rate'; showing conversion."
            return out
        if flag == "hill_assist":
            a0, a1 = d0 - dt.timedelta(weeks=w), d0
            b0, b1 = d0 + dt.timedelta(weeks=2), d0 + dt.timedelta(weeks=2 + w)
            cohort = f"SELECT BIKE_ID, HILL_ASSIST_VARIANT GRP FROM {T}BIKES WHERE HILL_ASSIST_VARIANT IS NOT NULL AND DELIVERED_DATE < {lit(a0)}"
            pre = group_stats(session, cohort, metric, a0, a1)
            post = group_stats(session, cohort, metric, b0, b1)
            out["primary_estimate"] = primary(metric)
            out.update(method="randomized feature flag (30% on) with diff-in-diff", treated="hill_assist = on", control="hill_assist = off",
                       window={"pre": [str(a0), str(a1)], "post": [str(b0), str(b1)]}, results=summarize(pre, post, "on", "off"))
            return out
        if r["COMPONENT"] == "firmware":
            ver = r["VERSION"]
            stages = q(session, f"SELECT MAX(ROLLOUT_STAGE) MS FROM {T}FIRMWARE_INSTALLS WHERE VERSION = {lit(ver)}")[0]["MS"] or 0
            early = "(1, 2)" if stages >= 3 else "(1)"
            later = f"(SELECT RELEASE_DATE FROM {T}RELEASES WHERE COMPONENT = 'firmware' AND RELEASE_DATE >= {lit(d0)})"
            base = (f"SELECT b.BIKE_ID, MIN(IFF(fi.VERSION = {lit(ver)} AND fi.ROLLOUT_STAGE IN {early}, fi.INSTALLED_AT, NULL)) T_AT, "
                    f"MIN(IFF(r.RELEASE_DATE IS NOT NULL, fi.INSTALLED_AT, NULL)) ANY_AT "
                    f"FROM {T}BIKES b LEFT JOIN {T}FIRMWARE_INSTALLS fi ON fi.BIKE_ID = b.BIKE_ID "
                    f"LEFT JOIN {T}RELEASES r ON r.COMPONENT = 'firmware' AND r.VERSION = fi.VERSION AND r.RELEASE_DATE >= {lit(d0)} "
                    f"WHERE b.DELIVERED_DATE < {lit(d0)} GROUP BY 1")
            stats = q(session, f"WITH x AS ({base}) SELECT MAX(T_AT) TMAX, COUNT(T_AT) NT FROM x")[0]
            if stats["NT"] and stats["NT"] >= 30:
                post_start = monday(stats["TMAX"]) + dt.timedelta(weeks=1)
                for ww in range(w, 0, -1):
                    post_end = post_start + dt.timedelta(weeks=ww)
                    nc = q(session, f"WITH x AS ({base}) SELECT COUNT(*) N FROM x WHERE T_AT IS NULL AND (ANY_AT IS NULL OR ANY_AT >= {lit(post_end)})")[0]["N"]
                    if nc >= 30:
                        cohort = (f"WITH x AS ({base}) SELECT BIKE_ID, IFF(T_AT IS NOT NULL, 'treated', 'control') GRP FROM x "
                                  f"WHERE T_AT IS NOT NULL OR (ANY_AT IS NULL OR ANY_AT >= {lit(post_end)})")
                        a0, a1 = d0 - dt.timedelta(weeks=w), d0
                        pre = group_stats(session, cohort, metric, a0, a1)
                        post = group_stats(session, cohort, metric, post_start, post_end)
                        out["primary_estimate"] = primary(metric)
                        out.update(method="staged-rollout diff-in-diff (early installers vs bikes not yet updated; rollout buckets assigned at random)",
                                   treated=f"bikes that installed {ver} in rollout stage(s) {early}",
                                   control=f"bikes delivered before {d0} still without {ver} (or later firmware) through {post_end}",
                                   window={"pre": [str(a0), str(a1)], "post": [str(post_start), str(post_end)]},
                                   results=summarize(pre, post, "treated", "control"))
                        if ww < w:
                            out["note"] = f"Post window shortened to {ww} week(s): the untreated control ran out after that."
                        return out
            # fall through: rollout too fast for a concurrent control
        # interrupted time series on bikes that existed before the change
        a0, a1 = d0 - dt.timedelta(weeks=w), monday(d0)
        b0, b1 = monday(d0) + dt.timedelta(weeks=1), monday(d0) + dt.timedelta(weeks=1 + w)
        cohort = f"SELECT BIKE_ID, 'all' GRP FROM {T}BIKES WHERE DELIVERED_DATE < {lit(a0)}"
        pre = group_stats(session, cohort, metric, a0, a1)
        post = group_stats(session, cohort, metric, b0, b1)
        res = {}
        for k in ("all", "hilly", "flat", "rainy", "dry"):
            if (k, "all") in pre and (k, "all") in post:
                n0, m0, v0 = pre[(k, "all")]
                n1, m1, v1 = post[(k, "all")]
                se = math.sqrt(v0 / n0 + v1 / n1)
                res[k] = {"n": n1, "pre_mean": round(m0, 4), "post_mean": round(m1, 4), "change": round(m1 - m0, 4),
                          "ci95": [round(m1 - m0 - 1.96 * se, 4), round(m1 - m0 + 1.96 * se, 4)],
                          "relative_change": round((m1 - m0) / m0, 4) if m0 else None}
        out.update(method="interrupted time series (before vs after, same pre-existing bikes; NOT causal)",
                   population=f"bikes delivered before {a0} (unaffected by later hardware revisions)",
                   window={"pre": [str(a0), str(a1)], "post": [str(b0), str(b1)]}, results=res,
                   warning="No randomized or staged control group for this change. Seasonality and concurrent events can explain the change; see concurrent_events.")
        return out

    if hw:
        h = hw[0]
        col = HW_COLUMN.get(h["PART"])
        new_val = "Arcadia Cells" if h["REVISION_ID"] == "HW-CELL-ARC" else h["REV"]
        d0 = h["EFFECTIVE_BUILD_DATE"]
        if d0 <= dt.date(2025, 1, 1):
            out["error"] = f"{h['REVISION_ID']} is the baseline revision; analyze its successor instead."
            return out
        b0 = monday(d0) + dt.timedelta(weeks=2)
        b1 = dt.date(2026, 10, 26)
        cohort = (f"SELECT BIKE_ID, IFF({col} = {lit(new_val)}, 'treated', 'control') GRP FROM {T}BIKES "
                  f"WHERE BUILD_DATE >= {lit(d0 - dt.timedelta(days=365))}")
        post = group_stats(session, cohort, metric, b0, b1)
        out.update(change=f"{h['REVISION_ID']} {h['PART']} rev {h['REV']} ({h['SUPPLIER']}), builds from {d0}",
                   method="hardware cohort comparison (new vs previous revision, same calendar weeks)",
                   treated=f"bikes with {col} = {new_val}", control=f"bikes with previous {col}, built in the prior 12 months",
                   window={"post": [str(b0), str(b1)]}, results=summarize({}, post, "treated", "control", cross_sectional=True),
                   concurrent_events=concurrent(session, d0, h["REVISION_ID"]),
                   note="Bikes on both revisions ride in the same weeks and regions, so season and firmware are shared. Newer bikes are younger; check age-sensitive metrics.")
        return out

    if inc:
        i = inc[0]
        d0 = i["STARTED_AT"].date()
        if "unlock" in i["SERVICE"]:
            aff = (f"SELECT DISTINCT BIKE_ID FROM {T}ERROR_EVENTS WHERE CODE = 'UNLOCK_TIMEOUT' "
                   f"AND EVENT_TS BETWEEN {lit(i['STARTED_AT'])} AND {lit(i['ENDED_AT'])}")
            definition = "riders whose bikes logged UNLOCK_TIMEOUT during the outage"
        elif i["AFFECTED_REGIONS"] and i["AFFECTED_REGIONS"] != "all":
            regions = ",".join(lit(x.strip()) for x in i["AFFECTED_REGIONS"].split(","))
            aff = f"SELECT BIKE_ID FROM {T}BIKES WHERE REGION IN ({regions})"
            definition = f"bikes in {i['AFFECTED_REGIONS']}"
        else:
            aff = None
        if aff:
            cohort = (f"SELECT b.BIKE_ID, IFF(a.BIKE_ID IS NOT NULL, 'treated', 'control') GRP FROM {T}BIKES b "
                      f"LEFT JOIN ({aff}) a ON a.BIKE_ID = b.BIKE_ID WHERE b.DELIVERED_DATE < {lit(d0)}")
            a0, a1 = d0 - dt.timedelta(weeks=w), d0
            b0, b1 = d0, d0 + dt.timedelta(weeks=w)
            pre = group_stats(session, cohort, metric, a0, a1)
            post = group_stats(session, cohort, metric, b0, b1)
            out["primary_estimate"] = "diff_in_diff (exposure was not randomized; pre-period shows the groups were comparable)"
            out.update(change=f"{i['INCIDENT_ID']} {i['SEVERITY']} {i['SERVICE']}: {i['SUMMARY']}",
                       method="incident exposure diff-in-diff (affected vs unaffected customers)",
                       treated=definition, control="everyone else with a bike delivered before the incident",
                       window={"pre": [str(a0), str(a1)], "post": [str(b0), str(b1)]},
                       results=summarize(pre, post, "treated", "control"), concurrent_events=concurrent(session, d0, i["INCIDENT_ID"]))
            return out
        out["error"] = "Incident has no identifiable affected population; use sql_exec for a time series."
        return out

    out["error"] = (f"Unknown change_id '{cid}'. Use a RELEASE_ID (e.g. FW-4.2, APP-5.0), a flag key (hill_assist, new_checkout), "
                    "a hardware REVISION_ID (e.g. HW-CALIPER-C) or an INCIDENT_ID (e.g. INC-217).")
    return out
$$
-- @@
CREATE OR REPLACE PROCEDURE VOLTRA.CORE.FORECAST_METRIC(METRIC STRING, HORIZON_WEEKS INT DEFAULT 12, ACT_CHANGE_PCT FLOAT DEFAULT NULL, ACT_START_WEEKS INT DEFAULT 2)
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.12'
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
COMMENT = 'Forecast a weekly business metric with SNOWFLAKE.ML.FORECAST: do-nothing vs act scenario, totals and dollar value.'
EXECUTE AS OWNER
AS
$$
import re
import uuid

T = "VOLTRA.CORE."
# metric -> (weekly count SQL template, value column for dollars, label)
SERIES = {
    "warranty_claims": ("SELECT DATE_TRUNC('week', CLAIM_DATE) W, COUNT(*) Y, AVG(COST_USD) U FROM {t}WARRANTY_CLAIMS WHERE 1=1{cond} GROUP BY 1", "PART", "warranty claims", "avg cost per claim (USD)"),
    "tickets": ("SELECT DATE_TRUNC('week', TICKET_DATE) W, COUNT(*) Y, NULL U FROM {t}SERVICE_TICKETS WHERE 1=1{cond} GROUP BY 1", "CATEGORY", "support tickets", None),
    "care_cancellations": ("SELECT DATE_TRUNC('week', CANCELLED_AT) W, COUNT(*) Y, AVG(MRR_USD) * 12 U FROM {t}SUBSCRIPTIONS WHERE CANCELLED_AT IS NOT NULL{cond} GROUP BY 1", None, "Voltra Care cancellations", "annual revenue lost per cancellation (USD)"),
    "orders": ("SELECT DATE_TRUNC('week', ORDER_DATE) W, COUNT(*) Y, AVG(REVENUE_USD) U FROM {t}ORDERS WHERE 1=1{cond} GROUP BY 1", None, "orders", "avg revenue per order (USD)"),
}


def run(session, metric, horizon_weeks, act_change_pct, act_start_weeks):
    metric = (metric or "").strip().lower()
    base, _, sub = metric.partition(":")
    if base not in SERIES:
        return {"error": f"Unsupported metric '{metric}'. Use one of: warranty_claims[:part], tickets[:category], care_cancellations, orders."}
    if sub and not re.fullmatch(r"[a-z_]+", sub):
        return {"error": "Invalid filter; use a part (battery, brakes, motor, ...) or ticket category (brake_noise, ...)."}
    sql, filt_col, label, unit_label = SERIES[base]
    if sub and not filt_col:
        return {"error": f"{base} has no sub-filter."}
    cond = f" AND {filt_col} = '{sub}'" if sub else ""
    horizon = max(2, min(int(horizon_weeks or 12), 26))
    start = max(0, min(int(act_start_weeks if act_start_weeks is not None else 2), horizon - 1))

    weekly = f"({sql.format(t=T, cond=cond)})"
    rows = session.sql(
        f"WITH w AS {weekly}, last AS (SELECT DATEADD('week', -1, MAX(W)) LW FROM w) "
        f"SELECT w.W::TIMESTAMP_NTZ TS, w.Y::FLOAT Y, w.U FROM w, last WHERE w.W <= last.LW AND w.W >= '2025-01-06' ORDER BY 1"
    ).collect()
    if len(rows) < 20:
        return {"error": f"Only {len(rows)} weeks of history for {metric}; need at least 20."}
    units = [r["U"] for r in rows[-26:] if r["U"] is not None]
    unit_value = round(sum(units) / len(units), 2) if units else None

    tag = uuid.uuid4().hex[:10].upper()
    tbl, model = f"{T}FC_IN_{tag}", f"{T}FC_MODEL_{tag}"
    try:
        session.sql(f"CREATE TRANSIENT TABLE {tbl} (TS TIMESTAMP_NTZ, Y FLOAT)").collect()
        values = ",".join(f"('{r['TS']}', {float(r['Y'])})" for r in rows)
        session.sql(f"INSERT INTO {tbl} VALUES {values}").collect()
        session.sql(f"CREATE SNOWFLAKE.ML.FORECAST {model}(INPUT_DATA => TABLE({tbl}), TIMESTAMP_COLNAME => 'TS', TARGET_COLNAME => 'Y', CONFIG_OBJECT => {{'evaluate': FALSE, 'method': 'fast'}})").collect()
        fc = session.sql(f"CALL {model}!FORECAST(FORECASTING_PERIODS => {horizon}, CONFIG_OBJECT => {{'prediction_interval': 0.9}})").collect()
    finally:
        session.sql(f"DROP SNOWFLAKE.ML.FORECAST IF EXISTS {model}").collect()
        session.sql(f"DROP TABLE IF EXISTS {tbl}").collect()

    series = [{"WEEK": str(r["TS"])[:10], "SCENARIO": "history", "VALUE": round(float(r["Y"]), 2), "LOWER": None, "UPPER": None} for r in rows[-26:]]
    total_dn = total_act = 0.0
    pct = act_change_pct
    for i, r in enumerate(fc):
        f = max(0.0, float(r["FORECAST"]))
        lo, hi = max(0.0, float(r["LOWER_BOUND"])), max(0.0, float(r["UPPER_BOUND"]))
        week = str(r["TS"])[:10]
        series.append({"WEEK": week, "SCENARIO": "do nothing", "VALUE": round(f, 2), "LOWER": round(lo, 2), "UPPER": round(hi, 2)})
        total_dn += f
        if pct is not None:
            ramp = 0.0 if i < start else min(1.0, (i - start + 1) / 2.0)
            a = max(0.0, f * (1 + ramp * float(pct) / 100.0))
            series.append({"WEEK": week, "SCENARIO": "act", "VALUE": round(a, 2), "LOWER": None, "UPPER": None})
            total_act += a
    # Join the history line to each forecast line so charts draw continuously.
    last = series[len(rows[-26:]) - 1]
    series.append({"WEEK": last["WEEK"], "SCENARIO": "do nothing", "VALUE": last["VALUE"], "LOWER": last["VALUE"], "UPPER": last["VALUE"]})
    if pct is not None:
        series.append({"WEEK": last["WEEK"], "SCENARIO": "act", "VALUE": last["VALUE"], "LOWER": None, "UPPER": None})
    series.sort(key=lambda s: (s["WEEK"], s["SCENARIO"]))

    out = {
        "metric": metric, "label": label + (f" ({sub})" if sub else ""), "unit": "per week",
        "method": "SNOWFLAKE.ML.FORECAST on weekly totals since Jan 2025 (90% prediction interval)",
        "horizon_weeks": horizon, "history_weeks_used": len(rows),
        "last_actual_week": series and str(rows[-1]["TS"])[:10],
        "totals": {"do_nothing": round(total_dn, 1)},
        "series": series,
    }
    if pct is not None:
        diff = total_act - total_dn
        out["scenario"] = {"act_change_pct": pct, "act_starts_after_weeks": start, "ramp_weeks": 2,
                           "note": "act = forecast scaled by the measured effect from the start week; use the effect from release_impact"}
        out["totals"].update({"act": round(total_act, 1), "difference": round(diff, 1)})
        if unit_value is not None:
            out["totals"].update({"value_per_unit_usd": unit_value, "unit_value_basis": unit_label, "difference_usd": round(diff * unit_value, 0)})
    return out
$$
-- @@
CREATE OR REPLACE MCP SERVER VOLTRA.CORE.VOLTRA_MCP
  FROM SPECIFICATION $$
  tools:
    - title: "Voltra SQL (read-only)"
      name: "sql_exec"
      type: "SYSTEM_EXECUTE_SQL"
      description: "Execute one read-only SQL query against VOLTRA.CORE: RELEASES, FIRMWARE_INSTALLS (staged OTA per bike), FLAG_EXPOSURES, INCIDENTS, HARDWARE_REVISIONS, BIKES (model, build date, caliper/motor/cell/frame revision, region, hill-assist variant), REGIONS (hilly/rainy), TELEMETRY_WEEKLY (bike-week rides, km, range, battery/motor temps, error counts, firmware version), ERROR_EVENTS, WARRANTY_CLAIMS, SERVICE_TICKETS, APP_REVIEWS, CUSTOMERS, ORDERS, WEB_FUNNEL_DAILY, SUBSCRIPTIONS (Voltra Care), MARKETING_SPEND, WEATHER_WEEKLY. Aggregate in SQL and return chart-ready results."
      config:
        read_only: true
        query_timeout: 120
        warehouse: "DEFAULT_WH"
    - title: "Voltra 360 (Cortex Analyst)"
      name: "voltra_analyst"
      type: "CORTEX_ANALYST_MESSAGE"
      identifier: "VOLTRA.CORE.VOLTRA_360"
      description: "Turns a natural-language metric question into governed SQL over the VOLTRA_360 semantic view (range, overheat rate, warranty claims and cost, tickets, CSAT, Care subscriptions/MRR/cancellations, orders, revenue, funnel conversion; by region, hilly/rainy, model, caliper/motor revision, firmware version, flag variant, week). Returns SQL, which you then run with sql_exec."
    - title: "Voltra documents (Cortex Search)"
      name: "voltra_search"
      type: "CORTEX_SEARCH_SERVICE_QUERY"
      identifier: "VOLTRA.CORE.VOLTRA_TEXT"
      description: "Semantic search over release notes, incident postmortems, hardware change notices, support tickets and app reviews. Columns: TEXT, DOC_TYPE (release_note, postmortem, hardware_change, support_ticket, app_review), DOC_DATE, REF_ID. Use to read what changed and what customers said; not for counts."
    - title: "Release impact (causal)"
      name: "release_impact"
      type: "GENERIC"
      identifier: "VOLTRA.CORE.RELEASE_IMPACT"
      description: "Estimate the causal effect of one change on one metric with a proper control group: staged firmware rollouts (early installers vs bikes not yet updated, diff-in-diff), feature flags (hill_assist, new_checkout A/B), hardware revisions (new vs previous revision bikes in the same weeks) and incidents (affected vs unaffected riders). Falls back to a before/after time series with a warning when no control exists. Returns effect, 95% CI, relative effect, n, segment splits (hilly/flat, rainy/dry or platform), weather context and concurrent events (other releases, hardware changes, incidents, campaigns within 7 days) that could confound a naive reading."
      annotations:
        readOnlyHint: true
        destructiveHint: false
        idempotentHint: true
        openWorldHint: false
      config:
        type: "procedure"
        warehouse: "DEFAULT_WH"
        input_schema:
          type: "object"
          properties:
            change_id:
              type: "string"
              description: "RELEASE_ID (e.g. FW-4.2, FW-4.3, APP-5.0, APP-5.2), flag key (hill_assist, new_checkout), hardware REVISION_ID (HW-CALIPER-C, HW-MOTOR-M2, HW-CELL-ARC, HW-FRAME-F2) or INCIDENT_ID (e.g. INC-217)."
            metric:
              type: "string"
              description: "One of range_km, battery_temp_p95, motor_temp_p95, rides, km, overheat_errors, motor_overtemp_errors, unlock_timeouts, warranty_claims[:part], tickets[:category], care_cancellations, conversion, checkout_rate. Parts: battery, brakes, motor, controller, display, frame. Ticket categories: brake_noise, battery_range, app_unlock, motor, billing, delivery_setup, other."
            window_weeks:
              type: "number"
              description: "Weeks in the pre and post windows (default 6). Use ~12-16 for lagged outcomes such as warranty claims, ~2 for incidents."
          required: ["change_id", "metric"]
    - title: "Forecast (Snowflake ML)"
      name: "forecast_metric"
      type: "GENERIC"
      identifier: "VOLTRA.CORE.FORECAST_METRIC"
      description: "Forecast a weekly business metric with SNOWFLAKE.ML.FORECAST and compare two futures: 'do nothing' (with a 90% prediction interval) and 'act' (the forecast scaled by act_change_pct from act_start_weeks on, e.g. the effect of fixing a bad part or rolling out a winning feature, taken from release_impact). Returns weekly SERIES rows (WEEK, SCENARIO history/do nothing/act, VALUE, LOWER, UPPER) that become a chartable dataset, totals for each scenario, the difference and its dollar value (average claim cost, order revenue or annual Care revenue)."
      annotations:
        readOnlyHint: true
        destructiveHint: false
        idempotentHint: true
        openWorldHint: false
      config:
        type: "procedure"
        warehouse: "DEFAULT_WH"
        input_schema:
          type: "object"
          properties:
            metric:
              type: "string"
              description: "warranty_claims[:part] (part: battery, brakes, motor, controller, display, frame), tickets[:category] (e.g. brake_noise, app_unlock), care_cancellations, or orders."
            horizon_weeks:
              type: "number"
              description: "Weeks to forecast (2-26, default 12)."
            act_change_pct:
              type: "number"
              description: "Percent change applied in the 'act' scenario, e.g. -50 if fixing the cause halves claims. Omit for a do-nothing forecast only."
            act_start_weeks:
              type: "number"
              description: "Weeks from now until the action takes effect (default 2)."
          required: ["metric"]
  $$
