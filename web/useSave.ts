import { useCallback, useEffect, useState } from "react";
import type { SaveSummary } from "../shared/types";
import { getJson } from "./api";

export function useSave(): { save: SaveSummary | null; error: string | null } {
  const [save, setSave] = useState<SaveSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    getJson<SaveSummary>("/api/save/summary").then((s) => { setSave(s); setError(null); }, (e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    load();
    const es = new EventSource("/api/save/stream");
    es.addEventListener("save-changed", load);
    return () => es.close();
  }, [load]);
  return { save, error };
}
