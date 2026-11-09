import type { SaveMeta } from "../../shared/types";

export const hms = (seconds: number) => `${Math.floor(seconds / 3600)}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}`;

export function SaveMetaCard({ meta, title }: { meta: SaveMeta | null; title?: string }) {
  if (!meta) return <div className="card"><b>{title}</b> Not found</div>;
  return (
    <div className="card save-meta">
      {title ? <b>{title}</b> : null}
      <div>{meta.trainerName} · {hms(meta.playtimeSeconds)} played · {meta.badgeCount} badges</div>
      <div className="muted">{meta.mapName ?? `Map ${meta.mapId}`} · saved {new Date(meta.mtimeMs).toLocaleString()}</div>
    </div>
  );
}
