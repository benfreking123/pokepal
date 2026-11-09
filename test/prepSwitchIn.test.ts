import { expect, it } from "vitest";
import { rankSwitchIns, switchTag, type SwitchCandidate } from "../shared/prep/switchin";
import { NO_FIELD } from "../shared/typechart";
import { canonicalChart } from "../data/test/canonical-chart";

const chart = canonicalChart();
const name = (t: string) => t[0] + t.slice(1).toLowerCase();
const cand = (n: string, types: string[], hpPercent = 100, active = false, level = 50): SwitchCandidate => ({ mon: { uid: n, name: n, level, types, baseStatTotal: 500, box: null }, hpPercent, active });
const rank = (foe: string[], cs: SwitchCandidate[]) => rankSwitchIns(chart, NO_FIELD, foe, cs, name);

it("puts immunities and resistances to the foe's types first", () => {
  const r = rank(["NORMAL"], [cand("Machamp", ["FIGHTING"]), cand("Gengar", ["GHOST", "POISON"]), cand("Steelix", ["STEEL"])]);
  expect(r.map((x) => x.mon.name)).toEqual(["Gengar", "Steelix", "Machamp"]);
  expect(r[0].tag).toBe("immune");
  expect(r[1].tag).toBe("resists Normal");
  expect(r[2].tag).toBe("2x FIG");
});

it("weights taking the hit above dealing damage", () => {
  const r = rank(["FIRE"], [cand("Hitter", ["GRASS"]), cand("Wall", ["WATER"])]);
  expect(r[0].mon.name).toBe("Wall");
});

it("uses HP only to break otherwise equal matchups", () => {
  const r = rank(["NORMAL"], [cand("A", ["NORMAL"], 30), cand("B", ["NORMAL"], 90), cand("C", ["STEEL"], 20)]);
  expect(r.map((x) => x.mon.name)).toEqual(["C", "B", "A"]);
});

it("keeps the active Pokémon out of the list unless it is the best choice", () => {
  const out = rank(["NORMAL"], [cand("Rio", ["FIGHTING", "STEEL"], 100, true), cand("Snorlax", ["NORMAL"])]);
  expect(out[0]).toMatchObject({ mon: { name: "Rio" }, active: true });
  const weak = rank(["NORMAL"], [cand("Snorlax", ["NORMAL"], 100, true), cand("Steelix", ["STEEL"])]);
  expect(weak.map((x) => x.mon.name)).toEqual(["Steelix"]);
});

it("shows at most three picks and nothing without known foe types", () => {
  const five = ["A", "B", "C", "D", "E"].map((n) => cand(n, ["NORMAL"]));
  expect(rank(["NORMAL"], five)).toHaveLength(3);
  expect(rank([], five)).toEqual([]);
});

it("follows the field's rules", () => {
  const inverse = { ...NO_FIELD, fieldId: "INVERSE", invert: true };
  const r = rankSwitchIns(chart, inverse, ["NORMAL"], [cand("Steelix", ["STEEL"]), cand("Machamp", ["FIGHTING"])], name);
  expect(r[0].mon.name).toBe("Machamp");
  expect(switchTag(chart, inverse, cand("Steelix", ["STEEL"]).mon, ["NORMAL"], name)).not.toMatch(/resists|immune/);
});
