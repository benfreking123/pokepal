import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";

export const RUNA_ZIP_PATTERN = /^reborn_saves.*\.zip$/i;
export const SAVE_ENTRY_PATTERN = /^game(_\d+)?\.rxdata$/i;

export const PHONE_ZIP_PATTERN = /^reborn_from_phone_.*\.zip$/i;
export const POKEPAL_ZIP_NAME = "pokepal_to_runa.zip";

export async function findRunaExports(syncDir: string): Promise<{ path: string; mtimeMs: number }[]> {
  const names = (await readdir(syncDir).catch(() => [] as string[])).filter((n) => !n.startsWith("."));
  const timed = async (n: string) => ({ path: path.join(syncDir, n), mtimeMs: (await stat(path.join(syncDir, n)).catch(() => ({ mtimeMs: 0 }))).mtimeMs });
  const newest = async (list: string[], accept: (file: string) => boolean = () => true) =>
    (await Promise.all(list.map(timed))).sort((a, b) => b.mtimeMs - a.mtimeMs).find((x) => accept(x.path));
  const zips = names.filter((n) => /\.zip$/i.test(n) && n.toLowerCase() !== POKEPAL_ZIP_NAME);
  const hasSave = (file: string) => { try { return listSaveEntries(file).length > 0; } catch { return false; } };
  const phone = await newest(zips.filter((n) => PHONE_ZIP_PATTERN.test(n)));
  const other = await newest(zips.filter((n) => !PHONE_ZIP_PATTERN.test(n)), (f) => RUNA_ZIP_PATTERN.test(path.basename(f)) || hasSave(f));
  const raw = await newest(names.filter((n) => /\.rxdata$/i.test(n)));
  return [phone, other, raw].filter((x): x is { path: string; mtimeMs: number } => !!x);
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
