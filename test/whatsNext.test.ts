import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { ConfigSchema } from "../server/config";
import { registerSaveRoutes } from "../server/routes/save";
import { openSpoilers, registerSpoilerRoutes } from "../server/routes/spoilers";
import { registerWhatsNextRoutes } from "../server/routes/whatsNext";
import { mapSave } from "../server/save/mapSave";
import { bagItems, readProgress } from "../server/save/progress";
import { readSaveFile } from "../server/save/readSave";
import { loadWhatsNext, validateWhatsNext, WHATS_NEXT_FILE } from "../server/whatsnext/load";
import type { Boss, LoadedData } from "../shared/types";
import { computeWhatsNext, currentStepIndex, mapMatches, REVEAL_OPTIONAL, revealStep, trackedIds, type SaveProgress, type WhatsNextView } from "../shared/whatsNext";

const curated = validateWhatsNext(JSON.parse(readFileSync(WHATS_NEXT_FILE, "utf8")));
const realBosses = JSON.parse(readFileSync("data/versions/19.5.0/bosses.json", "utf8")) as Boss[];
const realMaps = Object.values(JSON.parse(readFileSync("data/versions/19.5.0/maps.json", "utf8")) as Record<string, string>);
const bossById = (id: string) => { const b = realBosses.find((x) => x.id === id); return b ? { name: b.name, location: b.location ?? null } : null; };

const progress = (o: Partial<SaveProgress> = {}): SaveProgress => ({
  badges: 0, postgame: 0, mapId: 0, mapName: null, playtimeSeconds: 0, variables: {}, switches: {}, items: {}, fieldNotes: false, fieldNoteCount: null, ...o,
});
const view = (p: SaveProgress, showNames = false, reveal: string[] = []) => computeWhatsNext(curated, p, { showNames, reveal: new Set(reveal), bossById });
// Ben's live save (internal/story-flags.md): 6 badges at Tanzan Cove, var 107 = 28, switches 414 and 599 on, bag has HM01 and HM04.
const BEN = progress({
  badges: 6, mapId: 232, mapName: "Tanzan Cove", playtimeSeconds: 24 * 3600 + 35 * 60,
  variables: { 107: 28, 552: 0 }, switches: { 414: true, 599: true },
  items: { HM01: true, HM04: true, HM07: false, HM08: false, BICYCLE: false, SUPERROD: false }, fieldNotes: true,
});

describe("curated data", () => {
  it("validates and has one main step per badge count", () => {
    expect(curated.mainSteps.map((s) => s.badges)).toEqual(Array.from({ length: 19 }, (_, i) => i));
    expect(curated.optional.length).toBeGreaterThan(20);
  });

  it("references real bosses and real map names", () => {
    for (const s of curated.mainSteps) {
      if (s.gym) expect(realBosses.some((b) => b.id === s.gym!.bossId), s.id).toBe(true);
      for (const leg of s.route) for (const m of leg.maps) expect(realMaps.some((n) => mapMatches([m], n)), `${s.id}: ${m}`).toBe(true);
    }
  });

  it("only links to https source pages and never embeds script or save content", () => {
    for (const s of Object.values(curated.sources)) if (s.url) expect(s.url).toMatch(/^https:\/\/pokemon-reborn\.fandom\.com\/wiki\//);
    expect(readFileSync(WHATS_NEXT_FILE, "utf8")).not.toMatch(/\$game_|\.rxdata|\.png/);
  });

  it("rejects unknown source ids and out-of-order steps", () => {
    const bad = structuredClone(curated);
    bad.optional[0].sources = ["nope"];
    expect(() => validateWhatsNext(bad)).toThrow(/unknown source nope/);
    const swapped = structuredClone(curated);
    [swapped.mainSteps[0], swapped.mainSteps[1]] = [swapped.mainSteps[1], swapped.mainSteps[0]];
    expect(() => validateWhatsNext(swapped)).toThrow(/must be for 0 badges/);
  });

  it("tracks the game's own completion variables and switches", () => {
    const t = trackedIds(curated);
    expect(t.variables).toEqual(expect.arrayContaining([150, 173, 339, 438, 549]));
    expect(t.switches).toEqual(expect.arrayContaining([414, 599, 1028]));
    expect(t.items).toEqual(expect.arrayContaining(["HM01", "HM04", "HM07", "HM08", "BICYCLE", "SUPERROD"]));
  });
});

describe("reading progress from the synthetic save", () => {
  it("takes badges, map, Field Notes and only the tracked ids", async () => {
    const read = await readSaveFile("test/fixtures/saves/synthetic-Game.rxdata");
    const data = {
      species: {}, moves: {}, items: {}, abilities: {}, maps: { "240": "Spinel Pokemon Center" }, types: [],
      fields: { INDOOR: { id: "INDOOR", name: "Indoor", description: "", fieldAppSwitch: 2 } },
    } as never;
    const s = mapSave(read, data, trackedIds(curated));
    expect(s.progress).toMatchObject({ badges: 5, postgame: 0, mapId: 240, mapName: "Spinel Pokemon Center", playtimeSeconds: 84023, fieldNotes: false, fieldNoteCount: 1, variables: {} });
    expect(Object.keys(s.progress.switches).map(Number)).toEqual(expect.arrayContaining([414, 599]));
    expect(s.progress.switches[414]).toBe(false);
    expect(computeWhatsNext(curated, s.progress, { showNames: false, reveal: new Set(), bossById }).current?.id).toBe("badges-5");
  });

  it("reads Game_Variables/@data and Game_Switches/@data by id", () => {
    const roots = [{
      Trainer: { "@badges": [...Array(6).fill(true), ...Array(12).fill(false)], "@postgame": null },
      playtime: 40 * (24 * 3600 + 25 * 60), map_id: 244,
      switches: { "@data": Object.assign(Array(2400).fill(false), { 414: true, 599: true }) },
      variable: { "@data": Object.assign(Array(900).fill(0), { 150: 12, 438: 3 }) },
    }];
    const p = readProgress(roots, trackedIds(curated), { mapName: "Tanzan Mountain", fieldNoteCount: null });
    expect(p).toMatchObject({ badges: 6, postgame: 0, mapId: 244, playtimeSeconds: 24 * 3600 + 25 * 60, fieldNotes: true });
    expect(p.variables).toMatchObject({ 150: 12, 438: 3, 549: 0 });
    expect(p.switches[414]).toBe(true);
    expect(p.switches[1028]).toBe(false);
  });
});

describe("main story", () => {
  it("places Ben (6 badges, Tanzan Cove) on the last leg of the 7th-badge route", () => {
    const v = view(BEN);
    expect(v.current?.id).toBe("badges-6");
    expect(v.current?.title).toMatch(/Tanzan/);
    expect(v.current?.legs.map((l) => `${l.state}:${l.where}`)).toEqual([
      "done:Belrose Manse (Tanzan Cove area)", "done:Tanzan Mountain", "done:Tanzan Meteor Base", "here:Tanzan Cove",
    ]);
    expect(view({ ...BEN, mapId: 244, mapName: "Tanzan Mountain" }).current?.legs.map((l) => l.state)).toEqual(["done", "here", "todo", "todo"]);
    expect(v.completedSteps).toHaveLength(6);
  });

  it("moves to the next step as soon as a badge is earned and when the map matches a floor name", () => {
    expect(view(progress({ badges: 7 })).current?.id).toBe("badges-7");
    expect(currentStepIndex(curated.mainSteps, progress({ badges: 18 }))).toBe(18);
    expect(mapMatches(["Blacksteam Factory"], "Blacksteam Factory 2F")).toBe(true);
    expect(mapMatches(["Route 1"], "Route 10")).toBe(false);
  });

  it("starts at the beginning for a fresh save and finishes after postgame starts", () => {
    expect(view(progress()).current?.id).toBe("badges-0");
    const done = view(progress({ badges: 18, postgame: 3 }));
    expect(done.storyComplete).toBe(true);
    expect(done.current).toBeNull();
    expect(done.ahead).toEqual([]);
  });
});

describe("spoilers", () => {
  const bossNames = realBosses.flatMap((b) => [b.name, b.name.split(" ")[0]]).filter((n) => n.length > 3);
  const namedBattleText = curated.mainSteps.flatMap((s) => s.namedBattles).concat(curated.optional.flatMap((o) => o.namedBattles ?? []));

  it("default view names no bosses, gym numbers, rewards or battles anywhere", () => {
    const text = JSON.stringify(view(BEN));
    for (const n of ["Noel", "Radomus", "Sirius", "ZEL", "Sigmund", "Gargantuan", "Badge 7", "Hidden Power"]) expect(text, n).not.toContain(n);
    for (const n of namedBattleText) expect(text).not.toContain(n);
    const v = view(BEN);
    expect(v.current?.gym).toBeNull();
    expect(v.current?.namedBattles).toBeNull();
    expect(v.current?.rewards).toBeNull();
    expect(bossNames.length).toBeGreaterThan(10);
  });

  it("hides every step beyond the current one behind a reveal, and reveals only what was asked for", () => {
    const v = view(BEN);
    expect(v.ahead.map((a) => a.locked)).toEqual([true, true, true]);
    expect(v.moreAhead).toBe(19 - 7 - 3);
    const text = JSON.stringify(v);
    for (const s of curated.mainSteps.slice(7)) expect(text).not.toContain(s.title);
    const revealed = view(BEN, false, [revealStep("badges-7")]);
    expect(revealed.ahead.map((a) => a.locked)).toEqual([false, true, true]);
    expect(revealed.ahead[0]).toMatchObject({ id: "badges-7", title: curated.mainSteps[7].title });
    expect(JSON.stringify(revealed)).not.toContain(curated.mainSteps[8].title);
  });

  it("hides optional objectives that are not open yet until revealed", () => {
    const hidden = view(BEN);
    expect(hidden.optionalAhead.revealed).toBe(false);
    expect(hidden.optionalAhead.items).toEqual([]);
    expect(hidden.optionalAhead.count).toBe(curated.optional.filter((o) => o.minBadges > 6).length);
    const text = JSON.stringify(hidden);
    for (const o of curated.optional.filter((x) => x.minBadges > 6)) expect(text).not.toContain(o.title);
    const shown = view(BEN, false, [REVEAL_OPTIONAL]);
    expect(shown.optionalAhead.items.map((i) => i.id)).toEqual(curated.optional.filter((o) => o.minBadges > 6).map((o) => o.id));
  });

  it("shows boss names, the gym number and named battles only with trainer context on", () => {
    const v = view(BEN, true);
    expect(v.current?.gym).toEqual({ number: 7, bossName: "Noel", location: "Tanzan Cove" });
    expect(v.current?.namedBattles).toContain("ZEL (Tanzan Meteor Base)");
    expect(v.current?.rewards).toContain("TM10 Hidden Power (Tanzan Cove)");
    expect(v.optionalNow.find((i) => i.id === "tanzan-depths-boss")?.namedBattles).toEqual(["Pokemon Gargantuan"]);
  });
});

describe("optional objectives", () => {
  it("lists what is open for Ben now, in wiki order, and not later or expired ones", () => {
    const ids = view(BEN).optionalNow.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(["magikarp", "day-care", "police", "gang-raid", "missing-furniture", "eevee-petting", "museum-fossil", "tara-identity", "bicycle", "unlock-rock-smash", "unlock-flash", "tanzan-depths-boss", "memory-dragon", "memory-bug"]));
    expect(ids).not.toContain("rainbow-scent");
    expect(ids).not.toContain("chess-puzzle");
    expect(ids).not.toContain("starter-egg");
  });

  it("flags time-limited quests as a last chance on their final badge only", () => {
    expect(view(BEN).optionalNow.find((i) => i.id === "police")?.lastChance).toBe(true);
    expect(view(progress({ badges: 5 })).optionalNow.find((i) => i.id === "police")?.lastChance).toBe(false);
    expect(view(progress({ badges: 7 })).optionalNow.map((i) => i.id)).not.toContain("police");
  });

  it("marks items done from the game's own flags", () => {
    const noSnax = view({ ...BEN, switches: {} });
    expect(noSnax.optionalNow.find((i) => i.id === "solrock-lunatone")?.done).toBe(false);
    expect(view(BEN).optionalDone.map((i) => i.id)).toContain("solrock-lunatone");

    const late = view(progress({ badges: 14, variables: { 150: 40, 173: 8, 438: 21, 339: 10 } }));
    expect(late.optionalDone.map((i) => i.id).sort()).toEqual(["chess-puzzle", "route-2", "starter-egg"]);
    expect(late.optionalNow.map((i) => i.id)).toContain("devon-corp");
  });

  it("ticks field-move unlocks from the bag and leaves missing ones open", () => {
    const v = view(BEN);
    expect(v.optionalDone.map((i) => i.id)).toEqual(expect.arrayContaining(["unlock-cut", "unlock-strength"]));
    const open = Object.fromEntries(v.optionalNow.map((i) => [i.id, i]));
    for (const id of ["unlock-rock-smash", "unlock-flash", "bicycle", "tara-identity"]) expect(open[id], id).toMatchObject({ tracked: true, done: false });
  });

  it("reads bag items from any [symbol, quantity] layout", () => {
    const bag = { "@pockets": [[], [["HM01", 1], ["HM07", 0]], { "@items": [["BICYCLE", 2]] }] };
    expect(bagItems(bag, ["HM01", "HM07", "BICYCLE", "SUPERROD"])).toEqual({ HM01: true, HM07: false, BICYCLE: true, SUPERROD: false });
    expect(bagItems(undefined, ["HM01"])).toEqual({ HM01: false });
  });

  it("does not claim completion for items the save cannot show", () => {
    const item = view(BEN).optionalNow.find((i) => i.id === "magikarp");
    expect(item).toMatchObject({ tracked: false, done: false });
  });
});

describe("GET /api/whats-next", () => {
  async function build(trainerContext: boolean) {
    const dir = await mkdtemp(path.join(os.tmpdir(), "pokepal-wn-"));
    const store = await openSpoilers(path.join(dir, "spoilers.json"));
    store.state.settings.trainerContext = trainerContext;
    const data = {
      game: { meta: { gameVersion: "t", extractedAt: "" }, types: [], chart: {}, species: {}, moves: {}, abilities: {}, items: {}, maps: { "240": "Spinel Pokemon Center" }, showdownNames: { species: {}, items: {}, moves: {}, abilities: {} }, fields: {}, overlays: {} },
      trainers: {}, bosses: realBosses,
    } as unknown as LoadedData;
    const config = ConfigSchema.parse({ saveFile: "test/fixtures/saves/synthetic-Game.rxdata" });
    const app = Fastify();
    registerSpoilerRoutes(app, store);
    registerSaveRoutes(app, config, data);
    registerWhatsNextRoutes(app, config, data, store);
    return app;
  }

  it("serves the spoiler-safe view by default and honours reveal tokens", async () => {
    const app = await build(false);
    const res = await app.inject("/api/whats-next");
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    const v = res.json() as WhatsNextView;
    expect(v.current?.id).toBe("badges-5");
    expect(v.current?.gym).toBeNull();
    expect(res.body).not.toContain("Serra");
    const revealed = (await app.inject(`/api/whats-next?reveal=${revealStep("badges-6")}`)).json() as WhatsNextView;
    expect(revealed.ahead[0]).toMatchObject({ locked: false, id: "badges-6" });
  });

  it("includes boss names when the existing trainer-context switch is on", async () => {
    const v = (await (await build(true)).inject("/api/whats-next")).json() as WhatsNextView;
    expect(v.current?.gym).toMatchObject({ number: 6, bossName: "Serra" });
  });

  it("loads the same curated file the tests validate", async () => {
    expect((await loadWhatsNext()).mainSteps).toHaveLength(19);
  });
});
