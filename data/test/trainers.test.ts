import { describe, expect, it } from "vitest";
import { extractTrainers } from "../src/extract/trainers";
import { loadReal, REAL } from "./real";

it("keys trainers by type:name:party and defaults form to 0", () => {
  const out = extractTrainers([
    { teamid: ["Julia", "LEADER_JULIA", 0], mons: [{ species: "MINUN", level: 18, moves: ["NUZZLE"], item: "ORANBERRY" }] },
  ]);
  expect(out["LEADER_JULIA:Julia:0"]).toEqual({
    key: "LEADER_JULIA:Julia:0", trainerType: "LEADER_JULIA", name: "Julia", partyId: 0,
    mons: [{ species: "MINUN", form: 0, level: 18, item: "ORANBERRY", ability: null, moves: ["NUZZLE"], nature: null, iv: null, ev: null }],
  });
});

describe.runIf(REAL)("real install", () => {
  it("extracts about 1,180 trainers including gym leaders", async () => {
    const out = extractTrainers(await loadReal("trainers"));
    const keys = Object.keys(out);
    // TEAMARRAY has 1,180 entries; "Gargantuan:Steelix:0" appears twice, so the later entry wins.
    expect(keys).toHaveLength(1179);
    expect(out["JULIA:Julia:0"].mons.length).toBeGreaterThan(0);
  });
});
