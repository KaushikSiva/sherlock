"""Generate Voltra, a synthetic connected e-bike company (software + mechanical + business data).

The world contains planted causal effects (see evals/voltra_truth.yaml) plus decoys that coincide with them,
so a naive before/after read of the aggregates points at the wrong release. Deterministic for a fixed SEED.

    python data/voltra/generate.py      # writes parquet files to data/voltra/out/
"""
import pathlib
import warnings
from datetime import date, datetime, timedelta

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore", category=DeprecationWarning)
SEED = 20261023
rng = np.random.default_rng(SEED)
OUT = pathlib.Path(__file__).parent / "out"

START = pd.Timestamp("2025-01-06")  # first Monday
LAST_WEEK = pd.Timestamp("2026-10-19")
TODAY = pd.Timestamp("2026-10-23")
WEEKS = pd.date_range(START, LAST_WEEK, freq="7D")
DAYS = pd.date_range(START, TODAY - pd.Timedelta(days=1), freq="D")
NW = len(WEEKS)


def d(s):
    return pd.Timestamp(s)


def week_idx(ts):
    """Index of the week containing timestamp(s)."""
    return ((pd.to_datetime(ts) - START).days // 7).astype(int) if hasattr(ts, "__len__") else (ts - START).days // 7


# ---------------------------------------------------------------- regions & weather
REGIONS = pd.DataFrame(
    [
        # region, hilly, rainy, base temp C, seasonal amplitude, mean weekly rain mm, customer share, cloud cluster
        ("Seattle", True, True, 11.5, 7.0, 30, 0.20, "us-west"),
        ("San Francisco", True, False, 15.0, 3.5, 12, 0.20, "us-west"),
        ("Denver", True, False, 11.0, 11.0, 9, 0.12, "us-central"),
        ("Portland", False, True, 12.5, 8.0, 28, 0.14, "us-west"),
        ("Chicago", False, False, 10.5, 14.0, 17, 0.18, "us-central"),
        ("Austin", False, False, 21.5, 8.5, 12, 0.16, "us-central"),
    ],
    columns=["REGION", "HILLY", "RAINY", "BASE_TEMP", "TEMP_AMP", "RAIN_MM", "SHARE", "CLOUD_CLUSTER"],
)
NR = len(REGIONS)

doy_w = WEEKS.dayofyear.values
temp_w = (
    REGIONS.BASE_TEMP.values[:, None]
    + REGIONS.TEMP_AMP.values[:, None] * np.sin(2 * np.pi * (doy_w[None, :] - 105) / 365.25)
    + rng.normal(0, 1.8, (NR, NW))
)
rain_season = 1 + 0.6 * np.cos(2 * np.pi * (doy_w[None, :] - 15) / 365.25)
rain_w = rng.gamma(2.0, (REGIONS.RAIN_MM.values[:, None] * rain_season) / 2.0)
weather = pd.DataFrame(
    {
        "REGION": np.repeat(REGIONS.REGION.values, NW),
        "WEEK_START": np.tile(WEEKS.date, NR),
        "AVG_TEMP_C": temp_w.ravel().round(1),
        "RAIN_MM": rain_w.ravel().round(1),
    }
)

# ---------------------------------------------------------------- marketing spend & web funnel
CAMPAIGNS = [
    # campaign, start, end, {channel: extra daily spend}, order-rate multiplier (discounts)
    ("Black Friday 2025", d("2025-11-24"), d("2025-12-01"), {"Meta": 1500, "Google Search": 800}, 1.35),
    ("Spring Into Motion", d("2026-03-16"), d("2026-04-26"), {"Meta": 1150, "YouTube": 700}, 1.0),
    ("Summer Commute 2025", d("2025-06-09"), d("2025-06-22"), {"Google Search": 300}, 1.0),
]
CHANNELS = {
    # channel: (organic sessions/day, base spend/day, sessions per $)
    "Google Search": (120, 900, 0.25),
    "Meta": (40, 700, 0.22),
    "YouTube": (10, 300, 0.18),
    "Influencer": (20, 200, 0.30),
    "Referral": (30, 100, 0.60),
    "Email": (40, 50, 1.50),
    "Direct": (220, 0, 0.0),
}
t_years = (DAYS - START).days.values / 365.25
growth = 1 + 0.30 * t_years
season = 1 + 0.32 * np.sin(2 * np.pi * (DAYS.dayofyear.values - 80) / 365.25)
weekend = np.where(DAYS.dayofweek.values >= 5, 1.15, 1.0)

spend_rows, spend = [], {}
for ch, (_, base, _) in CHANNELS.items():
    s = base * (1 + 0.15 * t_years) * (0.85 + 0.3 * season / season.max()) * rng.normal(1, 0.08, len(DAYS))
    s = np.where(base > 0, s, 0.0)
    campaign = np.array(["Always-on"] * len(DAYS), dtype=object)
    for name, cs, ce, extra, _ in CAMPAIGNS:
        if ch in extra:
            m = (DAYS >= cs) & (DAYS <= ce)
            s = s + np.where(m, extra[ch] * rng.normal(1, 0.06, len(DAYS)), 0)
            campaign = np.where(m, name, campaign)
    spend[ch] = s
    if base > 0:
        spend_rows.append(pd.DataFrame({"SPEND_DATE": DAYS.date, "CHANNEL": ch, "CAMPAIGN": campaign, "SPEND_USD": s.round(2)}))
marketing = pd.concat(spend_rows, ignore_index=True)

order_rate_mult = np.ones(len(DAYS))
discount = np.zeros(len(DAYS))
for name, cs, ce, _, mult in CAMPAIGNS:
    m = (DAYS >= cs) & (DAYS <= ce)
    order_rate_mult = np.where(m, order_rate_mult * mult, order_rate_mult)
    if mult > 1:
        discount = np.where(m, 0.15, discount)

NEW_CHECKOUT = d("2026-03-16")
PLATFORMS = {"ios": (0.38, 0.13), "android": (0.30, 0.11), "web": (0.32, 0.12)}
funnel_rows = []
for ch, (organic, _, spd) in CHANNELS.items():
    sessions = rng.poisson((organic * growth * season + spend[ch] * spd) * weekend)
    for plat, (share, cfg_rate) in PLATFORMS.items():
        ps = rng.binomial(sessions, share)
        post = DAYS >= NEW_CHECKOUT
        for variant in ("control", "new_checkout"):
            vs = np.where(post, rng.binomial(ps, 0.5), ps) if variant == "control" else None
            if variant == "control":
                ctrl = vs
                vs_v = ctrl
            else:
                vs_v = np.where(post, ps - ctrl, 0)
            cfg = rng.binomial(vs_v, cfg_rate)
            ck_rate = 0.35 * (0.97 if (variant == "new_checkout" and plat == "android") else 1.0)
            ck = rng.binomial(cfg, ck_rate)
            od = rng.binomial(ck, np.clip(0.30 * order_rate_mult, 0, 0.95))
            df = pd.DataFrame(
                {
                    "FUNNEL_DATE": DAYS.date,
                    "CHANNEL": ch,
                    "PLATFORM": plat,
                    "VARIANT": variant,
                    "SESSIONS": vs_v,
                    "CONFIGURATOR_STARTS": cfg,
                    "CHECKOUTS": ck,
                    "ORDERS": od,
                }
            )
            funnel_rows.append(df[(df.SESSIONS > 0) | (variant == "control")])
funnel = pd.concat(funnel_rows, ignore_index=True)
funnel = funnel[~((funnel.VARIANT == "new_checkout") & (pd.to_datetime(funnel.FUNNEL_DATE) < NEW_CHECKOUT))]

# ---------------------------------------------------------------- customers, orders
MODELS = {"Commuter": (2399, 0.55), "Cargo": (3899, 0.20), "Trail": (3199, 0.25)}
model_names = list(MODELS)
model_p = np.array([v[1] for v in MODELS.values()])
day_index = {dt: i for i, dt in enumerate(DAYS.date)}

exp = funnel.loc[funnel.ORDERS > 0, ["FUNNEL_DATE", "CHANNEL", "PLATFORM", "VARIANT", "ORDERS"]]
exp = exp.loc[exp.index.repeat(exp.ORDERS)].reset_index(drop=True)
n_cons = len(exp)
cons_region = rng.choice(NR, n_cons, p=REGIONS.SHARE.values / REGIONS.SHARE.sum())
cons_model = rng.choice(len(model_names), n_cons, p=model_p)
odates = pd.to_datetime(exp.FUNNEL_DATE)
disc = np.array([discount[day_index[x]] for x in exp.FUNNEL_DATE])
disc = np.where((disc == 0) & (rng.random(n_cons) < 0.08), 0.05, disc)
list_price = np.array([MODELS[model_names[m]][0] for m in cons_model])
customers_c = pd.DataFrame(
    {
        "CUSTOMER_ID": [f"C{100000 + i}" for i in range(n_cons)],
        "SEGMENT": "Consumer",
        "REGION": REGIONS.REGION.values[cons_region],
        "ACQUISITION_CHANNEL": exp.CHANNEL.values,
        "SIGNUP_DATE": odates.dt.date.values,
        "COMPANY_NAME": None,
    }
)
orders_c = pd.DataFrame(
    {
        "ORDER_ID": [f"O{200000 + i}" for i in range(n_cons)],
        "CUSTOMER_ID": customers_c.CUSTOMER_ID,
        "ORDER_DATE": odates.dt.date.values,
        "CHANNEL": exp.CHANNEL.values,
        "PLATFORM": exp.PLATFORM.values,
        "CHECKOUT_VARIANT": exp.VARIANT.values,
        "MODEL": np.array(model_names)[cons_model],
        "QUANTITY": 1,
        "LIST_PRICE": list_price,
        "DISCOUNT_PCT": disc,
        "REVENUE_USD": (list_price * (1 - disc)).round(2),
    }
)

FLEETS = ["Swift Couriers", "GreenGo Delivery", "CityHop Logistics", "Parcel Pedal", "Metro Eats Fleet", "UrbanDrop",
          "Bolt Grocers", "Last Mile Co", "PedalPost", "FreshCart Riders", "QuickBite Logistics", "Harbor Freight Bikes",
          "Northside Couriers", "Velo Logistics", "SprintBox", "CargoKite", "Hilltop Deliveries", "BayRunner", "MileHigh Couriers",
          "Lakeshore Logistics", "Rose City Riders", "Lone Star Last Mile", "Emerald Express", "Golden Gate Grocers"]
fleet_region = rng.choice(NR, len(FLEETS), p=REGIONS.SHARE.values / REGIONS.SHARE.sum())
customers_f = pd.DataFrame(
    {
        "CUSTOMER_ID": [f"F{300 + i}" for i in range(len(FLEETS))],
        "SEGMENT": "Delivery Fleet",
        "REGION": REGIONS.REGION.values[fleet_region],
        "ACQUISITION_CHANNEL": "B2B Sales",
        "SIGNUP_DATE": (START + pd.to_timedelta(rng.integers(0, 500, len(FLEETS)), unit="D")).date,
        "COMPANY_NAME": FLEETS,
    }
)
fo = []
for i, row in customers_f.iterrows():
    t = pd.Timestamp(row.SIGNUP_DATE)
    while t < TODAY - pd.Timedelta(days=10):
        q = int(rng.integers(4, 13))
        fo.append((row.CUSTOMER_ID, t.date(), q))
        t = t + pd.Timedelta(days=int(rng.integers(60, 160)))
orders_f = pd.DataFrame(fo, columns=["CUSTOMER_ID", "ORDER_DATE", "QUANTITY"])
orders_f.insert(0, "ORDER_ID", [f"O{900000 + i}" for i in range(len(orders_f))])
orders_f["CHANNEL"] = "B2B Sales"
orders_f["PLATFORM"] = "web"
orders_f["CHECKOUT_VARIANT"] = "control"
orders_f["MODEL"] = "Cargo"
orders_f["LIST_PRICE"] = 3899
orders_f["DISCOUNT_PCT"] = 0.12
orders_f["REVENUE_USD"] = (orders_f.LIST_PRICE * orders_f.QUANTITY * (1 - 0.12)).round(2)
orders_f = orders_f[orders_c.columns]

customers = pd.concat([customers_c, customers_f], ignore_index=True)
orders = pd.concat([orders_c, orders_f], ignore_index=True)

# ---------------------------------------------------------------- bikes & hardware revisions
CALIPER_C = d("2026-05-04")
MOTOR_M2 = d("2025-11-03")
bike_order = orders.loc[orders.index.repeat(orders.QUANTITY)].reset_index(drop=True)
NB = len(bike_order)
cust_region = customers.set_index("CUSTOMER_ID").REGION
bo_dates = pd.to_datetime(bike_order.ORDER_DATE)
build = bo_dates - pd.to_timedelta(rng.integers(5, 26, NB), unit="D")
deliv = bo_dates + pd.to_timedelta(rng.integers(4, 11, NB), unit="D")
bikes = pd.DataFrame(
    {
        "BIKE_ID": [f"VB-{i + 1:06d}" for i in range(NB)],
        "CUSTOMER_ID": bike_order.CUSTOMER_ID.values,
        "ORDER_ID": bike_order.ORDER_ID.values,
        "MODEL": bike_order.MODEL.values,
        "REGION": cust_region.loc[bike_order.CUSTOMER_ID].values,
        "FACTORY": rng.choice(["Taichung", "Monterrey"], NB, p=[0.6, 0.4]),
        "BUILD_DATE": build.dt.date.values,
        "DELIVERED_DATE": deliv.dt.date.values,
        "CALIPER_REV": np.where(build >= CALIPER_C, "C", "B"),
        "CALIPER_SUPPLIER": np.where(build >= CALIPER_C, "Duraforge Components", "Kinetic Brake Co"),
        "MOTOR_REV": np.where(build >= MOTOR_M2, "M2", "M1"),
        "BATTERY_CELL_SUPPLIER": np.where(
            build >= d("2025-07-14"), rng.choice(["Lumacell", "Arcadia Cells"], NB), "Lumacell"
        ),
        "FRAME_REV": np.where(build >= d("2026-01-12"), "F2", "F1"),
    }
)
bikes = bikes[pd.to_datetime(bikes.DELIVERED_DATE) <= LAST_WEEK + pd.Timedelta(days=6)].reset_index(drop=True)
NB = len(bikes)

hardware = pd.DataFrame(
    [
        ("HW-CALIPER-B", "Disc brake caliper", "B", "Kinetic Brake Co", date(2024, 9, 2), 0.0,
         "Two-piston hydraulic caliper, organic pads. Baseline for 2025 model year."),
        ("HW-CALIPER-C", "Disc brake caliper", "C", "Duraforge Components", CALIPER_C.date(), -6.40,
         "Second-source caliper to resolve supply constraints; equivalent spec, sintered-blend pads, new piston seal."),
        ("HW-MOTOR-M1", "Rear hub motor", "M1", "Bafang-style OEM", date(2024, 9, 2), 0.0,
         "250W/80Nm rear hub motor with hall sensors."),
        ("HW-MOTOR-M2", "Rear hub motor", "M2", "Bafang-style OEM", MOTOR_M2.date(), -18.00,
         "Cost-reduced motor: stamped housing, revised winding process. Same torque and thermal rating."),
        ("HW-CELL-ARC", "Battery cells", "Dual source", "Arcadia Cells", date(2025, 7, 14), -4.10,
         "Added Arcadia 21700 cells as second source alongside Lumacell."),
        ("HW-FRAME-F2", "Frame", "F2", "Taichung Alloy", date(2026, 1, 12), 2.50,
         "Reinforced head-tube weld and internal cable routing."),
    ],
    columns=["REVISION_ID", "PART", "REV", "SUPPLIER", "EFFECTIVE_BUILD_DATE", "BOM_COST_DELTA_USD", "CHANGE_DESCRIPTION"],
)

# ---------------------------------------------------------------- releases, firmware installs, flags
RELEASES = [
    # id, component, version, date, title, team, flag_key, rollout, notes
    ("FW-4.0", "firmware", "4.0", "2024-12-02", "Platform 4 baseline", "Embedded", None, "Factory install",
     "New motor-control loop, faster boot, BLE 5.2 pairing. Baseline firmware for 2025 model-year bikes."),
    ("APP-4.8", "app", "4.8", "2025-04-14", "Dark mode and ride history", "Mobile", None, "100% via app stores",
     "Dark mode across the app. Ride history now shows elevation and assist usage. Minor crash fixes on iOS 18."),
    ("BE-2025.03", "backend", "2025.03", "2025-03-10", "Payments provider migration", "Platform", None, "Blue/green",
     "Moved card processing to new payments provider. No customer-facing changes expected."),
    ("FW-4.1", "firmware", "4.1", "2025-06-02", "Ride stats and BLE stability", "Embedded", None, "OTA 100% over 1 week",
     "More accurate cadence and speed reporting, BLE reconnect fixes, lower standby drain on the display."),
    ("FW-4.1.2", "firmware", "4.1.2", "2025-07-07", "Display hotfix", "Embedded", None, "OTA 100%",
     "Fixes a rare display freeze when switching assist levels quickly."),
    ("APP-4.9", "app", "4.9", "2025-07-21", "Route planner", "Mobile", None, "100% via app stores",
     "Route planner with bike-lane preference and elevation preview. Share routes with friends."),
    ("BE-2025.08", "backend", "2025.08", "2025-08-18", "Telemetry pipeline v2", "Data Platform", None, "Shadow then cutover",
     "Telemetry ingestion moved to streaming pipeline; weekly aggregates now computed in Snowflake."),
    ("FW-4.2", "firmware", "4.2", "2025-09-08", "Adaptive battery thermal management", "Embedded / Battery", "fw_4_2_rollout",
     "Staged OTA: 10% on Sep 8, 50% on Sep 15, 80% on Sep 29. 20% holdback kept on 4.1.2 for a battery-health study until 4.2.3.",
     "Battery management system now adapts charge and discharge current to cell temperature, pre-conditions the pack "
     "on cold mornings, and smooths assist ramp-up under heavy load. Also updates range estimation."),
    ("WEB-2025.10", "web", "2025.10", "2025-10-06", "3D bike configurator", "Web", None, "100%",
     "New 3D configurator on voltra.bike with colour and accessory previews."),
    ("BE-2025.11", "backend", "2025.11", "2025-11-10", "Unlock service autoscaling", "Platform", None, "Canary then 100%",
     "Unlock service moved to autoscaling node pool; added regional health checks."),
    ("FW-4.2.3", "firmware", "4.2.3", "2026-01-19", "Hill Assist (beta)", "Embedded / Ride Experience", "hill_assist",
     "OTA 100% over 10 days. Hill Assist enabled for a random 30% of bikes via flag hill_assist (A/B test).",
     "Hill Assist detects sustained gradients and boosts torque smoothly on climbs, holding the bike on stop-starts. "
     "Includes BMS fixes; ends the 4.2 battery-health holdback."),
    ("BE-2026.02", "backend", "2026.02", "2026-02-23", "Care billing engine", "Platform", None, "100%",
     "New subscription billing engine for Voltra Care with proration and pause support."),
    ("APP-5.0", "app", "5.0", "2026-03-16", "Checkout redesign", "Growth", "new_checkout",
     "50/50 A/B on all platforms via flag new_checkout.",
     "Redesigned configurator-to-checkout flow: single-page checkout, Apple Pay / Google Pay, financing calculator, "
     "trade-in estimate. Visual refresh of the shop tab."),
    ("FW-4.3", "firmware", "4.3", "2026-05-04", "Regen braking tuning", "Embedded / Ride Experience", "fw_4_3_rollout",
     "Staged OTA: 50% May 4, 100% May 11.",
     "Re-tuned regenerative braking curve for smoother deceleration and slightly more energy recovery on descents. "
     "Brake-lever sensor debounce adjusted."),
    ("APP-5.1", "app", "5.1", "2026-06-01", "Social ride stats", "Mobile", None, "100% via app stores",
     "Weekly ride summaries, challenges with friends, family sharing for multiple bikes."),
    ("BE-2026.06", "backend", "2026.06", "2026-06-15", "Config API v3", "Platform", None, "100%",
     "New configuration API for the shop and configurator; 40% lower p95 latency."),
    ("BE-2026.08.1", "backend", "2026.08.1", "2026-08-11", "Unlock service connection pool tuning", "Platform", None,
     "Rolled to us-west then us-central", "Tuned database connection pool sizes for the unlock service ahead of fall traffic."),
    ("APP-5.2", "app", "5.2", "2026-08-12", "New map tiles and battery widget", "Mobile", None, "100% via app stores",
     "Vector map tiles, home-screen battery widget, faster app launch."),
    ("FW-4.4", "firmware", "4.4", "2026-09-14", "Diagnostics improvements", "Embedded", None, "OTA 100% over 1 week",
     "Richer self-diagnostics for service centers; logs brake-lever and motor sensor health."),
    ("APP-5.3", "app", "5.3", "2026-10-05", "Theft alerts", "Mobile", None, "100% via app stores",
     "Motion alerts when the bike is moved while locked; share live location with a friend."),
]
releases = pd.DataFrame(
    RELEASES,
    columns=["RELEASE_ID", "COMPONENT", "VERSION", "RELEASE_DATE", "TITLE", "OWNER_TEAM", "FLAG_KEY", "ROLLOUT", "NOTES"],
)
releases["RELEASE_DATE"] = pd.to_datetime(releases.RELEASE_DATE).dt.date

deliv_ts = pd.to_datetime(bikes.DELIVERED_DATE)
deliv_w = ((deliv_ts - START).dt.days // 7).clip(lower=0).values
build_ts = pd.to_datetime(bikes.BUILD_DATE)
fw_installs = []
INF = 10**6
install_day = {}  # version -> array of install day offsets from START (INF = never)


def ota(version, rel, stages, lag_max=10):
    """stages: list of (cumulative share, date). Bikes delivered after the release get it at delivery."""
    u = rng.random(NB)
    day = np.full(NB, INF)
    stage_no = np.zeros(NB, int)
    prev = 0.0
    for k, (share, sd) in enumerate(stages, start=1):
        m = (u >= prev) & (u < share)
        day = np.where(m, (sd - START).days + rng.integers(0, lag_max + 1, NB), day)
        stage_no = np.where(m, k, stage_no)
        prev = share
    deliv_day = (deliv_ts - START).dt.days.values
    rel_day = (rel - START).days
    after = deliv_day >= rel_day
    day = np.where(after, deliv_day, np.maximum(day, deliv_day))
    stage_no = np.where(after, 0, stage_no)
    install_day[version] = day
    ok = day < (TODAY - START).days
    fw_installs.append(
        pd.DataFrame(
            {
                "BIKE_ID": bikes.BIKE_ID.values[ok],
                "VERSION": version,
                "INSTALLED_AT": (START + pd.to_timedelta(day[ok], unit="D")).date,
                "METHOD": np.where(after[ok], "factory/setup", "ota"),
                "ROLLOUT_STAGE": stage_no[ok],
            }
        )
    )


deliv_day_all = (deliv_ts - START).dt.days.values
install_day["4.0"] = deliv_day_all
fw_installs.append(pd.DataFrame({"BIKE_ID": bikes.BIKE_ID, "VERSION": "4.0", "INSTALLED_AT": bikes.DELIVERED_DATE,
                                 "METHOD": "factory/setup", "ROLLOUT_STAGE": 0}))
ota("4.1", d("2025-06-02"), [(1.0, d("2025-06-02"))], 7)
ota("4.1.2", d("2025-07-07"), [(1.0, d("2025-07-07"))], 7)
# FW 4.2: staged with a 20% holdback that only moves when 4.2.3 ships (holdback bikes jump straight to 4.2.3)
ota("4.2", d("2025-09-08"), [(0.10, d("2025-09-08")), (0.50, d("2025-09-15")), (0.80, d("2025-09-29"))], 10)
holdback = install_day["4.2"] >= INF
ota("4.2.3", d("2026-01-19"), [(1.0, d("2026-01-19"))], 10)
install_day["4.2"] = np.where(holdback, install_day["4.2.3"], install_day["4.2"])
fw_installs[-2] = fw_installs[-2][fw_installs[-2].ROLLOUT_STAGE.isin([0, 1, 2, 3])]
ota("4.3", d("2026-05-04"), [(0.5, d("2026-05-04")), (1.0, d("2026-05-11"))], 6)
ota("4.4", d("2026-09-14"), [(1.0, d("2026-09-14"))], 7)
firmware_installs = pd.concat(fw_installs, ignore_index=True)
firmware_installs = firmware_installs[pd.to_datetime(firmware_installs.INSTALLED_AT) < TODAY].reset_index(drop=True)
FW_ORDER = ["4.0", "4.1", "4.1.2", "4.2", "4.2.3", "4.3", "4.4"]

# Flags
HILL = d("2026-01-19")
ha_on = rng.random(NB) < 0.30
ha_day = np.maximum(install_day["4.2.3"], 0)
ha_exposed = ha_day < (TODAY - START).days
flags = [
    pd.DataFrame(
        {
            "FLAG_KEY": "hill_assist",
            "UNIT_TYPE": "bike",
            "UNIT_ID": bikes.BIKE_ID.values[ha_exposed],
            "VARIANT": np.where(ha_on, "on", "off")[ha_exposed],
            "EXPOSED_AT": (START + pd.to_timedelta(ha_day[ha_exposed], unit="D")).date,
        }
    ),
    pd.DataFrame(
        {
            "FLAG_KEY": "new_checkout",
            "UNIT_TYPE": "customer",
            "UNIT_ID": orders.CUSTOMER_ID[pd.to_datetime(orders.ORDER_DATE) >= NEW_CHECKOUT].values,
            "VARIANT": orders.CHECKOUT_VARIANT[pd.to_datetime(orders.ORDER_DATE) >= NEW_CHECKOUT].values,
            "EXPOSED_AT": orders.ORDER_DATE[pd.to_datetime(orders.ORDER_DATE) >= NEW_CHECKOUT].values,
        }
    ),
]
flags[1] = flags[1][flags[1].UNIT_ID.str.startswith("C")]
flag_exposures = pd.concat(flags, ignore_index=True)
bikes["HILL_ASSIST_VARIANT"] = np.where(ha_exposed, np.where(ha_on, "on", "off"), None)

# ---------------------------------------------------------------- telemetry loop
INC_DAY = d("2026-08-12")
INC_W = (INC_DAY - START).days // 7
reg_idx = bikes.REGION.map({r: i for i, r in enumerate(REGIONS.REGION)}).values
hilly = REGIONS.HILLY.values[reg_idx]
rainy = REGIONS.RAINY.values[reg_idx]
west = REGIONS.CLOUD_CLUSTER.values[reg_idx] == "us-west"
fleet = bikes.CUSTOMER_ID.str.startswith("F").values
model = bikes.MODEL.values
base_rides = np.select([fleet, model == "Cargo", model == "Trail"], [24.0, 7.0, 3.5], 6.0)
trip_km = np.select([fleet, model == "Trail"], [9.0, 11.0], 5.5) * rng.lognormal(0, 0.2, NB)
bike_mult = rng.lognormal(0, 0.35, NB)
range_base = np.select([model == "Cargo", model == "Trail"], [62.0, 70.0], 75.0)
caliper_c = bikes.CALIPER_REV.values == "C"
care_eligible = ~fleet
care_sub = care_eligible & (rng.random(NB) < np.where(model == "Cargo", 0.55, 0.45))
care_start_day = deliv_day_all.copy()
care_cancel_day = np.full(NB, INF)
rider_dropped = np.zeros(NB, bool)
bt_ema = np.full(NB, np.nan)
affected = np.zeros(NB, bool)

tel, errs, claims, tickets = [], [], [], []
fw_days = {v: install_day[v] for v in FW_ORDER}

for w in range(NW):
    wk = WEEKS[w]
    wday0 = (wk - START).days
    active = (deliv_w <= w) & ~rider_dropped
    idx = np.nonzero(active)[0]
    if len(idx) == 0:
        continue
    r = reg_idx[idx]
    temp = temp_w[r, w]
    rain = rain_w[r, w]
    rain_week = rain > 15
    # current firmware (as of mid-week)
    mid = wday0 + 3
    fwv = np.full(len(idx), "4.0", dtype=object)
    for v in FW_ORDER[1:]:
        fwv = np.where(fw_days[v][idx] <= mid, v, fwv)
    fw42 = fw_days["4.2"][idx] <= mid
    ha = ha_on[idx] & (ha_day[idx] <= mid)
    season_f = np.clip(1 + 0.022 * (temp - 12), 0.45, 1.4) * np.where(rain_week, 0.78, 1.0)
    lam = base_rides[idx] * bike_mult[idx] * season_f * np.where(ha & hilly[idx], 1.12, 1.0)
    rides = rng.poisson(lam)
    km = rides * trip_km[idx] * rng.normal(1, 0.08, len(idx)).clip(0.5)
    load = np.clip(km / np.maximum(rides, 1) / 6.0, 0.5, 2.5)
    bt = temp + 16.5 + 2.2 * load + rng.normal(0, 1.8, len(idx)) - np.where(fw42, 6.0, 0.0)
    bt = np.where(rides > 0, bt, temp + 4)
    prev = bt_ema[idx]
    ema = np.where(np.isnan(prev), bt, 0.72 * prev + 0.28 * bt)
    bt_ema[idx] = ema
    age_w = w - deliv_w[idx]
    rng_km = (
        range_base[idx]
        * (1 - 0.0075 * np.clip(15 - temp, 0, None))
        * np.where(fw42, 1.07, 1.0)
        * (1 - 0.0007 * age_w)
        * rng.normal(1, 0.03, len(idx))
    )
    mt = temp + 30 + np.where(hilly[idx], 9, 0) + 4 * load + rng.normal(0, 3, len(idx))
    overheat = rng.poisson(rides * 0.02 * np.exp((bt - 38) / 6.5))
    motor_ot = rng.poisson(rides * 0.002 * np.exp((mt - 55) / 8))
    assist = np.clip(rng.normal(2.6 + np.where(hilly[idx], 0.5, 0) + np.where(ha & hilly[idx], 0.2, 0), 0.5), 1, 5)
    brake_ev = rng.poisson(rides * (8 + np.where(hilly[idx], 5, 0)))
    unlock = np.zeros(len(idx), int)
    if w == INC_W:
        hit = west[idx] & (rides > 0) & (rng.random(len(idx)) < 0.75)
        affected[idx[hit]] = True
        unlock = np.where(hit, rng.integers(1, 5, len(idx)), 0)
    else:
        unlock = rng.poisson(0.004, len(idx))

    tel.append(
        pd.DataFrame(
            {
                "BIKE_ID": bikes.BIKE_ID.values[idx],
                "WEEK_START": wk.date(),
                "FIRMWARE_VERSION": fwv,
                "RIDES": rides,
                "KM": km.round(1),
                "AVG_ASSIST_LEVEL": assist.round(2),
                "BATTERY_TEMP_P95": bt.round(1),
                "RANGE_KM": rng_km.round(1),
                "MOTOR_TEMP_P95": mt.round(1),
                "OVERHEAT_ERRORS": overheat,
                "MOTOR_OVERTEMP_ERRORS": motor_ot,
                "UNLOCK_TIMEOUTS": unlock,
                "BRAKE_EVENTS": brake_ev,
            }
        )
    )

    # error events (expanded from counts)
    for code, sub, cnt in (("BATT_OVERTEMP", "battery", overheat), ("MOTOR_OVERTEMP", "motor", motor_ot), ("UNLOCK_TIMEOUT", "connectivity", unlock)):
        k = np.nonzero(cnt)[0]
        if len(k):
            rep = np.repeat(k, cnt[k])
            if code == "UNLOCK_TIMEOUT" and w == INC_W:
                ts = INC_DAY + pd.to_timedelta(9 * 3600 + rng.integers(0, 9 * 3600, len(rep)), unit="s")
            else:
                ts = wk + pd.to_timedelta(rng.integers(0, 7 * 86400, len(rep)), unit="s")
            errs.append(pd.DataFrame({"BIKE_ID": bikes.BIKE_ID.values[idx[rep]], "EVENT_TS": ts, "CODE": code,
                                      "SUBSYSTEM": sub, "FIRMWARE_VERSION": fwv[rep]}))

    # warranty claims
    rf = np.clip(rides / 6.0, 0.3, 2.5)
    haz = {
        # FW 4.2 also caps charge current on hot cells; the reduced wear shows up ~4 weeks after install
        "battery": 0.004 * np.exp((ema - 38) / 12.0) * np.where(fw_days["4.2"][idx] <= wday0 - 28, 0.65, 1.0),
        "brakes": 0.0005 * np.where(caliper_c[idx], 2.5, 1.0) * np.where(rainy[idx], 1.3, 1.0) * rf,
        "motor": 0.0005 * np.where(hilly[idx], 1.3, 1.0) * np.ones(len(idx)),
        "controller": 0.0002 * np.ones(len(idx)),
        "display": 0.00015 * np.ones(len(idx)),
        "frame": 0.00005 * np.ones(len(idx)),
    }
    for part, h in haz.items():
        k = np.nonzero(rng.random(len(idx)) < h)[0]
        if len(k):
            claims.append(pd.DataFrame({"BIKE_ID": bikes.BIKE_ID.values[idx[k]], "PART": part,
                                        "CLAIM_DATE": (wk + pd.to_timedelta(rng.integers(0, 7, len(k)), unit="D")).date,
                                        "FW": fwv[k]}))

    # service tickets
    th = {
        "brake_noise": 0.0015 * np.where(caliper_c[idx], 3.0, 1.0) * np.where(rain_week & rainy[idx], 1.6, 1.0) * rf,
        "battery_range": 0.0018 * (1 + 0.6 * (overheat > 0)) * np.where(temp < 5, 1.5, 1.0),
        "app_unlock": 0.0007 + np.where(unlock > 0, 0.35 if w == INC_W else 0.05, 0.0),
        "motor": 0.0006 * np.where(hilly[idx], 1.3, 1.0),
        "billing": np.where(care_sub[idx] & (care_cancel_day[idx] > wday0), 0.0005, 0.0),
        "delivery_setup": np.where(age_w <= 1, 0.012, 0.0),
        "other": 0.0006 * np.ones(len(idx)),
    }
    for cat, h in th.items():
        k = np.nonzero(rng.random(len(idx)) < h)[0]
        if len(k):
            tickets.append(pd.DataFrame({"BIKE_ID": bikes.BIKE_ID.values[idx[k]], "CATEGORY": cat,
                                         "TICKET_DATE": (wk + pd.to_timedelta(rng.integers(0, 7, len(k)), unit="D")).date,
                                         "XC": caliper_c[idx[k]], "XINC": (w == INC_W) & (unlock[k] > 0),
                                         "XAGE": age_w[k], "XRAINY": rainy[idx[k]]}))

    # Care cancellations
    subs_active = care_sub[idx] & (care_start_day[idx] <= wday0 + 6) & (care_cancel_day[idx] >= INF)
    h = np.full(len(idx), 0.006)
    h = np.where(ha & hilly[idx], h * 0.55, h)
    if w in (INC_W, INC_W + 1):
        h = np.where(affected[idx], h * 10, h)
    cancel = subs_active & (rng.random(len(idx)) < h)
    if w == INC_W:  # cancellations happen after the outage day
        cday = np.maximum(wday0 + rng.integers(0, 7, len(idx)), (INC_DAY - START).days)
    else:
        cday = wday0 + rng.integers(0, 7, len(idx))
    care_cancel_day[idx[cancel]] = cday[cancel]

    # some riders stop riding
    rider_dropped[idx[rng.random(len(idx)) < 0.0015]] = True

telemetry = pd.concat(tel, ignore_index=True)
error_events = pd.concat(errs, ignore_index=True)
error_events.insert(0, "EVENT_ID", np.arange(1, len(error_events) + 1))

# ---------------------------------------------------------------- warranty claims table
wc = pd.concat(claims, ignore_index=True)
FAIL = {
    "battery": (["Cell imbalance / capacity fade", "Pack overheating shutdown", "BMS fault"], 620, 70),
    "brakes": (["Caliper noise / vibration", "Pad glazing", "Piston seal leak"], 140, 30),
    "motor": (["Hall sensor fault", "Bearing noise", "Overheat cut-out"], 480, 60),
    "controller": (["Controller board failure", "Connector corrosion"], 260, 40),
    "display": (["Display freeze", "Button failure"], 180, 25),
    "frame": (["Weld crack", "Dropout alignment"], 900, 120),
}
wc["FAILURE_MODE"] = [rng.choice(FAIL[p][0]) for p in wc.PART]
wc.loc[(wc.PART == "brakes") & wc.BIKE_ID.isin(bikes.BIKE_ID[caliper_c]), "FAILURE_MODE"] = rng.choice(
    ["Caliper noise / vibration", "Caliper noise / vibration", "Pad glazing"], ((wc.PART == "brakes") & wc.BIKE_ID.isin(bikes.BIKE_ID[caliper_c])).sum())
wc["COST_USD"] = [max(40, rng.normal(FAIL[p][1], FAIL[p][2])) for p in wc.PART]
wc["COST_USD"] = wc.COST_USD.round(2)
wc = wc.sort_values("CLAIM_DATE").reset_index(drop=True)
wc.insert(0, "CLAIM_ID", [f"WC-{i + 1:05d}" for i in range(len(wc))])
wc["STATUS"] = rng.choice(["approved", "approved", "approved", "denied"], len(wc))
warranty_claims = wc[["CLAIM_ID", "BIKE_ID", "CLAIM_DATE", "PART", "FAILURE_MODE", "COST_USD", "STATUS"]]

# ---------------------------------------------------------------- tickets (free text)
TEXT = {
    "brake_noise": [
        "Rear brake squeals every time I stop, especially when it's wet out.",
        "Loud screeching from the front disc when braking downhill. Is this normal?",
        "Brakes started making a high-pitched noise after a rainy commute and haven't stopped.",
        "My bike is only {age} weeks old and the brakes squeal at every red light. Pretty embarrassing.",
        "Grinding / squealing noise from the brakes. Already cleaned the rotor with alcohol, still happening.",
        "Brake noise is getting worse. Feels fine, just really loud. Can someone take a look?",
        "Front brake howls in the rain, rear one too sometimes. Commuting in {region} so it's wet a lot.",
        "Vibration and a squeak when I brake hard on hills.",
        "Every stop sounds like a bus. Pads look fine to me.",
    ],
    "battery_range": [
        "Range dropped a lot this week, I'm getting maybe {km} km on a full charge.",
        "Battery got really hot on my ride today and the bike cut assist for a minute.",
        "Saw a battery temperature warning on the display during my commute.",
        "Range estimate jumps around a lot. Started at 60 km, died at 35.",
        "Is it normal for the battery to drain faster in the cold?",
        "Assist cut out going up a long hill, display said battery too hot.",
        "Charging takes longer than it used to.",
    ],
    "app_unlock": [
        "App won't unlock my bike, just keeps spinning.",
        "Couldn't unlock this morning and had to take a taxi. What's going on?",
        "Unlock timed out three times in a row.",
        "Bluetooth unlock is flaky, have to restart the app.",
        "The app says the bike is offline but it's right in front of me.",
    ],
    "motor": [
        "Motor makes a clicking noise under load.",
        "Felt the motor cut out for a second on a steep climb.",
        "Humming noise from the rear hub that wasn't there before.",
        "Assist feels weaker than when I bought it.",
    ],
    "billing": [
        "I was charged twice for Voltra Care this month.",
        "How do I pause my Care subscription for the winter?",
        "Need an invoice for my Care plan for my employer.",
        "Why did my Care price change?",
    ],
    "delivery_setup": [
        "Bike arrived but the handlebar was loose, how do I tighten it?",
        "Can't pair the bike with the app during setup.",
        "Delivery was late, is there a tracking number?",
        "Missing the charger in the box.",
    ],
    "other": [
        "Where can I buy a replacement key?",
        "Can I fit a child seat on my bike?",
        "Kickstand rattles on bumpy roads.",
        "What tire pressure do you recommend?",
        "Light doesn't turn on automatically anymore.",
    ],
}
INC_TEXT = [
    "Unlock completely broken this morning, app spinning forever. Missed my train.",
    "Can't unlock my bike AT ALL. Paying for Care and this happens?",
    "Unlock failing for an hour now. Any outage?",
    "The app is down? Bike won't unlock, stuck at work.",
]
ADDONS = [
    "It's a {model}.", "Bought it about {age} weeks ago.", "I ride it most days in {region}.", "Around {odo} km on it so far.",
    "Using it for my daily commute.", "Please advise.", "Thanks in advance!", "Can I book a service visit?",
    "Started this week.", "This has happened a few times now.",
]
tk = pd.concat(tickets, ignore_index=True)
tk = tk.merge(bikes[["BIKE_ID", "CUSTOMER_ID", "REGION", "MODEL"]], on="BIKE_ID")
texts, csat = [], []
for row in tk.itertuples():
    if row.XINC:
        t = rng.choice(INC_TEXT)
        c = rng.choice([1, 2, 2, 3])
    else:
        t = rng.choice(TEXT[row.CATEGORY]).format(age=max(1, row.XAGE), region=row.REGION, km=int(rng.integers(25, 45)))
        for extra in rng.choice(ADDONS, int(rng.integers(0, 3)), replace=False):
            t += " " + extra.format(model=row.MODEL, age=max(1, row.XAGE), region=row.REGION, odo=int(max(1, row.XAGE) * rng.integers(25, 60)))
        if row.CATEGORY == "brake_noise":
            c = rng.choice([1, 2, 3, 3, 4]) if row.XC else rng.choice([3, 4, 4, 5])
        elif row.CATEGORY == "app_unlock":
            c = rng.choice([2, 3, 4])
        else:
            c = rng.choice([3, 4, 5, 5])
    texts.append(t)
    csat.append(int(c))
tk["DESCRIPTION"] = texts
tk["CSAT"] = csat
tk = tk.sort_values("TICKET_DATE").reset_index(drop=True)
tk.insert(0, "TICKET_ID", [f"T-{i + 1:06d}" for i in range(len(tk))])
tk["CHANNEL"] = rng.choice(["app chat", "email", "phone"], len(tk), p=[0.55, 0.3, 0.15])
service_tickets = tk[["TICKET_ID", "CUSTOMER_ID", "BIKE_ID", "TICKET_DATE", "CATEGORY", "CHANNEL", "DESCRIPTION", "CSAT"]]

# ---------------------------------------------------------------- app reviews
REV = {
    5: ["Love this bike, the app is slick.", "Commuting is fun again. Range is great.", "Best purchase this year.",
        "Route planner is excellent.", "Hill Assist makes my climbs so easy!"],
    4: ["Solid app, occasional bluetooth hiccups.", "Great bike, wish the app was faster.", "Good overall, range could be better in winter."],
    3: ["It's fine. Some bugs.", "Bike is good, app is meh.", "Brakes are a bit noisy but otherwise ok."],
    2: ["App crashes sometimes and the brakes squeal.", "Battery warnings on hot days, not happy.", "Support was slow."],
    1: ["Couldn't unlock my bike, useless app.", "Paying for Care and the app doesn't work.", "Terrible experience lately."],
}
n_days = len(DAYS)
rv_counts = rng.poisson(3.2, n_days)
inc_i = (INC_DAY - START).days
rv_counts[inc_i] += 45
rv_counts[inc_i + 1] += 15
rv_rows = []
for i, n in enumerate(rv_counts):
    if n == 0:
        continue
    p = np.array([0.04, 0.06, 0.12, 0.30, 0.48])
    if i in (inc_i, inc_i + 1):
        p = np.array([0.55, 0.20, 0.10, 0.08, 0.07])
    ratings = rng.choice([1, 2, 3, 4, 5], n, p=p)
    for rt in ratings:
        txt = rng.choice(REV[rt])
        if i in (inc_i, inc_i + 1) and rt <= 2:
            txt = rng.choice(["Couldn't unlock my bike this morning, app just spun. Late for work.",
                              "Unlock outage again?? Paying for Care for this.", "App down, bike locked, great."])
        rv_rows.append((DAYS[i].date(), int(rt), rng.choice(["ios", "android"]), txt))
app_reviews = pd.DataFrame(rv_rows, columns=["REVIEW_DATE", "RATING", "PLATFORM", "REVIEW_TEXT"])
app_reviews.insert(0, "REVIEW_ID", [f"R-{i + 1:05d}" for i in range(len(app_reviews))])
app_reviews["APP_VERSION"] = [
    releases[(releases.COMPONENT == "app") & (releases.RELEASE_DATE <= dt)].VERSION.iloc[-1]
    if ((releases.COMPONENT == "app") & (releases.RELEASE_DATE <= dt)).any() else "4.7"
    for dt in app_reviews.REVIEW_DATE
]

# ---------------------------------------------------------------- subscriptions
sub_idx = np.nonzero(care_sub)[0]
subscriptions = pd.DataFrame(
    {
        "SUBSCRIPTION_ID": [f"S-{i + 1:05d}" for i in range(len(sub_idx))],
        "CUSTOMER_ID": bikes.CUSTOMER_ID.values[sub_idx],
        "BIKE_ID": bikes.BIKE_ID.values[sub_idx],
        "PLAN": "Voltra Care Monthly",
        "MRR_USD": 14.99,
        "STARTED_AT": bikes.DELIVERED_DATE.values[sub_idx],
        "CANCELLED_AT": [
            (START + pd.Timedelta(days=int(c))).date() if c < INF and START + pd.Timedelta(days=int(c)) < TODAY else None
            for c in care_cancel_day[sub_idx]
        ],
    }
)

# ---------------------------------------------------------------- incidents
INCIDENTS = [
    ("INC-142", "payments-api", "SEV3", "2025-02-18 14:05", "2025-02-18 15:20",
     "Elevated checkout latency from payments provider.",
     "Summary: p95 checkout latency rose to 9s for 75 minutes due to a degraded upstream payments region.\n"
     "Impact: ~4% of checkouts abandoned during the window.\nRoot cause: provider regional failover.\n"
     "Actions: added client-side timeout and retry with idempotency keys."),
    ("INC-171", "telemetry-ingest", "SEV3", "2025-06-24 02:10", "2025-06-24 11:40",
     "Telemetry ingestion delayed ~9 hours.",
     "Summary: a schema change in the bike uplink payload stalled the batch ingester.\n"
     "Impact: dashboards and range estimates were stale; no data lost.\nActions: schema registry checks in CI."),
    ("INC-188", "ota-cdn", "SEV3", "2025-10-14 07:00", "2025-10-14 10:30",
     "Slow firmware downloads from CDN edge.",
     "Summary: one CDN edge served firmware packages at reduced throughput.\n"
     "Impact: some OTA downloads retried; installs completed later the same day.\nActions: multi-CDN for OTA packages."),
    ("INC-203", "care-billing", "SEV2", "2026-01-27 06:00", "2026-01-27 13:00",
     "Duplicate Voltra Care charges for a subset of subscribers.",
     "Summary: a retry bug in the legacy billing job charged ~3% of Care subscribers twice.\n"
     "Impact: duplicate charges refunded automatically within 48h with an apology email.\n"
     "Actions: idempotency keys on billing jobs; billing engine replacement already planned (BE-2026.02)."),
    ("INC-217", "unlock-service", "SEV1", "2026-08-12 09:02", "2026-08-12 18:05",
     "Bike unlock failures in us-west.",
     "Summary: unlock requests in the us-west cluster timed out for about nine hours.\n"
     "Impact: riders in Seattle, San Francisco and Portland could not unlock their bikes via the app; physical keys worked.\n"
     "Root cause: database connection exhaustion in unlock-service after connection pool settings were reduced; "
     "autoscaling added pods, which made exhaustion worse.\nDetection: delayed; alert thresholds were tuned for us-central traffic.\n"
     "Actions: reverted pool config, added per-region SLO alerts, offline BLE unlock fallback planned. "
     "Affected Care members received a one-month credit."),
    ("INC-224", "mobile-android", "SEV3", "2026-09-30 17:00", "2026-10-01 09:00",
     "Android map screen crash on some devices.",
     "Summary: map tiles crashed the app on a subset of Android 15 devices.\n"
     "Impact: map screen unusable for ~3% of Android users; unlock unaffected.\nActions: hotfix 5.2.4."),
]
incidents = pd.DataFrame(INCIDENTS, columns=["INCIDENT_ID", "SERVICE", "SEVERITY", "STARTED_AT", "ENDED_AT", "SUMMARY", "POSTMORTEM"])
incidents["STARTED_AT"] = pd.to_datetime(incidents.STARTED_AT)
incidents["ENDED_AT"] = pd.to_datetime(incidents.ENDED_AT)
incidents["AFFECTED_REGIONS"] = ["all", "all", "all", "all", "Seattle, San Francisco, Portland", "all"]

# ---------------------------------------------------------------- write
TABLES = {
    "REGIONS": REGIONS.drop(columns=["BASE_TEMP", "TEMP_AMP", "RAIN_MM", "SHARE"]),
    "WEATHER_WEEKLY": weather,
    "MARKETING_SPEND": marketing,
    "WEB_FUNNEL_DAILY": funnel,
    "CUSTOMERS": customers,
    "ORDERS": orders,
    "BIKES": bikes,
    "HARDWARE_REVISIONS": hardware,
    "RELEASES": releases,
    "FIRMWARE_INSTALLS": firmware_installs,
    "FLAG_EXPOSURES": flag_exposures,
    "TELEMETRY_WEEKLY": telemetry,
    "ERROR_EVENTS": error_events,
    "WARRANTY_CLAIMS": warranty_claims,
    "SERVICE_TICKETS": service_tickets,
    "APP_REVIEWS": app_reviews,
    "SUBSCRIPTIONS": subscriptions,
    "INCIDENTS": incidents,
}

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, df in TABLES.items():
        df.to_parquet(OUT / f"{name}.parquet", index=False)
        print(f"{name:20s} {len(df):>9,d} rows")
