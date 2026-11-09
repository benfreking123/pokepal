import { useMemo } from "react";
import { foeCardData, type Counter } from "../../shared/prep/foeCard";
import type { PrepFoe } from "../../shared/prep/score";
import { NO_FIELD } from "../../shared/typechart";
import type { ClientBundle, LiveBattle, SaveSummary } from "../../shared/types";
import { useRecMons } from "./BattleRecs";
import { Sprite } from "./Sprite";
import { TypeBadge } from "./TypeBadge";

export interface CardFoe extends PrepFoe { fainted?: boolean }

function CounterRow({ c, pc }: { c: Counter; pc?: boolean }) {
  return (
    <li className="foe-counter" title={c.pill?.text}>
      <strong>{c.mon.name}</strong> <small>Lv. {c.mon.level}</small>
      {c.pill ? <span className="rec-pill good">{c.pill.text}</span> : null}
      {pc ? <span className="rec-tag">{c.mon.box ?? "PC"}</span> : null}
    </li>
  );
}

export function FoeCards({ bundle, save, foes, fieldId, live, hiddenMore = false }: {
  bundle: ClientBundle; save: SaveSummary | null; foes: CardFoe[]; fieldId: string; live: LiveBattle | null; hiddenMore?: boolean;
}) {
  const overlay = bundle.overlays[fieldId] ?? NO_FIELD;
  const fieldName = fieldId === "NONE" ? "" : bundle.fields[fieldId]?.name ?? fieldId;
  const typeName = (t: string) => bundle.types.find((x) => x.id === t)?.name ?? t;
  const mons = useRecMons(save, live, bundle);
  const typeIds = useMemo(() => bundle.types.map((t) => t.id), [bundle.types]);
  const cards = useMemo(
    () => foes.map((foe) => ({ foe, data: mons ? foeCardData({ chart: bundle.chart, overlay, fieldName, typeName, typeIds, foe, ...mons }) : null })),
    [foes, mons, overlay], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <div className="foe-cards">
      {cards.map(({ foe, data }, i) => (
        <section key={`${foe.species}-${i}`} className={foe.fainted ? "foe-card fainted" : "foe-card"} title={foe.moves?.map((m) => m.label).join(", ")}>
          <div className="foe-card-top">
            <Sprite species={foe.species} form={foe.form} />
            <div className="foe-card-id">
              <strong>{foe.name}</strong>{foe.level !== null ? <small> Lv. {foe.level}</small> : null}
              <div>{foe.types.length ? foe.types.map((t) => <TypeBadge key={t} type={t} data={bundle} />) : <span className="type-badge" style={{ background: "var(--type-qmarks)" }}>???</span>}</div>
            </div>
          </div>
          {data && data.weaknesses.length ? (
            <div className="foe-weak" aria-label="Weak to">
              {data.weaknesses.map((w) => <TypeBadge key={w.type} type={w.type} data={bundle} suffix={`${w.x}×`} />)}
            </div>
          ) : null}
          {data?.unknown ? <p className="rec-note">Disguised, no pick</p> : null}
          {data && !data.unknown ? (
            <ul className="foe-best" aria-label="Your best">
              {data.best.map((c) => <CounterRow key={c.mon.uid} c={c} />)}
              {data.best.length === 0 ? <li className="rec-note">No healthy party member</li> : null}
              {data.pc ? <CounterRow c={data.pc} pc /> : null}
            </ul>
          ) : null}
          {!mons ? <p className="rec-note">Loading your save…</p> : null}
        </section>
      ))}
      {hiddenMore ? (
        <section className="foe-card foe-card-hidden" aria-label="Hidden Pokémon">
          <div className="foe-card-top"><Sprite species={null} form={0} /><div className="foe-card-id"><strong>?</strong><div className="muted">More hidden</div></div></div>
        </section>
      ) : null}
    </div>
  );
}
