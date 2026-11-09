import type { FieldOverlay, GameData } from "../../shared/types";

const orList = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function describeOverlay(o: FieldOverlay, data: GameData): string[] {
  const name = (id: string) => data.types.find((t) => t.id === id)?.name ?? id;
  const lines: string[] = [];
  if (o.invert) lines.push("Type matchups are inverted: immunities and resistances become weaknesses, and weaknesses become resistances.");
  for (const r of o.moveTypeRemap ?? []) lines.push(`${name(r.from)} moves become ${name(r.to)}.`);
  for (const r of o.secondaryTypes ?? []) {
    const who = capitalize([r.match.category, r.match.moveType ? name(r.match.moveType) : null].filter(Boolean).join(" ")) || "Matching";
    const ids = r.match.moveIds ? ` (${r.match.moveIds.join(", ")})` : "";
    lines.push(r.addType ? `${who} moves${ids} also count as ${name(r.addType)}.` : `${who} moves${ids} also count as one of ${orList((r.oneOf ?? []).map(name))} (varies).`);
  }
  for (const t of o.failingMoveTypes ?? []) lines.push(`${name(t)} moves fail.`);
  for (const b of o.typeBoosts ?? []) lines.push(`${name(b.type)} moves have ${b.factor}× power.`);
  lines.push(...o.notes);
  return lines;
}

export function FieldPicker({ data, hidden, value, onChange }: { data: GameData; hidden: string[]; value: string; onChange: (fieldId: string) => void }) {
  const fields = Object.values(data.fields).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <label className="field-picker">
      Field{" "}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="NONE">No field</option>
        {fields.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
            {hidden.includes(f.id) ? " (Field Notes not found yet)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
