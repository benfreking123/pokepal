import type { GameData, TypeId } from "../../shared/types";

export function TypeBadge({ type, data, suffix }: { type: TypeId; data: GameData; suffix?: string }) {
  const name = data.types.find((t) => t.id === type)?.name ?? type;
  return (
    <span className="type-badge" style={{ background: `var(--type-${type.toLowerCase()}, var(--type-qmarks))` }}>
      {name}
      {suffix ? ` ${suffix}` : ""}
    </span>
  );
}
