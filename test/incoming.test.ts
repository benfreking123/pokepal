import { expect, it } from "vitest";
import { incomingGroups } from "../web/components/IncomingStrip";
import type { GameData } from "../shared/types";
import { canonicalChart, TYPES } from "../data/test/canonical-chart";
import { NO_FIELD } from "../shared/typechart";

const data = { chart: canonicalChart(), types: TYPES.map((id) => ({ id, name: id })) } as unknown as GameData;

it("groups attacking types for Gengar on no field", () => {
  const groups = incomingGroups(data, ["GHOST", "POISON"], NO_FIELD);
  const by = Object.fromEntries(groups.map((g) => [g.label, g.types.map((t) => t.type)]));
  expect(by["2×"].sort()).toEqual(["DARK", "GHOST", "GROUND", "PSYCHIC"]);
  expect(by["0×"].sort()).toEqual(["FIGHTING", "NORMAL"]);
  expect(by["¼× or less"].sort()).toEqual(["BUG", "POISON"]);
  expect(by["½×"].sort()).toEqual(["FAIRY", "GRASS"]);
});
