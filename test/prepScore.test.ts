import { expect, it } from "vitest";
import { scoreMatchup } from "../shared/prep/score";
import { NO_FIELD } from "../shared/typechart";
import type { FieldOverlay } from "../shared/types";
import { canonicalChart } from "../data/test/canonical-chart";

const chart = canonicalChart();
const lucario = { uid: "p0", name: "Lucario", level: 50, order: 0, types: ["FIGHTING", "STEEL"], moves: [
  { id: "AURASPHERE", label: "Aura Sphere", type: "FIGHTING", category: "special" as const, power: 80 },
  { id: "FLASHCANNON", label: "Flash Cannon", type: "STEEL", category: "special" as const, power: 80 },
  { id: "SWORDSDANCE", label: "Swords Dance", type: "NORMAL", power: 0 },
] };
const gardevoir = { name: "Gardevoir", species: "GARDEVOIR", form: 0, level: 50, types: ["PSYCHIC", "FAIRY"] };

it("scores offense with STAB, threat by foe types, and log difference", () => {
  const d = scoreMatchup(chart, NO_FIELD, lucario, gardevoir);
  expect(d.offense).toBe(3);
  expect(d.bestMove).toBe("Flash Cannon");
  expect(d.threat).toBe(1);
  expect(d.value).toBeCloseTo(Math.log2(3), 5);
});

it("applies the level adjustment with clamps", () => {
  expect(scoreMatchup(chart, NO_FIELD, { ...lucario, level: 40 }, gardevoir).value).toBeCloseTo(Math.log2(3) - 1, 5);
  expect(scoreMatchup(chart, NO_FIELD, { ...lucario, level: 30 }, gardevoir).value).toBeCloseTo(Math.log2(3) - 1, 5);
  expect(scoreMatchup(chart, NO_FIELD, { ...lucario, level: 60 }, gardevoir).value).toBeCloseTo(Math.log2(3) + 0.5, 5);
});

it("Glitch remap removes Dark's edge on Gengar", () => {
  const glitch: FieldOverlay = { fieldId: "GLITCH", moveTypeRemap: [{ from: "DARK", to: "NORMAL" }], notes: [], source: "t" };
  const umbreon = { uid: "b0-0", name: "Umbreon", level: 50, order: 6, types: ["DARK"], moves: [{ id: "FOULPLAY", label: "Foul Play", type: "DARK", category: "physical" as const, power: 95 }] };
  const gengar = { name: "Gengar", species: "GENGAR", form: 0, level: 50, types: ["GHOST", "POISON"] };
  expect(scoreMatchup(chart, NO_FIELD, umbreon, gengar).value).toBeCloseTo(Math.log2(3), 5);
  expect(scoreMatchup(chart, glitch, umbreon, gengar)).toMatchObject({ offense: 0, value: -4 });
});

it("uses own types as stand-in moves when no damaging moves", () => {
  const blissey = { uid: "x", name: "Blissey", level: 50, order: 9, types: ["NORMAL"], moves: [] };
  const d = scoreMatchup(chart, NO_FIELD, blissey, gardevoir);
  expect(d.offense).toBe(1.5);
  expect(d.bestMove).toBe("Normal (type)");
});

it("with known foe moves, threat follows the actual moves (non-STAB counts 2/3)", () => {
  const knownGardevoir = { ...gardevoir, moves: [
    { id: "MOONBLAST", label: "Moonblast", type: "FAIRY", category: "special" as const, power: 95 },
    { id: "MYSTICALFIRE", label: "Mystical Fire", type: "FIRE", category: "special" as const, power: 75 },
  ] };
  const d = scoreMatchup(chart, NO_FIELD, lucario, knownGardevoir);
  expect(d.threat).toBeCloseTo(2 / 1.5, 5);
  expect(d).toMatchObject({ worstThreatType: "FIRE", worstThreatMove: "Mystical Fire" });
  expect(scoreMatchup(chart, NO_FIELD, lucario, gardevoir).worstThreatMove).toBeNull();
});

it("with a known ability, immunities and Wonder Guard block offense", () => {
  const garchomp = { uid: "g", name: "Garchomp", level: 50, order: 1, types: ["DRAGON", "GROUND"], moves: [
    { id: "EARTHQUAKE", label: "Earthquake", type: "GROUND", category: "physical" as const, power: 100 },
    { id: "STONEEDGE", label: "Stone Edge", type: "ROCK", category: "physical" as const, power: 100 },
  ] };
  const rotom = { name: "Rotom", species: "ROTOM", form: 0, level: 50, types: ["ELECTRIC", "GHOST"] };
  expect(scoreMatchup(chart, NO_FIELD, garchomp, rotom)).toMatchObject({ offense: 3, bestMove: "Earthquake" });
  expect(scoreMatchup(chart, NO_FIELD, garchomp, { ...rotom, ability: "LEVITATE" })).toMatchObject({ offense: 1, bestMove: "Stone Edge" });
  const shedinja = { name: "Shedinja", species: "SHEDINJA", form: 0, level: 50, types: ["BUG", "GHOST"], ability: "WONDERGUARD" };
  expect(scoreMatchup(chart, NO_FIELD, garchomp, shedinja)).toMatchObject({ offense: 2, bestMove: "Stone Edge" });
});

it("with a known item, Air Balloon blocks Ground and type items boost threat", () => {
  const garchomp = { uid: "g", name: "Garchomp", level: 50, order: 1, types: ["DRAGON", "GROUND"], moves: [
    { id: "EARTHQUAKE", label: "Earthquake", type: "GROUND", category: "physical" as const, power: 100 },
  ] };
  const heatran = { name: "Heatran", species: "HEATRAN", form: 0, level: 50, types: ["FIRE", "STEEL"] };
  expect(scoreMatchup(chart, NO_FIELD, garchomp, heatran).offense).toBe(6);
  expect(scoreMatchup(chart, NO_FIELD, garchomp, { ...heatran, item: "AIRBALLOON" }).offense).toBe(0);
  expect(scoreMatchup(chart, NO_FIELD, lucario, { ...gardevoir, item: "PIXIEPLATE" }).threat).toBe(1);
  expect(scoreMatchup(chart, NO_FIELD, garchomp, { ...gardevoir, item: "DRAGONFANG" }).threat).toBe(2);
  const kingdra = { name: "Kingdra", species: "KINGDRA", form: 0, level: 50, types: ["WATER", "DRAGON"], item: "DRAGONFANG" };
  expect(scoreMatchup(chart, NO_FIELD, garchomp, kingdra).threat).toBeCloseTo(2.4, 5);
});

it("with levels hidden, the level adjustment is zero", () => {
  expect(scoreMatchup(chart, NO_FIELD, { ...lucario, level: 30 }, { ...gardevoir, level: null }).value).toBeCloseTo(Math.log2(3), 5);
});
