# Reborn mechanics used by this data

## Type effectiveness on a field

For a move of type M against defender types D1 (and D2):

1. If the field lists M in `failingMoveTypes`, the move fails (0x).
2. The effective move type is M, or `to` if the overlay's `moveTypeRemap` has `from: M`.
3. For each defender type, the multiplier is the overlay's `overrides` cell if present, otherwise the base chart cell (`types.json`, missing = 1). Unknown types such as `QMARKS` are neutral.
4. With `invert`, each multiplier is then mapped: 0 -> 2, 0.5 -> 2, 1 -> 1, 2 -> 0.5.
5. Multipliers multiply across the defender's types.
6. Each matching `secondaryTypes` rule adds a second type to the move (for example Flying Press, or Ground moves on Underwater); its multiplier vs the defender is multiplied in. With `oneOf`, the result is a range (min to max) because the extra type varies.

`typeBoosts` are power multipliers, not effectiveness. A boost factor of 0 in the game's data means moves of that type fail.

Most field chart rules live in the game's battle code, not in `fieldtext.rb` (Glitch's `typeMods` is empty, for example), which is why they are hand-curated in `field-overlays.json`.

## Curated overlays

| Field | Rules | Source |
|---|---|---|
| `INVERSE` | Chart inverted. Ability immunities, Freeze-Dry vs Water and Thunder Wave vs Ground still apply | Fandom Field Effects; research doc section 3 |
| `GLITCH` | Ghost->Psychic 0x, Ice->Fire 1x, Poison<->Bug 2x, Dragon neutral against Dragon/Steel/Fairy; Dark, Steel and Fairy moves become Normal; physical/special split by type returns | Fandom Field Effects; research doc section 3 |
| `HOLY` | Normal->Ghost and Normal->Dark 2x | Fandom Field Effects; research doc section 3 |
| `UNDERWATER` | Water->Water 1x; Ground moves also count as Water; Fire moves fail | Fandom Field Effects; research doc section 3 |
| `CRYSTALCAVERN` | Rock moves also count as one of Fire, Water, Grass or Psychic (varies) | Fandom Field Effects; research doc section 3 |

These starting values still need checking against the Fandom Field Effects page, xephy's field notes and the in-game Field Notes.
