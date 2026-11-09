export const TYPES = [
  "NORMAL", "FIRE", "WATER", "ELECTRIC", "GRASS", "ICE", "FIGHTING", "POISON", "GROUND",
  "FLYING", "PSYCHIC", "BUG", "ROCK", "GHOST", "DRAGON", "DARK", "STEEL", "FAIRY",
] as const;

const SE: Record<string, string[]> = {
  FIRE: ["GRASS", "ICE", "BUG", "STEEL"], WATER: ["FIRE", "GROUND", "ROCK"], ELECTRIC: ["WATER", "FLYING"],
  GRASS: ["WATER", "GROUND", "ROCK"], ICE: ["GRASS", "GROUND", "FLYING", "DRAGON"],
  FIGHTING: ["NORMAL", "ICE", "ROCK", "DARK", "STEEL"], POISON: ["GRASS", "FAIRY"],
  GROUND: ["FIRE", "ELECTRIC", "POISON", "ROCK", "STEEL"], FLYING: ["GRASS", "FIGHTING", "BUG"],
  PSYCHIC: ["FIGHTING", "POISON"], BUG: ["GRASS", "PSYCHIC", "DARK"], ROCK: ["FIRE", "ICE", "FLYING", "BUG"],
  GHOST: ["PSYCHIC", "GHOST"], DRAGON: ["DRAGON"], DARK: ["PSYCHIC", "GHOST"], STEEL: ["ICE", "ROCK", "FAIRY"],
  FAIRY: ["FIGHTING", "DRAGON", "DARK"],
};
const NVE: Record<string, string[]> = {
  NORMAL: ["ROCK", "STEEL"], FIRE: ["FIRE", "WATER", "ROCK", "DRAGON"], WATER: ["WATER", "GRASS", "DRAGON"],
  ELECTRIC: ["ELECTRIC", "GRASS", "DRAGON"], GRASS: ["FIRE", "GRASS", "POISON", "FLYING", "BUG", "DRAGON", "STEEL"],
  ICE: ["FIRE", "WATER", "ICE", "STEEL"], FIGHTING: ["POISON", "FLYING", "PSYCHIC", "BUG", "FAIRY"],
  POISON: ["POISON", "GROUND", "ROCK", "GHOST"], GROUND: ["GRASS", "BUG"], FLYING: ["ELECTRIC", "ROCK", "STEEL"],
  PSYCHIC: ["PSYCHIC", "STEEL"], BUG: ["FIRE", "FIGHTING", "POISON", "FLYING", "GHOST", "STEEL", "FAIRY"],
  ROCK: ["FIGHTING", "GROUND", "STEEL"], GHOST: ["DARK"], DRAGON: ["STEEL"], DARK: ["FIGHTING", "DARK", "FAIRY"],
  STEEL: ["FIRE", "WATER", "ELECTRIC", "STEEL"], FAIRY: ["FIRE", "POISON", "STEEL"],
};
const IMMUNE: Record<string, string[]> = {
  NORMAL: ["GHOST"], ELECTRIC: ["GROUND"], FIGHTING: ["GHOST"], POISON: ["STEEL"], GROUND: ["FLYING"],
  PSYCHIC: ["DARK"], GHOST: ["NORMAL"], DRAGON: ["FAIRY"],
};

export function canonicalChart(): Record<string, Record<string, number>> {
  const chart: Record<string, Record<string, number>> = {};
  for (const atk of TYPES) {
    chart[atk] = {};
    for (const d of SE[atk] ?? []) chart[atk][d] = 2;
    for (const d of NVE[atk] ?? []) chart[atk][d] = 0.5;
    for (const d of IMMUNE[atk] ?? []) chart[atk][d] = 0;
  }
  return chart;
}
