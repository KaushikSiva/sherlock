import { createContext, useContext } from "react";

export type Row = Record<string, unknown>;
export type Dataset = { columns: string[]; rows: Row[]; sql: string; queryId?: string };

/** Query results streamed from the backend, keyed by dataset id (d1, d2, …). */
export const DataContext = createContext<Record<string, Dataset>>({});
export const useDataset = (id?: string) => {
  const data = useContext(DataContext);
  return id ? data[id] : undefined;
};

/** Lets generated components (e.g. FollowUps) ask the agent a new question. */
export const AskContext = createContext<(q: string) => void>(() => {});
export const useAsk = () => useContext(AskContext);
