# Rules for AI assistants using this data

- Pick the data folder from `versions/manifest.json` -> `latest`.
- IDs are the game's symbols without the colon: uppercase for species, moves, types, items, abilities and fields; mixed case for trainer types (`PkMnTRAINER_Male`, `Youngster`). Trainer keys are `"<trainerType>:<name>:<partyId>"`.
- Base stats are ordered HP, Atk, Def, SpA, SpD, Spe.
- `trainers.json` contains trainer teams and movesets. These are **spoilers**: do not reveal them unless the user asks.
- Type effectiveness on a field = the base chart in `types.json` + the matching entry in `field-overlays.json` + `fields.json` -> `rules` (type boosts, failing move types, secondary types). See `docs/reborn-mechanics.md` for the evaluation order.
- `SHADOW` in `types.json` is an unused engine leftover; ignore it. `QMARKS` is the "???" type.
- Never invent Reborn data that is not in these files. If something is missing, say so.
