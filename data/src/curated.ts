import { z } from "zod";

const Type = z.string();
const SecondaryTypeRule = z
  .object({
    match: z.object({ moveType: Type.optional(), moveIds: z.array(z.string()).optional(), category: z.enum(["physical", "special"]).optional() }),
    addType: Type.optional(),
    oneOf: z.array(Type).optional(),
  })
  .refine((r) => (r.addType ? 1 : 0) + (r.oneOf ? 1 : 0) === 1, { message: "secondary rule needs exactly one of addType or oneOf" });

export const FieldOverlaySchema = z.object({
  fieldId: z.string(),
  invert: z.boolean().optional(),
  overrides: z.array(z.object({ attack: Type, defend: Type, multiplier: z.union([z.literal(0), z.literal(0.5), z.literal(1), z.literal(2)]) })).optional(),
  moveTypeRemap: z.array(z.object({ from: Type, to: Type })).optional(),
  secondaryTypes: z.array(SecondaryTypeRule).optional(),
  failingMoveTypes: z.array(Type).optional(),
  typeBoosts: z.array(z.object({ type: Type, factor: z.number().positive() })).optional(),
  notes: z.array(z.string()),
  source: z.string().min(1),
});
export type FieldOverlay = z.infer<typeof FieldOverlaySchema>;

export interface RefContext { fieldIds: Set<string>; typeIds: Set<string>; moveIds: Set<string> }

export function validateOverlays(input: unknown, ctx: RefContext): FieldOverlay[] {
  const overlays = z.array(FieldOverlaySchema).parse(input);
  const problems: string[] = [];
  const type = (where: string, t: string) => !ctx.typeIds.has(t) && problems.push(`${where}: unknown type ${t}`);
  for (const o of overlays) {
    const at = `overlay ${o.fieldId}`;
    if (!ctx.fieldIds.has(o.fieldId)) problems.push(`${at}: unknown field ${o.fieldId}`);
    o.overrides?.forEach((r) => (type(at, r.attack), type(at, r.defend)));
    o.moveTypeRemap?.forEach((r) => (type(at, r.from), type(at, r.to)));
    o.failingMoveTypes?.forEach((t) => type(at, t));
    o.typeBoosts?.forEach((b) => type(at, b.type));
    o.secondaryTypes?.forEach((r) => {
      if (r.match.moveType) type(at, r.match.moveType);
      r.match.moveIds?.forEach((m) => !ctx.moveIds.has(m) && problems.push(`${at}: unknown move ${m}`));
      if (r.addType) type(at, r.addType);
      r.oneOf?.forEach((t) => type(at, t));
    });
  }
  if (problems.length) throw new Error(`Curated overlays invalid:\n${problems.join("\n")}`);
  return overlays;
}

export const BossSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  group: z.enum(["gym", "other"]),
  order: z.number(),
  variants: z.array(z.object({ label: z.string(), trainerKey: z.string() })).min(1),
  fieldId: z.string(),
  doubles: z.boolean(),
  location: z.string().nullable().optional(),
  notes: z.array(z.string()),
  source: z.string().min(1),
});
export type Boss = z.infer<typeof BossSchema>;

export function validateBosses(input: unknown, ctx: { fieldIds: Set<string>; trainerKeys: Set<string> }): Boss[] {
  const bosses = z.array(BossSchema).parse(input);
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const b of bosses) {
    if (seen.has(b.id)) problems.push(`duplicate id ${b.id}`);
    seen.add(b.id);
    for (const v of b.variants) if (!ctx.trainerKeys.has(v.trainerKey)) problems.push(`boss ${b.id}: unknown trainer ${v.trainerKey}`);
    if (b.fieldId !== "NONE" && !ctx.fieldIds.has(b.fieldId)) problems.push(`boss ${b.id}: unknown field ${b.fieldId}`);
  }
  if (problems.length) throw new Error(`Curated bosses invalid:\n${problems.join("\n")}`);
  return bosses;
}
