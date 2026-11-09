import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const ConfigSchema = z.object({
  port: z.number().int().default(4870),
  lanAccess: z.boolean().default(true),
  dataDir: z.string().default(path.join("data", "versions")),
  dataVersion: z.string().nullable().default(null),
  gameDir: z.string().nullable().default(null),
  saveFile: z.string().nullable().default(null),
  syncDir: z.string().nullable().default(null),
  stateDir: z.string().nullable().default(null),
  backupDir: z.string().nullable().default(null),
  runaFormat: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("rxdata") }),
    z.object({ kind: z.literal("zip"), entryPath: z.string() }),
  ]).default({ kind: "zip", entryPath: "data/Game.rxdata" }),
  battleStateFile: z.string().nullable().default(null),
  gameProcessNames: z.array(z.string()).default(["Game.exe"]),
});
export type Config = z.infer<typeof ConfigSchema>;
export const CONFIG_FILE = "pokepal.config.json";

export function saveCandidates(env: NodeJS.ProcessEnv, gameDir: string | null): string[] {
  const out: string[] = [];
  if (env.USERPROFILE) out.push(path.join(env.USERPROFILE, "Saved Games", "Pokemon Reborn", "Game.rxdata"));
  if (env.APPDATA) out.push(path.join(env.APPDATA, "Pokemon Reborn", "Game.rxdata"));
  if (gameDir) out.push(path.join(gameDir, "Game.rxdata"));
  return out;
}

function insideWorkingTree(dir: string): boolean {
  const rel = path.relative(process.cwd(), path.resolve(dir));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

// Backups hold saves, so they must never land inside the repo clone (relative paths resolve against it).
function safeBackupDir(configured: string | null, pokepalDir: string | null): string | null {
  const fallback = pokepalDir ? path.join(pokepalDir, "backups") : null;
  if (!configured) return fallback;
  return insideWorkingTree(configured) && fallback ? fallback : configured;
}

function autodetect(config: Config, env: NodeJS.ProcessEnv): Config {
  const saveFile = config.saveFile ?? saveCandidates(env, config.gameDir).find((p) => existsSync(p)) ?? null;
  const home = env.USERPROFILE ?? null;
  const pokepalDir = saveFile ? path.join(path.dirname(saveFile), "PokePal") : home ? path.join(home, "Documents", "PokePal") : null;
  const icloud = home ? path.join(home, "iCloudDrive", "Pokemon Reborn Sync") : null;
  return {
    ...config,
    saveFile,
    syncDir: config.syncDir ?? (icloud && existsSync(icloud) ? icloud : null),
    stateDir: config.stateDir ?? (pokepalDir ? path.join(pokepalDir, "state") : null),
    backupDir: safeBackupDir(config.backupDir, pokepalDir),
    battleStateFile: config.battleStateFile ?? (saveFile ? path.join(path.dirname(saveFile), "PokePal", "battle_state.json") : null),
  };
}

export async function loadConfig(file = CONFIG_FILE, env = process.env): Promise<Config> {
  const raw = existsSync(file) ? JSON.parse(await readFile(file, "utf8")) : {};
  const config = autodetect(ConfigSchema.parse(raw), env);
  if (!existsSync(file)) await saveConfig(config, file);
  return config;
}

export async function saveConfig(config: Config, file = CONFIG_FILE) {
  await writeFile(file, JSON.stringify(ConfigSchema.parse(config), null, 2) + "\n");
}
