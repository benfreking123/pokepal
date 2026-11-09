# Data dictionary

All files are in `versions/<version>/`, JSON with sorted keys. IDs follow the rules in `../AGENTS.md`.

## meta.json
| Property | Type | Meaning |
|---|---|---|
| `gameVersion` | string | `GAMEVERSION` from `Scripts/Reborn/Bootstrap.rb` |
| `extractedAt` | string | ISO time of extraction |
| `extractorVersion` | string | Version of the extractor that wrote the files |
| `sources` | object | Source file path (relative to the install) -> SHA-256 |

## types.json
| Property | Type | Meaning |
|---|---|---|
| `types` | `{ id, name }[]` | Types in the game's `TYPEHASH` order (includes `QMARKS` and the unused `SHADOW`) |
| `chart` | `Record<attackType, Record<defendType, number>>` | Only non-1 multipliers (`0`, `0.5`, `2`); missing = 1. Derived from each defending type's weaknesses, resistances and immunities |

## species.json
`Record<id, { id, dexNum, forms }>`. `forms[]` is in form-index order: `{ form (index), formName (null for the base form), name, types[], baseStats[6], abilities[], hiddenAbility }`. Later forms inherit every property from the base form and override only what the game lists.

## moves.json
`Record<id, { id, name, type, category ("physical"|"special"|"status"), power, accuracy, pp, target (string|null), description }>`.

## abilities.json, items.json
`Record<id, { name, description }>`.

## fields.json
`Record<id, FieldEntry>`:
| Property | Type | Meaning |
|---|---|---|
| `id`, `name` | string | Field id and display name |
| `description` | string | First string of the game's `fieldMessage` |
| `fieldAppSwitch` | number or null | The game switch the in-game Field Notes app uses for this field (set once the entry is found) |
| `rules.typeBoosts` | `{ type, factor }[]` | Power multipliers for moves of a type (from `typeBoosts`, factor != 0) |
| `rules.failingMoveTypes` | `string[]` | Move types that fail (a `typeBoosts` factor of 0) |
| `rules.secondaryTypes` | `{ match: { moveType }, addType }[]` | From `typeAddOns`: moves of `moveType` also count as `addType` |
| `raw` | object | The whole field hash. Values the extractor cannot evaluate are `{ "$ruby": "<source text>" }` (code, e.g. `proc`/`lambda`) or `{ "$const": "A::B" }` (constant paths). Hash keys that were numbers appear as strings (`2.0` -> `"2"`); other keys keep their source text (`[1, 1]`, `PBStats::SPEED`) |

## trainers.json
`Record<key, { key, trainerType, name, partyId, mons[] }>`; mon = `{ species, form, level, item, ability, moves[], nature, iv, ev }` (`iv` is a number or null; `ev` is an array or null). **Spoilers.** If the game lists the same key twice, the later entry is kept.

## trainer-types.json
`Record<trainerType, { name }>`; the name is the game's `:title`.

## maps.json
`Record<mapId, mapName>` from `Data/MapInfos.rxdata`.

## field-overlays.json (curated)
Array of `FieldOverlay`:
| Property | Type | Meaning |
|---|---|---|
| `fieldId` | string | A key of `fields.json` |
| `invert` | boolean? | Whole chart inverted (0 and 1/2 become 2, 2 becomes 1/2) |
| `overrides` | `{ attack, defend, multiplier }[]` | Replace single cells of the base chart |
| `moveTypeRemap` | `{ from, to }[]` | Moves of `from` act as `to` |
| `secondaryTypes` | `{ match: { moveType?, moveIds?, category? }, addType? , oneOf? }[]` | Extra type(s) for matching moves; exactly one of `addType` or `oneOf` (varies) |
| `failingMoveTypes` | `string[]`? | Move types that fail |
| `typeBoosts` | `{ type, factor }[]`? | Power multipliers |
| `notes` | `string[]` | Plain-language notes |
| `source` | string | Where the rule comes from |

## bosses.json (curated)
Array of `{ id, name, group ("gym"|"other"), order, variants[{ label, trainerKey }], fieldId, doubles, location?, notes[], source }`. Empty in Phase 1.

## showdown-names.json (curated)
`{ species, items, moves, abilities }`, each `Record<gameId, showdownName>` overrides.
