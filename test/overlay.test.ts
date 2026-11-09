import { mkdtemp, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { buildOverlay } from "../server/overlay/build";
import { createOverlayWriter, overlayFile, writeAtomic } from "../server/overlay/write";
import { DEFAULT_SPOILERS } from "../shared/spoilers";
import type { FieldOverlay, GameData, LiveBattle } from "../shared/types";
import { TYPES, canonicalChart } from "../data/test/canonical-chart";

const form = (name: string, types: string[]) => ({ forms: [{ form: 0, formName: null, name, types, baseStats: [70, 70, 70, 70, 70, 70], abilities: [], hiddenAbility: null }] });
const field = (o: Partial<FieldOverlay> & { fieldId: string }): FieldOverlay => ({ notes: [], source: "test", ...o });
const data = {
  types: TYPES.map((id) => ({ id, name: id[0] + id.slice(1).toLowerCase() })),
  chart: canonicalChart(),
  species: {
    GENGAR: { id: "GENGAR", dexNum: 94, ...form("Gengar", ["GHOST", "POISON"]) },
    LUCARIO: { id: "LUCARIO", dexNum: 448, ...form("Lucario", ["FIGHTING", "STEEL"]) },
    SNORLAX: { id: "SNORLAX", dexNum: 143, ...form("Snorlax", ["NORMAL"]) },
    UMBREON: { id: "UMBREON", dexNum: 197, ...form("Umbreon", ["DARK"]) },
    PORYGONZ: { id: "PORYGONZ", dexNum: 474, ...form("Porygon-Z", ["NORMAL"]) },
    GOLEM: { id: "GOLEM", dexNum: 76, ...form("Golem", ["ROCK", "GROUND"]) },
    SCIZOR: { id: "SCIZOR", dexNum: 212, ...form("Scizor", ["BUG", "STEEL"]) },
  },
  fields: { GLITCH: { id: "GLITCH", name: "Glitch Field", description: "", fieldAppSwitch: null }, UNDERWATER: { id: "UNDERWATER", name: "Underwater", description: "", fieldAppSwitch: null } },
  overlays: { UNDERWATER: field({ fieldId: "UNDERWATER", failingMoveTypes: ["FIRE"] }), GLITCH: field({ fieldId: "GLITCH", invert: true }) },
} as unknown as GameData;

const pm = (species: string, nickname: string, extra: Partial<LiveBattle["party"][number]> = {}) => ({ species, form: 0, nickname, level: 50, hpPercent: 100, fainted: false, active: false, ...extra });
const live = (over: Partial<LiveBattle> = {}): LiveBattle => ({
  schema: 1, bridgeVersion: "1.0.0", updatedAt: "", battleId: "1", state: "active", isDouble: false, field: { id: "INDOOR", name: "INDOOR" }, trainer: null, match: null,
  foes: [{ slot: 0, name: "Gengar", species: "GENGAR", form: 0, formName: null, types: ["GHOST", "POISON"], hpPercent: 100, fainted: false }],
  party: [pm("LUCARIO", "Rio", { active: true }), pm("UMBREON", "Umbreon"), pm("SNORLAX", "Snorlax"), pm("SCIZOR", "Scizor", { fainted: true })],
  ...over,
});
const none = new Set<string>();

it("lists the foe's types and weaknesses as compact 4x and 2x groups", () => {
  const o = buildOverlay(live(), data, DEFAULT_SPOILERS, none)!;
  expect(o.field).toEqual({ id: "NONE", name: "No field" });
  expect(o.foes).toEqual([{ name: "Gengar", types: ["Ghost", "Poison"], weak4: [], weak2: ["Ground", "Psychic", "Ghost", "Dark"].sort((a, b) => TYPES.indexOf(a.toUpperCase() as never) - TYPES.indexOf(b.toUpperCase() as never)) }]);
});

it("applies the field's rules to weaknesses and picks", () => {
  const o = buildOverlay(live({ field: { id: "GLITCH", name: "GLITCH" } }), data, DEFAULT_SPOILERS, none)!;
  expect(o.field).toEqual({ id: "GLITCH", name: "Glitch Field" });
  expect(o.foes[0].weak2).not.toContain("Ground");
  expect(o.foes[0].weak4).toContain("Fighting");
  expect(o.foes[0].weak2).toContain("Normal");
});

it("picks up to three healthy bench Pokémon, never the active or fainted one, with a short tag", () => {
  const o = buildOverlay(live(), data, DEFAULT_SPOILERS, none)!;
  expect(o.picks!.map((p) => p.name).sort()).toEqual(["Snorlax", "Umbreon"]);
  expect(o.picks!.find((p) => p.name === "Snorlax")!.tag).toBe("immune Ghost");
  expect(o.picks!.length).toBeLessThanOrEqual(3);
  expect(Object.keys(o.picks![0]).sort()).toEqual(["name", "tag"]);
});

it("leaves picks out when nobody can switch in, and shows no overlay for ended battles", () => {
  expect(buildOverlay(live({ party: [pm("LUCARIO", "Rio", { active: true })] }), data, DEFAULT_SPOILERS, none)!.picks).toBeUndefined();
  expect(buildOverlay(live({ state: "ended" }), data, DEFAULT_SPOILERS, none)).toBeNull();
});

it("falls back to the shown species' types for a disguised foe and omits nothing it cannot know", () => {
  const o = buildOverlay(live({ foes: [{ ...live().foes[0], types: [] }] }), data, DEFAULT_SPOILERS, none)!;
  expect(o.foes[0].types).toEqual(["Ghost", "Poison"]);
});

it("uses the base chart for a hidden field, until its Field Notes are found", () => {
  const hidden = { ...DEFAULT_SPOILERS, fieldDetails: false };
  const l = live({ field: { id: "GLITCH", name: "GLITCH" } });
  expect(buildOverlay(l, data, hidden, none)!.foes[0].weak2).toContain("Ground");
  expect(buildOverlay(l, data, hidden, new Set(["GLITCH"]))!.foes[0].weak2).not.toContain("Ground");
});

it("sends the field-adjusted chart, remaps, failing types and secondary types for move markers", () => {
  const base = buildOverlay(live(), data, DEFAULT_SPOILERS, none)!.rules;
  expect(base.chart.FIRE.GRASS).toBe(2);
  expect(base.chart.NORMAL.GHOST).toBe(0);
  expect(base.chart.NORMAL.NORMAL).toBeUndefined();
  expect([base.remap, base.failing, base.secondary]).toEqual([[], [], []]);
  const glitch = buildOverlay(live({ field: { id: "GLITCH", name: "GLITCH" } }), data, DEFAULT_SPOILERS, none)!.rules;
  expect(glitch.chart.FIRE.GRASS).toBe(0.5);
  const water = buildOverlay(live({ field: { id: "UNDERWATER", name: "UNDERWATER" } }), data, DEFAULT_SPOILERS, none)!.rules;
  expect(water.failing).toEqual(["FIRE"]);
});

it("sends the base rules for a field whose details are hidden", () => {
  const hidden = { ...DEFAULT_SPOILERS, fieldDetails: false };
  const rules = buildOverlay(live({ field: { id: "UNDERWATER", name: "UNDERWATER" } }), data, hidden, none)!.rules;
  expect(rules.failing).toEqual([]);
});

const incoming = { slot: 3, species: "PORYGONZ", form: 0, level: 62, types: ["NORMAL"] };

it("switches the panel to the announced foe and ranks who to bring in", () => {
  const o = buildOverlay(live({ incoming }), data, DEFAULT_SPOILERS, none)!;
  expect(o.incoming).toBe(true);
  expect(o.foes).toEqual([{ name: "Porygon-Z", types: ["Normal"], weak4: [], weak2: ["Fighting"] }]);
  expect(o.picks![0]).toEqual({ name: "Rio", tag: "resists Normal", stay: true });
  expect(o.picks!.map((p) => p.name)).toEqual(["Rio", "Umbreon", "Snorlax"]);
  expect(o.picks!.length).toBeLessThanOrEqual(3);
});

it("leaves fainted Pokémon out of the bring-in list and doesn't suggest the active one unless it is best", () => {
  const party = [pm("SNORLAX", "Snorlax", { active: true }), pm("LUCARIO", "Rio"), pm("UMBREON", "Umbreon"), pm("SCIZOR", "Scizor", { fainted: true })];
  const o = buildOverlay(live({ incoming, party }), data, DEFAULT_SPOILERS, none)!;
  expect(o.picks!.map((p) => p.name)).toEqual(["Rio", "Umbreon"]);
  expect(o.picks!.every((p) => !p.stay)).toBe(true);
});

it("tells the field's rules apart in the bring-in list and stays offline-safe without foe types", () => {
  const o = buildOverlay(live({ incoming: { ...incoming, types: [] } }), data, DEFAULT_SPOILERS, none)!;
  expect(o.foes[0].types).toEqual(["Normal"]);
});

it("never writes levels, moves, abilities or items", () => {
  const text = JSON.stringify(buildOverlay(live({ foes: [{ ...live().foes[0], level: 99 }] }), data, { ...DEFAULT_SPOILERS, opponentLevels: true }, none));
  expect(text).not.toMatch(/level|move|abilit|item/i);
});

const dirs: string[] = [];
const tmp = async () => { const d = await mkdtemp(path.join(os.tmpdir(), "pokepal-overlay-")); dirs.push(d); return d; };
afterEach(() => { dirs.length = 0; });

it("writes overlay.json beside battle_state.json, atomically, and replaces it", async () => {
  const dir = await tmp();
  const file = overlayFile(path.join(dir, "PokePal", "battle_state.json"));
  expect(file).toBe(path.join(dir, "PokePal", "overlay.json"));
  await writeAtomic(file, '{"a":1}');
  await writeAtomic(file, '{"a":2}');
  expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ a: 2 });
  expect(await readdir(path.dirname(file))).toEqual(["overlay.json"]);
});

it("keeps the file fresh while a battle is active and removes it when it ends", async () => {
  const dir = await tmp();
  const file = path.join(dir, "overlay.json");
  let current: LiveBattle | null = live();
  const w = createOverlayWriter({ file, data, latest: () => current, settings: () => ({ settings: DEFAULT_SPOILERS, found: none }), refreshMs: 20 });
  await w.refresh();
  const first = JSON.parse(await readFile(file, "utf8")).updatedAt;
  await new Promise((r) => setTimeout(r, 80));
  expect(JSON.parse(await readFile(file, "utf8")).updatedAt).not.toBe(first);
  current = live({ state: "ended" });
  await w.refresh();
  await expect(readFile(file, "utf8")).rejects.toThrow();
  await w.close();
});
