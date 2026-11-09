import { useCallback, useEffect, useState } from "react";
import type { ClientBundle } from "../shared/types";
import { getJson } from "./api";
import { useBattleStream } from "./battleStream";
import { DashboardContext, type BattleFocus } from "./dock/context";
import { DockDashboard } from "./dock/DockDashboard";
import { MOBILE_QUERY, SHOW_PANEL_EVENT } from "./dock/layout";
import { MobileDashboard } from "./dock/MobileDashboard";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    mq.addEventListener("change", on);
    on();
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

export function App() {
  const [bundle, setBundle] = useState<ClientBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<BattleFocus | null>(null);
  const stream = useBattleStream();
  const mobile = useMediaQuery(MOBILE_QUERY);

  const reload = useCallback(() => {
    getJson<ClientBundle>("/api/data/bundle").then((b) => { setBundle(b); setError(null); }, (e: Error) => setError(e.message));
  }, []);

  const openBattle = useCallback((f: Omit<BattleFocus, "nonce">) => {
    setFocus((prev) => ({ ...f, nonce: (prev?.nonce ?? 0) + 1 }));
    window.dispatchEvent(new CustomEvent(SHOW_PANEL_EVENT, { detail: "battle" }));
  }, []);

  useEffect(() => {
    reload();
    const onVisible = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  return (
    <DashboardContext.Provider value={{ bundle, stream, reload, focus, openBattle }}>
      <div className="app">
        {error ? <div className="error-banner" role="alert">{error}</div> : null}
        <div className="app-body">{mobile ? <MobileDashboard /> : <DockDashboard />}</div>
      </div>
    </DashboardContext.Provider>
  );
}
