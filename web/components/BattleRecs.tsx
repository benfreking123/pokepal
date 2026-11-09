import { useMemo } from "react";
import { baseStatTotal, formTypes, recommend, type RecMon, type RecResult } from "../../shared/prep/recommend";
import { toFoes, type PrepFoe } from "../../shared/prep/score";
import { NO_FIELD } from "../../shared/typechart";
import type { ClientBundle, LiveBattle, OwnedMon, SaveSummary, TrainerView } from "../../shared/types";
import { TypeBadge } from "./TypeBadge";

const formName = (b: ClientBundle, species: string, form: number) =>
  (b.species[species]?.forms.find((f) => f.form === form) ?? b.species[species]?.forms[0])?.name ?? species;

const ownedToRec = (m: OwnedMon, b: ClientBundle, box: string | null): RecMon => ({
  uid: m.uid, name: m.nickname ?? formName(b, m.species, m.form), level: m.level, types: formTypes(b, m.species, m.form), baseStatTotal: baseStatTotal(b, m.species, m.form), box,
});

function RecList({ title, result, bundle, empty }: { title: string; result: RecResult; bundle: ClientBundle; empty?: string }) {
  const show = (r: RecResult["party"][number], pc: boolean) => (
    <li key={r.mon.uid} className="rec">
      <strong>{r.mon.name}</strong> <small>Lv. {r.mon.level}{pc && r.mon.box ? ` · ${r.mon.box}` : ""}</small>{" "}
      {r.mon.types.map((t) => <TypeBadge key={t} type={t} data={bundle} />)}
      <div className="muted">{r.reason}</div>
    </li>
  );
  return (
    <section className="card recs">
      <h3>{title}</h3>
      {result.unknownFoes.length ? <p className="notice">{result.unknownFoes.join(" and ")} {result.unknownFoes.length > 1 ? "are" : "is"} disguised (Illusion), so there is no recommendation for {result.unknownFoes.length > 1 ? "them" : "it"}.</p> : null}
      {result.party.length ? <ol>{result.party.map((r) => show(r, false))}</ol> : <p className="muted">{empty ?? "No party member to rank."}</p>}
      {result.fainted.length ? <p className="muted">Fainted: {result.fainted.map((m) => m.name).join(", ")}</p> : null}
      {result.pc.length ? (
        <>
          <h4>Swap in at a PC</h4>
          <ol>{result.pc.map((r) => show(r, true))}</ol>
        </>
      ) : null}
    </section>
  );
}

export function BattleRecs({ bundle, save, view, fieldId, live, onRevealNext }: {
  bundle: ClientBundle; save: SaveSummary | null; view: TrainerView | null; fieldId: string; live: LiveBattle | null; onRevealNext?: () => void;
}) {
  const overlay = bundle.overlays[fieldId] ?? NO_FIELD;
  const fieldName = fieldId === "NONE" ? "" : bundle.fields[fieldId]?.name ?? fieldId;
  const typeName = (t: string) => bundle.types.find((x) => x.id === t)?.name ?? t;

  const mons = useMemo(() => {
    if (!save) return null;
    const pc = save.boxes.flatMap((b) => b.mons.filter((m) => !m.isEgg).map((m) => ownedToRec(m, bundle, b.name)));
    if (live) {
      const all = live.party.map((p, i) => ({ fainted: p.fainted, mon: { uid: `live-${i}`, name: p.nickname || formName(bundle, p.species, p.form), level: p.level, types: formTypes(bundle, p.species, p.form), baseStatTotal: baseStatTotal(bundle, p.species, p.form), box: null } }));
      return { party: all.filter((x) => !x.fainted).map((x) => x.mon), fainted: all.filter((x) => x.fainted).map((x) => x.mon), pc };
    }
    return { party: save.party.filter((m) => !m.isEgg).map((m) => ownedToRec(m, bundle, null)), fainted: [], pc };
  }, [save, live, bundle]);

  const teamFoes = useMemo(() => (view ? toFoes(view, bundle) : []), [view, bundle]);
  const outNow: PrepFoe[] = useMemo(
    () => (live ? live.foes.filter((f) => !f.fainted).map((f) => ({ name: f.name, species: f.species, form: f.form, level: f.level ?? null, types: f.types })) : []),
    [live],
  );

  const base = { chart: bundle.chart, overlay, fieldName, typeName };
  const now = useMemo(() => (mons && outNow.length ? recommend({ ...base, foes: outNow, ...mons }) : null), [mons, outNow, overlay]); // eslint-disable-line react-hooks/exhaustive-deps
  const team = useMemo(() => (mons && teamFoes.length ? recommend({ ...base, foes: teamFoes, ...mons }) : null), [mons, teamFoes, overlay]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!save) return <p className="muted">Loading your save…</p>;
  return (
    <div className="battle-recs">
      {fieldId !== "NONE" && !bundle.overlays[fieldId] ? <p className="notice">Field Notes not found yet, so this field's type rules are not used.</p> : null}
      {live && now ? <RecList title={`Best against ${outNow.map((f) => f.name).join(" and ")} (on the field now)`} result={now} bundle={bundle} /> : null}
      {live && outNow.length === 0 ? <p className="muted">No foe on the field right now.</p> : null}
      {team ? (
        <RecList title={`${live ? "Against their whole team" : `Best against ${view?.label ?? "this trainer"}`} (${teamFoes.length} Pokémon known)`} result={team} bundle={bundle} />
      ) : view && teamFoes.length === 0 ? <p className="notice">No Pokémon revealed yet, so there is nothing to suggest.{onRevealNext && view.partial ? <> <button onClick={onRevealNext}>Show one more</button> <a href="#settings-spoilers">Turn on full team</a></> : null}</p> : null}
      {view?.partial && teamFoes.length > 0 ? <p className="muted">Only the Pokémon you've seen are counted.{onRevealNext ? <> <button onClick={onRevealNext}>Show one more</button></> : null} <a href="#settings-spoilers">Turn on full team</a> to plan for the rest.</p> : null}
      <p className="muted">Types, field rules, levels and base stats only. Moves are never used.{live && live.field.id ? ` Field: ${fieldName || "none"}.` : ""}</p>
    </div>
  );
}

