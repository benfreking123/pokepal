import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildMatrix, pickTeam } from "../../shared/prep/pick";
import { describeReason, ignoredLine } from "../../shared/prep/explain";
import { toCandidate, toFoes } from "../../shared/prep/score";
import { searchTrainers } from "../../shared/prep/trainers";
import { teamToShowdown } from "../../shared/showdown";
import { liveFieldId } from "../../shared/live";
import { NO_FIELD } from "../../shared/typechart";
import type { ClientBundle, SaveSummary, TrainerView } from "../../shared/types";
import { getJson, sendJson } from "../api";
import type { BattleStream } from "../battleStream";
import { BattleBanners } from "../components/BattleBanners";
import { CopyButton } from "../components/CopyButton";
import { FieldPicker } from "../components/FieldPicker";
import { SpoilerChip } from "../components/SpoilerChip";
import { TypeBadge } from "../components/TypeBadge";

export function PrepTab({ bundle, stream }: { bundle: ClientBundle; stream: BattleStream }) {
  const [query, setQuery] = useState("");
  const [trainerKey, setTrainerKey] = useState<string | null>(null);
  const [fieldId, setFieldId] = useState("NONE");
  const [view, setView] = useState<TrainerView | null>(null);
  const [save, setSave] = useState<SaveSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [exportText, setExportText] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [fromBattle, setFromBattle] = useState<{ battleId: string; exact: boolean } | null>(null);
  const manualBattle = useRef<string | null>(null);
  const live = stream.live && stream.live.state === "active" ? stream.live : null;

  const hits = useMemo(() => searchTrainers(bundle.trainerIndex, bundle.bosses, query, 50), [bundle.trainerIndex, bundle.bosses, query]);
  const partyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of bundle.trainerIndex) counts.set(`${t.trainerType}:${t.name}`, (counts.get(`${t.trainerType}:${t.name}`) ?? 0) + 1);
    return counts;
  }, [bundle.trainerIndex]);
  const boss = useMemo(() => bundle.bosses.find((b) => b.variants.some((v) => v.trainerKey === trainerKey)) ?? null, [bundle.bosses, trainerKey]);

  const loadSave = useCallback(() => {
    getJson<SaveSummary>("/api/save/summary").then((s) => { setSave(s); setError(null); }, (e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    loadSave();
    const es = new EventSource("/api/save/stream");
    es.addEventListener("save-changed", loadSave);
    return () => es.close();
  }, [loadSave]);

  useEffect(() => {
    setView(null);
    if (!trainerKey) return;
    getJson<TrainerView>(`/api/trainers/${encodeURIComponent(trainerKey)}`).then(setView, (e: Error) => setError(e.message));
  }, [trainerKey, bundle.spoilers]);

  const liveBattleId = live?.battleId ?? null;
  const liveMatchKey = live?.match?.key ?? null;
  const liveExact = live?.match?.exact ?? true;
  const liveField = live?.field.id ?? null;
  useEffect(() => {
    if (!liveBattleId || !liveMatchKey || manualBattle.current === liveBattleId) return;
    setTrainerKey(liveMatchKey);
    setFieldId(liveField ? liveFieldId(liveField) : "NONE");
    setFromBattle({ battleId: liveBattleId, exact: liveExact });
  }, [liveBattleId, liveMatchKey, liveExact, liveField]);

  const pick = (key: string) => {
    manualBattle.current = liveBattleId;
    setFromBattle(null);
    setTrainerKey(key);
    const b = bundle.bosses.find((x) => x.variants.some((v) => v.trainerKey === key));
    setFieldId(b?.fieldId ?? "NONE");
  };
  const otherParties = fromBattle && !fromBattle.exact && trainerKey
    ? bundle.trainerIndex.filter((t) => {
        const cur = bundle.trainerIndex.find((x) => x.key === trainerKey);
        return cur && t.trainerType === cur.trainerType && t.name === cur.name;
      })
    : [];
  const revealNext = () => {
    if (!trainerKey) return;
    sendJson<TrainerView>("POST", `/api/trainers/${encodeURIComponent(trainerKey)}/reveal-next`).then(setView, (e: Error) => setError(e.message));
  };

  const overlay = bundle.overlays[fieldId] ?? NO_FIELD;
  const fieldHidden = bundle.hiddenFields.includes(fieldId);
  const foes = useMemo(() => (view ? toFoes(view, bundle) : []), [view, bundle]);
  const mons = useMemo(() => (save ? [...save.party, ...save.boxes.flatMap((b) => b.mons)] : []), [save]);
  const candidates = useMemo(() => mons.map((m) => toCandidate(m, bundle)).filter((c) => c !== null), [mons, bundle]);
  const result = useMemo(() => {
    if (foes.length === 0 || candidates.length === 0) return null;
    const matrix = buildMatrix(bundle.chart, overlay, candidates, foes);
    return { matrix, ...pickTeam(candidates, foes.length, matrix, { locked, excluded }) };
  }, [foes, candidates, bundle.chart, overlay, locked, excluded]);

  const typeName = (t: string) => bundle.types.find((x) => x.id === t)?.name ?? t;
  const monName = (uid: string) => candidates.find((c) => c.uid === uid)?.name ?? uid;
  const toggle = (list: string[], set: (v: string[]) => void, other: string[], setOther: (v: string[]) => void, uid: string) => {
    set(list.includes(uid) ? list.filter((u) => u !== uid) : [...list, uid]);
    setOther(other.filter((u) => u !== uid));
  };
  const s = bundle.spoilers;

  return (
    <div>
      <div className="toolbar"><SpoilerChip spoilers={s} /></div>
      <BattleBanners stream={stream} />
      {error ? <p className="notice warn" role="alert">{error}</p> : null}
      {live && live.trainer && !live.match ? <p className="notice">This battle's trainer isn't in the data.</p> : null}
      <section className="card">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search trainers (name, type or boss)" aria-label="Search trainers" style={{ width: "100%" }} />
        <ul className="prep-results">
          {hits.map(({ entry, boss: b }) => {
            const parties = partyCounts.get(`${entry.trainerType}:${entry.name}`) ?? 1;
            return (
              <li key={entry.key}>
                <button className={entry.key === trainerKey ? "active" : ""} onClick={() => pick(entry.key)}>
                  {b ? <strong>{b.name}</strong> : entry.label}
                  {parties > 1 ? ` · team ${entry.partyId}` : ""}
                  {entry.maxLevel !== undefined ? ` · up to Lv. ${entry.maxLevel}` : ""}
                  {b?.context?.location ? ` · ${b.context.location}` : ""}
                </button>
              </li>
            );
          })}
          {hits.length === 0 ? <li className="muted">No trainers match.</li> : null}
        </ul>
      </section>

      {trainerKey ? (
        <>
          {fromBattle && live?.battleId === fromBattle.battleId ? (
            <div className="toolbar">
              <span className="chip live-chip">{fromBattle.exact ? "From the current battle" : "From the current battle (best guess)"}</span>
              {otherParties.length > 1 ? otherParties.map((t) => (
                <button key={t.key} aria-pressed={t.key === trainerKey} onClick={() => { manualBattle.current = fromBattle.battleId; setTrainerKey(t.key); }}>Team {t.partyId}</button>
              )) : null}
            </div>
          ) : null}
          <div className="toolbar">
            {boss && boss.variants.length > 1 ? (
              <label>
                Variant{" "}
                <select value={trainerKey} onChange={(e) => { manualBattle.current = liveBattleId; setFromBattle(null); setTrainerKey(e.target.value); }}>
                  {boss.variants.map((v) => <option key={v.trainerKey} value={v.trainerKey}>{v.label || v.trainerKey}</option>)}
                </select>
              </label>
            ) : null}
            <FieldPicker data={bundle} hidden={bundle.hiddenFields} value={fieldId} onChange={setFieldId} />
            {boss && fieldId !== boss.fieldId ? <a href="#prep" onClick={(e) => { e.preventDefault(); setFieldId(boss.fieldId); }}>Reset to boss field</a> : null}
          </div>
          {fieldHidden ? <p className="notice">Field Notes not found yet, so this field's type rules are not used.</p> : null}
          {boss?.context?.notes.length ? <ul className="overlay-rules">{boss.context.notes.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}

          <h2>Their team</h2>
          {view ? (
            <>
              <div className="grid">
                {foes.map((f, i) => (
                  <section key={`${view.mons[i]?.slot ?? i}`} className="card">
                    <strong>{f.name}</strong>{f.level !== null ? <small> Lv. {f.level}</small> : null}
                    <div>{f.types.map((t) => <TypeBadge key={t} type={t} data={bundle} />)}</div>
                    {f.moves ? <p className="muted">{f.moves.map((m) => m.label).join(", ")}</p> : null}
                    {f.ability !== undefined ? <p className="muted">Ability: {f.ability ? bundle.abilities[f.ability]?.name ?? f.ability : "Unknown"}</p> : null}
                    {f.item !== undefined ? <p className="muted">Item: {f.item ? bundle.items[f.item]?.name ?? f.item : "None"}</p> : null}
                  </section>
                ))}
              </div>
              {view.partial ? (
                <p className="notice">
                  Other Pokémon hidden (full team is off).{" "}
                  <button onClick={revealNext}>Show one more</button>{" "}
                  <a href="#settings-spoilers">Turn on full team</a>
                </p>
              ) : null}
            </>
          ) : <p>Loading…</p>}

          {view && foes.length === 0 ? <p className="notice">No Pokémon seen yet, so there is nothing to suggest.</p> : null}
          {!save && !error ? <p>Loading your save…</p> : null}
          {result ? (
            <>
              <h2>Suggested team</h2>
              <div className="grid">
                {result.team.map((uid) => {
                  const c = candidates.find((x) => x.uid === uid)!;
                  return (
                    <section key={uid} className="card">
                      <strong>{c.name}</strong> <small>Lv. {c.level}</small>
                      <div>{c.types.map((t) => <TypeBadge key={t} type={t} data={bundle} />)}</div>
                      <ul className="mon-moves">
                        {(result.reasons[uid] ?? []).map((r) => <li key={r.foeIndex}>{describeReason(foes[r.foeIndex], r.detail, typeName)}</li>)}
                        {(result.reasons[uid] ?? []).length === 0 ? <li className="muted">Backup: no foe where this is the best answer.</li> : null}
                      </ul>
                      <div className="toolbar">
                        <button aria-pressed={locked.includes(uid)} onClick={() => toggle(locked, setLocked, excluded, setExcluded, uid)}>{locked.includes(uid) ? "Locked" : "Lock"}</button>
                        <button onClick={() => toggle(excluded, setExcluded, locked, setLocked, uid)}>Exclude</button>
                      </div>
                    </section>
                  );
                })}
              </div>
              {excluded.length ? (
                <p className="muted">Excluded: {excluded.map((u) => <button key={u} onClick={() => setExcluded(excluded.filter((x) => x !== u))}>{monName(u)} ×</button>)}</p>
              ) : null}
              <div className="toolbar">
                <button onClick={() => setExportText(teamToShowdown(result.team.map((u) => mons.find((m) => m.uid === u)!).sort((a, b) => a.order - b.order), bundle))}>Export these six</button>
              </div>
              <details className="card">
                <summary>Alternates</summary>
                {foes.map((f, i) => (
                  <p key={i}>
                    <strong>{f.name}</strong>: {result.alternates[i].length
                      ? result.alternates[i].map((a) => `${monName(a.uid)} (${a.value.toFixed(1)})`).join(", ")
                      : "none"}
                  </p>
                ))}
              </details>
              <p className="muted">
                {ignoredLine({ moves: !!s.opponentMoves, abilities: !!s.opponentAbilities, items: !!s.opponentItems, levels: !!s.opponentLevels, fullTeam: !!s.opponentFullTeam, seen: view?.mons.length ?? 0, partial: view?.partial ?? false })}
                {boss?.context?.notes.length ? ` ${boss.context.notes.join(" ")}` : ""}
              </p>
            </>
          ) : null}
          {save && candidates.length === 0 && foes.length > 0 ? <p className="notice">No Pokémon found in the save.</p> : null}
        </>
      ) : <p className="notice">Pick a trainer to get a suggested six.</p>}

      {exportText !== null ? (
        <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="Showdown export">
          <div className="dialog">
            <h3>Showdown export</h3>
            <textarea ref={textareaRef} readOnly rows={16} value={exportText} style={{ width: "100%" }} />
            <div className="toolbar"><CopyButton text={exportText} textareaRef={textareaRef} /><button onClick={() => setExportText(null)}>Close</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
