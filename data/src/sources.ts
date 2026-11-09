export type Domain = "species" | "moves" | "types" | "abilities" | "items" | "trainers" | "trainerTypes" | "fields";

export const SOURCES: Record<Domain, { file: string; constant: string }> = {
  species: { file: "Scripts/Reborn/montext.rb", constant: "MONHASH" },
  moves: { file: "Scripts/Reborn/movetext.rb", constant: "MOVEHASH" },
  types: { file: "Scripts/Reborn/typetext.rb", constant: "TYPEHASH" },
  abilities: { file: "Scripts/Reborn/abiltext.rb", constant: "ABILHASH" },
  items: { file: "Scripts/Reborn/itemtext.rb", constant: "ITEMHASH" },
  trainers: { file: "Scripts/Reborn/trainertext.rb", constant: "TEAMARRAY" },
  trainerTypes: { file: "Scripts/Reborn/ttypetext.rb", constant: "TTYPEHASH" },
  fields: { file: "Scripts/Reborn/fieldtext.rb", constant: "FIELDEFFECTS" },
};

export const MAPINFOS_FILE = "Data/MapInfos.rxdata";
export const VERSION_SOURCE = { file: "Scripts/Reborn/Bootstrap.rb", constant: "GAMEVERSION" };
