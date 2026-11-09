import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { expect, it } from "vitest";
import { ConfigSchema } from "../server/config";
import { registerConfigRoutes } from "../server/routes/config";
import { registerDataRoutes } from "../server/routes/data";
import { openSpoilers, registerSpoilerRoutes } from "../server/routes/spoilers";
import { registerTrainerRoutes } from "../server/routes/trainers";
import type { LoadedData, TrainerFull } from "../shared/types";

const julia: TrainerFull = {
  key: "LEADER_JULIA:Julia:0", trainerType: "LEADER_JULIA", name: "Julia", label: "Leader Julia", partyId: 0,
  mons: [
    { species: "VOLTORB", form: 0, level: 13, moves: ["SPARK"], ability: "STATIC", item: null },
    { species: "PLUSLE", form: 0, level: 14, moves: ["NUZZLE"], ability: "PLUS", item: "ORANBERRY" },
  ],
};
const data: LoadedData = {
  game: {
    meta: { gameVersion: "t", extractedAt: "" }, types: [], chart: {}, species: {}, moves: {}, abilities: {}, items: {}, maps: {}, showdownNames: { species: {}, items: {}, moves: {}, abilities: {} },
    fields: {}, overlays: { NONE: { fieldId: "NONE", notes: [], source: "" } },
  },
  trainers: { [julia.key]: julia }, bosses: [],
};

async function build() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pokepal-routes-"));
  const store = await openSpoilers(path.join(dir, "spoilers.json"));
  const app = Fastify();
  registerSpoilerRoutes(app, store);
  registerDataRoutes(app, data, store, () => null);
  registerTrainerRoutes(app, data, store);
  const configFile = path.join(dir, "pokepal.config.json");
  const cwd = process.cwd();
  process.chdir(dir);
  registerConfigRoutes(app, ConfigSchema.parse({}), {});
  process.chdir(cwd);
  return { app, dir, configFile };
}

it("keeps trainer details out of the bundle and the trainer view by default", async () => {
  const { app } = await build();
  const bundle = await app.inject("/api/data/bundle");
  expect(bundle.statusCode).toBe(200);
  expect(bundle.headers["cache-control"]).toBe("no-store");
  expect(bundle.body).not.toMatch(/SPARK|NUZZLE|VOLTORB|"mons"/);
  const view = await app.inject(`/api/trainers/${encodeURIComponent(julia.key)}`);
  expect(view.json().mons).toEqual([]);
  expect(view.body).not.toMatch(/"moves"/);
  expect((await app.inject({ method: "POST", url: `/api/trainers/${encodeURIComponent(julia.key)}/reveal-next` })).json().mons).toEqual([{ slot: 0, species: "VOLTORB", form: 0, level: 13 }]);
  expect((await app.inject("/api/trainers/NOPE")).statusCode).toBe(404);
});

it("applies spoiler switches to the next response and rejects unknown ones", async () => {
  const { app } = await build();
  const url = `/api/trainers/${encodeURIComponent(julia.key)}/reveal-next`;
  await app.inject({ method: "POST", url });
  const put = await app.inject({ method: "PUT", url: "/api/spoilers", payload: { settings: { opponentMoves: true } } });
  expect(put.statusCode).toBe(200);
  expect(put.json().settings.opponentMoves).toBe(true);
  const view = await app.inject(`/api/trainers/${encodeURIComponent(julia.key)}`);
  expect(view.json().mons[0].moves).toEqual(["SPARK"]);
  const bad = await app.inject({ method: "PUT", url: "/api/spoilers", payload: { settings: { nope: true } } });
  expect(bad.statusCode).toBe(400);
  expect((await app.inject("/api/spoilers")).json().settings.opponentMoves).toBe(true);
});

it("allows config changes only from the PC", async () => {
  const { app, dir } = await build();
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    const lan = await app.inject({ method: "PUT", url: "/api/config", payload: {}, remoteAddress: "192.168.1.30" });
    expect(lan.statusCode).toBe(403);
    const local = await app.inject({ method: "PUT", url: "/api/config", payload: {}, remoteAddress: "127.0.0.1" });
    expect(local.statusCode).toBe(200);
    expect(local.json()).toEqual({ restartRequired: true });
  } finally {
    process.chdir(cwd);
  }
});
