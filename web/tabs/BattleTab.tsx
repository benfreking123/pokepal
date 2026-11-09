import { useState } from "react";
import { NO_FIELD } from "../../shared/typechart";
import { liveBattleToShow, type BattleStream } from "../battleStream";
import type { ClientBundle } from "../../shared/types";
import { BattleBanners } from "../components/BattleBanners";
import { describeOverlay, FieldPicker } from "../components/FieldPicker";
import { FoePanel } from "../components/FoePanel";
import { LiveBattleView } from "../components/LiveBattleView";
import { SpeciesPicker, type SpeciesChoice } from "../components/SpeciesPicker";
import { SpoilerChip } from "../components/SpoilerChip";

export function BattleTab({ bundle, stream }: { bundle: ClientBundle; stream: BattleStream }) {
  const [choice, setChoice] = useState<SpeciesChoice | null>(null);
  const [fieldId, setFieldId] = useState("NONE");
  const overlay = bundle.overlays[fieldId] ?? NO_FIELD;
  const hidden = bundle.hiddenFields.includes(fieldId);
  const form = choice ? bundle.species[choice.species]?.forms[choice.form] : null;
  const live = liveBattleToShow(stream);
  const resumable = stream.live && stream.activeId === stream.live.battleId && stream.manualFor === stream.live.battleId ? stream.live : null;

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
      {live ? (
        <LiveBattleView bundle={bundle} live={live} />
      ) : (
        <>
          <div className="toolbar">
            <SpeciesPicker data={bundle} onPick={setChoice} />
            <FieldPicker data={bundle} hidden={bundle.hiddenFields} value={fieldId} onChange={setFieldId} />
          </div>
          <details className="card">
            <summary>Field rules</summary>
            {hidden ? (
              <p>Field Notes not found yet.</p>
            ) : (
              <ul className="overlay-rules">
                {describeOverlay(overlay, bundle).map((line, i) => (<li key={i}>{line}</li>))}
                {describeOverlay(overlay, bundle).length === 0 ? <li>No special type rules.</li> : null}
              </ul>
            )}
          </details>
          {form && choice ? (
            <FoePanel data={bundle} overlay={overlay} foe={{ name: form.name, species: choice.species, form: choice.form, level: null, types: form.types }} />
          ) : (
            <p className="notice">Pick an opposing Pokémon to see what hits it.</p>
          )}
        </>
      )}
    </div>
  );
}
