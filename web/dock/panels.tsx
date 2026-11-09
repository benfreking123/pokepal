import type { ReactNode } from "react";
import { BattleTab } from "../tabs/BattleTab";
import { GuidesTab } from "../tabs/GuidesTab";
import { PrepTab } from "../tabs/PrepTab";
import { SaveSwapTab } from "../tabs/SaveSwapTab";
import { SettingsTab } from "../tabs/SettingsTab";
import { TeamTab } from "../tabs/TeamTab";
import { TypeChartTab } from "../tabs/TypeChartTab";
import { WhatsNextTab } from "../tabs/WhatsNextTab";
import { useDashboard } from "./context";
import { PANELS, type PanelId } from "./layout";

function Body({ id }: { id: PanelId }): ReactNode {
  const { bundle, stream, reload } = useDashboard();
  if (id === "save-swap") return <SaveSwapTab />;
  if (id === "guides") return <GuidesTab />;
  if (!bundle) return <p className="muted">Loading data…</p>;
  switch (id) {
    case "battle": return <BattleTab bundle={bundle} stream={stream} />;
    case "team": return <TeamTab bundle={bundle} />;
    case "prep": return <PrepTab bundle={bundle} stream={stream} />;
    case "whats-next": return <WhatsNextTab bundle={bundle} />;
    case "type-chart": return <TypeChartTab bundle={bundle} />;
    case "settings": return <SettingsTab bundle={bundle} onChange={reload} />;
    default: return null;
  }
}

export function Panel({ id }: { id: PanelId }) {
  const title = PANELS.find((p) => p.id === id)?.title ?? id;
  return (
    <div className="dock-panel" data-panel={id}>
      <div className="dock-panel-header"><span className="dock-panel-title">{title}</span></div>
      <div className="dock-panel-body"><Body id={id} /></div>
    </div>
  );
}
