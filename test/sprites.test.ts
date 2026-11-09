import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { PNG } from "pngjs";
import { expect, it } from "vitest";
import { CELL, FORM_ROWS, frontSprite, registerSpriteRoutes, spriteNames, trim } from "../server/sprites";
import type { LoadedData } from "../shared/types";

const data = { game: { species: {
  PIKACHU: { id: "PIKACHU", dexNum: 25 }, ABRA: { id: "ABRA", dexNum: 63 }, KYUREM: { id: "KYUREM", dexNum: 646 },
} } } as unknown as LoadedData;

type Rgba = [number, number, number, number];
/** Synthetic image: each rect is [x, y, w, h, colour]; everything else is transparent. */
function image(width: number, height: number, rects: [number, number, number, number, Rgba][]): PNG {
  const png = new PNG({ width, height });
  for (const [rx, ry, rw, rh, c] of rects) {
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) png.data.set(c, (y * width + x) * 4);
  }
  return png;
}
const RED: Rgba = [255, 0, 0, 255];
const GREEN: Rgba = [0, 255, 0, 255];
const BLUE: Rgba = [0, 0, 255, 255];
const pixel = (png: PNG, x: number, y: number) => [...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4)];

/** Two forms: form 0 red in the normal cell, shiny cell green; form 1 blue at the front row, back row green. */
const sheet = () => image(CELL * 2, FORM_ROWS * 2, [
  [10, 20, 30, 40, RED], [CELL + 10, 20, 30, 40, GREEN],
  [10, FORM_ROWS + 5, 50, 60, BLUE], [10, FORM_ROWS + CELL + 5, 50, 60, GREEN],
]);

it("tries the padded dex number, then the lowercase name, female first when asked", () => {
  expect(spriteNames(25, "PIKACHU", 0, false)).toEqual(["025", "pikachu"]);
  expect(spriteNames(25, "PIKACHU", 0, true)).toEqual(["025f", "025", "pikachuf", "pikachu"]);
  expect(spriteNames(646, "KYUREM", 1, false)).toEqual(["646_1", "646", "kyurem_1", "kyurem"]);
});

it("crops the form's normal front cell and falls back to form 0 when the row is missing", () => {
  const f0 = frontSprite(sheet(), 0);
  expect([f0.width, f0.height]).toEqual([CELL, CELL]);
  expect(pixel(f0, 10, 20)).toEqual(RED);
  expect(pixel(frontSprite(sheet(), 1), 10, 5)).toEqual(BLUE);
  expect(pixel(frontSprite(sheet(), 2), 10, 20)).toEqual(RED);
});

it("falls back to form 0 when the form's cell is blank, and leaves whole images alone", () => {
  const blank = image(CELL * 2, FORM_ROWS * 2, [[10, 20, 30, 40, RED]]);
  expect(pixel(frontSprite(blank, 1), 10, 20)).toEqual(RED);
  const whole = image(CELL, CELL, [[0, 0, 5, 5, RED]]);
  expect(frontSprite(whole, 1)).toBe(whole);
});

it("trims transparent padding", () => {
  const t = trim(frontSprite(sheet(), 0));
  expect([t.width, t.height]).toEqual([30, 40]);
  const empty = image(4, 4, []);
  expect(trim(empty)).toBe(empty);
});

async function setup(files: Record<string, PNG>, gameDir = true) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pokepal-sprites-"));
  await mkdir(path.join(dir, "Graphics", "Battlers"), { recursive: true });
  for (const [name, png] of Object.entries(files)) await writeFile(path.join(dir, "Graphics", "Battlers", name), PNG.sync.write(png));
  const app = Fastify();
  registerSpriteRoutes(app, gameDir ? dir : null, data);
  return app;
}
const get = async (app: Awaited<ReturnType<typeof setup>>, url: string) => {
  const r = await app.inject(url);
  return { r, png: r.statusCode === 200 ? PNG.sync.read(r.rawPayload) : null };
};

it("serves trimmed form crops from a sheet named by lowercase species, with caching headers", async () => {
  const app = await setup({ "abra.png": sheet() });
  const a = await get(app, "/api/sprites/ABRA/1");
  expect(a.r.headers["content-type"]).toBe("image/png");
  expect(a.r.headers["cache-control"]).toContain("max-age");
  expect([a.png!.width, a.png!.height]).toEqual([50, 60]);
  expect(pixel(a.png!, 0, 0)).toEqual(BLUE);
  expect(pixel((await get(app, "/api/sprites/ABRA/5")).png!, 0, 0)).toEqual(RED);
});

it("prefers the padded dex file, uses the female file only when asked, and serves toobig per-form files whole", async () => {
  const app = await setup({
    "025.png": image(CELL * 2, FORM_ROWS, [[0, 0, 10, 10, RED]]),
    "025f.png": image(CELL * 2, FORM_ROWS, [[0, 0, 10, 10, GREEN]]),
    "kyurem.png": image(CELL, CELL, [[0, 0, 8, 8, RED]]),
    "kyurem_1.png": image(CELL, CELL, [[0, 0, 20, 20, BLUE]]),
  });
  expect(pixel((await get(app, "/api/sprites/PIKACHU/0")).png!, 0, 0)).toEqual(RED);
  expect(pixel((await get(app, "/api/sprites/PIKACHU/0?female=1")).png!, 0, 0)).toEqual(GREEN);
  const k1 = (await get(app, "/api/sprites/KYUREM/1")).png!;
  expect([k1.width, k1.height]).toEqual([20, 20]);
  expect((await get(app, "/api/sprites/KYUREM/0")).png!.width).toBe(8);
});

it("404s for unknown species, path tricks, missing files and a missing game folder", async () => {
  const app = await setup({});
  expect((await get(app, "/api/sprites/PIKACHU/0")).r.statusCode).toBe(404);
  expect((await get(app, "/api/sprites/MISSINGNO/0")).r.statusCode).toBe(404);
  expect((await get(app, "/api/sprites/..%2F..%2Fetc/0")).r.statusCode).toBe(404);
  expect((await get(await setup({}, false), "/api/sprites/PIKACHU/0")).r.statusCode).toBe(404);
});

it("says why a sprite is unavailable when its file cannot be decoded", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pokepal-sprites-"));
  await mkdir(path.join(dir, "Graphics", "Battlers"), { recursive: true });
  await writeFile(path.join(dir, "Graphics", "Battlers", "abra.png"), "not a png");
  const app = Fastify();
  registerSpriteRoutes(app, dir, data);
  const r = await app.inject("/api/sprites/ABRA/0");
  expect(r.statusCode).toBe(404);
  expect(r.json().error).toContain("abra.png could not be read");
  expect((await get(await setup({}), "/api/sprites/ABRA/0")).r.json().error).toContain("no matching file");
});
