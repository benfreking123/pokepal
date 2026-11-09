import type { TypeId } from "../types";
import type { MatchupDetail, PrepFoe } from "./score";

const FRACTIONS: [number, string][] = [[0.0625, "1/16"], [0.125, "1/8"], [0.25, "¼"], [0.5, "½"]];

export function fmtMultiplier(x: number): string {
  for (const [v, s] of FRACTIONS) if (Math.abs(x - v) < 1e-6) return s;
  return `${Math.round(x * 100) / 100}`;
}

export function describeReason(foe: PrepFoe, d: MatchupDetail, typeName: (t: TypeId) => string): string {
  const best = d.bestMove && d.offense > 0 ? `${d.bestMove} ${fmtMultiplier(d.offense)}×` : "no damaging answer";
  let text = `Best answer to ${foe.name}: ${best}`;
  if (d.worstThreatType) text += `; takes ${fmtMultiplier(d.threat)}× from ${typeName(d.worstThreatType)}`;
  if (d.worstThreatMove) text += `; watch out for its ${d.worstThreatMove}`;
  return text;
}

export interface IgnoredInput {
  moves: boolean; abilities: boolean; items: boolean; levels: boolean; fullTeam: boolean;
  seen: number; partial: boolean;
}

export function ignoredLine(i: IgnoredInput): string {
  const off = [!i.moves && "moves", !i.abilities && "abilities", !i.items && "items", !i.levels && "levels"].filter(Boolean) as string[];
  const list = off.length > 1 ? `${off.slice(0, -1).join(", ")} and ${off[off.length - 1]}` : off.join("");
  const parts: string[] = [];
  if (off.length) parts.push(`Ignores foe ${list} (switched off)`);
  parts.push(i.partial ? `${i.seen} of this trainer's Pokémon seen` : "Full team used");
  parts.push("The field can change mid-battle");
  return `${parts.join("; ")}.`;
}
