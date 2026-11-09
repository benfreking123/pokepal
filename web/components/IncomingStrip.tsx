import { moveEffectiveness } from "../../shared/typechart";
import type { FieldOverlay, GameData, TypeId } from "../../shared/types";
import { TypeBadge } from "./TypeBadge";

type Entry = { type: TypeId; min: number; max: number };
const LABELS = ["4×+", "2×", "½×", "¼× or less", "0×", "Fails", "Varies"] as const;

export function incomingGroups(data: GameData, defenderTypes: TypeId[], overlay: FieldOverlay) {
  const buckets = new Map<string, Entry[]>(LABELS.map((l) => [l, []]));
  for (const { id } of data.types) {
    const e = moveEffectiveness(data.chart, { type: id }, defenderTypes, overlay);
    const entry = { type: id, min: e.min, max: e.max };
    const label = e.fails ? "Fails" : e.min !== e.max ? "Varies" : e.min >= 4 ? "4×+" : e.min === 2 ? "2×" : e.min === 0.5 ? "½×" : e.min === 0 ? "0×" : e.min < 0.5 ? "¼× or less" : null;
    if (label) buckets.get(label)!.push(entry);
  }
  return LABELS.map((label) => ({ label, types: buckets.get(label)! })).filter((g) => g.types.length > 0);
}

export function IncomingStrip({ data, defenderTypes, overlay }: { data: GameData; defenderTypes: TypeId[]; overlay: FieldOverlay }) {
  const groups = incomingGroups(data, defenderTypes, overlay);
  return (
    <div className="incoming">
      {groups.map((g) => (
        <div className="incoming-row" key={g.label}>
          <strong className="incoming-label">{g.label}</strong>
          <span className="incoming-types">
            {g.types.map((t) => (
              <TypeBadge key={t.type} type={t.type} data={data} suffix={g.label === "Varies" ? `${t.min}–${t.max}×` : undefined} />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
