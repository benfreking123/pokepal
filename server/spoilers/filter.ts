import type { Boss, BossView, ClientBundle, LiveBattle, LoadedData, SpoilerSettings, TrainerFull, TrainerView } from "../../shared/types";
import type { BattleState } from "../battle/schema";
import type { SpoilerState } from "./state";

export function trainerView(t: TrainerFull, s: SpoilerSettings, seen: number[]): TrainerView {
  const seenSet = new Set(seen);
  const mons = t.mons.flatMap((m, slot) => {
    if (!s.opponentFullTeam && !seenSet.has(slot)) return [];
    return [{
      slot, species: m.species, form: m.form,
      ...(s.opponentLevels ? { level: m.level } : {}),
      ...(s.opponentMoves ? { moves: m.moves } : {}),
      ...(s.opponentAbilities ? { ability: m.ability } : {}),
      ...(s.opponentItems ? { item: m.item } : {}),
    }];
  });
  return { key: t.key, label: t.label, partyId: t.partyId, mons, partial: !s.opponentFullTeam };
}

export function liveBattleView(state: BattleState, match: LiveBattle["match"], s: SpoilerSettings): LiveBattle {
  return { ...state, match, foes: state.foes.map(({ level, ...f }) => (s.opponentLevels ? { ...f, level } : f)) };
}

export function bossView(b: Boss, s: SpoilerSettings): BossView {
  return {
    id: b.id, name: b.name, variants: b.variants, fieldId: b.fieldId, doubles: b.doubles,
    context: s.trainerContext ? { group: b.group, order: b.order, location: b.location ?? null, notes: b.notes } : null,
  };
}

export function hiddenFieldIds(fieldIds: string[], s: SpoilerSettings, found: Set<string>): string[] {
  return s.fieldDetails ? [] : fieldIds.filter((id) => !found.has(id)).sort();
}

export function buildBundle(data: LoadedData, state: SpoilerState, fieldNotesFromSave: string[] | null): ClientBundle {
  const s = state.settings;
  const found = new Set([...state.foundFieldNotes, ...(fieldNotesFromSave ?? [])]);
  const hidden = hiddenFieldIds(Object.keys(data.game.fields), s, found);
  const hiddenSet = new Set(hidden);
  const fields = Object.fromEntries(Object.entries(data.game.fields).map(([id, f]) => [id, hiddenSet.has(id) ? { ...f, description: "" } : f]));
  const overlays = Object.fromEntries(Object.entries(data.game.overlays).filter(([id]) => !hiddenSet.has(id)));
  const trainerIndex = Object.values(data.trainers).map((t) => ({
    key: t.key, trainerType: t.trainerType, name: t.name, label: t.label, partyId: t.partyId,
    ...(s.opponentLevels ? { maxLevel: Math.max(0, ...t.mons.map((m) => m.level)) } : {}),
  }));
  return {
    ...data.game, fields, overlays, hiddenFields: hidden, trainerIndex,
    bosses: data.bosses.map((b) => bossView(b, s)), spoilers: s,
  };
}
