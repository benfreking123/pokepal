import { useCallback, useEffect, useState } from "react";
import type { ClientBundle } from "../shared/types";
import { getJson } from "./api";
import { BattleTab } from "./tabs/BattleTab";
import { GuidesTab } from "./tabs/GuidesTab";
import { SettingsTab } from "./tabs/SettingsTab";
import { TypeChartTab } from "./tabs/TypeChartTab";

const TABS = [
  { id: "battle", label: "Battle" },
  { id: "team", label: "Team" },
  { id: "type-chart", label: "Type Chart" },
  { id: "prep", label: "Prep" },
  { id: "save-swap", label: "Save Swap" },
  { id: "guides", label: "Guides" },
  { id: "settings", label: "Settings" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const COMING: Partial<Record<TabId, number>> = { team: 2, "save-swap": 2, prep: 3 };

function tabFromHash(hash: string): TabId {
  const h = hash.replace(/^#/, "");
  return TABS.find((t) => h === t.id || h.startsWith(`${t.id}-`))?.id ?? "battle";
}

export function App() {
  const [bundle, setBundle] = useState<ClientBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>(() => tabFromHash(location.hash));

  const reload = useCallback(() => {
    getJson<ClientBundle>("/api/data/bundle").then((b) => { setBundle(b); setError(null); }, (e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    reload();
    const onVisible = () => { if (document.visibilityState === "visible") reload(); };
    const onHash = () => setTab(tabFromHash(location.hash));
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("hashchange", onHash);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("hashchange", onHash);
    };
  }, [reload]);

  const body = () => {
    if (!bundle) return null;
    const phase = COMING[tab];
    if (phase) return <p>Coming in Phase {phase}</p>;
    switch (tab) {
      case "battle": return <BattleTab bundle={bundle} />;
      case "type-chart": return <TypeChartTab bundle={bundle} />;
      case "guides": return <GuidesTab />;
      case "settings": return <SettingsTab bundle={bundle} onChange={reload} />;
      default: return null;
    }
  };

  return (
    <div className="app">
      <nav className="tabs">
        {TABS.map((t) => (
          <a key={t.id} href={`#${t.id}`} className={t.id === tab ? "active" : ""}>{t.label}</a>
        ))}
      </nav>
      {error ? <div className="error-banner" role="alert">{error}</div> : null}
      <main>{body()}</main>
    </div>
  );
}
