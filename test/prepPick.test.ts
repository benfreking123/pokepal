import { expect, it } from "vitest";
import { pickTeam } from "../shared/prep/pick";
import type { MatchupDetail, PrepCandidate } from "../shared/prep/score";

const d = (value: number): MatchupDetail => ({ value, offense: 1, threat: 1, bestMove: null, worstThreatType: null, worstThreatMove: null });
const cand = (uid: string, order: number, level = 50): PrepCandidate => ({ uid, name: uid, level, types: [], moves: [], order });
const candidates = [cand("c1", 0), cand("c2", 1), cand("c3", 2)];
const matrix = new Map([["c1", [d(2), d(-1)]], ["c2", [d(-1), d(2)]], ["c3", [d(1), d(1)]]]);

it("greedy picks by coverage with tie-breaks by average, level, then order", () => {
  expect(pickTeam(candidates, 2, matrix, { locked: [], excluded: [], size: 2 }).team).toEqual(["c3", "c1"]);
});

it("respects locked and excluded", () => {
  expect(pickTeam(candidates, 2, matrix, { locked: ["c2"], excluded: [], size: 2 }).team).toEqual(["c2", "c1"]);
  expect(pickTeam(candidates, 2, matrix, { locked: [], excluded: ["c3"], size: 1 }).team).toEqual(["c1"]);
});

it("stops when candidates run out and explains each foe's best answer", () => {
  const r = pickTeam(candidates, 2, matrix, { locked: [], excluded: [] });
  expect(r.team).toHaveLength(3);
  expect(r.reasons.c1).toEqual([{ foeIndex: 0, detail: d(2) }]);
  expect(r.reasons.c2).toEqual([{ foeIndex: 1, detail: d(2) }]);
  expect(r.alternates).toEqual([[], []]);
});

it("lists alternates not in the team, best first", () => {
  const r = pickTeam(candidates, 2, matrix, { locked: [], excluded: [], size: 1 });
  expect(r.alternates[0]).toEqual([{ uid: "c1", value: 2 }, { uid: "c2", value: -1 }]);
});
