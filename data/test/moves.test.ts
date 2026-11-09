import { describe, expect, it } from "vitest";
import { extractMoves } from "../src/extract/moves";
import { loadReal, REAL } from "./real";

it("normalizes a move", () => {
  const out = extractMoves({
    MEGAHORN: { name: "Megahorn", type: "BUG", category: "physical", basedamage: 120, accuracy: 85, maxpp: 10, target: "SingleNonUser", desc: "Rams the target." },
    GROWL: { name: "Growl", type: "NORMAL", category: "status", basedamage: 0, accuracy: 100, maxpp: 40, desc: "Lowers Attack." },
  });
  expect(out.MEGAHORN).toEqual({ id: "MEGAHORN", name: "Megahorn", type: "BUG", category: "physical", power: 120, accuracy: 85, pp: 10, target: "SingleNonUser", description: "Rams the target." });
  expect(out.GROWL.category).toBe("status");
  expect(out.GROWL.target).toBeNull();
});

describe.runIf(REAL)("real install", () => {
  it("extracts 862 moves", async () => {
    const out = extractMoves(await loadReal("moves"));
    expect(Object.keys(out)).toHaveLength(862);
    expect(out.MEGAHORN).toMatchObject({ type: "BUG", category: "physical", power: 120 });
  });
});
