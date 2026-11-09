import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { PNG } from "pngjs";
import type { LoadedData } from "../shared/types";

/** Reborn's battler sheets: 192x192 cells, normal at x=0 and shiny at x=192, each form takes 384 rows (front, then back). */
export const CELL = 192;
export const FORM_ROWS = CELL * 2;
const SHEET_WIDTH = CELL * 2;
const MISS_TTL_MS = 30_000;

/**
 * File names the game tries, in its order (pbPokemonBitmap): zero-padded dex number then the lowercase species id,
 * the female `f` file first when asked for. Whole-image ("toobig") Pokémon keep one file per form as `<name>_<form>`.
 */
export function spriteNames(dexNum: number, species: string, form: number, female: boolean): string[] {
  const dex = String(dexNum).padStart(3, "0");
  const name = species.toLowerCase();
  const suffixes = form > 0 ? [`_${form}`, ""] : [""];
  const names: string[] = [];
  for (const base of [dex, name]) {
    for (const suffix of suffixes) {
      if (female) names.push(`${base}f${suffix}`);
      names.push(`${base}${suffix}`);
    }
  }
  return [...new Set(names)];
}

const isSheet = (png: PNG) => png.width === SHEET_WIDTH && png.height % FORM_ROWS === 0;

function crop(png: PNG, x: number, y: number, w: number, h: number): PNG {
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(png, out, x, y, w, h, 0, 0);
  return out;
}

const isEmpty = (png: PNG) => { for (let i = 3; i < png.data.length; i += 4) if (png.data[i] !== 0) return false; return true; };

/** Crops to the opaque pixels so the sprite fills its card; a fully transparent image is returned unchanged. */
export function trim(png: PNG): PNG {
  let minX = png.width, minY = png.height, maxX = -1, maxY = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? png : crop(png, minX, minY, maxX - minX + 1, maxY - minY + 1);
}

/**
 * The normal front picture for a form. A sheet is cropped to the form's front cell, falling back to form 0 when the sheet has no
 * such row (as the game does); a whole image (toobig) is used as is.
 */
export function frontSprite(png: PNG, form: number): PNG {
  if (!isSheet(png)) return png;
  const row = (f: number) => f * FORM_ROWS;
  const cell = (f: number) => (row(f) + CELL <= png.height ? crop(png, 0, row(f), CELL, CELL) : null);
  const wanted = cell(form);
  return wanted && !isEmpty(wanted) ? wanted : cell(0)!;
}

export function registerSpriteRoutes(app: FastifyInstance, gameDir: string | null, data: LoadedData | Error) {
  const cache = new Map<string, { png: Buffer | null; at: number }>();

  const locate = async (species: string, form: number, female: boolean): Promise<string | null> => {
    if (!gameDir || data instanceof Error) return null;
    const dex = data.game.species[species]?.dexNum;
    if (dex === undefined) return null;
    for (const n of spriteNames(dex, species, form, female)) {
      const file = path.join(gameDir, "Graphics", "Battlers", `${n}.png`);
      if (await stat(file).then((s) => s.isFile(), () => false)) return file;
    }
    return null;
  };

  const render = async (species: string, form: number, female: boolean): Promise<Buffer | null> => {
    const key = `${species}:${form}:${female}`;
    const hit = cache.get(key);
    if (hit && (hit.png || Date.now() - hit.at < MISS_TTL_MS)) return hit.png;
    let out: Buffer | null = null;
    const file = await locate(species, form, female);
    if (file) {
      try { out = PNG.sync.write(trim(frontSprite(PNG.sync.read(await readFile(file)), form))); } catch { out = null; }
    }
    cache.set(key, { png: out, at: Date.now() });
    return out;
  };

  app.get<{ Params: { species: string; form: string }; Querystring: { female?: string } }>("/api/sprites/:species/:form", async (req, reply) => {
    const form = Number(req.params.form);
    const png = Number.isInteger(form) && form >= 0 ? await render(req.params.species, form, req.query.female === "1") : null;
    if (!png) return reply.code(404).header("cache-control", "no-store").send({ error: "No sprite found" });
    return reply.header("content-type", "image/png").header("cache-control", "public, max-age=86400").send(png);
  });
}
