import { describe, expect, it } from "vitest";
import { extractTrainerTypes } from "../src/extract/trainerTypes";
import { loadReal, REAL } from "./real";

it("uses the title as the display name and keeps mixed-case ids", () => {
  expect(extractTrainerTypes({
    PkMnTRAINER_Male: { ID: 0, title: "PkMn Trainer", skill: 100, moneymult: 100, player: true },
    LEADER_JULIA: { ID: 40, title: "Leader" },
    Odd: {},
  })).toEqual({ PkMnTRAINER_Male: { name: "PkMn Trainer" }, LEADER_JULIA: { name: "Leader" }, Odd: { name: "Odd" } });
});

describe.runIf(REAL)("real install", () => {
  it("names PkMnTRAINER_Male", async () => {
    expect(extractTrainerTypes(await loadReal("trainerTypes")).PkMnTRAINER_Male).toEqual({ name: "PkMn Trainer" });
  });
});
