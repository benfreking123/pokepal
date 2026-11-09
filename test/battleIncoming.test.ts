import { expect, it } from "vitest";
import { parseBattleState } from "../server/battle/schema";
import { liveBattleView } from "../server/spoilers/filter";
import { DEFAULT_SPOILERS } from "../shared/spoilers";

const base = {
  schema: 1, bridgeVersion: "1.0.0", updatedAt: "", battleId: "1", state: "active", isDouble: false, field: { id: "INDOOR", name: "INDOOR" }, trainer: null,
  foes: [], party: [],
};
const incoming = { slot: 3, species: "PORYGONZ", form: 0, level: 62, types: ["NORMAL"] };

it("accepts battle state with and without an announced foe", () => {
  for (const extra of [{}, { incoming: null }, { incoming }]) {
    expect(parseBattleState(JSON.stringify({ ...base, ...extra })).ok).toBe(true);
  }
  expect(parseBattleState(JSON.stringify({ ...base, incoming: { ...incoming, moves: [] } })).ok).toBe(false);
});

it("hides the announced foe's level with the other opponent levels", () => {
  const r = parseBattleState(JSON.stringify({ ...base, incoming }));
  if (!r.ok) throw new Error("invalid");
  expect(liveBattleView(r.state, null, DEFAULT_SPOILERS).incoming?.level).toBe(62);
  const hidden = liveBattleView(r.state, null, { ...DEFAULT_SPOILERS, opponentLevels: false }).incoming;
  expect(hidden).toEqual({ slot: 3, species: "PORYGONZ", form: 0, types: ["NORMAL"] });
});
