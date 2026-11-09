import type { SaveMeta } from "../../shared/types";

export function compareSaves(a: SaveMeta | null, b: SaveMeta | null): { newer: "a" | "b" | "same" | "unknown"; reason: string } {
  if (!a && !b) return { newer: "unknown", reason: "neither save exists" };
  if (!b) return { newer: "a", reason: "only one exists" };
  if (!a) return { newer: "b", reason: "only one exists" };
  if (a.sha256 === b.sha256) return { newer: "same", reason: "identical files" };
  if (a.trainerName !== b.trainerName) return { newer: "unknown", reason: "different trainers; check before replacing" };
  const dt = a.playtimeSeconds - b.playtimeSeconds;
  if (Math.abs(dt) > 60) return { newer: dt > 0 ? "a" : "b", reason: "more playtime" };
  if (a.badgeCount !== b.badgeCount) return { newer: a.badgeCount > b.badgeCount ? "a" : "b", reason: "more badges" };
  return { newer: a.mtimeMs >= b.mtimeMs ? "a" : "b", reason: "playtime within a minute; using file time" };
}
