import path from "node:path";
import { expect, it } from "vitest";
import { humanizeTrainerType, loadGameData } from "../server/data/loadData";

const dataDir = path.join(import.meta.dirname, "fixtures", "data");

it("loads the latest version and merges overlays", async () => {
  const { game } = await loadGameData(dataDir, null);
  expect(game.meta.gameVersion).toBe("19.5.0-test");
  expect(game.chart.FIRE.GRASS).toBe(2);
  expect(game.types.map((t) => t.id)).toEqual(["FIRE", "GRASS", "WATER"]);
  expect(game.chart).toEqual({ FIRE: { GRASS: 2, WATER: 0.5 } });
  expect(game.overlays.UNDERWATER.failingMoveTypes).toEqual(["FIRE"]);
  expect(game.overlays.UNDERWATER.typeBoosts).toEqual([{ type: "WATER", factor: 1.5 }]);
  expect(game.overlays.NONE.notes).toEqual([]);
  expect(game).not.toHaveProperty("trainers");
});

it("keeps full trainers server-side with a display label", async () => {
  const { trainers, bosses } = await loadGameData(dataDir, null);
  expect(trainers["LEADER_X:X:0"]).toEqual({
    key: "LEADER_X:X:0", trainerType: "LEADER_X", name: "X", label: "Leader X", partyId: 0,
    mons: [{ species: "GENGAR", form: 0, level: 50, moves: ["SHADOWBALL"], ability: "CURSEDBODY", item: "LEFTOVERS" }],
  });
  expect(bosses).toEqual([]);
});

it("humanizes trainer types with no name", () => {
  expect(humanizeTrainerType("ACE_TRAINER_F")).toBe("Ace Trainer F");
});

it("names the missing path", async () => {
  await expect(loadGameData(path.join(dataDir, "nope"), null)).rejects.toThrow(/nope/);
});
