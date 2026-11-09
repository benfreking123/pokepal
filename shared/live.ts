import type { GameData, LiveBattle, TrainerMonView, TypeId } from "./types";

/** The game's id for "no field" is INDOOR; the app's is NONE. */
export const liveFieldId = (id: string) => (id === "INDOOR" ? "NONE" : id);

export type LiveFoe = LiveBattle["foes"][number];

/** The foe's types: the mod's, or the shown species' own types when the mod sent none (a disguised Illusion foe). */
export function liveFoeTypes(foe: LiveFoe, data: GameData): TypeId[] {
  if (foe.types.length > 0) return foe.types;
  const forms = data.species[foe.species]?.forms;
  return (forms?.find((f) => f.form === foe.form) ?? forms?.[0])?.types ?? [];
}

/** Pairs each foe on the field with a slot of the trainer's team view (same species and form, closest level). Returns slot indexes into `mons`, or null. */
export function assignFoeMons(foes: LiveFoe[], mons: TrainerMonView[]): (number | null)[] {
  const taken = new Set<number>();
  return foes.map((f) => {
    let best = -1;
    mons.forEach((m, i) => {
      if (taken.has(i) || m.species !== f.species || m.form !== f.form) return;
      const gap = (x: TrainerMonView) => (x.level !== undefined && f.level !== undefined ? Math.abs(x.level - f.level) : 0);
      if (best < 0 || gap(m) < gap(mons[best])) best = i;
    });
    if (best < 0) return null;
    taken.add(best);
    return best;
  });
}

/** Cheap identity of which foes are out, to know when to refetch the trainer view. */
export const foesKey = (foes: LiveFoe[]) => foes.map((f) => `${f.species}/${f.form}`).join(",");
