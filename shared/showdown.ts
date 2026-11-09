import type { GameData, OwnedMon, StatBlock } from "./types";

export type ShowdownData = Pick<GameData, "species" | "moves" | "items" | "abilities" | "types" | "showdownNames">;

const STATS: [keyof StatBlock, string][] = [["hp", "HP"], ["atk", "Atk"], ["def", "Def"], ["spa", "SpA"], ["spd", "SpD"], ["spe", "Spe"]];
const titleCase = (id: string) => id.charAt(0) + id.slice(1).toLowerCase();

function speciesName(mon: OwnedMon, data: ShowdownData): { showdown: string; display: string } {
  const sp = data.species[mon.species];
  const form = sp?.forms.find((f) => f.form === mon.form) ?? sp?.forms[0];
  const display = form?.name ?? mon.species;
  const showdown = data.showdownNames.species[`${mon.species}:${mon.form}`] ?? data.showdownNames.species[mon.species] ?? display;
  return { showdown, display };
}

export function toShowdown(mon: OwnedMon, data: ShowdownData): string {
  const { showdown, display } = speciesName(mon, data);
  const n = data.showdownNames;
  const item = mon.item ? n.items[mon.item] ?? data.items[mon.item]?.name ?? mon.item : null;
  const ability = mon.ability ? n.abilities[mon.ability] ?? data.abilities[mon.ability]?.name ?? mon.ability : null;
  const lines: string[] = [];
  let head = mon.nickname && mon.nickname !== display ? `${mon.nickname} (${showdown})` : showdown;
  if (item) head += ` @ ${item}`;
  lines.push(head);
  if (ability) lines.push(`Ability: ${ability}`);
  if (mon.level !== 100) lines.push(`Level: ${mon.level}`);
  if (mon.shiny) lines.push("Shiny: Yes");
  const evs = STATS.filter(([k]) => mon.evs[k] > 0).map(([k, l]) => `${mon.evs[k]} ${l}`);
  if (evs.length) lines.push(`EVs: ${evs.join(" / ")}`);
  if (mon.nature) lines.push(`${titleCase(mon.nature)} Nature`);
  const ivs = STATS.filter(([k]) => mon.ivs[k] !== 31).map(([k, l]) => `${mon.ivs[k]} ${l}`);
  if (ivs.length) lines.push(`IVs: ${ivs.join(" / ")}`);
  for (const id of mon.moves) {
    const name = n.moves[id] ?? data.moves[id]?.name ?? id;
    const hp = id === "HIDDENPOWER" && mon.hiddenPowerType ? data.types.find((t) => t.id === mon.hiddenPowerType)?.name ?? titleCase(mon.hiddenPowerType) : null;
    lines.push(hp ? `- ${name} [${hp}]` : `- ${name}`);
  }
  return lines.join("\n");
}

export const teamToShowdown = (mons: OwnedMon[], data: ShowdownData) =>
  mons.filter((m) => !m.isEgg).map((m) => toShowdown(m, data)).join("\n\n") + "\n";
