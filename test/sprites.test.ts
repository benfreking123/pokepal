import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { expect, it } from "vitest";
import { registerSpriteRoutes, spriteCandidates } from "../server/sprites";
import type { LoadedData } from "../shared/types";

const data = { game: { species: { PIKACHU: { id: "PIKACHU", dexNum: 25, forms: [] } } } } as unknown as LoadedData;
const png = Buffer.from("89504e470d0a1a0a", "hex");

async function app(gameDir: string | null) {
  const a = Fastify();
  registerSpriteRoutes(a, gameDir, data);
  return a;
}

it("orders candidates by dex number, then form, then species id", () => {
  const c = spriteCandidates("/g", 25, "PIKACHU", 0).map((p) => path.relative("/g", p));
  expect(c[0]).toBe(path.join("Graphics", "Battlers", "025.png"));
  expect(spriteCandidates("/g", 25, "PIKACHU", 2)[0]).toBe(path.join("/g", "Graphics", "Battlers", "025_2.png"));
});

it("serves a front sprite from the game folder, cached, and 404s otherwise", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pokepal-sprites-"));
  await mkdir(path.join(dir, "Graphics", "Battlers"), { recursive: true });
  await writeFile(path.join(dir, "Graphics", "Battlers", "025.png"), png);
  const a = await app(dir);
  const ok = await a.inject("/api/sprites/PIKACHU/0");
  expect(ok.statusCode).toBe(200);
  expect(ok.headers["content-type"]).toBe("image/png");
  expect(ok.headers["cache-control"]).toContain("max-age");
  expect((await a.inject("/api/sprites/PIKACHU/3")).statusCode).toBe(200);
  expect((await a.inject("/api/sprites/MISSINGNO/0")).statusCode).toBe(404);
  expect((await a.inject("/api/sprites/..%2F..%2Fetc/0")).statusCode).toBe(404);
  expect((await (await app(null)).inject("/api/sprites/PIKACHU/0")).statusCode).toBe(404);
});
