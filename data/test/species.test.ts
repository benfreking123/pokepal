import { describe, expect, it } from "vitest";
import { extractSpecies } from "../src/extract/species";
import { loadReal, REAL } from "./real";

it("merges alternate forms over the base form", () => {
  const out = extractSpecies({
    RAICHU: {
      "Normal Form": { name: "Raichu", dexnum: 26, Type1: "ELECTRIC", BaseStats: [60, 90, 55, 110, 90, 80], Abilities: ["STATIC"], HiddenAbility: "LIGHTNINGROD" },
      "Alolan Form": { Type2: "PSYCHIC", BaseStats: [60, 85, 50, 95, 85, 110], Abilities: ["SURGESURFER"], HiddenAbility: "SURGESURFER" },
      OnCreation: { $ruby: "proc {}" },
      PulseForm: { "PULSE Form": 1 },
    },
  });
  expect(out.RAICHU).toEqual({
    id: "RAICHU",
    dexNum: 26,
    forms: [
      { form: 0, formName: null, name: "Raichu", types: ["ELECTRIC"], baseStats: [60, 90, 55, 110, 90, 80], abilities: ["STATIC"], hiddenAbility: "LIGHTNINGROD" },
      { form: 1, formName: "Alolan Form", name: "Raichu", types: ["ELECTRIC", "PSYCHIC"], baseStats: [60, 85, 50, 95, 85, 110], abilities: ["SURGESURFER"], hiddenAbility: "SURGESURFER" },
    ],
  });
});

describe.runIf(REAL)("real install", () => {
  it("extracts Bulbasaur and Alolan Raichu", async () => {
    const out = extractSpecies(await loadReal("species"));
    expect(Object.keys(out).length).toBeGreaterThan(800);
    expect(out.BULBASAUR.dexNum).toBe(1);
    expect(out.BULBASAUR.forms[0].types).toEqual(["GRASS", "POISON"]);
    expect(out.BULBASAUR.forms[0].baseStats).toEqual([45, 49, 49, 65, 65, 45]);
    expect(out.RAICHU.forms[1].formName).toBe("Alolan Form");
    expect(out.RAICHU.forms[1].types).toEqual(["ELECTRIC", "PSYCHIC"]);
    expect(out.RAICHU.forms[1].baseStats).toEqual([60, 85, 50, 95, 85, 110]);
  });
});
