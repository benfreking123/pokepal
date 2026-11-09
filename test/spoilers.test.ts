import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { buildBundle, bossView, trainerView } from "../server/spoilers/filter";
import { applyUpdate, readSpoilerState, recordSeen, revealNext, SpoilerUpdateSchema, writeSpoilerState, type SpoilerState } from "../server/spoilers/state";
import { DEFAULT_SPOILERS, spoilersOn } from "../shared/spoilers";
import type { Boss, LoadedData, SpoilerSettings, TrainerFull } from "../shared/types";

const julia: TrainerFull = {
  key: "LEADER_JULIA:Julia:0", trainerType: "LEADER_JULIA", name: "Julia", label: "Leader Julia", partyId: 0,
  mons: [
    { species: "VOLTORB", form: 0, level: 13, moves: ["SPARK"], ability: "STATIC", item: null },
    { species: "PLUSLE", form: 0, level: 14, moves: ["NUZZLE"], ability: "PLUS", item: "ORANBERRY" },
  ],
};
const boss: Boss = { id: "julia", name: "Julia", group: "gym", order: 1, variants: [{ label: "", trainerKey: julia.key }], fieldId: "ELECTERRAIN", doubles: false, location: "Electric Studio", notes: ["Field can become Factory"], source: "t" };
const all = (on: boolean) => Object.fromEntries(Object.keys(DEFAULT_SPOILERS).map((k) => [k, on])) as unknown as SpoilerSettings;

it("defaults: only levels and field details on", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pokepal-spoil-"));
  const state = await readSpoilerState(path.join(dir, "spoilers.json"));
  expect(state).toEqual({ settings: DEFAULT_SPOILERS, seen: {}, foundFieldNotes: [] });
  expect(spoilersOn(state.settings)).toEqual(["Opponent levels", "Field effect details before Field Notes"]);
});

it("persists settings, seen Pokémon and found Field Notes", async () => {
  const file = path.join(await mkdtemp(path.join(os.tmpdir(), "pokepal-spoil-")), "state", "spoilers.json");
  let state = await readSpoilerState(file);
  state = applyUpdate(state, SpoilerUpdateSchema.parse({ settings: { opponentMoves: true }, foundFieldNotes: ["GLITCH", "ELECTERRAIN", "GLITCH"] }));
  state = recordSeen(state, julia.key, [1]);
  await writeSpoilerState(file, state);
  const back = await readSpoilerState(file);
  expect(back.settings).toEqual({ ...DEFAULT_SPOILERS, opponentMoves: true });
  expect(back).toMatchObject({ seen: { [julia.key]: [1] }, foundFieldNotes: ["ELECTERRAIN", "GLITCH"] });
  expect(applyUpdate(back, { clearSeen: true }).seen).toEqual({});
  expect(() => SpoilerUpdateSchema.parse({ settings: { opponentMoves: "yes" } })).toThrow();
  await writeFile(file, "{oops");
  await expect(readSpoilerState(file)).rejects.toThrow(/unreadable/);
});

it("reveals one more Pokémon at a time", () => {
  let state: SpoilerState = { settings: DEFAULT_SPOILERS, seen: {}, foundFieldNotes: [] };
  state = revealNext(state, julia);
  expect(state.seen).toEqual({ [julia.key]: [0] });
  state = revealNext(revealNext(state, julia), julia);
  expect(state.seen).toEqual({ [julia.key]: [0, 1] });
});

it("filters a trainer per switch; off means the key is absent", () => {
  const strict = trainerView(julia, DEFAULT_SPOILERS, [1]);
  expect(strict).toEqual({ key: julia.key, label: "Leader Julia", partyId: 0, partial: true, mons: [{ slot: 1, species: "PLUSLE", form: 0, level: 14 }] });
  expect(JSON.stringify(strict)).not.toMatch(/NUZZLE|PLUS"|ORANBERRY|VOLTORB/);
  expect(trainerView(julia, { ...DEFAULT_SPOILERS, opponentLevels: false }, [1]).mons[0]).toEqual({ slot: 1, species: "PLUSLE", form: 0 });
  expect(trainerView(julia, all(true), []).mons).toEqual([
    { slot: 0, species: "VOLTORB", form: 0, level: 13, moves: ["SPARK"], ability: "STATIC", item: null },
    { slot: 1, species: "PLUSLE", form: 0, level: 14, moves: ["NUZZLE"], ability: "PLUS", item: "ORANBERRY" },
  ]);
  expect(trainerView(julia, { ...all(false), opponentFullTeam: true, opponentItems: true }, []).mons[1]).toEqual({ slot: 1, species: "PLUSLE", form: 0, item: "ORANBERRY" });
});

it("hides boss context unless switched on", () => {
  expect(bossView(boss, DEFAULT_SPOILERS)).toMatchObject({ name: "Julia", fieldId: "ELECTERRAIN", context: null });
  expect(bossView(boss, { ...DEFAULT_SPOILERS, trainerContext: true }).context).toEqual({ group: "gym", order: 1, location: "Electric Studio", notes: ["Field can become Factory"] });
});

it("builds the bundle: field rules hidden until Field Notes are found, trainer index without teams", () => {
  const data: LoadedData = {
    game: {
      meta: { gameVersion: "t", extractedAt: "" }, types: [], chart: {}, species: {}, moves: {}, abilities: {}, items: {}, maps: {}, showdownNames: { species: {}, items: {}, moves: {}, abilities: {} },
      fields: { ELECTERRAIN: { id: "ELECTERRAIN", name: "Electric Terrain", description: "Electric moves boosted.", fieldAppSwitch: null }, GLITCH: { id: "GLITCH", name: "Glitch Field", description: "Dark becomes Normal.", fieldAppSwitch: null } },
      overlays: { NONE: { fieldId: "NONE", notes: [], source: "" }, ELECTERRAIN: { fieldId: "ELECTERRAIN", notes: [], source: "t" }, GLITCH: { fieldId: "GLITCH", notes: [], source: "t" } },
    },
    trainers: { [julia.key]: julia }, bosses: [boss],
  };
  const state = { settings: { ...DEFAULT_SPOILERS, fieldDetails: false }, seen: {}, foundFieldNotes: ["GLITCH"] };
  const b = buildBundle(data, state, ["ELECTERRAIN"]);
  expect(b.hiddenFields).toEqual([]);
  const none = buildBundle(data, state, null);
  expect(none.hiddenFields).toEqual(["ELECTERRAIN"]);
  expect(Object.keys(none.overlays).sort()).toEqual(["GLITCH", "NONE"]);
  expect(none.fields.ELECTERRAIN).toEqual({ id: "ELECTERRAIN", name: "Electric Terrain", description: "", fieldAppSwitch: null });
  expect(none.trainerIndex).toEqual([{ key: julia.key, trainerType: "LEADER_JULIA", name: "Julia", label: "Leader Julia", partyId: 0, maxLevel: 14 }]);
  expect(none.bosses[0].context).toBeNull();
  expect(none.spoilers.fieldDetails).toBe(false);
  expect(JSON.stringify(none)).not.toMatch(/VOLTORB|SPARK|Electric Studio/);
  expect(buildBundle(data, { ...state, settings: { ...state.settings, opponentLevels: false } }, null).trainerIndex[0]).not.toHaveProperty("maxLevel");
});

it("an update only changes the switches it names", () => {
  const base: SpoilerState = { settings: { ...DEFAULT_SPOILERS, opponentLevels: false }, seen: {}, foundFieldNotes: [] };
  const next = applyUpdate(base, SpoilerUpdateSchema.parse({ settings: { opponentMoves: true } }));
  expect(next.settings).toEqual({ ...DEFAULT_SPOILERS, opponentLevels: false, opponentMoves: true });
  expect(() => SpoilerUpdateSchema.parse({ settings: { nope: true } })).toThrow();
});
