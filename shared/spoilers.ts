import type { SpoilerSettings } from "./types";

export const SPOILER_SWITCHES: { key: keyof SpoilerSettings; label: string; reveals: string; defaultOn: boolean }[] = [
  { key: "opponentMoves", label: "Opponent moves", reveals: "Each opposing Pokémon's moveset.", defaultOn: false },
  { key: "opponentAbilities", label: "Opponent abilities", reveals: "Each opposing Pokémon's ability.", defaultOn: false },
  { key: "opponentItems", label: "Opponent held items", reveals: "The item each opposing Pokémon holds.", defaultOn: false },
  { key: "opponentFullTeam", label: "Opponent's full team before battle", reveals: "Every Pokémon on a trainer's team. Off: only the ones you've already seen.", defaultOn: false },
  { key: "opponentLevels", label: "Opponent levels", reveals: "The level of each opposing Pokémon.", defaultOn: true },
  { key: "trainerContext", label: "Trainer locations and story context", reveals: "Where a trainer is, story order (gym number) and boss notes.", defaultOn: false },
  { key: "fieldDetails", label: "Field effect details before Field Notes", reveals: "A field's type rules before you've found its Field Notes in game.", defaultOn: true },
];

export const DEFAULT_SPOILERS = Object.fromEntries(SPOILER_SWITCHES.map((s) => [s.key, s.defaultOn])) as unknown as SpoilerSettings;

export const spoilersOn = (s: SpoilerSettings) => SPOILER_SWITCHES.filter((x) => s[x.key]).map((x) => x.label);
