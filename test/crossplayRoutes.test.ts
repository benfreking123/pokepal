import { copyFile, mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { beforeEach, expect, it } from "vitest";
import { ConfigSchema } from "../server/config";
import { registerCrossplayRoutes } from "../server/routes/crossplay";
import { registerSaveRoutes } from "../server/routes/save";
import { loadGameData } from "../server/data/loadData";

let app: ReturnType<typeof Fastify>;
let root: string;
let saveFile: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "pokepal-xp-routes-"));
  for (const d of ["state", "backups"]) await mkdir(path.join(root, d));
  saveFile = path.join(root, "Game.rxdata");
  await copyFile("test/fixtures/saves/synthetic-Game.rxdata", saveFile);
  const config = ConfigSchema.parse({ saveFile, stateDir: path.join(root, "state"), backupDir: path.join(root, "backups"), runaFormat: { kind: "rxdata" }, gameProcessNames: ["NoSuchGame.exe"] });
  const data = await loadGameData("test/fixtures/data", null);
  app = Fastify();
  registerSaveRoutes(app, config, data);
  registerCrossplayRoutes(app, config, data);
  await app.ready();
});

const LAN = "192.168.1.30";

it("refuses install and restore from the LAN, but not hand-off", async () => {
  const install = await app.inject({ method: "POST", url: "/api/crossplay/install", remoteAddress: LAN, payload: {} });
  expect(install.statusCode).toBe(403);
  const restore = await app.inject({ method: "POST", url: "/api/crossplay/restore", remoteAddress: LAN, payload: {} });
  expect(restore.statusCode).toBe(403);
  const status = await app.inject({ url: "/api/crossplay/status", remoteAddress: LAN });
  const sha = status.json().pc.sha256;
  const handoff = await app.inject({ method: "POST", url: "/api/crossplay/handoff", remoteAddress: LAN, payload: { expectedSha256: sha } });
  expect(handoff.statusCode).toBe(200);
  expect(handoff.json().status.ledger.holder).toBe("runa");
  const out = await app.inject({ url: "/api/crossplay/outbox", remoteAddress: LAN });
  expect(out.statusCode).toBe(200);
  expect(out.headers["content-disposition"]).toContain("Game.rxdata");
});

it("rejects a bad upload name and reports status", async () => {
  const bad = await app.inject({ method: "POST", url: "/api/crossplay/upload?name=x.txt", remoteAddress: LAN, headers: { "content-type": "application/octet-stream" }, payload: Buffer.from("x") });
  expect(bad.statusCode).toBe(400);
  const garbage = await app.inject({ method: "POST", url: "/api/crossplay/upload?name=Game.rxdata", remoteAddress: LAN, headers: { "content-type": "application/octet-stream" }, payload: Buffer.from("garbage") });
  expect(garbage.statusCode).toBe(422);
  const status = await app.inject({ url: "/api/crossplay/status", remoteAddress: LAN });
  expect(status.statusCode).toBe(200);
  expect(status.json().pc.trainerName).toBe("Bean");
});

it("asks for typed confirmation data on 409 and refuses a stale hash", async () => {
  const stale = await app.inject({ method: "POST", url: "/api/crossplay/handoff", payload: { expectedSha256: "stale" } });
  expect(stale.statusCode).toBe(409);
  expect(stale.json().code).toBe("FILE_CHANGED");
});

it("serves the save summary and 404s a missing save", async () => {
  const ok = await app.inject({ url: "/api/save/summary" });
  expect(ok.statusCode).toBe(200);
  expect(ok.json().party).toHaveLength(2);
  const backups = await app.inject({ url: "/api/crossplay/backups" });
  expect(backups.json()).toEqual([]);
});
