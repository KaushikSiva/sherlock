"""Load the generated Voltra parquet files into Snowflake (VOLTRA.CORE) and print planted-effect sanity checks.

    python data/voltra/load.py
"""
import pathlib
import sys

import pandas as pd
from snowflake.connector.pandas_tools import write_pandas

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from sf import connect  # noqa: E402

OUT = pathlib.Path(__file__).parent / "out"
DATE_COLS = {
    "WEATHER_WEEKLY": ["WEEK_START"],
    "MARKETING_SPEND": ["SPEND_DATE"],
    "WEB_FUNNEL_DAILY": ["FUNNEL_DATE"],
    "CUSTOMERS": ["SIGNUP_DATE"],
    "ORDERS": ["ORDER_DATE"],
    "BIKES": ["BUILD_DATE", "DELIVERED_DATE"],
    "HARDWARE_REVISIONS": ["EFFECTIVE_BUILD_DATE"],
    "RELEASES": ["RELEASE_DATE"],
    "FIRMWARE_INSTALLS": ["INSTALLED_AT"],
    "FLAG_EXPOSURES": ["EXPOSED_AT"],
    "TELEMETRY_WEEKLY": ["WEEK_START"],
    "WARRANTY_CLAIMS": ["CLAIM_DATE"],
    "SERVICE_TICKETS": ["TICKET_DATE"],
    "APP_REVIEWS": ["REVIEW_DATE"],
    "SUBSCRIPTIONS": ["STARTED_AT", "CANCELLED_AT"],
}

CHECKS = {
    "FW 4.2 early adopters vs holdback (battery temp, range, overheat/1k rides)": """
        WITH c AS (
          SELECT b.BIKE_ID, CASE WHEN fi.ROLLOUT_STAGE IN (1,2) THEN 'early' ELSE 'holdback' END AS cohort
          FROM BIKES b LEFT JOIN FIRMWARE_INSTALLS fi ON fi.BIKE_ID = b.BIKE_ID AND fi.VERSION = '4.2'
          WHERE b.DELIVERED_DATE < '2025-09-08' AND (fi.ROLLOUT_STAGE IN (1,2) OR fi.BIKE_ID IS NULL))
        SELECT cohort, IFF(t.WEEK_START < '2025-09-08','pre','post') period,
               ROUND(AVG(BATTERY_TEMP_P95),2) bt, ROUND(AVG(RANGE_KM),2) range_km,
               ROUND(1000*SUM(OVERHEAT_ERRORS)/NULLIF(SUM(RIDES),0),2) overheat_per_1k_rides
        FROM TELEMETRY_WEEKLY t JOIN c USING (BIKE_ID)
        WHERE (t.WEEK_START >= '2025-07-28' AND t.WEEK_START < '2025-09-08') OR (t.WEEK_START >= '2025-09-29' AND t.WEEK_START < '2026-01-12')
        GROUP BY 1,2 ORDER BY 1,2 DESC""",
    "Caliper C vs B: brake-noise tickets per 1k bike-weeks since May 18 2026": """
        SELECT b.CALIPER_REV, COUNT(DISTINCT t.BIKE_ID||t.WEEK_START) bike_weeks,
               (SELECT COUNT(*) FROM SERVICE_TICKETS s JOIN BIKES b2 USING (BIKE_ID)
                 WHERE s.CATEGORY='brake_noise' AND s.TICKET_DATE >= '2026-05-18' AND b2.CALIPER_REV=b.CALIPER_REV) tickets,
               ROUND(1000*tickets/bike_weeks,2) per_1k
        FROM TELEMETRY_WEEKLY t JOIN BIKES b USING (BIKE_ID) WHERE t.WEEK_START >= '2026-05-18' GROUP BY 1""",
    "INC-217: Care cancellations in 14 days, affected vs not": """
        WITH aff AS (SELECT DISTINCT BIKE_ID FROM ERROR_EVENTS WHERE CODE='UNLOCK_TIMEOUT' AND EVENT_TS::DATE='2026-08-12')
        SELECT IFF(a.BIKE_ID IS NULL,'unaffected','affected') grp, COUNT(*) subs,
               ROUND(AVG(IFF(s.CANCELLED_AT BETWEEN '2026-08-12' AND '2026-08-25',1,0)),4) cancel_rate_14d
        FROM SUBSCRIPTIONS s LEFT JOIN aff a USING (BIKE_ID)
        WHERE s.STARTED_AT < '2026-08-12' AND (s.CANCELLED_AT IS NULL OR s.CANCELLED_AT >= '2026-08-12') GROUP BY 1""",
    "Hill Assist: rides/week by region type and variant (since Feb 2026)": """
        SELECT r.HILLY, b.HILL_ASSIST_VARIANT, ROUND(AVG(t.RIDES),2) rides
        FROM TELEMETRY_WEEKLY t JOIN BIKES b USING (BIKE_ID) JOIN REGIONS r USING (REGION)
        WHERE t.WEEK_START >= '2026-02-02' AND b.HILL_ASSIST_VARIANT IS NOT NULL GROUP BY 1,2 ORDER BY 1,2""",
    "Naive aggregate: monthly brake-noise tickets and battery warranty claims": """
        SELECT DATE_TRUNC('month', d) m, SUM(bn) brake_noise_tickets, SUM(bc) battery_claims FROM (
          SELECT TICKET_DATE d, IFF(CATEGORY='brake_noise',1,0) bn, 0 bc FROM SERVICE_TICKETS
          UNION ALL SELECT CLAIM_DATE, 0, IFF(PART='battery',1,0) FROM WARRANTY_CLAIMS) GROUP BY 1 ORDER BY 1""",
}


def main():
    conn = connect()
    cur = conn.cursor()
    cur.execute("CREATE DATABASE IF NOT EXISTS VOLTRA COMMENT = 'Synthetic connected e-bike company (Voltra) for release-impact demos'")
    cur.execute("CREATE SCHEMA IF NOT EXISTS VOLTRA.CORE")
    cur.execute("USE SCHEMA VOLTRA.CORE")
    cur.execute("USE WAREHOUSE DEFAULT_WH")
    for f in sorted(OUT.glob("*.parquet")):
        name = f.stem
        df = pd.read_parquet(f)
        for c in DATE_COLS.get(name, []):
            df[c] = pd.to_datetime(df[c]).dt.date
        ok, _, nrows, _ = write_pandas(
            conn, df, name, database="VOLTRA", schema="CORE", auto_create_table=True, overwrite=True,
            quote_identifiers=False, use_logical_type=True,
        )
        print(f"{name:20s} {nrows:>9,d} rows {'ok' if ok else 'FAILED'}")
    for title, sql in CHECKS.items():
        cur.execute(sql)
        cols = [d[0] for d in cur.description]
        print(f"\n== {title}")
        print(pd.DataFrame(cur.fetchall(), columns=cols).to_string(index=False))
    conn.close()


if __name__ == "__main__":
    main()
