import { DockviewReact, themeAbyss, type DockviewApi, type DockviewReadyEvent, type IDockviewPanelProps } from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import { useCallback, useEffect, useRef } from "react";
import { layoutHasAllPanels, loadLayout, panelFromHash, PANELS, resetLayout, SHOW_PANEL_EVENT, saveLayout, type PanelId } from "./layout";
import { Panel } from "./panels";

const theme = { ...themeAbyss, className: `${themeAbyss.className} dockview-theme-pokepal` };

const components = Object.fromEntries(
  PANELS.map((p) => [p.id, () => <Panel id={p.id} />] as const),
) as unknown as Record<PanelId, (props: IDockviewPanelProps) => React.JSX.Element>;

export function buildDefaultLayout(api: DockviewApi): void {
  const title = (id: PanelId) => PANELS.find((p) => p.id === id)!.title;
  api.addPanel({ id: "battle", component: "battle", title: title("battle") });
  api.addPanel({ id: "type-chart", component: "type-chart", title: title("type-chart"), position: { referencePanel: "battle", direction: "right" } });
  api.addPanel({ id: "team", component: "team", title: title("team"), position: { referencePanel: "type-chart", direction: "right" } });
  api.addPanel({ id: "prep", component: "prep", title: title("prep"), position: { referencePanel: "type-chart", direction: "below" } });
  api.addPanel({ id: "history", component: "history", title: title("history"), position: { referencePanel: "battle", direction: "below" } });
  api.addPanel({ id: "save-swap", component: "save-swap", title: title("save-swap"), position: { referencePanel: "team", direction: "below" } });
  api.addPanel({ id: "whats-next", component: "whats-next", title: title("whats-next"), position: { referencePanel: "save-swap", direction: "within" } });
  api.addPanel({ id: "guides", component: "guides", title: title("guides"), position: { referencePanel: "save-swap", direction: "within" } });
  api.addPanel({ id: "settings", component: "settings", title: title("settings"), position: { referencePanel: "save-swap", direction: "within" } });
  api.getPanel("save-swap")?.api.setActive();
  api.getPanel("battle")?.api.setActive();
  const { width, height } = api;
  api.getPanel("battle")?.api.setSize({ width: Math.round(width * 0.38), height: Math.round(height * 0.7) });
  api.getPanel("history")?.api.setSize({ height: Math.round(height * 0.3) });
  api.getPanel("type-chart")?.api.setSize({ width: Math.round(width * 0.34), height: Math.round(height * 0.5) });
  api.getPanel("team")?.api.setSize({ width: Math.round(width * 0.28), height: Math.round(height * 0.5) });
}

export function DockDashboard() {
  const apiRef = useRef<DockviewApi | null>(null);

  const onReady = useCallback((e: DockviewReadyEvent) => {
    const api = e.api;
    apiRef.current = api;
    const saved = loadLayout(localStorage);
    let restored = false;
    if (layoutHasAllPanels(saved)) {
      try { api.fromJSON(saved as Parameters<DockviewApi["fromJSON"]>[0]); restored = true; } catch { api.clear(); }
    }
    if (!restored) buildDefaultLayout(api);
    api.onDidLayoutChange(() => saveLayout(localStorage, api.toJSON()));
    const hashed = panelFromHash(location.hash);
    if (hashed) api.getPanel(hashed)?.api.setActive();
  }, []);

  useEffect(() => {
    const onHash = () => {
      const id = panelFromHash(location.hash);
      if (id) apiRef.current?.getPanel(id)?.api.setActive();
    };
    const onShow = (e: Event) => apiRef.current?.getPanel((e as CustomEvent<PanelId>).detail)?.api.setActive();
    window.addEventListener("hashchange", onHash);
    window.addEventListener(SHOW_PANEL_EVENT, onShow);
    return () => { window.removeEventListener("hashchange", onHash); window.removeEventListener(SHOW_PANEL_EVENT, onShow); };
  }, []);

  const reset = () => {
    const api = apiRef.current;
    if (!api) return;
    resetLayout(localStorage);
    api.clear();
    buildDefaultLayout(api);
  };

  return (
    <div className="dock-wrapper">
      <div className="dock-toolbar">
        <span className="dock-toolbar-title">PokePal</span>
        <button className="dock-toolbar-btn" onClick={reset}>Reset layout</button>
      </div>
      <div className="dock-container">
        <DockviewReact theme={theme} components={components} onReady={onReady} defaultRenderer="always" />
      </div>
    </div>
  );
}
