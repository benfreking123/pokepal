import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { readRubyConstants } from "./ruby/literal";
import { MAPINFOS_FILE, SOURCES, VERSION_SOURCE, type Domain } from "./sources";
import { extractTypes } from "./extract/types";
import { extractSpecies } from "./extract/species";
import { extractMoves } from "./extract/moves";
import { extractNames } from "./extract/names";
import { extractFields } from "./extract/fields";
import { extractTrainers } from "./extract/trainers";
import { extractMaps } from "./extract/maps";
import { extractTrainerTypes } from "./extract/trainerTypes";
import { readMarshalFile } from "./marshal";
import { validateBosses, validateOverlays } from "./curated";
import { stableStringify, updateManifest, type Manifest } from "./write";

const EXTRACTOR_VERSION = "1.0.0";
const ROOT = path.resolve(import.meta.dirname, "..");
const { values } = parseArgs({ options: { game: { type: "string" }, version: { type: "string" } } });
if (!values.game) throw new Error("Usage: npm run extract -- --game <install dir> [--version <19.5.x>]");
const gameDir = values.game;

const hashes: Record<string, string> = {};
async function load(domain: Domain) {
  const { file, constant } = SOURCES[domain];
  const bytes = await readFile(path.join(gameDir, file));
  hashes[file] = createHash("sha256").update(bytes).digest("hex");
  const { constants } = await readRubyConstants(bytes);
  if (!(constant in constants)) throw new Error(`${file}: constant ${constant} not found (found: ${Object.keys(constants).join(", ")})`);
  return constants[constant];
}

const { constants: boot } = await readRubyConstants(await readFile(path.join(gameDir, VERSION_SOURCE.file)));
const gameVersion = boot[VERSION_SOURCE.constant];
if (typeof gameVersion !== "string") throw new Error(`${VERSION_SOURCE.file}: ${VERSION_SOURCE.constant} not found`);
if (values.version && values.version !== gameVersion) throw new Error(`--version ${values.version} disagrees with ${VERSION_SOURCE.file} (${gameVersion})`);
const version = gameVersion;

const types = extractTypes(await load("types"));
const species = extractSpecies(await load("species"));
const moves = extractMoves(await load("moves"));
const abilities = extractNames(await load("abilities"));
const items = extractNames(await load("items"));
const fields = extractFields(await load("fields"));
const trainers = extractTrainers(await load("trainers"));
const trainerTypes = extractTrainerTypes(await load("trainerTypes"));

const mapPath = path.join(gameDir, MAPINFOS_FILE);
let maps: Record<string, string> = {};
if (existsSync(mapPath)) {
  hashes[MAPINFOS_FILE] = createHash("sha256").update(await readFile(mapPath)).digest("hex");
  maps = extractMaps((await readMarshalFile(mapPath))[0]);
} else {
  console.warn(`WARNING: ${mapPath} not found; maps.json will be empty. Re-run against a full install to fill it.`);
}

const ctx = { fieldIds: new Set(Object.keys(fields)), typeIds: new Set(types.types.map((t) => t.id)), moveIds: new Set(Object.keys(moves)) };
const overlays = validateOverlays(JSON.parse(await readFile(path.join(ROOT, "curated", "field-overlays.json"), "utf8")), ctx);
const showdownNames = JSON.parse(await readFile(path.join(ROOT, "curated", "showdown-names.json"), "utf8"));
const bosses = validateBosses(JSON.parse(await readFile(path.join(ROOT, "curated", "bosses.json"), "utf8")), { fieldIds: ctx.fieldIds, trainerKeys: new Set(Object.keys(trainers)) });

const outDir = path.join(ROOT, "versions", version);
await mkdir(outDir, { recursive: true });
const files: Record<string, unknown> = {
  "types.json": types, "species.json": species, "moves.json": moves, "abilities.json": abilities, "items.json": items,
  "fields.json": fields, "trainers.json": trainers, "trainer-types.json": trainerTypes, "maps.json": maps, "field-overlays.json": overlays,
  "showdown-names.json": showdownNames, "bosses.json": bosses,
  "meta.json": { gameVersion: version, extractedAt: new Date().toISOString(), extractorVersion: EXTRACTOR_VERSION, sources: hashes },
};
for (const [name, value] of Object.entries(files)) await writeFile(path.join(outDir, name), stableStringify(value));

const manifestPath = path.join(ROOT, "versions", "manifest.json");
const current: Manifest | null = await readFile(manifestPath, "utf8").then(JSON.parse, () => null);
await writeFile(manifestPath, stableStringify(updateManifest(current, version)));

console.log(`Wrote ${outDir}: ${types.types.length} types, ${Object.keys(species).length} species, ${Object.keys(moves).length} moves, ` +
  `${Object.keys(fields).length} fields, ${Object.keys(trainers).length} trainers, ${Object.keys(maps).length} maps`);
