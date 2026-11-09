import type { BossView, TrainerFull, TrainerIndexEntry } from "../types";

export interface TrainerHit { entry: TrainerIndexEntry; boss: BossView | null }
export interface LiveTrainer { type: string; name: string }
export interface LiveFoe { species: string; form: number; level: number }

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function searchTrainers(index: TrainerIndexEntry[], bosses: BossView[], query: string, limit = 50): TrainerHit[] {
  const bossByKey = new Map(bosses.flatMap((b) => b.variants.map((v) => [v.trainerKey, b] as const)));
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  const bossOrder = (b: BossView | null) => (b?.context ? b.context.order : 0);
  return index
    .filter((t) => {
      const hay = norm(`${t.label} ${t.trainerType} ${bossByKey.get(t.key)?.name ?? ""}`);
      return tokens.every((tok) => hay.includes(tok));
    })
    .map((entry) => ({ entry, boss: bossByKey.get(entry.key) ?? null }))
    .sort((a, b) =>
      (a.boss ? 0 : 1) - (b.boss ? 0 : 1) ||
      bossOrder(a.boss) - bossOrder(b.boss) ||
      (a.boss && b.boss ? a.boss.name.localeCompare(b.boss.name) : 0) ||
      a.entry.label.localeCompare(b.entry.label) ||
      a.entry.partyId - b.entry.partyId)
    .slice(0, limit);
}

export function seenSlots(trainer: TrainerFull, foes: LiveFoe[]): number[] {
  const taken = new Set<number>();
  for (const f of foes) {
    let best = -1;
    for (const [slot, m] of trainer.mons.entries()) {
      if (taken.has(slot) || m.species !== f.species || m.form !== f.form) continue;
      if (best < 0 || Math.abs(m.level - f.level) < Math.abs(trainer.mons[best].level - f.level)) best = slot;
    }
    if (best >= 0) taken.add(best);
  }
  return [...taken].sort((a, b) => a - b);
}

export function matchTrainer(trainers: Record<string, TrainerFull>, live: LiveTrainer, foes: LiveFoe[]): { key: string; exact: boolean } | null {
  const candidates = Object.values(trainers).filter((t) => t.trainerType === live.type && t.name === live.name);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return { key: candidates[0].key, exact: true };
  const fit = (t: TrainerFull) => {
    const slots = seenSlots(t, foes);
    const levelGap = foes.reduce((sum, f) => {
      const m = t.mons.find((x, i) => slots.includes(i) && x.species === f.species && x.form === f.form);
      return m ? sum + Math.abs(m.level - f.level) : sum;
    }, 0);
    return { matched: slots.length, levelGap };
  };
  const ranked = candidates.map((t) => ({ t, ...fit(t) })).sort((a, b) => b.matched - a.matched || a.levelGap - b.levelGap || a.t.partyId - b.t.partyId);
  const [best, next] = ranked;
  const exact = best.matched > 0 && !(next && next.matched === best.matched && next.levelGap === best.levelGap);
  return { key: best.t.key, exact };
}
