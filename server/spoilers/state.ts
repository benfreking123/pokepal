import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { DEFAULT_SPOILERS } from "../../shared/spoilers";
import type { SpoilerSettings, TrainerFull } from "../../shared/types";

const Settings = z.object(
  Object.fromEntries(Object.entries(DEFAULT_SPOILERS).map(([k, v]) => [k, z.boolean().default(v)])) as Record<keyof SpoilerSettings, z.ZodDefault<z.ZodBoolean>>,
);
export const SpoilerStateSchema = z.object({
  settings: Settings.prefault({}),
  seen: z.record(z.string(), z.array(z.number().int().nonnegative())).default({}),
  foundFieldNotes: z.array(z.string()).default([]),
});
export type SpoilerState = z.infer<typeof SpoilerStateSchema>;
// Plain optional booleans (no defaults, strict): an update must never reset switches it does not mention,
// and an unknown switch name is an error rather than silently dropped.
const SettingsUpdate = z.strictObject(
  Object.fromEntries(Object.keys(DEFAULT_SPOILERS).map((k) => [k, z.boolean().optional()])) as Record<keyof SpoilerSettings, z.ZodOptional<z.ZodBoolean>>,
);
export const SpoilerUpdateSchema = z.object({
  settings: SettingsUpdate.optional(),
  foundFieldNotes: z.array(z.string()).optional(),
  clearSeen: z.boolean().optional(),
}).strict();
export type SpoilerUpdate = z.infer<typeof SpoilerUpdateSchema>;

export async function readSpoilerState(file: string): Promise<SpoilerState> {
  let raw: unknown = {};
  try {
    raw = JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw new Error(`Spoiler settings ${file} are unreadable: ${(e as Error).message}`);
  }
  return SpoilerStateSchema.parse(raw);
}

export async function writeSpoilerState(file: string, state: SpoilerState): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, JSON.stringify(SpoilerStateSchema.parse(state), null, 2));
  await rename(`${file}.tmp`, file);
}

export function applyUpdate(state: SpoilerState, update: SpoilerUpdate): SpoilerState {
  return {
    settings: { ...state.settings, ...update.settings } as SpoilerSettings,
    seen: update.clearSeen ? {} : state.seen,
    foundFieldNotes: update.foundFieldNotes ? [...new Set(update.foundFieldNotes)].sort() : state.foundFieldNotes,
  };
}

export function recordSeen(state: SpoilerState, key: string, slots: number[]): SpoilerState {
  if (slots.length === 0) return state;
  const merged = [...new Set([...(state.seen[key] ?? []), ...slots])].sort((a, b) => a - b);
  return { ...state, seen: { ...state.seen, [key]: merged } };
}

export function revealNext(state: SpoilerState, trainer: TrainerFull): SpoilerState {
  const seen = new Set(state.seen[trainer.key] ?? []);
  const next = trainer.mons.findIndex((_, slot) => !seen.has(slot));
  return next < 0 ? state : recordSeen(state, trainer.key, [next]);
}
