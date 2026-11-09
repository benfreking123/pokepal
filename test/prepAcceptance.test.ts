import path from "node:path";
import { beforeAll, expect, it } from "vitest";
import { loadGameData } from "../server/data/loadData";
import { buildMatrix, pickTeam } from "../shared/prep/pick";
import { toFoes, type PrepCandidate } from "../shared/prep/score";
import { searchTrainers } from "../shared/prep/trainers";
import { NO_FIELD } from "../shared/typechart";
import type { LoadedData } from "../shared/types";
import { bossView } from "../server/spoilers/filter";
import { DEFAULT_SPOILERS } from "../shared/spoilers";

let data: LoadedData;
beforeAll(async () => { data = await loadGameData(path.resolve("data/versions"), "19.5.0"); });

const GYM_LEADERS = ["Julia", "Florinia", "Shelly", "Shade", "Aya", "Serra", "Noel", "Radomus", "Luna", "Samson", "Charlotte", "Terra", "Ciel", "Adrienn", "Titania", "Amaria", "Hardy", "Saphira"];

it("features all 18 gym leaders in story order, plus Sirius and the league", () => {
  const gyms = data.bosses.filter((b) => b.group === "gym").sort((a, b) => a.order - b.order);
  expect(gyms.map((b) => b.name)).toEqual(GYM_LEADERS);
  expect(data.bosses.filter((b) => b.id.startsWith("sirius")).length).toBeGreaterThanOrEqual(3);
  expect(data.bosses.every((b) => b.source.length > 0)).toBe(true);
  expect(new Set(data.bosses.map((b) => b.order)).size).toBe(data.bosses.length);
});

it("searches every trainer with featured bosses first, and hides story context by default", () => {
  const index = Object.values(data.trainers).map(({ key, trainerType, name, label, partyId }) => ({ key, trainerType, name, label, partyId }));
  const views = data.bosses.map((b) => bossView(b, DEFAULT_SPOILERS));
  expect(views.every((b) => b.context === null)).toBe(true);
  const hits = searchTrainers(index, views, "julia", 50);
  expect(hits[0].boss?.id).toBe("julia");
  expect(hits.length).toBeGreaterThan(1);
  expect(searchTrainers(index, views, "sirius")[0].boss?.name).toMatch(/^Sirius/);
});

const candidate = (uid: string, name: string, level: number, types: string[], order: number): PrepCandidate => ({ uid, name, level, types, order, moves: [] });

it("is deterministic, follows the field, and honours lock and exclude against a real boss", () => {
  const trainer = data.trainers["JULIA:Julia:0"];
  const view = { key: trainer.key, label: trainer.label, partyId: 0, partial: false, mons: trainer.mons.map((m, slot) => ({ slot, species: m.species, form: m.form, level: m.level })) };
  const foes = toFoes(view, data.game);
  expect(foes).toHaveLength(6);
  expect(foes.every((f) => f.moves === undefined && f.ability === undefined && f.item === undefined)).toBe(true);
  const pool = [
    candidate("a", "Diglett", 30, ["GROUND"], 0), candidate("b", "Rattata", 30, ["NORMAL"], 1), candidate("c", "Sandslash", 30, ["GROUND"], 2),
    candidate("d", "Pidgey", 30, ["NORMAL", "FLYING"], 3), candidate("e", "Wooper", 30, ["WATER", "GROUND"], 4), candidate("f", "Caterpie", 30, ["BUG"], 5), candidate("g", "Machop", 30, ["FIGHTING"], 6),
  ];
  const run = (fieldId: string, opts = { locked: [] as string[], excluded: [] as string[] }) => {
    const overlay = data.game.overlays[fieldId] ?? NO_FIELD;
    return pickTeam(pool, foes.length, buildMatrix(data.game.chart, overlay, pool, foes), opts);
  };
  const a = run("ELECTERRAIN");
  expect(run("ELECTERRAIN").team).toEqual(a.team);
  expect(a.team).toHaveLength(6);
  expect(a.team).toContain("a");
  expect(run("ELECTERRAIN", { locked: ["f"], excluded: [] }).team[0]).toBe("f");
  const ex = run("ELECTERRAIN", { locked: [], excluded: ["a", "c"] }).team;
  expect(ex).toHaveLength(5);
  expect(ex).not.toContain("a");
  expect(ex).not.toContain("c");
});
