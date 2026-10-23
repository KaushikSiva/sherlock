"""Shared Snowflake connection helper."""
import os

import snowflake.connector
from dotenv import load_dotenv

load_dotenv()


def connect():
    opts = {
        "account": os.environ["SNOWFLAKE_ACCOUNT"],
        "user": os.environ["SNOWFLAKE_USER"],
        "password": os.environ["SNOWFLAKE_PASSWORD"],
        "enable_server_session_keep_alive_auto_detection": True,
    }
    for key in ("role", "warehouse", "database", "schema"):
        if val := os.getenv(f"SNOWFLAKE_{key.upper()}"):
            opts[key] = val
    return snowflake.connector.connect(**opts)
