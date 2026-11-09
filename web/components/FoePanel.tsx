import type { FieldOverlay, GameData, TrainerMonView, TypeId } from "../../shared/types";
import { IncomingStrip } from "./IncomingStrip";
import { TypeBadge } from "./TypeBadge";

export interface Foe { name: string; species: string; form: number; level: number | null; types: TypeId[]; hpPercent?: number }

export function FoePanel({ data, foe, overlay, details }: { data: GameData; foe: Foe; overlay: FieldOverlay; details?: TrainerMonView }) {
  return (
    <section className="card foe-panel">
      <h2>
        {foe.name}
        {foe.level != null ? <small> Lv. {foe.level}</small> : null}
      </h2>
      <div>
        {foe.types.map((t) => (
          <TypeBadge key={t} type={t} data={data} />
        ))}
      </div>
      {foe.hpPercent != null ? (
        <div className="hp-bar" aria-label={`HP ${foe.hpPercent}%`}>
          <div style={{ width: `${foe.hpPercent}%` }} />
        </div>
      ) : null}
      {details ? (
        <dl className="foe-details">
          {details.moves ? (<><dt>Moves</dt><dd>{details.moves.map((m) => data.moves[m]?.name ?? m).join(", ")}</dd></>) : null}
          {details.ability !== undefined ? (<><dt>Ability</dt><dd>{details.ability ? data.abilities[details.ability]?.name ?? details.ability : "Unknown"}</dd></>) : null}
          {details.item !== undefined ? (<><dt>Item</dt><dd>{details.item ? data.items[details.item]?.name ?? details.item : "None"}</dd></>) : null}
        </dl>
      ) : null}
      <h3>Incoming damage</h3>
      <IncomingStrip data={data} defenderTypes={foe.types} overlay={overlay} />
    </section>
  );
}
