import { describe, expect, it } from "vitest";
import { extractFields } from "../src/extract/fields";
import { loadReal, REAL } from "./real";

it("normalizes type boosts, failing types and add-ons, and keeps raw", () => {
  const raw = {
    name: "Underwater", fieldAppSwitch: 1012, fieldMessage: ["Blub..."],
    typeBoosts: { "1.5": ["WATER"], "2": ["ELECTRIC"], "0": ["FIRE"] }, typeAddOns: { WATER: ["GROUND"] },
    changeCondition: { MURKWATERSURFACE: "@battle.field.counter > 1" }, seed: { stats: { "PBStats::SPEED": 1 } },
  };
  const out = extractFields({ UNDERWATER: raw });
  expect(out.UNDERWATER).toEqual({
    id: "UNDERWATER",
    name: "Underwater",
    description: "Blub...",
    fieldAppSwitch: 1012,
    rules: {
      typeBoosts: [{ type: "ELECTRIC", factor: 2 }, { type: "WATER", factor: 1.5 }],
      failingMoveTypes: ["FIRE"],
      secondaryTypes: [{ match: { moveType: "GROUND" }, addType: "WATER" }],
    },
    raw,
  });
});

it("leaves fieldAppSwitch null when absent", () => {
  expect(extractFields({ INDOOR: { name: "Indoor" } }).INDOOR.fieldAppSwitch).toBeNull();
});

describe.runIf(REAL)("real install", () => {
  it("extracts 42 fields including the curated overlay ids", async () => {
    const out = extractFields(await loadReal("fields"));
    expect(Object.keys(out)).toHaveLength(42);
    for (const id of ["INVERSE", "GLITCH", "HOLY", "UNDERWATER", "CRYSTALCAVERN"]) expect(out[id], id).toBeDefined();
  });
});
