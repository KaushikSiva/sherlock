"""Run a SQL file whose statements are separated by lines containing only "-- @@".

    .venv/bin/python sql/run_sql.py sql/voltra_setup.sql
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from sf import connect  # noqa: E402


def main(path):
    statements = [s.strip() for s in pathlib.Path(path).read_text().split("\n-- @@\n") if s.strip()]
    conn = connect()
    cur = conn.cursor()
    cur.execute("USE WAREHOUSE DEFAULT_WH")
    for s in statements:
        first = next((line for line in s.splitlines() if line.strip() and not line.startswith("--")), "")
        cur.execute(s)
        print(f"ok  {first[:90]}  -> {cur.fetchone()}")
    conn.close()


if __name__ == "__main__":
    main(sys.argv[1])
