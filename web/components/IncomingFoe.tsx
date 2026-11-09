import { useMemo } from "react";
import { baseStatTotal, formTypes, type RecMon } from "../../shared/prep/recommend";
import { rankSwitchIns } from "../../shared/prep/switchin";
import { NO_FIELD } from "../../shared/typechart";
import type { ClientBundle, LiveBattle } from "../../shared/types";
import { TypeBadge } from "./TypeBadge";

/** "Next foe": shown from the moment the trainer announces its next Pokémon until it is on the field. */
export function IncomingFoe({ bundle, live, fieldId }: { bundle: ClientBundle; live: LiveBattle; fieldId: string }) {
  const inc = live.incoming;
  const overlay = bundle.overlays[fieldId] ?? NO_FIELD;
  const typeName = (t: string) => bundle.types.find((x) => x.id === t)?.name ?? t;
  const foeName = inc ? bundle.species[inc.species]?.forms.find((f) => f.form === inc.form)?.name ?? bundle.species[inc.species]?.forms[0]?.name ?? inc.species : "";
  const foeTypes = inc ? (inc.types.length ? inc.types : formTypes(bundle, inc.species, inc.form)) : [];

  const picks = useMemo(() => {
    if (!inc) return [];
    const cands = live.party.flatMap((p, i) => {
      if (p.fainted) return [];
      const mon: RecMon = { uid: `live-${i}`, name: p.nickname || bundle.species[p.species]?.forms[0]?.name || p.species, level: p.level, types: formTypes(bundle, p.species, p.form), baseStatTotal: baseStatTotal(bundle, p.species, p.form), box: null };
      return [{ mon, hpPercent: p.hpPercent, active: p.active }];
    });
    return rankSwitchIns(bundle.chart, overlay, foeTypes, cands, typeName);
  }, [inc, live.party, bundle, overlay]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!inc) return null;
  return (
    <section className="card recs incoming-foe">
      <h3>Next foe: {foeName}{inc.level !== undefined ? <small> Lv. {inc.level}</small> : null}</h3>
      <p>{foeTypes.map((t) => <TypeBadge key={t} type={t} data={bundle} />)}</p>
      <h4>Bring in</h4>
      {picks.length ? (
        <ol>
          {picks.map((r) => (
            <li key={r.mon.uid} className="rec">
              <strong>{r.mon.name}</strong> <small>{r.hpPercent}% HP{r.active ? " · out now, stay in" : ""}</small> <span className="pill">{r.tag}</span>
            </li>
          ))}
        </ol>
      ) : <p className="muted">No healthy Pokémon to bring in.</p>}
      <p className="rec-note">Ranked by what resists its types, then what hits it, then HP</p>
    </section>
  );
}
