import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";

export const RUNA_ZIP_PATTERN = /^reborn_saves.*\.zip$/i;
export const SAVE_ENTRY_PATTERN = /^game(_\d+)?\.rxdata$/i;

export async function findNewestRunaZip(syncDir: string) {
  const names = (await readdir(syncDir).catch(() => [] as string[])).filter((n) => RUNA_ZIP_PATTERN.test(n));
  const withTimes = await Promise.all(names.map(async (n) => ({ path: path.join(syncDir, n), mtimeMs: (await stat(path.join(syncDir, n))).mtimeMs })));
  return withTimes.sort((a, b) => b.mtimeMs - a.mtimeMs)[0] ?? null;
}

export function listSaveEntries(zipPath: string): string[] {
  return new AdmZip(zipPath).getEntries().filter((e) => !e.isDirectory && SAVE_ENTRY_PATTERN.test(path.posix.basename(e.entryName))).map((e) => e.entryName).sort();
}

export function buildRunaZip(saveFile: string, destZip: string, entryPath: string): void {
  const zip = new AdmZip();
  zip.addLocalFile(saveFile, path.posix.dirname(entryPath) === "." ? "" : path.posix.dirname(entryPath), path.posix.basename(entryPath));
  zip.writeZip(destZip);
}

export async function extractEntry(zipPath: string, entryName: string, destDir: string): Promise<string> {
  const entry = new AdmZip(zipPath).getEntry(entryName);
  if (!entry) throw new Error(`No ${entryName} in ${zipPath}`);
  const out = path.join(destDir, `runa-${Date.now()}-${path.posix.basename(entryName)}`);
  await writeFile(out, entry.getData());
  return out;
}
