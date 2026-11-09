import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SaveMeta } from "../../shared/types";

export type Holder = "pc" | "runa";
export interface Handoff { at: string; pcSha256: string; meta: SaveMeta }
export interface LedgerEvent { at: string; event: "handoff" | "install" | "restore" | "reclaim"; sha256: string; playtimeSeconds: number }
export interface Ledger { holder: Holder; handoff: Handoff | null; history: LedgerEvent[] }

export const emptyLedger = (): Ledger => ({ holder: "pc", handoff: null, history: [] });

export async function readLedger(file: string): Promise<Ledger> {
  try {
    return { ...emptyLedger(), ...JSON.parse(await readFile(file, "utf8")) };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return emptyLedger();
    throw new Error(`Hand-off record ${file} is unreadable: ${(e as Error).message}`);
  }
}

export async function writeLedger(file: string, ledger: Ledger): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, JSON.stringify(ledger, null, 2));
  await rename(`${file}.tmp`, file);
}
