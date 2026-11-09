import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { LoadedData } from "../shared/types";

const FOLDERS = [["Graphics", "Battlers"], ["Graphics", "Pokemon", "Front"], ["Graphics", "Pokemon"]];
const MISS_TTL_MS = 30_000;

/**
 * Where Reborn (Pokémon Essentials) keeps a front sprite, most likely first: the dex number zero-padded
 * to 3 digits, with `_<form>` for alternate forms. The species id is tried too for installs that name files by species.
 */
export function spriteCandidates(gameDir: string, dexNum: number, species: string, form: number): string[] {
  const dex = String(dexNum).padStart(3, "0");
  const stems = form > 0 ? [`${dex}_${form}`, `${species}_${form}`, `${species.toLowerCase()}_${form}`] : [dex, species, species.toLowerCase()];
  if (form > 0) stems.push(dex);
  return FOLDERS.flatMap((dir) => stems.map((s) => path.join(gameDir, ...dir, `${s}.png`)));
}

export function registerSpriteRoutes(app: FastifyInstance, gameDir: string | null, data: LoadedData | Error) {
  const found = new Map<string, { file: string | null; at: number }>();

  const locate = async (species: string, form: number): Promise<string | null> => {
    if (!gameDir || data instanceof Error) return null;
    const key = `${species}:${form}`;
    const hit = found.get(key);
    if (hit && (hit.file || Date.now() - hit.at < MISS_TTL_MS)) return hit.file;
    const dex = data.game.species[species]?.dexNum;
    let file: string | null = null;
    if (dex !== undefined) {
      for (const c of spriteCandidates(gameDir, dex, species, form)) {
        if (await stat(c).then((s) => s.isFile(), () => false)) { file = c; break; }
      }
    }
    found.set(key, { file, at: Date.now() });
    return file;
  };

  app.get<{ Params: { species: string; form: string } }>("/api/sprites/:species/:form", async (req, reply) => {
    const form = Number(req.params.form);
    const file = Number.isInteger(form) && form >= 0 ? await locate(req.params.species, form) : null;
    if (!file) return reply.code(404).header("cache-control", "no-store").send({ error: "No sprite found" });
    return reply.header("content-type", "image/png").header("cache-control", "public, max-age=86400").send(await readFile(file));
  });
}
