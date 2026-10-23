"""Verify the Snowflake connection and that Claude is callable via Cortex AI_COMPLETE."""
from sf import connect

with connect() as conn:
    cur = conn.cursor()
    cur.execute(
        "SELECT CURRENT_ORGANIZATION_NAME(), CURRENT_ACCOUNT_NAME(), CURRENT_USER(), "
        "CURRENT_ROLE(), CURRENT_WAREHOUSE(), CURRENT_REGION(), CURRENT_VERSION()"
    )
    cols = ["org", "account", "user", "role", "warehouse", "region", "version"]
    for c, v in zip(cols, cur.fetchone()):
        print(f"{c:>10}: {v}")

    cur.execute("SHOW WAREHOUSES")
    print("\nwarehouses:", [r[0] for r in cur.fetchall()])
    cur.execute("SHOW DATABASES")
    print("databases: ", [r[1] for r in cur.fetchall()])

    cur.execute("SELECT AI_COMPLETE('claude-sonnet-5-5', 'Say hello to the Snowflake x Anthropic hackathon in one sentence.')")
    print("\nclaude-sonnet-5-5:", cur.fetchone()[0])
