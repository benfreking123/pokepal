import { expect, it } from "vitest";
import { teamToShowdown, toShowdown } from "../shared/showdown";
import type { OwnedMon } from "../shared/types";

const data = {
  species: {
    LUCARIO: { id: "LUCARIO", dexNum: 448, forms: [{ form: 0, formName: null, name: "Lucario", types: ["FIGHTING", "STEEL"], baseStats: [], abilities: [], hiddenAbility: null }] },
    RAICHU: { id: "RAICHU", dexNum: 26, forms: [
      { form: 0, formName: null, name: "Raichu", types: ["ELECTRIC"], baseStats: [], abilities: [], hiddenAbility: null },
      { form: 1, formName: "Alolan Form", name: "Raichu", types: ["ELECTRIC", "PSYCHIC"], baseStats: [], abilities: [], hiddenAbility: null }] },
  },
  moves: { AURASPHERE: { name: "Aura Sphere" }, HIDDENPOWER: { name: "Hidden Power" }, THUNDERBOLT: { name: "Thunderbolt" } },
  items: { LIFEORB: { name: "Life Orb" } },
  abilities: { INNERFOCUS: { name: "Inner Focus" }, SURGESURFER: { name: "Surge Surfer" } },
  types: [{ id: "ICE", name: "Ice" }],
  showdownNames: { species: { "RAICHU:1": "Raichu-Alola" }, items: {}, moves: {}, abilities: {} },
} as never;

const full = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const zero = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const base: OwnedMon = {
  uid: "p0", location: { kind: "party", index: 0 }, order: 0, species: "LUCARIO", form: 0, nickname: "Rio", level: 78,
  isEgg: false, shiny: true, item: "LIFEORB", ability: "INNERFOCUS", nature: "TIMID", moves: ["AURASPHERE", "HIDDENPOWER"],
  ivs: { ...full, atk: 0 }, evs: { ...zero, spa: 252, spe: 252, hp: 4 }, hiddenPowerType: "ICE",
};

it("formats a full set", () => {
  expect(toShowdown(base, data)).toBe(
    ["Rio (Lucario) @ Life Orb", "Ability: Inner Focus", "Level: 78", "Shiny: Yes", "EVs: 4 HP / 252 SpA / 252 Spe", "Timid Nature", "IVs: 0 Atk", "- Aura Sphere", "- Hidden Power [Ice]"].join("\n"),
  );
});

it("omits defaults and uses name overrides", () => {
  const m: OwnedMon = { ...base, species: "RAICHU", form: 1, nickname: null, level: 100, shiny: false, item: null, ability: "SURGESURFER", nature: null, moves: ["THUNDERBOLT"], ivs: full, evs: zero, hiddenPowerType: null };
  expect(toShowdown(m, data)).toBe(["Raichu-Alola", "Ability: Surge Surfer", "- Thunderbolt"].join("\n"));
});

it("drops nickname equal to species name and skips eggs in teams", () => {
  const same = { ...base, nickname: "Lucario" };
  expect(toShowdown(same, data).split("\n")[0]).toBe("Lucario @ Life Orb");
  expect(teamToShowdown([base, { ...base, isEgg: true }], data).split("\n\n")).toHaveLength(1);
});
