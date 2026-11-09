import { useCallback, useEffect, useState } from "react";
import type { ClientBundle } from "../../shared/types";
import { REVEAL_OPTIONAL, revealStep, type WNItem, type WNLockedStep, type WNSource, type WNStep, type WhatsNextView } from "../../shared/whatsNext";
import { getJson } from "../api";
import { SpoilerChip } from "../components/SpoilerChip";

const KIND_LABEL = { sidequest: "Side quest", area: "Optional area", unlock: "Key item / unlock", battle: "Optional battle" } as const;

const hours = (s: number) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;

function Sources({ sources }: { sources: WNSource[] }) {
  const linked = sources.filter((s) => s.url);
  if (linked.length === 0) return null;
  return (
    <div className="wn-sources">
      {linked.map((s) => <a key={s.url} href={s.url!} target="_blank" rel="noreferrer">{s.label.replace(/^Reborn wiki: /, "")}</a>)}
    </div>
  );
}

function StepCard({ step, current }: { step: WNStep; current?: boolean }) {
  return (
    <div className={`card wn-step${current ? " wn-current" : ""}`}>
      <strong className="wn-title">{step.title}</strong>
      <ol className="wn-legs">
        {step.legs.map((l) => (
          <li key={l.where} className={`wn-leg wn-${l.state}`}>
            <span className="wn-leg-mark" aria-hidden>{l.state === "done" ? "✓" : l.state === "here" ? "●" : "○"}</span>
            <span><b>{l.where}</b>{l.state === "here" ? <em className="wn-here"> you are here</em> : null}<br /><span className="muted">{l.what}</span></span>
          </li>
        ))}
      </ol>
      <p className="muted wn-needs">{step.needs}</p>
      {step.gym ? (
        <p className="wn-context">
          {step.gym.number !== null ? `Badge ${step.gym.number}` : "Main battle"}
          {step.gym.bossName ? `: ${step.gym.bossName}` : ""}{step.gym.location ? ` (${step.gym.location})` : ""}
        </p>
      ) : null}
      {step.namedBattles?.length ? <p className="wn-context">Along the way: {step.namedBattles.join("; ")}</p> : null}
      {step.rewards?.length ? <p className="wn-context">Rewards: {step.rewards.join(", ")}</p> : null}
      <Sources sources={step.sources} />
    </div>
  );
}

function ItemRow({ item }: { item: WNItem }) {
  return (
    <li className={`card wn-item${item.done ? " wn-item-done" : ""}`}>
      <div className="wn-item-head">
        <span className="wn-check" aria-label={item.done ? "Done" : item.tracked ? "Not done yet" : "Not tracked in the save"}>{item.done ? "✓" : item.tracked ? "○" : "·"}</span>
        <strong>{item.title}</strong>
        <span className="chip wn-kind">{KIND_LABEL[item.kind]}</span>
        {item.lastChance ? <span className="chip wn-warn">Last chance before the next badge</span> : null}
      </div>
      <div><span className="muted">Start: </span>{item.where}</div>
      <div><span className="muted">Needs: </span>{item.needs}</div>
      <div className="muted">{item.hint}</div>
      {item.statusLabel ? <div className={item.done ? "wn-status wn-status-done" : "wn-status muted"}>{item.statusLabel}</div> : null}
      {item.namedBattles?.length ? <div className="wn-context">Battles: {item.namedBattles.join("; ")}</div> : null}
      <Sources sources={item.sources} />
    </li>
  );
}

export function WhatsNextTab({ bundle }: { bundle: ClientBundle }) {
  const [view, setView] = useState<WhatsNextView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<string[]>([]);
  const [showDone, setShowDone] = useState(false);
  const trainerContext = bundle.spoilers.trainerContext;

  const load = useCallback(() => {
    const q = reveal.length ? `?reveal=${encodeURIComponent(reveal.join(","))}` : "";
    getJson<WhatsNextView>(`/api/whats-next${q}`).then((v) => { setView(v); setError(null); }, (e: Error) => setError(e.message));
  }, [reveal]);

  useEffect(() => {
    load();
    // Polling instead of another EventSource: browsers allow ~6 connections per host and the dashboard's panels already hold several streams.
    const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 15_000);
    return () => clearInterval(timer);
  }, [load, trainerContext]);

  const add = (token: string) => setReveal((r) => (r.includes(token) ? r : [...r, token]));

  if (error) return <p className="notice warn" role="alert">{error}</p>;
  if (!view) return <p className="muted">Loading…</p>;
  const { progress } = view;

  return (
    <div className="wn">
      <div className="wn-summary">
        <span className="chip">{progress.badges} badge{progress.badges === 1 ? "" : "s"}</span>
        <span className="chip">{progress.mapName ?? "Unknown map"}</span>
        <span className="chip">{hours(progress.playtimeSeconds)} played</span>
        <SpoilerChip spoilers={bundle.spoilers} />
      </div>

      <h2>Main story</h2>
      {view.storyComplete ? <p className="notice">The main story is finished. Postgame quests are listed below.</p> : null}
      {view.current ? <StepCard step={view.current} current /> : null}
      {view.completedSteps.length ? (
        <div>
          <button className="wn-link" onClick={() => setShowDone((v) => !v)}>{showDone ? "Hide" : "Show"} {view.completedSteps.length} finished step{view.completedSteps.length === 1 ? "" : "s"}</button>
          {showDone ? <ul className="wn-done-list">{view.completedSteps.map((s) => <li key={s.id}>✓ {s.title}</li>)}</ul> : null}
        </div>
      ) : null}
      {view.ahead.map((s) => (s.locked ? <LockedStep key={s.id} step={s} onReveal={() => add(revealStep(s.id))} /> : <StepCard key={s.id} step={s} />))}
      {view.moreAhead > 0 ? <p className="muted">{view.moreAhead} more step{view.moreAhead === 1 ? "" : "s"} further ahead are hidden.</p> : null}

      <h2>Optional, available now ({view.optionalNow.length})</h2>
      {view.optionalNow.length === 0 ? <p className="muted">Nothing optional is open right now.</p> : <ul className="wn-list">{view.optionalNow.map((i) => <ItemRow key={i.id} item={i} />)}</ul>}

      {view.optionalDone.length ? (
        <>
          <h2>Done ({view.optionalDone.length})</h2>
          <ul className="wn-list">{view.optionalDone.map((i) => <ItemRow key={i.id} item={i} />)}</ul>
        </>
      ) : null}

      {view.optionalAhead.count > 0 ? (
        <>
          <h2>Later</h2>
          {view.optionalAhead.revealed
            ? <ul className="wn-list">{view.optionalAhead.items.map((i) => <ItemRow key={i.id} item={i} />)}</ul>
            : <div className="card wn-locked"><span className="muted">{view.optionalAhead.count} optional objectives open up later.</span> <button onClick={() => add(REVEAL_OPTIONAL)}>Reveal</button></div>}
        </>
      ) : null}
      <p className="muted wn-foot">· means the save does not record whether that item is done. Completion uses the game's own quest flags where they exist.</p>
    </div>
  );
}

function LockedStep({ onReveal }: { step: WNLockedStep; onReveal: () => void }) {
  return (
    <div className="card wn-locked">
      <span className="muted">A later step is hidden.</span> <button onClick={onReveal}>Reveal</button>
    </div>
  );
}
