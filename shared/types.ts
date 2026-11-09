export type TypeId = string;
export type BaseChart = Record<TypeId, Record<TypeId, number>>;
export type Multiplier = 0 | 0.5 | 1 | 2;

export interface SecondaryTypeRule {
  match: { moveType?: TypeId; moveIds?: string[]; category?: "physical" | "special" };
  addType?: TypeId;
  oneOf?: TypeId[];
}
export interface FieldOverlay {
  fieldId: string;
  invert?: boolean;
  overrides?: { attack: TypeId; defend: TypeId; multiplier: Multiplier }[];
  moveTypeRemap?: { from: TypeId; to: TypeId }[];
  secondaryTypes?: SecondaryTypeRule[];
  failingMoveTypes?: TypeId[];
  typeBoosts?: { type: TypeId; factor: number }[];
  notes: string[];
  source: string;
}
export interface SpeciesForm { form: number; formName: string | null; name: string; types: TypeId[]; baseStats: number[]; abilities: string[]; hiddenAbility: string | null }
export interface Species { id: string; dexNum: number; forms: SpeciesForm[] }
export interface Move { id: string; name: string; type: TypeId; category: "physical" | "special" | "status"; power: number; accuracy: number; pp: number; target: string | null; description: string }
export interface Field { id: string; name: string; description: string; fieldAppSwitch: number | null }
export interface TrainerMonFull { species: string; form: number; level: number; moves: string[]; ability: string | null; item: string | null }
export interface TrainerFull { key: string; trainerType: string; name: string; label: string; partyId: number; mons: TrainerMonFull[] }
export interface TrainerIndexEntry { key: string; trainerType: string; name: string; label: string; partyId: number; maxLevel?: number }
export interface TrainerMonView { slot: number; species: string; form: number; level?: number; moves?: string[]; ability?: string | null; item?: string | null }
export interface TrainerView { key: string; label: string; partyId: number; mons: TrainerMonView[]; partial: boolean }
export interface Boss { id: string; name: string; group: "gym" | "other"; order: number; variants: { label: string; trainerKey: string }[]; fieldId: string; doubles: boolean; location?: string | null; notes: string[]; source: string }
export interface BossView {
  id: string; name: string; variants: { label: string; trainerKey: string }[]; fieldId: string; doubles: boolean;
  context: { group: "gym" | "other"; order: number; location: string | null; notes: string[] } | null;
}
export interface SpoilerSettings {
  opponentMoves: boolean; opponentAbilities: boolean; opponentItems: boolean; opponentFullTeam: boolean;
  opponentLevels: boolean; trainerContext: boolean; fieldDetails: boolean;
}
export interface ShowdownNames { species: Record<string, string>; items: Record<string, string>; moves: Record<string, string>; abilities: Record<string, string> }
export interface GameData {
  meta: { gameVersion: string; extractedAt: string };
  types: { id: TypeId; name: string }[];
  chart: BaseChart;
  species: Record<string, Species>;
  moves: Record<string, Move>;
  abilities: Record<string, { name: string }>;
  items: Record<string, { name: string }>;
  fields: Record<string, Field>;
  overlays: Record<string, FieldOverlay>;
  maps: Record<string, string>;
  showdownNames: ShowdownNames;
}
export interface LoadedData { game: GameData; trainers: Record<string, TrainerFull>; bosses: Boss[] }
export interface ClientBundle extends GameData {
  trainerIndex: TrainerIndexEntry[]; bosses: BossView[]; hiddenFields: string[]; spoilers: SpoilerSettings;
}

export interface StatBlock { hp: number; atk: number; def: number; spa: number; spd: number; spe: number }
export type MonLocation = { kind: "party"; index: number } | { kind: "box"; box: number; slot: number };
export interface OwnedMon {
  uid: string; location: MonLocation; order: number;
  species: string; form: number; nickname: string | null; level: number; isEgg: boolean; shiny: boolean;
  item: string | null; ability: string | null; nature: string | null; moves: string[];
  ivs: StatBlock; evs: StatBlock; hiddenPowerType: TypeId | null;
}
export interface SaveMeta { trainerName: string; playtimeSeconds: number; badgeCount: number; mapId: number; mapName: string | null; sha256: string; mtimeMs: number; sizeBytes: number }
export interface SaveSummary { meta: SaveMeta; party: OwnedMon[]; boxes: { name: string; mons: OwnedMon[] }[]; unknownIds: string[]; fieldNotesFound: string[] | null }

export interface LiveFoeState { slot: number; name: string; species: string; form: number; formName: string | null; level: number; types: string[]; hpPercent: number; fainted: boolean }
export interface LivePartyMon { species: string; form: number; nickname: string; level: number; hpPercent: number; fainted: boolean; active: boolean }
export interface LiveBattleBase {
  schema: 1; bridgeVersion: string; updatedAt: string; battleId: string; state: "active" | "ended"; isDouble: boolean;
  field: { id: string; name: string }; trainer: { type: string; name: string } | null; foes: LiveFoeState[]; party: LivePartyMon[];
}
/** What the browser gets: the mod's state with the foes' level left out when "Opponent levels" is off, plus the trainer match. */
export interface LiveBattle extends Omit<LiveBattleBase, "foes"> {
  foes: (Omit<LiveFoeState, "level"> & { level?: number })[];
  match: { key: string; exact: boolean } | null;
}
export type LiveBattleMessage = LiveBattle | { error: string };
