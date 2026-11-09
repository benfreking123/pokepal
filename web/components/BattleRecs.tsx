import { useMemo } from "react";
import { baseStatTotal, formTypes, recommend, type RecMon, type RecResult, type Recommendation } from "../../shared/prep/recommend";
import { toFoes, type PrepFoe } from "../../shared/prep/score";
import { NO_FIELD } from "../../shared/typechart";
import type { ClientBundle, LiveBattle, OwnedMon, SaveSummary, TrainerView } from "../../shared/types";
import { IncomingFoe } from "./IncomingFoe";
import { TypeBadge } from "./TypeBadge";

const formName = (b: ClientBundle, species: string, form: number) =>
  (b.species[species]?.forms.find((f) => f.form === form) ?? b.species[species]?.forms[0])?.name ?? species;

const ownedToRec = (m: OwnedMon, b: ClientBundle, box: string | null): RecMon => ({
  uid: m.uid, name: m.nickname ?? formName(b, m.species, m.form), level: m.level, types: formTypes(b, m.species, m.form), baseStatTotal: baseStatTotal(b, m.species, m.form), box,
});

function RecRow({ r, bundle, pc }: { r: Recommendation; bundle: ClientBundle; pc: boolean }) {
  return (
    <li className="rec-row" title={r.reason}>
      <span className="rec-mon">
        <strong>{r.mon.name}</strong> <small>Lv. {r.mon.level}</small>
        {r.mon.types.map((t) => <TypeBadge key={t} type={t} data={bundle} />)}
      </span>
      <span className="rec-pills">
        {r.pills.map((p) => <span key={p.text} className={`rec-pill ${p.kind}`}>{p.text}</span>)}
        {pc && r.mon.box ? <span className="rec-tag">{r.mon.box}</span> : null}
      </span>
    </li>
  );
}

function RecList({ title, result, bundle }: { title: string; result: RecResult; bundle: ClientBundle }) {
  return (
    <section className="card recs">
      <h3 className="rec-head">{title}</h3>
      {result.unknownFoes.length ? <p className="rec-note">{result.unknownFoes.join(", ")}: disguised (Illusion), no pick</p> : null}
      {result.party.length ? <ul className="rec-list">{result.party.map((r) => <RecRow key={r.mon.uid} r={r} bundle={bundle} pc={false} />)}</ul> : <p className="rec-note">No party member to rank.</p>}
      {result.fainted.length ? <p className="rec-note">Fainted: {result.fainted.map((m) => m.name).join(", ")}</p> : null}
      {result.pc.length ? (
        <>
          <h4 className="rec-head rec-head-pc">Swap in at a PC</h4>
          <ul className="rec-list">{result.pc.map((r) => <RecRow key={r.mon.uid} r={r} bundle={bundle} pc />)}</ul>
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

  const incomingCard = live?.incoming ? <IncomingFoe bundle={bundle} live={live} fieldId={fieldId} /> : null;
  if (!save) return <>{incomingCard}<p className="muted">Loading your save…</p></>;
  return (
    <div className="battle-recs">
      {incomingCard}
      {fieldId !== "NONE" && !bundle.overlays[fieldId] ? <p className="notice">Field Notes not found yet, so this field's type rules are not used.</p> : null}
      {live && now ? <RecList title={`On the field: ${outNow.map((f) => f.name).join(" + ")}`} result={now} bundle={bundle} /> : null}
      {live && outNow.length === 0 ? <p className="rec-note">No foe on the field right now.</p> : null}
      {team ? (
        <RecList title={`${live ? "Whole team" : `vs ${view?.label ?? "this trainer"}`} · ${teamFoes.length} known`} result={team} bundle={bundle} />
      ) : view && teamFoes.length === 0 ? <p className="notice">No Pokémon revealed yet, so there is nothing to suggest.{onRevealNext && view.partial ? <> <button onClick={onRevealNext}>Show one more</button> <a href="#settings-spoilers">Turn on full team</a></> : null}</p> : null}
      {view?.partial && teamFoes.length > 0 ? <p className="rec-note">Only seen Pokémon counted.{onRevealNext ? <> <button onClick={onRevealNext}>Show one more</button></> : null} <a href="#settings-spoilers">Full team</a></p> : null}
      <p className="rec-note">Types, field, levels, base stats only{fieldName ? ` · ${fieldName}` : ""}</p>
    </div>
  );
}

