import { useEffect, useState } from "react";
import { panelFromHash, PANELS, SHOW_PANEL_EVENT, type PanelId } from "./layout";
import { Panel } from "./panels";

export function MobileDashboard() {
  const [current, setCurrent] = useState<PanelId>(() => panelFromHash(location.hash) ?? "battle");
  useEffect(() => {
    const onHash = () => { const id = panelFromHash(location.hash); if (id) setCurrent(id); };
    const onShow = (e: Event) => setCurrent((e as CustomEvent<PanelId>).detail);
    window.addEventListener("hashchange", onHash);
    window.addEventListener(SHOW_PANEL_EVENT, onShow);
    return () => { window.removeEventListener("hashchange", onHash); window.removeEventListener(SHOW_PANEL_EVENT, onShow); };
  }, []);
  return (
    <div className="mobile-dashboard">
      <div className="mobile-dashboard-header">
        <select className="mobile-dashboard-select" aria-label="Panel" value={current} onChange={(e) => setCurrent(e.target.value as PanelId)}>
          {PANELS.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </div>
      <div className="mobile-dashboard-content">
        {PANELS.map((p) => (
          <div key={p.id} hidden={p.id !== current} className="mobile-panel"><Panel id={p.id} /></div>
        ))}
      </div>
    </div>
  );
}
