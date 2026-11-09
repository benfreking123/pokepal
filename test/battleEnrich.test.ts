import { expect, it } from "vitest";
import { enrichBattle } from "../server/battle/enrich";
import type { BattleState } from "../server/battle/schema";
import { DEFAULT_SPOILERS } from "../shared/spoilers";
import type { TrainerFull } from "../shared/types";

const joey: TrainerFull = {
  key: "YOUNGSTER:Joey:0", trainerType: "YOUNGSTER", name: "Joey", label: "Youngster Joey", partyId: 0,
  mons: [{ species: "RATTATA", form: 0, level: 5, moves: [], ability: null, item: null }, { species: "PIDGEY", form: 0, level: 6, moves: [], ability: null, item: null }],
};
const state = (trainer: BattleState["trainer"], species: string): BattleState => ({
  schema: 1, bridgeVersion: "1.0.0", updatedAt: "", battleId: "1", state: "active", isDouble: false,
  field: { id: "NONE", name: "" }, trainer,
  foes: [{ slot: 0, name: species, species, form: 0, formName: null, level: 6, types: [], hpPercent: 100, fainted: false }], party: [],
});
const fresh = { settings: DEFAULT_SPOILERS, seen: {}, foundFieldNotes: [] };

it("matches the trainer and records the Pokémon on the field as seen", () => {
  const r = enrichBattle(state({ type: "YOUNGSTER", name: "Joey" }, "PIDGEY"), { [joey.key]: joey }, fresh);
  expect(r.match).toEqual({ key: joey.key, exact: true });
  expect(r.spoilers.seen).toEqual({ [joey.key]: [1] });
});

it("leaves wild battles and unknown trainers alone", () => {
  expect(enrichBattle(state(null, "PIDGEY"), { [joey.key]: joey }, fresh)).toEqual({ match: null, spoilers: fresh });
  expect(enrichBattle(state({ type: "X", name: "Y" }, "PIDGEY"), { [joey.key]: joey }, fresh)).toEqual({ match: null, spoilers: fresh });
});
