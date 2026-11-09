import type { GameData, OwnedMon } from "../../shared/types";
import { TypeBadge } from "./TypeBadge";

const STAT_LABELS = [["hp", "HP"], ["atk", "Atk"], ["def", "Def"], ["spa", "SpA"], ["spd", "SpD"], ["spe", "Spe"]] as const;

export function monDisplay(mon: OwnedMon, data: GameData) {
  const sp = data.species[mon.species];
  const form = sp?.forms.find((f) => f.form === mon.form) ?? sp?.forms[0];
  return { name: form?.name ?? mon.species, types: form?.types ?? [] };
}

export function MonCard({ mon, data, unknown, selected, onToggle }: {
  mon: OwnedMon; data: GameData; unknown: Set<string>; selected: boolean; onToggle: () => void;
}) {
  const { name, types } = monDisplay(mon, data);
  const label = (id: string | null, table: Record<string, { name: string }>) => (id ? table[id]?.name ?? id : null);
  const warn = [mon.species, mon.item, mon.ability, ...mon.moves].some((id) => id && unknown.has(id));
  return (
    <div className="card mon-card">
      <label className="mon-select">
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${mon.nickname ?? name}`} />{" "}
        <b>{mon.isEgg ? "Egg" : mon.nickname && mon.nickname !== name ? `${mon.nickname} (${name})` : name}</b>
        {mon.shiny ? " ★" : ""} {mon.isEgg ? null : <span className="muted">Lv {mon.level}</span>}
      </label>
      {warn ? <span className="notice warn" title="This save has IDs the data does not know">Unknown data</span> : null}
      {!mon.isEgg ? (
        <>
          <div>{types.map((t) => <TypeBadge key={t} type={t} data={data} />)}</div>
          <div>{[label(mon.item, data.items), label(mon.ability, data.abilities), mon.nature ? mon.nature.charAt(0) + mon.nature.slice(1).toLowerCase() : null].filter(Boolean).join(" · ")}</div>
          <ul className="mon-moves">{mon.moves.map((m) => <li key={m}>{data.moves[m]?.name ?? m}{m === "HIDDENPOWER" && mon.hiddenPowerType ? ` [${data.types.find((t) => t.id === mon.hiddenPowerType)?.name ?? mon.hiddenPowerType}]` : ""}</li>)}</ul>
          <details>
            <summary>IVs / EVs</summary>
            <table className="iv-table">
              <tbody>
                <tr><th></th>{STAT_LABELS.map(([, l]) => <th key={l}>{l}</th>)}</tr>
                <tr><th>IV</th>{STAT_LABELS.map(([k]) => <td key={k}>{mon.ivs[k]}</td>)}</tr>
                <tr><th>EV</th>{STAT_LABELS.map(([k]) => <td key={k}>{mon.evs[k]}</td>)}</tr>
              </tbody>
            </table>
          </details>
        </>
      ) : null}
    </div>
  );
}
