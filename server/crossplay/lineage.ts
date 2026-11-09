import type { SaveMeta } from "../../shared/types";
import { compareSaves } from "./compare";
import type { Ledger } from "./ledger";

export type WarningCode =
  | "GAME_RUNNING" | "ALREADY_HANDED_OFF" | "DESTINATION_NEWER" | "DIFFERENT_TRAINER"
  | "OLDER_THAN_HANDOFF" | "PC_CHANGED_SINCE_HANDOFF" | "NO_NEW_PROGRESS";
export interface SwapWarning { code: WarningCode; message: string }

const SLACK_SECONDS = 60;

export function handOffWarnings(pc: SaveMeta, ledger: Ledger, gameRunning: boolean, syncCopy: SaveMeta | null): SwapWarning[] {
  const w: SwapWarning[] = [];
  if (gameRunning) w.push({ code: "GAME_RUNNING", message: "Pokémon Reborn is running on the PC. Save in game and close it first, or the hand-off may miss your latest progress." });
  if (ledger.holder === "runa") w.push({ code: "ALREADY_HANDED_OFF", message: `The save was already handed to Runa at ${ledger.handoff?.at}. Handing off again replaces that copy; Runa progress since then would be lost.` });
  if (syncCopy) {
    const c = compareSaves(pc, syncCopy);
    if (c.newer === "b" || c.newer === "unknown") w.push({ code: "DESTINATION_NEWER", message: `The copy already in the iCloud folder may be newer (${c.reason}).` });
  }
  return w;
}

export function incomingWarnings(incoming: SaveMeta, pc: SaveMeta | null, ledger: Ledger): SwapWarning[] {
  const w: SwapWarning[] = [];
  const handoff = ledger.holder === "runa" ? ledger.handoff : null;
  const ref = handoff?.meta ?? pc;
  if (ref && incoming.trainerName !== ref.trainerName) w.push({ code: "DIFFERENT_TRAINER", message: `This save belongs to ${incoming.trainerName}, not ${ref.trainerName}.` });
  if (incoming.sha256 === pc?.sha256 || incoming.sha256 === handoff?.pcSha256) {
    w.push({ code: "NO_NEW_PROGRESS", message: "This is the same save PokePal already has; there is no new progress in it." });
  }
  if (handoff && incoming.playtimeSeconds + SLACK_SECONDS < handoff.meta.playtimeSeconds) {
    w.push({ code: "OLDER_THAN_HANDOFF", message: "This save has less playtime than the one you handed to Runa. It is probably an old export." });
  }
  if (handoff && pc && pc.sha256 !== handoff.pcSha256) {
    w.push({ code: "PC_CHANGED_SINCE_HANDOFF", message: "The PC save changed after you handed off to Runa (did you play on the PC?). Installing replaces that PC progress; it stays in the backup." });
  }
  if (pc && compareSaves(incoming, pc).newer === "b") w.push({ code: "DESTINATION_NEWER", message: `The PC save looks newer (${compareSaves(incoming, pc).reason}).` });
  return w;
}

export function restoreWarnings(backup: SaveMeta, pc: SaveMeta | null, ledger: Ledger): SwapWarning[] {
  const w: SwapWarning[] = [];
  if (ledger.holder === "runa") w.push({ code: "ALREADY_HANDED_OFF", message: "Your save is currently handed to Runa. Restoring on the PC starts a separate copy here." });
  if (pc && compareSaves(backup, pc).newer === "b") w.push({ code: "DESTINATION_NEWER", message: `The current PC save looks newer (${compareSaves(backup, pc).reason}).` });
  return w;
}
