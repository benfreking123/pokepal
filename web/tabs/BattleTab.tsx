import { useState } from "react";
import { NO_FIELD } from "../../shared/typechart";
import { liveFieldId } from "../../shared/live";
import { liveBattleToShow, type BattleStream } from "../battleStream";
import type { ClientBundle } from "../../shared/types";
import { BattleBanners } from "../components/BattleBanners";
import { BattleRecs } from "../components/BattleRecs";
import { describeOverlay, FieldPicker } from "../components/FieldPicker";
import { FoePanel } from "../components/FoePanel";
import { LiveBattleView } from "../components/LiveBattleView";
import { SpeciesPicker, type SpeciesChoice } from "../components/SpeciesPicker";
import { SpoilerChip } from "../components/SpoilerChip";
import { TrainerPicker } from "../components/TrainerPicker";
import { useSave } from "../useSave";
import { useTrainerSelection } from "../useTrainerSelection";

export function BattleTab({ bundle, stream }: { bundle: ClientBundle; stream: BattleStream }) {
  const [choice, setChoice] = useState<SpeciesChoice | null>(null);
  const shown = liveBattleToShow(stream);
  const live = shown && shown.state === "active" ? shown : null;
  const activeBattle = stream.live && stream.live.state === "active" ? stream.live : null;
  const resumable = activeBattle && stream.activeId === activeBattle.battleId && stream.manualFor === activeBattle.battleId ? activeBattle : null;

  const sel = useTrainerSelection(bundle, activeBattle);
  const { save, error: saveError } = useSave();
  const error = sel.error ?? saveError;
  const fieldId = live ? liveFieldId(live.field.id) : sel.fieldId;
  const overlay = bundle.overlays[fieldId] ?? NO_FIELD;
  const hidden = bundle.hiddenFields.includes(fieldId);
  const form = choice ? bundle.species[choice.species]?.forms[choice.form] : null;
  const { boss, view, trainerKey } = sel;

  return (
    <div>
      <div className="toolbar">
        <SpoilerChip spoilers={bundle.spoilers} />
        {live ? (
          <>
            <span className="chip live-chip">Live</span>
            <button onClick={() => stream.setManual(live.battleId)}>Manual</button>
          </>
        ) : resumable ? (
          <button onClick={() => stream.setManual(null)}>Back to live battle</button>
        ) : null}
      </div>
      <BattleBanners stream={stream} />
      {error ? <p className="notice warn" role="alert">{error}</p> : null}
      {live ? (
        <>
          <LiveBattleView bundle={bundle} live={live} />
          {sel.otherParties.length > 1 ? (
            <div className="toolbar">
              {sel.otherParties.map((t) => <button key={t.key} aria-pressed={t.key === trainerKey} onClick={() => sel.switchParty(t.key)}>Team {t.partyId}</button>)}
            </div>
          ) : null}
          <BattleRecs bundle={bundle} save={save} view={view} fieldId={fieldId} live={live} onRevealNext={sel.revealNext} />
        </>
      ) : (
        <>
          <TrainerPicker bundle={bundle} trainerKey={trainerKey} onPick={sel.pick} />
          {trainerKey ? (
            <>
              <div className="toolbar">
                {boss && boss.variants.length > 1 ? (
                  <label>
                    Variant{" "}
                    <select value={trainerKey} onChange={(e) => sel.chooseVariant(e.target.value)}>
                      {boss.variants.map((v) => <option key={v.trainerKey} value={v.trainerKey}>{v.label || v.trainerKey}</option>)}
                    </select>
                  </label>
                ) : null}
                <FieldPicker data={bundle} hidden={bundle.hiddenFields} value={sel.fieldId} onChange={sel.setFieldId} />
                {boss && sel.fieldId !== boss.fieldId ? <a href="#battle" onClick={(e) => { e.preventDefault(); sel.setFieldId(boss.fieldId); }}>Reset to boss field</a> : null}
              </div>
              {boss?.context?.notes.length ? <ul className="overlay-rules">{boss.context.notes.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}
              {view ? <BattleRecs bundle={bundle} save={save} view={view} fieldId={fieldId} live={null} onRevealNext={sel.revealNext} /> : <p>Loading…</p>}
            </>
          ) : <p className="notice">Pick the trainer you are about to fight to see which Pokémon to use.</p>}
          <details className="card">
            <summary>Look up a single Pokémon</summary>
            <div className="toolbar">
              <SpeciesPicker data={bundle} onPick={setChoice} />
            </div>
            <ul className="overlay-rules">
              {hidden ? <li>Field Notes not found yet.</li> : describeOverlay(overlay, bundle).map((line, i) => (<li key={i}>{line}</li>))}
            </ul>
            {form && choice ? (
              <FoePanel data={bundle} overlay={overlay} foe={{ name: form.name, species: choice.species, form: choice.form, level: null, types: form.types }} />
            ) : (
              <p className="notice">Pick an opposing Pokémon to see what hits it.</p>
            )}
          </details>
        </>
      )}
    </div>
  );
}
