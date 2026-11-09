import { expect, it } from "vitest";
import { describeReason, fmtMultiplier, ignoredLine } from "../shared/prep/explain";

const d = { value: 1, offense: 3, threat: 0.5, bestMove: "Flash Cannon", worstThreatType: "POISON", worstThreatMove: null };
const foe = { name: "Gengar", species: "GENGAR", form: 0, level: 50, types: ["GHOST", "POISON"] };

it("formats multipliers", () => {
  expect([0.25, 0.5, 1, 1.5, 4].map(fmtMultiplier)).toEqual(["¼", "½", "1", "1.5", "4"]);
});

it("describes the best answer and the worst threat, naming the move only when known", () => {
  expect(describeReason(foe, d, (t) => t.toLowerCase())).toBe("Best answer to Gengar: Flash Cannon 3×; takes ½× from poison");
  expect(describeReason(foe, { ...d, worstThreatMove: "Sludge Bomb" }, (t) => t)).toContain("watch out for its Sludge Bomb");
  expect(describeReason(foe, { ...d, offense: 0, bestMove: null, worstThreatType: null }, (t) => t)).toBe("Best answer to Gengar: no damaging answer");
});

it("says what was ignored", () => {
  const base = { moves: false, abilities: false, items: false, levels: true, fullTeam: false, seen: 2, partial: true };
  expect(ignoredLine(base)).toBe("Ignores foe moves, abilities and items (switched off); 2 of this trainer's Pokémon seen; The field can change mid-battle.");
  expect(ignoredLine({ ...base, moves: true, abilities: true, items: true, partial: false })).toBe("Full team used; The field can change mid-battle.");
});
