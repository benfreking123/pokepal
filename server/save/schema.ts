import { ivar, sym } from "./readSave";

export const FRAME_RATE = 40;
export const SHINY_CHANCE = 700;
export const HIDDEN_POWER_EXCLUDED = ["NORMAL", "QMARKS", "SHADOW"];

const root = (roots: unknown[]) => (roots[0] ?? {}) as Record<string, unknown>;
const list = (v: unknown) => (Array.isArray(v) ? v : []);

export const SAVE_PATHS = {
  trainer: (roots: unknown[]) => root(roots).Trainer,
  playtimeSeconds: (roots: unknown[]) => Math.floor(Number(root(roots).playtime ?? 0) / FRAME_RATE),
  mapId: (roots: unknown[]) => Number(root(roots).map_id ?? 0),
  storage: (roots: unknown[]) => root(roots).PokemonStorage,
  switches: (roots: unknown[]): unknown[] | null => {
    const data = ivar(root(roots).switches, "data");
    return Array.isArray(data) ? data : null;
  },
  trainerName: (trainer: unknown) => String(ivar(trainer, "name") ?? ""),
  party: (trainer: unknown) => list(ivar(trainer, "party")),
  badges: (trainer: unknown) => list(ivar(trainer, "badges")),
  boxes: (storage: unknown) => list(ivar(storage, "boxes")),
  boxName: (box: unknown) => String(ivar(box, "name") ?? ""),
  boxMons: (box: unknown) => list(ivar(box, "pokemon")),
} as const;

export const MON = {
  species: (m: unknown) => sym(ivar(m, "species")) ?? String(ivar(m, "species")),
  form: (m: unknown) => Number(ivar(m, "form") ?? 0),
  nickname: (m: unknown) => (typeof ivar(m, "name") === "string" ? (ivar(m, "name") as string) : null),
  level: (m: unknown) => Number(ivar(m, "level") ?? 0),
  item: (m: unknown) => sym(ivar(m, "item")),
  ability: (m: unknown) => sym(ivar(m, "ability")),
  nature: (m: unknown) => sym(ivar(m, "nature")),
  moves: (m: unknown) => list(ivar(m, "moves")).map((mv) => sym(ivar(mv, "move")) ?? sym(mv)).filter((x): x is string => !!x),
  ivs: (m: unknown) => list(ivar(m, "iv")) as number[],
  evs: (m: unknown) => list(ivar(m, "ev")) as number[],
  personalId: (m: unknown) => Number(ivar(m, "personalID") ?? 0),
  trainerId: (m: unknown) => Number(ivar(m, "trainerID") ?? 0),
  shinyFlag: (m: unknown) => (typeof ivar(m, "shinyflag") === "boolean" ? (ivar(m, "shinyflag") as boolean) : null),
  cachedHiddenPowerType: (m: unknown) => sym(ivar(m, "hptype")),
  isEgg: (m: unknown) => Number(ivar(m, "eggsteps") ?? 0) > 0,
} as const;

// Already Showdown's order: HP, Atk, Def, SpA, SpD, Spe (PBStats HP=0 … SPDEF=4, SPEED=5).
export const STAT_ORDER = ["hp", "atk", "def", "spa", "spd", "spe"] as const;

// Pokemon.rb isShiny?: an explicit @shinyflag wins, otherwise the personal/trainer ID test.
export function isShiny(personalId: number, trainerId: number, flag: boolean | null): boolean {
  if (flag !== null) return flag;
  const x = (personalId ^ trainerId) >>> 0;
  return ((x & 0xffff) ^ (x >>> 16)) < SHINY_CHANCE;
}

// pbHiddenPower: @hptype is only a cache; the type comes from the personal ID, not the IVs.
export function hiddenPowerType(personalId: number, cached: string | null, typeIds: string[]): string | null {
  if (cached) return cached;
  const pool = typeIds.filter((t) => !HIDDEN_POWER_EXCLUDED.includes(t));
  return pool.length ? pool[personalId % pool.length] : null;
}
