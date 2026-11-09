# Pokémon Reborn 19.5 game data

Game data for Pokémon Reborn 19.5.0 (a fan game), extracted from the game's own `Scripts/Reborn/*.rb` files and `Data/MapInfos.rxdata` into JSON. It is unofficial and contains no game assets (no sprites, maps, audio or scripts).

## Layout

```
data/
  README.md, AGENTS.md          this file, and rules for AI assistants
  docs/                         data-dictionary.md, reborn-mechanics.md, using-with-ai.md
  src/                          the extractor (cli.ts, sources.ts, ruby/literal.ts, marshal.ts, extract/*.ts, curated.ts, write.ts)
  test/                         extractor tests + canonical-chart.ts (the standard Gen 6+ chart)
  curated/                      hand-maintained files; every entry cites a source
  versions/
    manifest.json               { "latest": "19.5.0", "versions": ["19.5.0"] }
    19.5.0/
      meta.json                 game version, extraction time, SHA-256 of every source file, extractor version
      types.json                types in the game's order + base type chart
      species.json              species -> forms -> name, types, base stats, abilities, dex number
      moves.json                id -> name, type, category, power, accuracy, PP, target, description
      abilities.json, items.json  id -> name, description
      fields.json               field id -> name, description, fieldAppSwitch, normalized rules, raw hash
      trainers.json             trainer key -> trainer type, name, party id, Pokémon (moves, items, ...)
      trainer-types.json        trainer type id -> display name
      maps.json                 map id -> map name
      field-overlays.json, bosses.json, showdown-names.json   curated, validated copies
```

## Regenerate

From the repository root:

```
npm install
npm run extract -- --game "<Reborn install dir>"
npm run check
```

Then commit `data/versions/`. The version comes from `GAMEVERSION` in `Scripts/Reborn/Bootstrap.rb`; the optional `--version` flag must agree with it. Set `REBORN_GAME_DIR` to the install directory to also run the tests that read the real install.

## IDs

IDs are the game's Ruby symbols without the colon, exactly as written: species, moves, types, items, abilities and fields are uppercase (`BULBASAUR`, `FIRE`, `ELECTERRAIN`); trainer types, growth rates and similar are mixed case (`PkMnTRAINER_Male`, `Youngster`). A trainer key is `"<trainerType>:<name>:<partyId>"`. Stat arrays are HP, Atk, Def, SpA, SpD, Spe.

## Versioning

One folder per game patch under `versions/`; `manifest.json` `latest` names the newest one.
