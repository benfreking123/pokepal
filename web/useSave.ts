import { useCallback, useEffect, useState } from "react";
import type { SaveSummary } from "../shared/types";
import { getJson } from "./api";
import { onSaveChanged } from "./events";

export function useSave(): { save: SaveSummary | null; error: string | null } {
  const [save, setSave] = useState<SaveSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    getJson<SaveSummary>("/api/save/summary").then((s) => { setSave(s); setError(null); }, (e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    load();
    return onSaveChanged(load);
  }, [load]);
  return { save, error };
}
