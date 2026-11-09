import { useState } from "react";
import { changedCells, NO_FIELD, typeVsType } from "../../shared/typechart";
import type { ClientBundle } from "../../shared/types";
import { describeOverlay, FieldPicker } from "../components/FieldPicker";
import { SpoilerChip } from "../components/SpoilerChip";
import { TypeBadge } from "../components/TypeBadge";

const show = (m: number) => (m === 0 ? "0" : m === 0.5 ? "½" : m === 2 ? "2" : m === 1 ? "" : String(m));
const x = (m: number) => `${m === 0.5 ? "½" : m}×`;

export function TypeChartTab({ bundle }: { bundle: ClientBundle }) {
  const [fieldId, setFieldId] = useState("NONE");
  const overlay = bundle.overlays[fieldId] ?? NO_FIELD;
  const hidden = bundle.hiddenFields.includes(fieldId);
  const ids = bundle.types.map((t) => t.id);
  const changed = changedCells(bundle.chart, ids, overlay);
  const fieldName = bundle.fields[fieldId]?.name ?? "No field";

  return (
    <div>
      <div className="toolbar">
        <SpoilerChip spoilers={bundle.spoilers} />
        <FieldPicker data={bundle} hidden={bundle.hiddenFields} value={fieldId} onChange={setFieldId} />
      </div>
      {hidden ? (
        <p className="notice">
          Field Notes not found yet: showing the normal chart. Turn on 'Field effect details' in Settings → Spoilers to see this field's rules.
        </p>
      ) : null}
      <div className="chart-scroll">
        <table className="type-chart">
          <thead>
            <tr>
              <th>Atk ↓ / Def →</th>
              {bundle.types.map((t) => (
                <th key={t.id} title={t.name}>{t.name.slice(0, 3)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bundle.types.map((atk) => (
              <tr key={atk.id}>
                <th><TypeBadge type={atk.id} data={bundle} /></th>
                {bundle.types.map((def) => {
                  const value = typeVsType(bundle.chart, atk.id, def.id, overlay);
                  const isChanged = changed.has(`${atk.id}>${def.id}`);
                  const cls = [value === 0 ? "cell-0" : value === 0.5 ? "cell-half" : value === 2 ? "cell-2" : "", isChanged ? "cell-changed" : ""].join(" ").trim();
                  const base = typeVsType(bundle.chart, atk.id, def.id);
                  return (
                    <td key={def.id} className={cls} title={isChanged ? `${fieldName}: ${x(value)} (base ${x(base)})` : undefined}>
                      {show(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!hidden ? (
        <>
          <ul className="overlay-rules">
            {describeOverlay(overlay, bundle).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <p className="source">Source: {overlay.source}</p>
        </>
      ) : null}
    </div>
  );
}
