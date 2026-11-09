import { expect, it } from "vitest";
import { assignFoeMons, foesKey, liveFieldId, liveFoeTypes, type LiveFoe } from "../shared/live";
import type { GameData } from "../shared/types";

const foe = (species: string, level: number | undefined, types: string[] = []): LiveFoe => ({
  slot: 0, name: species, species, form: 0, formName: null, ...(level !== undefined ? { level } : {}), types, hpPercent: 100, fainted: false,
});

it("maps the game's no-field id to the app's", () => {
  expect([liveFieldId("INDOOR"), liveFieldId("GLITCH")]).toEqual(["NONE", "GLITCH"]);
});

it("falls back to the shown species' types when the mod sent none", () => {
  const data = { species: { ZOROARK: { id: "ZOROARK", dexNum: 571, forms: [{ form: 0, formName: null, name: "Zoroark", types: ["DARK"], baseStats: [], abilities: [], hiddenAbility: null }] } } } as unknown as GameData;
  expect(liveFoeTypes(foe("ZOROARK", 50), data)).toEqual(["DARK"]);
  expect(liveFoeTypes(foe("ZOROARK", 50, ["GHOST"]), data)).toEqual(["GHOST"]);
  expect(liveFoeTypes(foe("MISSING", 50), data)).toEqual([]);
});

it("pairs foes with distinct team slots, closest level first, with or without levels", () => {
  const mons = [{ slot: 0, species: "GENGAR", form: 0, level: 70 }, { slot: 1, species: "GENGAR", form: 0, level: 80 }, { slot: 2, species: "ABRA", form: 0, level: 5 }];
  expect(assignFoeMons([foe("GENGAR", 79), foe("GENGAR", 79)], mons)).toEqual([1, 0]);
  expect(assignFoeMons([foe("MEW", 5)], mons)).toEqual([null]);
  const noLevels = [{ slot: 0, species: "GENGAR", form: 0 }, { slot: 1, species: "GENGAR", form: 0 }];
  expect(assignFoeMons([foe("GENGAR", undefined), foe("GENGAR", undefined)], noLevels)).toEqual([0, 1]);
});

it("keys the foes on the field by species and form", () => {
  expect(foesKey([foe("GENGAR", 80), foe("ABRA", 5)])).toBe("GENGAR/0,ABRA/0");
});
