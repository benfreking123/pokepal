import { matchTrainer, seenSlots } from "../../shared/prep/trainers";
import type { TrainerFull } from "../../shared/types";
import { recordSeen, type SpoilerState } from "../spoilers/state";
import type { BattleState } from "./schema";

export interface BattleMatch { key: string; exact: boolean }

export function enrichBattle(state: BattleState, trainers: Record<string, TrainerFull>, spoilers: SpoilerState): { match: BattleMatch | null; spoilers: SpoilerState } {
  if (!state.trainer) return { match: null, spoilers };
  const foes = state.foes.map((f) => ({ species: f.species, form: f.form, level: f.level }));
  const match = matchTrainer(trainers, state.trainer, foes);
  if (!match) return { match: null, spoilers };
  return { match, spoilers: recordSeen(spoilers, match.key, seenSlots(trainers[match.key], foes)) };
}
