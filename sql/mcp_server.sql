-- Snowflake-managed MCP server for "Ask Your Data". Owned by ATTENDEE_ROLE (owner of DEFAULT_DATABASE).
CREATE OR REPLACE MCP SERVER DEFAULT_DATABASE.DEFAULT_SCHEMA.ASK_YOUR_DATA_MCP
  FROM SPECIFICATION $$
  tools:
    - title: "Snowflake SQL (read-only)"
      name: "sql_exec"
      type: "SYSTEM_EXECUTE_SQL"
      description: "Execute one read-only SQL query against Snowflake. Data lives in STOWEAWAY.ANALYTICS (customers, segments, channels, campaigns, weekly account activity, onboarding events, recurring deposits, NPS surveys, media performance, lifecycle touches, experiments). Aggregate in SQL and return chart-ready results."
      config:
        read_only: true
        query_timeout: 120
        warehouse: "DEFAULT_WH"
    - title: "Stoweaway 360 (Cortex Analyst)"
      name: "stoweaway_analyst"
      type: "CORTEX_ANALYST_MESSAGE"
      identifier: "STOWEAWAY.ANALYTICS.STOWEAWAY_360"
      description: "Turns a natural-language metric question into governed SQL using the STOWEAWAY_360 semantic view (official definitions of retention, recurring adoption, CAC, NPS, balances, activation). Returns SQL, which you then run with sql_exec."
    - title: "Survey verbatims (Cortex Search)"
      name: "survey_search"
      type: "CORTEX_SEARCH_SERVICE_QUERY"
      identifier: "STOWEAWAY.ANALYTICS.SURVEY_SEARCH"
      description: "Semantic search over NPS survey free-text responses (with NPS_SCORE and SURVEY_DATE). Use to find what customers say in their own words and pull quotes that explain a metric. Not for counts."
    - title: "Stoweaway Growth Analyst (Cortex Agent)"
      name: "growth_analyst_agent"
      type: "CORTEX_AGENT_RUN"
      identifier: "STOWEAWAY.ANALYTICS.STOWEAWAY_GROWTH_ANALYST"
      description: "Snowflake's governed growth-analyst agent. Delegate a self-contained sub-question to get a second, independently-derived answer to cross-check your numbers."
      annotations:
        readOnlyHint: true
        destructiveHint: false
        openWorldHint: false
  $$;
