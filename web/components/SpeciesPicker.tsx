import { useMemo, useState } from "react";
import type { GameData } from "../../shared/types";

export interface SpeciesChoice { species: string; form: number }

export function SpeciesPicker({ data, onPick }: { data: GameData; onPick: (choice: SpeciesChoice) => void }) {
  const [text, setText] = useState("");
  const options = useMemo(() => {
    const out = new Map<string, SpeciesChoice>();
    for (const s of Object.values(data.species)) {
      for (const f of s.forms) out.set(f.formName ? `${f.name} (${f.formName})` : f.name, { species: s.id, form: f.form });
    }
    return out;
  }, [data]);

  return (
    <label className="species-picker">
      Opposing Pokémon{" "}
      <input
        list="species-options"
        value={text}
        placeholder="Type a species"
        onChange={(e) => {
          setText(e.target.value);
          const choice = options.get(e.target.value);
          if (choice) onPick(choice);
        }}
      />
      <datalist id="species-options">
        {[...options.keys()].map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>
    </label>
  );
}
