import { readFile } from "node:fs/promises";
import path from "node:path";
import { readRubyConstants, type RubyValue } from "../src/ruby/literal";
import { SOURCES, type Domain } from "../src/sources";

export const REAL = process.env.REBORN_GAME_DIR;

export async function loadReal(domain: Domain): Promise<RubyValue> {
  const src = await readFile(path.join(REAL!, SOURCES[domain].file));
  const { constants } = await readRubyConstants(src);
  return constants[SOURCES[domain].constant];
}
