import { useEffect, useMemo, useState } from "react";
import { assignFoeMons, foesKey, liveFieldId, liveFoeTypes } from "../../shared/live";
import { NO_FIELD } from "../../shared/typechart";
import type { ClientBundle, LiveBattle, TrainerView } from "../../shared/types";
import { getJson } from "../api";
import { describeOverlay } from "./FieldPicker";
import { FoePanel } from "./FoePanel";
import { TypeBadge } from "./TypeBadge";

const timeOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString();
};

export function LiveBattleView({ bundle, live }: { bundle: ClientBundle; live: LiveBattle }) {
  const s = bundle.spoilers;
  const wantsDetails = s.opponentMoves || s.opponentAbilities || s.opponentItems || s.opponentFullTeam;
  const matchKey = live.match?.key ?? null;
  const [view, setView] = useState<TrainerView | null>(null);
  const foeIdentity = foesKey(live.foes);

  useEffect(() => {
    setView(null);
    if (!matchKey || !wantsDetails) return;
    let cancelled = false;
    getJson<TrainerView>(`/api/trainers/${encodeURIComponent(matchKey)}`).then((v) => { if (!cancelled) setView(v); }, () => {});
    return () => { cancelled = true; };
  }, [matchKey, wantsDetails, live.battleId, foeIdentity, bundle.spoilers]);

  const fieldId = liveFieldId(live.field.id);
  const known = fieldId === "NONE" || bundle.fields[fieldId] !== undefined;
  const hidden = bundle.hiddenFields.includes(fieldId);
  const overlay = bundle.overlays[fieldId] ?? NO_FIELD;
  const fieldName = fieldId === "NONE" ? "No field" : bundle.fields[fieldId]?.name ?? (live.field.name || live.field.id);
  const ruleLines = hidden ? [] : describeOverlay(overlay, bundle);
  const ended = live.state === "ended";

  const assignment = useMemo(() => (view ? assignFoeMons(live.foes, view.mons) : []), [view, live.foes]);
  const stillToCome = view && s.opponentFullTeam ? view.mons.filter((_, i) => !assignment.includes(i)) : [];
  const active = live.party.filter((p) => p.active);
  const speciesName = (id: string) => bundle.species[id]?.forms[0]?.name ?? id;

  return (
    <div className={ended ? "live ended" : "live"}>
      <section className="card">
        <h2>
          {fieldName}
          {!known ? <> <span className="pill">not in data</span></> : null}
        </h2>
        {hidden ? (
          <p>Field Notes not found yet.</p>
        ) : (
          <ul className="overlay-rules">
            {ruleLines.map((line, i) => (<li key={i}>{line}</li>))}
            {ruleLines.length === 0 ? <li>No special type rules.</li> : null}
          </ul>
        )}
        <p className="muted">
          {ended ? "Battle ended. " : ""}Last update: {timeOf(live.updatedAt)}
        </p>
      </section>

      {live.foes.length === 0 ? <p className="notice">Waiting for the opposing Pokémon…</p> : null}
      <div className={live.foes.length > 1 ? "grid live-foes" : "live-foes"}>
        {live.foes.map((f, i) => {
          const slot = assignment[i];
          const details = slot !== null && slot !== undefined ? view?.mons[slot] : undefined;
          return (
            <div key={f.slot} className={f.fainted ? "fainted" : undefined}>
              <FoePanel
                data={bundle}
                overlay={overlay}
                foe={{ name: f.name, species: f.species, form: f.form, level: f.level ?? null, types: liveFoeTypes(f, bundle), hpPercent: f.hpPercent }}
                details={details}
              />
            </div>
          );
        })}
      </div>

      {stillToCome.length > 0 ? (
        <section className="card">
          <strong>Still to come</strong>
          <ul className="mon-moves">
            {stillToCome.map((m) => (
              <li key={m.slot}>
                {speciesName(m.species)}{m.level !== undefined ? ` Lv. ${m.level}` : ""}
                {m.moves ? ` · ${m.moves.map((id) => bundle.moves[id]?.name ?? id).join(", ")}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {active.length > 0 ? (
        <section className="card live-party">
          <strong>Your side</strong>
          {active.map((p, i) => (
            <div key={i} className="live-party-mon">
              {p.nickname || speciesName(p.species)} <small>Lv. {p.level}</small>
              {(bundle.species[p.species]?.forms.find((f) => f.form === p.form) ?? bundle.species[p.species]?.forms[0])?.types.map((t) => <TypeBadge key={t} type={t} data={bundle} />)}
              <div className="hp-bar" aria-label={`HP ${p.hpPercent}%`}><div style={{ width: `${p.hpPercent}%` }} /></div>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
