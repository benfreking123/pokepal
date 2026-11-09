import { readFile } from "node:fs/promises";
import { loadAll } from "@hyrious/marshal";

export const MARSHAL_OPTIONS = { ivarToString: true, hashSymbolKeysToString: true } as const;

export async function readMarshalFile(path: string): Promise<unknown[]> {
  return loadAll(await readFile(path), MARSHAL_OPTIONS);
}

export const sym = (v: unknown): string | null => (typeof v === "symbol" ? Symbol.keyFor(v) ?? null : typeof v === "string" ? v : null);
