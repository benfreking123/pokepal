import type { GameData, MonLocation, OwnedMon, SaveMeta, SaveSummary, StatBlock } from "../../shared/types";
import { readSaveFile, type SaveRead } from "./readSave";
import { readProgress, type TrackedIds } from "./progress";
import { hiddenPowerType, isShiny, MON, SAVE_PATHS, STAT_ORDER } from "./schema";

export type SaveData = Pick<GameData, "species" | "moves" | "items" | "abilities" | "maps" | "types" | "fields">;

export function toStatBlock(arr: number[], order: readonly (keyof StatBlock)[]): StatBlock {
  const out = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  order.forEach((k, i) => (out[k] = Number(arr[i] ?? 0)));
  return out;
}

export function fieldNotesFound(switches: unknown[] | null, fields: SaveData["fields"]): string[] | null {
  if (!switches) return null;
  return Object.values(fields).filter((f) => f.fieldAppSwitch !== null && switches[f.fieldAppSwitch] === true).map((f) => f.id).sort();
}

export function mapSave(read: SaveRead, data: SaveData, tracked: TrackedIds = { variables: [], switches: [] }): SaveSummary {
  const typeIds = data.types.map((t) => t.id);
  const unknown = new Set<string>();
  const check = (id: string | null, table: Record<string, unknown>) => { if (id && !(id in table)) unknown.add(id); };
  let order = 0;
  const toMon = (m: unknown, uid: string, location: MonLocation): OwnedMon => {
    const mon: OwnedMon = {
      uid, location, order: order++,
      species: MON.species(m), form: MON.form(m), nickname: MON.nickname(m), level: MON.level(m), isEgg: MON.isEgg(m),
      shiny: isShiny(MON.personalId(m), MON.trainerId(m), MON.shinyFlag(m)),
      item: MON.item(m), ability: MON.ability(m), nature: MON.nature(m), moves: MON.moves(m),
      ivs: toStatBlock(MON.ivs(m), STAT_ORDER), evs: toStatBlock(MON.evs(m), STAT_ORDER),
      hiddenPowerType: hiddenPowerType(MON.personalId(m), MON.cachedHiddenPowerType(m), typeIds),
    };
    check(mon.species, data.species); check(mon.item, data.items); check(mon.ability, data.abilities);
    mon.moves.forEach((id) => check(id, data.moves));
    return mon;
  };

  const trainer = SAVE_PATHS.trainer(read.roots);
  const party = SAVE_PATHS.party(trainer).flatMap((m, index) => (m ? [toMon(m, `p${index}`, { kind: "party", index })] : []));
  order = 6;
  const boxes = SAVE_PATHS.boxes(SAVE_PATHS.storage(read.roots)).map((box, b) => ({
    name: SAVE_PATHS.boxName(box),
    mons: SAVE_PATHS.boxMons(box).flatMap((m, slot) => (m ? [toMon(m, `b${b}-${slot}`, { kind: "box", box: b, slot })] : [])),
  }));
  const mapId = SAVE_PATHS.mapId(read.roots);
  const meta: SaveMeta = {
    trainerName: SAVE_PATHS.trainerName(trainer),
    playtimeSeconds: SAVE_PATHS.playtimeSeconds(read.roots),
    badgeCount: SAVE_PATHS.badges(trainer).filter((b) => b === true).length,
    mapId, mapName: data.maps[String(mapId)] ?? null,
    sha256: read.sha256, mtimeMs: read.mtimeMs, sizeBytes: read.sizeBytes,
  };
  const notes = fieldNotesFound(SAVE_PATHS.switches(read.roots), data.fields);
  const progress = readProgress(read.roots, { variables: tracked.variables, switches: [...new Set([...tracked.switches, 599])] }, { mapName: meta.mapName, fieldNoteCount: notes?.length ?? null });
  return { meta, party, boxes, unknownIds: [...unknown].sort(), fieldNotesFound: notes, progress };
}

export async function readSaveMeta(file: string, data: SaveData): Promise<SaveMeta> {
  return mapSave(await readSaveFile(file), data).meta;
}
