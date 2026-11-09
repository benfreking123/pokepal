import { expect, it } from "vitest";
import { mapSave, toStatBlock } from "../server/save/mapSave";
import { readSaveFile, SaveParseError } from "../server/save/readSave";
import { hiddenPowerType, isShiny, STAT_ORDER } from "../server/save/schema";

const TYPE_IDS = ["NORMAL", "FIGHTING", "FLYING", "POISON", "GROUND", "ROCK", "BUG", "GHOST", "STEEL", "QMARKS", "FIRE", "WATER", "GRASS", "ELECTRIC", "PSYCHIC", "ICE", "DRAGON", "DARK", "FAIRY", "SHADOW"];
const has = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, {}]));
const data = {
  species: has("CHARIZARD", "AMPHAROS"), moves: has("WINGATTACK", "FLAMETHROWER", "THUNDERBOLT", "HIDDENPOWER"),
  items: has("CHARIZARDITEX"), abilities: has("BLAZE", "STATIC"), maps: { "240": "Spinel Pokemon Center" },
  types: TYPE_IDS.map((id) => ({ id, name: id })),
  fields: {
    INDOOR: { id: "INDOOR", name: "Indoor", description: "", fieldAppSwitch: 2 },
    UNDERWATER: { id: "UNDERWATER", name: "Underwater", description: "", fieldAppSwitch: 3 },
    GLITCH: { id: "GLITCH", name: "Glitch", description: "", fieldAppSwitch: null },
  },
} as never;

it("keeps the game's stat order, which is already Showdown's", () => {
  expect(toStatBlock([1, 2, 3, 4, 5, 6], STAT_ORDER)).toEqual({ hp: 1, atk: 2, def: 3, spa: 4, spd: 5, spe: 6 });
});

it("derives shininess from the IDs unless @shinyflag is set", () => {
  expect(isShiny(3_000_000_000, 54321, null)).toBe(false);
  expect(isShiny(0x10001, 0x10000, null)).toBe(true);
  expect(isShiny(0x10001, 0x10000, false)).toBe(false);
});

it("derives Hidden Power from the personal ID unless cached", () => {
  expect(hiddenPowerType(3_000_000_000, null, TYPE_IDS)).toBe("ROCK");
  expect(hiddenPowerType(3_000_000_000, "ICE", TYPE_IDS)).toBe("ICE");
});

it("reads and maps a save in the 19.5 layout", async () => {
  const read = await readSaveFile("test/fixtures/saves/synthetic-Game.rxdata");
  expect(read.roots).toHaveLength(1);
  expect(read.sha256).toMatch(/^[0-9a-f]{64}$/);
  const s = mapSave(read, data);
  expect(s.meta).toMatchObject({ trainerName: "Bean", playtimeSeconds: 84023, badgeCount: 5, mapId: 240, mapName: "Spinel Pokemon Center" });
  expect(s.party).toHaveLength(2);
  expect(s.party[0]).toMatchObject({
    uid: "p0", order: 0, species: "CHARIZARD", nickname: "Blunt", item: "CHARIZARDITEX", moves: ["WINGATTACK", "FLAMETHROWER"],
    ivs: { hp: 31, atk: 0, def: 31, spa: 30, spd: 31, spe: 29 }, evs: { hp: 4, spa: 252, spe: 252 }, shiny: false, hiddenPowerType: "ROCK",
  });
  expect(s.party[1]).toMatchObject({ species: "AMPHAROS", item: null, shiny: true, hiddenPowerType: "ICE" });
  expect(s.boxes).toHaveLength(50);
  expect(s.boxes[0]).toMatchObject({ name: "Box 1", mons: [{ uid: "b0-1", order: 6, isEgg: true, location: { kind: "box", box: 0, slot: 1 } }] });
  expect(s.unknownIds).toEqual(["TOGEPI"]);
  expect(s.fieldNotesFound).toEqual(["INDOOR"]);
});

it("rejects an unreadable save with SaveParseError", async () => {
  await expect(readSaveFile("test/fixtures/saves/missing.rxdata")).rejects.toBeInstanceOf(SaveParseError);
});
