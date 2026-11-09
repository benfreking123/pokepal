import { expect, it } from "vitest";
import { baseStatEdge, recommend, typeOnlyFoe, type RecMon } from "../shared/prep/recommend";
import type { PrepFoe } from "../shared/prep/score";
import { NO_FIELD } from "../shared/typechart";
import type { FieldOverlay } from "../shared/types";
import { canonicalChart } from "../data/test/canonical-chart";

const chart = canonicalChart();
const typeName = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();
const mon = (uid: string, types: string[], level = 50, bst = 500, box: string | null = null): RecMon => ({ uid, name: uid, level, types, baseStatTotal: bst, box });
const foe = (name: string, types: string[], level: number | null = 50): PrepFoe => ({ name, species: name.toUpperCase(), form: 0, level, types });
const base = { chart, overlay: NO_FIELD, fieldName: "", typeName };

it("ranks the party by type matchup against the foe", () => {
  const r = recommend({ ...base, foes: [foe("Charizard", ["FIRE", "FLYING"])], party: [mon("Rhydon", ["ROCK", "GROUND"]), mon("Blastoise", ["WATER"]), mon("Raticate", ["NORMAL"])], pc: [] });
  expect(r.party.map((x) => x.mon.uid)).toEqual(["Rhydon", "Blastoise", "Raticate"]);
  expect(r.party[0].reason).toContain("hits Charizard super-effectively");
});

it("uses base stats only as a tiebreak and clamps it", () => {
  const r = recommend({ ...base, foes: [foe("Rattata", ["NORMAL"])], party: [mon("a", ["NORMAL"], 50, 400), mon("b", ["NORMAL"], 50, 600)], pc: [] });
  expect(r.party[0].mon.uid).toBe("b");
  expect(baseStatEdge(5000)).toBe(0.5);
  expect(baseStatEdge(10)).toBe(-0.5);
  expect(baseStatEdge(0)).toBe(0);
});

it("never reads foe moves, abilities or items", () => {
  const rich = { ...foe("Gengar", ["GHOST", "POISON"]), moves: [{ id: "X", label: "X", type: "FIRE", power: 90 }], ability: "LEVITATE", item: "AIRBALLOON" };
  expect(typeOnlyFoe(rich)).toEqual(foe("Gengar", ["GHOST", "POISON"]));
  const args = { ...base, party: [mon("Rhydon", ["ROCK", "GROUND"])], pc: [] };
  expect(recommend({ ...args, foes: [rich] })).toEqual(recommend({ ...args, foes: [foe("Gengar", ["GHOST", "POISON"])] }));
});

it("suggests PC Pokémon only when they clearly beat the whole party", () => {
  const foes = [foe("Charizard", ["FIRE", "FLYING"])];
  const party = [mon("Blastoise", ["WATER"], 50), mon("Raticate", ["NORMAL"], 50)];
  const pc = [mon("Rhydon", ["ROCK", "GROUND"], 50, 500, "Box 2"), mon("Pidgey", ["NORMAL", "FLYING"], 50, 250, "Box 1")];
  const r = recommend({ ...base, foes, party, pc });
  expect(r.pc.map((x) => x.mon.uid)).toEqual(["Rhydon"]);
  expect(recommend({ ...base, foes, party: [...party, mon("Golem", ["ROCK", "GROUND"], 60)], pc }).pc).toEqual([]);
});

it("offers PC Pokémon when no party member can fight", () => {
  const r = recommend({ ...base, foes: [foe("Charizard", ["FIRE"])], party: [], fainted: [mon("Dead", ["WATER"])], pc: [mon("Rhydon", ["ROCK", "GROUND"])] });
  expect(r.party).toEqual([]);
  expect(r.fainted.map((x) => x.uid)).toEqual(["Dead"]);
  expect(r.pc.map((x) => x.mon.uid)).toEqual(["Rhydon"]);
});

it("scores a double battle across both foes", () => {
  const foes = [foe("Gengar", ["GHOST", "POISON"]), foe("Magnezone", ["ELECTRIC", "STEEL"])];
  const r = recommend({ ...base, foes, party: [mon("Lucario", ["FIGHTING", "STEEL"]), mon("Gardevoir", ["PSYCHIC", "FAIRY"]), mon("Garchomp", ["DRAGON", "GROUND"])], pc: [] });
  expect(r.party[0].mon.uid).toBe("Garchomp");
  expect(r.party[0].reason).toContain("hits Gengar and Magnezone super-effectively");
  expect(r.party[0].reason).toContain("immune to Electric");
});

it("gives no recommendation for a disguised foe", () => {
  const r = recommend({ ...base, foes: [foe("Zoroark", [])], party: [mon("Lucario", ["FIGHTING"])], pc: [mon("Rhydon", ["ROCK"])] });
  expect(r).toMatchObject({ party: [], pc: [], unknownFoes: ["Zoroark"] });
});

it("skips only the disguised foe in a double battle", () => {
  const r = recommend({ ...base, foes: [foe("Zoroark", []), foe("Charizard", ["FIRE", "FLYING"])], party: [mon("Rhydon", ["ROCK", "GROUND"])], pc: [] });
  expect(r.unknownFoes).toEqual(["Zoroark"]);
  expect(r.party).toHaveLength(1);
});

it("follows the active field in scoring and in the reason", () => {
  const superheated: FieldOverlay = { fieldId: "SUPERHEATED", overrides: [{ attack: "WATER", defend: "WATER", multiplier: 1 }, { attack: "FIRE", defend: "WATER", multiplier: 2 }], notes: [], source: "t" };
  const foes = [foe("Volcarona", ["BUG", "FIRE"])];
  const party = [mon("Vaporeon", ["WATER"])];
  const plain = recommend({ ...base, foes, party, pc: [] }).party[0];
  const hot = recommend({ ...base, overlay: superheated, fieldName: "Superheated Field", foes, party, pc: [] }).party[0];
  expect(hot.score).toBeLessThan(plain.score);
  expect(hot.reason).toContain("weak to Fire");
  const shielded = recommend({ ...base, overlay: { fieldId: "X", overrides: [{ attack: "FIRE", defend: "ROCK", multiplier: 0.5 }], notes: [], source: "t" }, fieldName: "Test Field", foes, party: [mon("Golem", ["ROCK"])], pc: [] });
  expect(shielded.party[0].reason).toContain("resists Fire on Test Field");
});

it("a level gap moves the ranking when the foe level is known, not when hidden", () => {
  const party = [mon("low", ["NORMAL"], 30), mon("high", ["NORMAL"], 60)];
  const known = recommend({ ...base, foes: [foe("Rattata", ["NORMAL"], 50)], party: [party[0], mon("same", ["NORMAL"], 50)], pc: [] });
  expect(known.party[0].mon.uid).toBe("same");
  const hidden = recommend({ ...base, foes: [foe("Rattata", ["NORMAL"], null)], party, pc: [] });
  expect(hidden.party[0].score).toBeCloseTo(hidden.party[1].score, 5);
});
