# Phase 2 PC findings (8 Nov 2026, real save copy, game running)

- `npm run check` with REBORN_GAME_DIR set: 28 files, 101 tests pass, including the real-save and real-Runa cases.
- Real save: trainer Bean, 6 badges; party Amoonguss 52, Ampharos 51, Castform 46, Klinklang 55, Diggersby 55, Talonflame 52; 50 boxes holding 33 mons; `unknownIds` empty.
- Hidden Power: `Battle_MoveEffects.rb:4081-4092` uses `$cache.types.keys` minus NORMAL/QMARKS/SHADOW, `personalID % length`, cached in `hptype`. `types.json` order gives the same pool. In-game comparison still needs Ben (no party mon knows Hidden Power).
- Field Notes: `FieldNotes.rb:162,173` sets `$game_switches[fieldAppSwitch]` from `$Unidata[:fieldNotes]`, so the switch is valid. Found: CORROSIVE, CRYSTALCAVERN, ELECTERRAIN, FACTORY, FOREST, RAINBOW, SUPERHEATED, SWAMP. Ben to confirm.
- Nicknames: every mon in this save is nicknamed; nil-vs-species not answerable here.
- `isGameRunning` returned true while Reborn ran.
- Committed `maps.json` was empty; re-extracted (895 maps). Save map 255 is "Tanzan Meteor Base" while the slot filename says "Tanzan Mountain"; cosmetic.
- Real save and Runa zip are gitignored.
