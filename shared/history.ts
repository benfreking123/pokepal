import { liveFieldId } from "./live";
import type { BattleHistoryEntry, ClientBundle, TrainerIndexEntry } from "./types";

/** The trainer entry a history row opens: its recorded match, else the first team of the same trainer type and name. */
export function historyTrainer(index: TrainerIndexEntry[], e: BattleHistoryEntry): TrainerIndexEntry | null {
  if (!e.trainer) return null;
  return index.find((t) => t.key === e.trainerKey)
    ?? index.filter((t) => t.trainerType === e.trainer!.type && t.name === e.trainer!.name).sort((a, b) => a.partyId - b.partyId)[0]
    ?? null;
}

export function historyTitle(b: ClientBundle, e: BattleHistoryEntry): string {
  if (e.trainer) {
    const t = historyTrainer(b.trainerIndex, e);
    const boss = t ? b.bosses.find((x) => x.variants.some((v) => v.trainerKey === t.key)) : null;
    return boss?.name ?? t?.label ?? e.trainer.name;
  }
  const f = e.foes[0];
  if (!f) return "Wild battle";
  const forms = b.species[f.species]?.forms;
  const name = (forms?.find((x) => x.form === f.form) ?? forms?.[0])?.name ?? f.name;
  return e.foes.length > 1 ? `${name} +${e.foes.length - 1}` : name;
}

export function historyFieldName(b: ClientBundle, e: BattleHistoryEntry): string | null {
  const id = liveFieldId(e.field.id);
  return id === "NONE" ? null : b.fields[id]?.name ?? (e.field.name || e.field.id);
}

/** What opening a history row should show in the Battle panel, or null when there is nothing to open. */
export function historyFocus(b: ClientBundle, e: BattleHistoryEntry): { trainerKey: string | null; fieldId: string; species: { species: string; form: number } | null } | null {
  const fieldId = liveFieldId(e.field.id);
  if (e.trainer) {
    const t = historyTrainer(b.trainerIndex, e);
    return t ? { trainerKey: t.key, fieldId, species: null } : null;
  }
  const f = e.foes[0];
  return f ? { trainerKey: null, fieldId, species: { species: f.species, form: f.form } } : null;
}

export function formatWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const day = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (day(d) === day(now)) return `Today ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (day(d) === day(yesterday)) return `Yesterday ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}
