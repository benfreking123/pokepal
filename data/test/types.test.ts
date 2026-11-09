import { describe, expect, it } from "vitest";
import { extractTypes } from "../src/extract/types";
import { canonicalChart, TYPES } from "./canonical-chart";
import { loadReal, REAL } from "./real";

describe("extractTypes", () => {
  it("builds attack→defend chart from defending weaknesses/resistances/immunities", () => {
    const file = extractTypes({
      GHOST: { name: "Ghost", weaknesses: ["GHOST", "DARK"], resistances: ["POISON", "BUG"], immunities: ["NORMAL", "FIGHTING"] },
      NORMAL: { name: "Normal", weaknesses: ["FIGHTING"], immunities: ["GHOST"] },
    });
    expect(file.types).toEqual([{ id: "GHOST", name: "Ghost" }, { id: "NORMAL", name: "Normal" }]);
    expect(file.chart.NORMAL.GHOST).toBe(0);
    expect(file.chart.DARK.GHOST).toBe(2);
    expect(file.chart.BUG.GHOST).toBe(0.5);
    expect(file.chart.GHOST.NORMAL).toBe(0);
    expect(file.chart.FIGHTING.NORMAL).toBe(2);
  });
});

describe.runIf(REAL)("real install", () => {
  it("matches the canonical Gen 6+ chart", async () => {
    const { chart } = extractTypes(await loadReal("types"));
    const canon = canonicalChart();
    const known = new Set<string>(TYPES);
    for (const atk of Object.keys(canon)) {
      const row = Object.fromEntries(Object.entries(chart[atk] ?? {}).filter(([def]) => known.has(def)));
      expect(row, atk).toEqual(canon[atk]);
    }
  });
});
