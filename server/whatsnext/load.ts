import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { WhatsNextData } from "../../shared/whatsNext";

const Cond = z.union([
  z.strictObject({ var: z.number().int().nonnegative(), gte: z.number().int() }),
  z.strictObject({ sw: z.number().int().positive() }),
  z.strictObject({ badges: z.number().int().min(0).max(18) }),
  z.strictObject({ item: z.string().regex(/^[A-Z0-9]+$/) }),
]);
const Named = z.strictObject({ name: z.string().min(1), from: z.string().min(1), note: z.string().min(1) });

export const WhatsNextSchema = z.strictObject({
  gameVersion: z.string(),
  note: z.string().optional(),
  sources: z.record(z.string(), z.strictObject({ label: z.string().min(1), url: z.string().url().nullable() })),
  progress: z.strictObject({ items: z.record(z.string(), z.string()).optional(), variables: z.record(z.string().regex(/^\d+$/), Named), switches: z.record(z.string().regex(/^\d+$/), Named) }),
  mainSteps: z.array(z.strictObject({
    id: z.string().min(1), badges: z.number().int().min(0).max(18), title: z.string().min(1),
    route: z.array(z.strictObject({ where: z.string().min(1), what: z.string().min(1), maps: z.array(z.string().min(1)) })).min(1),
    gym: z.strictObject({ number: z.number().int().min(1).max(18), bossId: z.string().min(1) }).nullable(),
    namedBattles: z.array(z.string()), levelCap: z.number().int().nullable(), unlocks: z.array(z.string()), sources: z.array(z.string()),
  })).min(1),
  optional: z.array(z.strictObject({
    id: z.string().min(1), kind: z.enum(["sidequest", "area", "unlock", "battle"]),
    minBadges: z.number().int().min(0).max(18), lastBadges: z.number().int().min(0).max(18).optional(),
    title: z.string().min(1), where: z.string().min(1), needs: z.string().min(1), hint: z.string().min(1),
    done: Cond.optional(), doneLabel: z.string().optional(), namedBattles: z.array(z.string()).optional(), sources: z.array(z.string()),
  })),
});

export function validateWhatsNext(input: unknown): WhatsNextData {
  const d = WhatsNextSchema.parse(input) as WhatsNextData;
  const problems: string[] = [];
  const ids = new Set<string>();
  [...d.mainSteps, ...d.optional].forEach((x) => { if (ids.has(x.id)) problems.push(`duplicate id ${x.id}`); ids.add(x.id); });
  d.mainSteps.forEach((s, i) => { if (s.badges !== i) problems.push(`mainSteps[${i}] must be for ${i} badges, got ${s.badges}`); });
  [...d.mainSteps, ...d.optional].forEach((x) => x.sources.forEach((s) => { if (!(s in d.sources)) problems.push(`${x.id}: unknown source ${s}`); }));
  if (problems.length) throw new Error(`whats-next.json: ${problems.join("; ")}`);
  return d;
}

export const WHATS_NEXT_FILE = path.resolve("data/curated/whats-next.json");

let cached: Promise<WhatsNextData> | null = null;
export function loadWhatsNext(file = WHATS_NEXT_FILE): Promise<WhatsNextData> {
  if (file !== WHATS_NEXT_FILE) return readFile(file, "utf8").then((t) => validateWhatsNext(JSON.parse(t)));
  cached ??= readFile(file, "utf8").then((t) => validateWhatsNext(JSON.parse(t)));
  cached.catch(() => { cached = null; });
  return cached;
}
