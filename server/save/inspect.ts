import { readFile } from "node:fs/promises";
import { loadAll } from "@hyrious/marshal";
import { loadConfig } from "../config";
import { MARSHAL_OPTIONS, sym } from "./readSave";

const MAX_DEPTH = 6;

function show(v: unknown, indent: string, depth: number, out: string[]): void {
  if (typeof v === "symbol") return void out.push(`${indent}:${sym(v)}`);
  if (typeof v === "string") return void out.push(`${indent}"${v.length > 40 ? `${v.slice(0, 40)}…` : v}"`);
  if (v === null || typeof v !== "object") return void out.push(`${indent}${String(v)}`);
  if (Array.isArray(v)) {
    out.push(`${indent}Array(${v.length})`);
    if (depth < MAX_DEPTH) v.slice(0, 2).forEach((x) => show(x, `${indent}  `, depth + 1, out));
    return;
  }
  const rec = v as Record<string | symbol, unknown>;
  const cls = sym(rec.class);
  out.push(`${indent}${cls ?? v.constructor?.name ?? "Object"}`);
  if (depth >= MAX_DEPTH) return;
  for (const [k, x] of Object.entries(rec)) {
    out.push(`${indent}  ${k}:`);
    show(x, `${indent}    `, depth + 1, out);
  }
}

const file = process.argv[2] ?? (await loadConfig()).saveFile;
if (!file) throw new Error("Pass a save file path or set saveFile in the config.");
const roots = loadAll(await readFile(file), MARSHAL_OPTIONS);
const out: string[] = [];
roots.forEach((r, i) => { out.push(`root ${i}:`); show(r, "  ", 0, out); });
console.log(out.join("\n"));
