import { describe, expect, it } from "vitest";
import { changedCells, mergeOverlay, moveEffectiveness, NO_FIELD, typeBoost, typeVsType, typeVsTypes } from "../shared/typechart";
import type { FieldOverlay } from "../shared/types";
import { canonicalChart, TYPES } from "../data/test/canonical-chart";

const chart = canonicalChart();
const INVERSE: FieldOverlay = { fieldId: "INVERSE", invert: true, notes: [], source: "t" };
const GLITCH: FieldOverlay = {
  fieldId: "GLITCH",
  overrides: [{ attack: "GHOST", defend: "PSYCHIC", multiplier: 0 }, { attack: "ICE", defend: "FIRE", multiplier: 1 }],
  moveTypeRemap: [{ from: "DARK", to: "NORMAL" }],
  notes: [], source: "t",
};
const HOLY: FieldOverlay = { fieldId: "HOLY", overrides: [{ attack: "NORMAL", defend: "GHOST", multiplier: 2 }], notes: [], source: "t" };
const UNDERWATER: FieldOverlay = {
  fieldId: "UNDERWATER",
  overrides: [{ attack: "WATER", defend: "WATER", multiplier: 1 }],
  secondaryTypes: [{ match: { moveType: "GROUND" }, addType: "WATER" }],
  failingMoveTypes: ["FIRE"],
  typeBoosts: [{ type: "WATER", factor: 1.5 }],
  notes: [], source: "t",
};
const CRYSTAL: FieldOverlay = { fieldId: "CRYSTAL", secondaryTypes: [{ match: { moveType: "ROCK" }, oneOf: ["FIRE", "WATER", "GRASS", "PSYCHIC"] }], notes: [], source: "t" };

describe("base chart", () => {
  it("single and dual types", () => {
    expect(typeVsType(chart, "FIRE", "GRASS")).toBe(2);
    expect(typeVsType(chart, "NORMAL", "GHOST")).toBe(0);
    expect(typeVsType(chart, "FIRE", "FIRE")).toBe(0.5);
    expect(typeVsType(chart, "FIRE", "NORMAL")).toBe(1);
    expect(typeVsTypes(chart, "FIRE", ["GRASS", "STEEL"])).toBe(4);
    expect(typeVsTypes(chart, "GROUND", ["FIRE", "FLYING"])).toBe(0);
  });
  it("treats unknown types (e.g. ???) as neutral", () => {
    expect(typeVsType(chart, "QMARKS", "FIRE")).toBe(1);
    expect(typeVsType(chart, "FIRE", "QMARKS")).toBe(1);
  });
});

describe("overlays", () => {
  it("inverse maps 0 and 1/2 to 2, and 2 to 1/2", () => {
    expect(typeVsType(chart, "NORMAL", "GHOST", INVERSE)).toBe(2);
    expect(typeVsType(chart, "FIRE", "WATER", INVERSE)).toBe(2);
    expect(typeVsType(chart, "FIRE", "GRASS", INVERSE)).toBe(0.5);
    expect(typeVsType(chart, "FIRE", "NORMAL", INVERSE)).toBe(1);
  });
  it("glitch overrides and remaps", () => {
    expect(typeVsType(chart, "GHOST", "PSYCHIC", GLITCH)).toBe(0);
    expect(typeVsType(chart, "ICE", "FIRE", GLITCH)).toBe(1);
    const dark = moveEffectiveness(chart, { type: "DARK" }, ["GHOST", "POISON"], GLITCH);
    expect(dark).toMatchObject({ min: 0, max: 0, fails: false, effectiveType: "NORMAL" });
  });
  it("holy makes Normal hit Ghost", () => {
    expect(moveEffectiveness(chart, { type: "NORMAL" }, ["GHOST"], HOLY).min).toBe(2);
  });
  it("underwater: fails, override, secondary type, boost", () => {
    expect(moveEffectiveness(chart, { type: "FIRE" }, ["GRASS"], UNDERWATER)).toMatchObject({ fails: true, min: 0, max: 0 });
    expect(moveEffectiveness(chart, { type: "WATER" }, ["WATER"], UNDERWATER).min).toBe(1);
    expect(moveEffectiveness(chart, { type: "GROUND" }, ["FIRE"], UNDERWATER)).toMatchObject({ min: 4, max: 4, secondary: [["WATER"]] });
    expect(typeBoost(UNDERWATER, "WATER")).toBe(1.5);
    expect(typeBoost(UNDERWATER, "FIRE")).toBe(1);
  });
  it("oneOf secondary types give a range", () => {
    expect(moveEffectiveness(chart, { type: "ROCK" }, ["GRASS"], CRYSTAL)).toMatchObject({ min: 0.5, max: 2 });
  });
  it("secondary rule can match move id and category", () => {
    const o: FieldOverlay = { fieldId: "X", secondaryTypes: [{ match: { moveIds: ["TACKLE"], category: "physical" }, addType: "FIRE" }], notes: [], source: "t" };
    expect(moveEffectiveness(chart, { type: "NORMAL", id: "TACKLE", category: "physical" }, ["GRASS"], o).min).toBe(2);
    expect(moveEffectiveness(chart, { type: "NORMAL", id: "TACKLE", category: "special" }, ["GRASS"], o).min).toBe(1);
    expect(moveEffectiveness(chart, { type: "NORMAL" }, ["GRASS"], o).min).toBe(1);
  });
  it("no field equals base chart", () => {
    expect(moveEffectiveness(chart, { type: "FIRE" }, ["GRASS"], NO_FIELD)).toMatchObject({ min: 2, max: 2, fails: false });
  });
});

describe("mergeOverlay and changedCells", () => {
  it("curated wins per property and notes concatenate", () => {
    const m = mergeOverlay("UW", { typeBoosts: [{ type: "WATER", factor: 1.2 }], secondaryTypes: [{ match: { moveType: "GROUND" }, addType: "WATER" }], notes: ["a"] },
      { fieldId: "UW", typeBoosts: [{ type: "WATER", factor: 1.5 }], notes: ["b"], source: "wiki" });
    expect(m.typeBoosts).toEqual([{ type: "WATER", factor: 1.5 }]);
    expect(m.secondaryTypes).toEqual([{ match: { moveType: "GROUND" }, addType: "WATER" }]);
    expect(m.notes).toEqual(["a", "b"]);
    expect(m.source).toBe("extracted field data; wiki");
  });
  it("changedCells lists only differing cells", () => {
    expect(changedCells(chart, [...TYPES], HOLY)).toEqual(new Set(["NORMAL>GHOST"]));
    expect(changedCells(chart, [...TYPES], NO_FIELD).size).toBe(0);
  });
});
