# PokePal bridge mod

`PokePalBridge.rb` is a small read-only mod for Pokémon Reborn 19.5. It writes the current battle (the foes on the field, the field effect, your party's HP, the opposing trainer) to a JSON file that PokePal watches, so the Battle tab can follow a fight live and Battle Prep can select the trainer you are facing.

- Read-only: it never changes battle state, the save, or the screen. No key bindings, no windows, no text.
- Writes `battle_state.json` (atomically, via a `.tmp` file and a rename) in `<save dir>\PokePal\`. The save dir is wherever the game keeps `Game.rxdata` (`C:\Users\Ben\Saved Games\Pokemon Reborn`).
- It never writes foe moves, abilities, items, stats or EVs: only what you can already see or check with Battle Inspect.
- Online battles: it writes nothing.
- Needs no gems (it has its own JSON encoder). Works with the game's own Ruby 3.1.

## Install

1. Close the game.
2. Create `<game dir>\patch\Mods\` if it doesn't exist (for example `C:\Users\Ben\Desktop\Reborn-19.5.0\patch\Mods`).
3. Copy `mod\PokePalBridge.rb` into it **as `zz_PokePalBridge.rb`**. The game loads `patch\Mods\*.rb` in name order, so the `zz_` prefix makes it load last and sit on top of any other mod.

```powershell
New-Item -ItemType Directory -Force "C:\Users\Ben\Desktop\Reborn-19.5.0\patch\Mods"
Copy-Item mod\PokePalBridge.rb "C:\Users\Ben\Desktop\Reborn-19.5.0\patch\Mods\zz_PokePalBridge.rb"
```

PokePal reads `<save dir>\PokePal\battle_state.json` automatically (`battleStateFile` in `pokepal.config.json`).

## Uninstall

Delete `zz_PokePalBridge.rb`. Nothing else was changed. The Battle tab goes back to manual mode.

## Switching it off without uninstalling

- Set `ENABLED = false` at the top of the file, or
- create an empty file named `disabled` in `<save dir>\PokePal\` (no editing needed; delete it to switch back on).

## Errors

Every hook runs inside `PokePalBridge.safely`. On the first error it writes `<save dir>\PokePal\bridge_error.log` and stops writing for the rest of the session. It never raises into the game. If the Battle tab's "Last update" is stuck, look for that log.

## Other mods

It adds no alias names, no globals and no methods on core classes, and wraps each battle method by redefining it around the method that is current at load time. That keeps it in the chain with alias-based mods (SWM Modular Modpack, Export Team as .txt, ShowMoveEffectiveness, Modular Debug Mode) loaded before or after it. Loading the file twice does nothing the second time. The compatibility checks against real mods are recorded in `docs/environment-findings.md` once run in game.

## Hooks (Reborn 19.5.0)

`PokeBattle_Battle#pbStartBattle` (writes at start and, when it returns, `ended`), `#pbOnActiveOne` (every send-out and switch-in), `#pbEndOfRoundPhase`. Details and file:line references: `docs/environment-findings.md` → "Battle hooks".

## Test

`npm run test:mod` (any Ruby 3.0 or newer; no game needed). It uses stand-in classes for the game's battle class.

## Support

Mods are unsupported by the Reborn developers. Remove this file before reporting a game bug.
