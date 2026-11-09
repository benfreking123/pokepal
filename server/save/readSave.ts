import { createHash } from "node:crypto";
import { copyFile, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadAll } from "@hyrious/marshal";

// No `string: "utf8"`: with it, 0.3.x decodes a string and then crashes setting its :E ivar
// ("Cannot create property 'E' on string"). Strings still come back as UTF-8 JS strings.
export const MARSHAL_OPTIONS = { ivarToString: true, hashSymbolKeysToString: true } as const;
export const sym = (v: unknown): string | null => (typeof v === "symbol" ? Symbol.keyFor(v) ?? null : typeof v === "string" ? v : null);
export const ivar = (obj: unknown, name: string): unknown => (obj && typeof obj === "object" ? (obj as Record<string, unknown>)[`@${name}`] : undefined);

export class SaveParseError extends Error {}

export interface SaveRead { roots: unknown[]; sha256: string; mtimeMs: number; sizeBytes: number }

async function attempt(file: string, tmpDir: string): Promise<SaveRead> {
  const tmp = path.join(tmpDir, `pokepal-${process.pid}-${Date.now()}-${path.basename(file)}`);
  await copyFile(file, tmp);
  try {
    const bytes = await readFile(tmp);
    const st = await stat(file);
    return { roots: loadAll(bytes, MARSHAL_OPTIONS), sha256: createHash("sha256").update(bytes).digest("hex"), mtimeMs: st.mtimeMs, sizeBytes: bytes.length };
  } finally {
    await rm(tmp, { force: true });
  }
}

export async function readSaveFile(file: string, tmpDir = os.tmpdir()): Promise<SaveRead> {
  try {
    return await attempt(file, tmpDir);
  } catch {
    await new Promise((r) => setTimeout(r, 500));
    try {
      return await attempt(file, tmpDir);
    } catch (e) {
      throw new SaveParseError(`Could not read save ${file}: ${(e as Error).message}. The game may have updated its save format; run "npm run inspect-save".`);
    }
  }
}
