# Environment findings

## Boss spot check

Checked 9 Nov 2026 from a cloud agent (no game install needed): `trainers.json` (19.5.0) against the set data that https://reborn.rebornversecalc.com serves in `js/data/sets/gen9.js`. Compared species, form, level, held item, ability and moves for every Pokémon.

| Boss | trainers.json key | rebornversecalc set | Result |
|---|---|---|---|
| Julia (early gym) | `JULIA:Julia:0` | "Gym Julia (Electric)" | All 6 match |
| Florinia (second gym) | `FLORINIA:Florinia:0` | "Gym Florinia (Desert)" | All 6 match |
| Sirius, Yureyu HQ | `Sirius:Sirius:0` | "Yureyu Sirius (Short Circuit) Doubles" | All 6 match |
| Sirius, Belrose Manse | `Sirius:Sirius:1` | "Belrose Sirius (None)" | All 6 match |
| Sirius, Victory Road | `Sirius:Sirius:2` | "VR Sirius (Dragon's Den) Doubles" | All 6 match |

The calc's "Fiore Florinia" (Lv 68-71) also matches `FLORINIA:Florinia:1`.

One difference, not in the data: rebornversecalc labels the Yureyu HQ Sirius fight as Doubles, while the wiki Battle Guide says single. `bosses.json` follows the calc (`doubles: true`) and notes the disagreement.

Not covered: the mid-game gym (Julia/Florinia are early, Sirius spans mid and late); the other 18 gym leaders were not compared.

## Battle hooks

Task 4.1 (Reborn 19.5.0, read from `C:\Users\Ben\Desktop\Reborn-19.5.0\Scripts`; paths relative to that folder). The bridge mod (`mod/PokePalBridge.rb`) uses exactly these.

| Need | What the mod uses | Source |
|---|---|---|
| Battle class | `PokeBattle_Battle` | `Battle.rb:258` (reopened `Battle_Clauses.rb:5`, `Battle_Field.rb:213`, `ShadowPokemon.rb:436`) |
| Battle start/end | wrap `pbStartBattle(canlose = false)`; it returns when the battle is over (`pbEndOfBattle` is its return value, `Battle.rb:3867`) | `Battle.rb:3585`, `:6453` |
| Mon enters the field | wrap `pbOnActiveOne(pkmn, onlyabilities = false)`, the single choke point for send-out and switch-in | `Battle.rb:2857` (callers `:1863`, `:2844`, `:3218`, `:6364`) |
| End of round | wrap `pbEndOfRoundPhase` (no args) | `Battle.rb:4372`, called `:3860` |
| Battlers | `battle.battlers` (Array, index parity: odd = foe) | `Battle.rb:273`, `:756-758` |
| Species / form / level / name | `species`, `form`, `level`, `name` (species and name honour Illusion) | `Battler.rb:720`, `:148`, `:11`, `:716` |
| Current types | `type1`, `type2` (live, include field and move type changes; no `types` method) | `Battler.rb:20-21` |
| HP / fainted | `hp`, `totalhp`; fainted is `hp <= 0` | `Battler.rb:13`, `:8`, `:751` |
| Field | `battle.field.effect` (symbol, same ids as `fields.json`; `:INDOOR` is "No Field"); name `$cache.FEData[effect].name` | `Battle_Field.rb:2`, `:172-176`; `DataObjects.rb:776` |
| Double flag | `battle.doublebattle` | `Battle.rb:262` |
| Opponent | `battle.opponent`: a trainer (`name`, `trainertype`), an Array in double trainer battles, nil when wild | `Battle.rb:267`; `Battle_Trainer.rb:2,5` |
| Player party | `battle.party1` | `Battle.rb:268` |
| Online battle | `battle.isOnline?` (false on the base class, true on `PokeBattle_OnlineBattle`; the safari class has no such method) | `Battle.rb:363-365`; `Online/Battle_Online.rb:30-32` |
| Save folder | `File.dirname(RTP.getSaveFileName('Game.rxdata'))` | `RTP.rb:80-82` |
| Mod loading | `Dir["./patch/Mods/*.rb"].each { load }` at the end of `startup`, after `$cache` exists; sorted by name | `ClientData.rb:50-60`, called from `Main.rb:31` |

How the findings changed Tasks 4.2-4.3 (applied before writing code):

- `Battle_Clauses.rb:8,41` already aliases `pbEndOfRoundPhase`. The findings suggested `prepend`; the mod instead redefines the method with the captured original (`PokePalBridge.wrap`, as the plan's coexistence rules say). Reason, checked in `mod/test/bridge_test.rb`: an `alias` taken over a prepended module resolves to the module's method, so after an F12 re-run of `Battle_Clauses.rb` the game's own `alias __clauses__pbEndOfRoundPhase pbEndOfRoundPhase` would call itself forever. A redefinition is simply replaced by the game's scripts on re-run, and the mod wraps again when it reloads.
- Online, recorded and safari battles are separate classes that override start, send-out and end, so those hooks only see them through `super`. `pbOnActiveOne` and `pbEndOfRoundPhase` are shared. The mod disables itself with `battle.isOnline?` and, as a second check, any `Online` class name in the battle's ancestors. Safari battles (own class) are not hooked.
- The opponent may be an Array (first trainer is used) or nil (wild, `trainer: null`).
- Foe `species` and `name` honour Illusion, which is what the player sees. `type1`/`type2` do not, so a disguised foe is written with `types: []` and the app falls back to the shown species' types. How the game marks an active Illusion (`effects[:Illusion]`) is a guess to verify in game (see mod/README.md).
- Singles never report battlers 2 and 3; battlers without a Pokémon are skipped.
- Field ids are written as the game's symbol (`INDOOR` for no field); the app treats `INDOOR` as "No field".
- Not verified (needs the game): whether F12 reloads `patch/Mods` (`io.rb:30` suggests `exit` is not called on reset). The mod is safe either way: if it is not reloaded after F12, the game's re-run scripts replace the wrappers and PokePal quietly stops writing until the game restarts.
