import { readFile } from "node:fs/promises";
import { readRubyConstants } from "../src/ruby/literal";
const { constants } = await readRubyConstants(await readFile(process.argv[2]));
for (const [name, value] of Object.entries(constants)) {
  const size = Array.isArray(value) ? value.length : value && typeof value === "object" ? Object.keys(value).length : 1;
  console.log(name, size);
}
