import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Boss, FieldOverlay, GameData, LoadedData, TrainerFull } from "../../shared/types";
import { mergeOverlay } from "../../shared/typechart";

export class DataLoadError extends Error {}

async function json<T>(file: string): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (e) {
    throw new DataLoadError(`Could not read ${file}: ${(e as Error).message}. Run "npm run extract".`);
  }
}

type RawTrainers = Record<string, { key: string; trainerType: string; name: string; partyId: number; mons: Record<string, unknown>[] }>;
const strOrNull = (v: unknown) => (typeof v === "string" ? v : null);

export const humanizeTrainerType = (id: string) =>
  id.split("_").filter(Boolean).map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");

// Essentials leftovers in TYPEHASH that no Reborn Pokémon or move uses; QMARKS ("???") stays.
export const UNUSED_TYPES = ["SHADOW"];

const dropTypes = (chart: GameData["chart"]): GameData["chart"] =>
  Object.fromEntries(Object.entries(chart).filter(([atk]) => !UNUSED_TYPES.includes(atk))
    .map(([atk, row]) => [atk, Object.fromEntries(Object.entries(row).filter(([def]) => !UNUSED_TYPES.includes(def)))]));

export async function loadGameData(dataDir: string, version: string | null): Promise<LoadedData> {
  const v = version ?? (await json<{ latest: string }>(path.join(dataDir, "manifest.json"))).latest;
  const dir = path.join(dataDir, v);
  const f = <T>(name: string) => json<T>(path.join(dir, name));

  const [meta, types, species, moves, abilities, items, fields, curated, rawTrainers, trainerTypes, bosses, maps, showdownNames] = await Promise.all([
    f<GameData["meta"]>("meta.json"),
    f<{ types: GameData["types"]; chart: GameData["chart"] }>("types.json"),
    f<GameData["species"]>("species.json"),
    f<GameData["moves"]>("moves.json"),
    f<GameData["abilities"]>("abilities.json"),
    f<GameData["items"]>("items.json"),
    f<Record<string, { id: string; name: string; description: string; fieldAppSwitch?: number | null; rules: Partial<FieldOverlay> }>>("fields.json"),
    f<FieldOverlay[]>("field-overlays.json"),
    f<RawTrainers>("trainers.json"),
    f<Record<string, { name: string }>>("trainer-types.json"),
    f<Boss[]>("bosses.json"),
    f<GameData["maps"]>("maps.json"),
    f<GameData["showdownNames"]>("showdown-names.json"),
  ]);

  const curatedById = new Map(curated.map((o) => [o.fieldId, o]));
  const overlays: GameData["overlays"] = { NONE: mergeOverlay("NONE", undefined, undefined) };
  for (const field of Object.values(fields)) overlays[field.id] = mergeOverlay(field.id, field.rules, curatedById.get(field.id));

  const trainers: Record<string, TrainerFull> = {};
  for (const t of Object.values(rawTrainers)) {
    trainers[t.key] = {
      key: t.key, trainerType: t.trainerType, name: t.name, partyId: t.partyId,
      label: `${trainerTypes[t.trainerType]?.name ?? humanizeTrainerType(t.trainerType)} ${t.name}`.trim(),
      mons: t.mons.map((m) => ({
        species: String(m.species), form: Number(m.form ?? 0), level: Number(m.level ?? 0),
        moves: Array.isArray(m.moves) ? m.moves.filter((x): x is string => typeof x === "string") : [],
        ability: strOrNull(m.ability), item: strOrNull(m.item),
      })),
    };
  }

  const game: GameData = {
    meta: { gameVersion: meta.gameVersion, extractedAt: meta.extractedAt },
    types: types.types.filter((t) => !UNUSED_TYPES.includes(t.id)), chart: dropTypes(types.chart), species, moves, abilities, items,
    fields: Object.fromEntries(Object.values(fields).map((x) => [x.id, { id: x.id, name: x.name, description: x.description, fieldAppSwitch: x.fieldAppSwitch ?? null }])),
    overlays, maps, showdownNames,
  };
  return { game, trainers, bosses };
}
