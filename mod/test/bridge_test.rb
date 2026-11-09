# Runs with any Ruby >= 3.0: ruby mod/test/bridge_test.rb
require 'tmpdir'

MOD = File.expand_path('../PokePalBridge.rb', __dir__)

# Stand-in for the game's battle class. Method names must match the hooks in install_hooks.
def define_game_battle
  Object.send(:remove_const, :PokeBattle_Battle) if defined?(::PokeBattle_Battle)
  Object.const_set(:PokeBattle_Battle, Class.new do
    attr_reader :calls
    def initialize = (@calls = [])
    def pbStartBattle(opts = {}, &block) = (@calls << [:start, opts]; block&.call; :won)
    def pbOnActiveOne(battler, fast: false) = (@calls << [:active, battler, fast]; battler)
    def pbEndOfRoundPhase = (@calls << [:round]; nil)
  end)
end

# What an alias-based mod (SWM, Export Team, ...) does.
def other_mod_hooks_round(tag)
  PokeBattle_Battle.class_eval <<~RUBY
    alias #{tag}_pbEndOfRoundPhase pbEndOfRoundPhase
    def pbEndOfRoundPhase(*args)
      @calls << :#{tag}
      #{tag}_pbEndOfRoundPhase(*args)
    end
  RUBY
end

def check(label, expected, actual)
  raise "#{label}: expected #{expected.inspect}, got #{actual.inspect}" unless expected == actual
end

def stub_writes
  PokePalBridge.define_singleton_method(:write) { |_b, state| WRITES << state }
end

WRITES = []
define_game_battle
other_mod_hooks_round(:before_us)
load MOD
load MOD # a second copy in patch/Mods must not double-wrap
other_mod_hooks_round(:after_us)
stub_writes

check('encode', '{"k":"GHOST","n":null,"a":[1,2.5,true]}', PokePalBridge.encode({ 'k' => :GHOST, 'n' => nil, 'a' => [1, 2.5, true] }))
check('escape', '"q\\"b\\\\n\\u000a"', PokePalBridge.encode("q\"b\\n\n"))
check('utf8', '"Flabébé"', PokePalBridge.encode('Flabébé'))
check('non-finite floats', '[null,null]', PokePalBridge.encode([Float::NAN, Float::INFINITY]))
check('invalid bytes', '"a?b"', PokePalBridge.encode("a\xFFb".dup.force_encoding('UTF-8')).sub("\uFFFD", '?'))

b = PokeBattle_Battle.new
yielded = false
check('return value', :won, b.pbStartBattle({ 'x' => 1 }) { yielded = true })
check('positional hash and block', [[:start, { 'x' => 1 }], true], [b.calls[0], yielded])
check('start writes', %w[active ended], WRITES)
check('keywords', :mon, b.pbOnActiveOne(:mon, fast: true))
check('keyword forwarded', [:active, :mon, true], b.calls[1])
b.pbEndOfRoundPhase
check('chain with other mods', [:after_us, :before_us, [:round]], b.calls[2..])
check('one write per hook', %w[active ended active active], WRITES)

# F12: the game re-runs its scripts (fresh methods), then every mod re-runs.
WRITES.clear
define_game_battle
other_mod_hooks_round(:before_us)
load MOD
stub_writes
b = PokeBattle_Battle.new
b.pbEndOfRoundPhase
check('after soft reset', [[:before_us, [:round]], %w[active]], [b.calls, WRITES])

# F12 on the same class with a game method that is itself aliased (Battle_Clauses does this to
# pbEndOfRoundPhase): the game's scripts redefine and re-alias the method under our wrapper.
# Wrapping by redefinition survives that; a prepended module would recurse forever here.
WRITES.clear
PokeBattle_Battle.class_eval do
  def pbEndOfRoundPhase = (@calls << [:round2]; nil)
  alias __clauses__pbEndOfRoundPhase pbEndOfRoundPhase
  def pbEndOfRoundPhase = (@calls << :clauses; __clauses__pbEndOfRoundPhase)
end
b = PokeBattle_Battle.new
b.pbEndOfRoundPhase
check('same-class script re-run', [[:clauses, [:round2]], []], [b.calls, WRITES])
load MOD # mods re-run after the scripts: wrapped again
stub_writes
b = PokeBattle_Battle.new
b.pbEndOfRoundPhase
check('re-wrapped after re-run', [[:clauses, [:round2]], %w[active]], [b.calls, WRITES])

# Visibility is kept.
define_game_battle
PokeBattle_Battle.send(:private, :pbEndOfRoundPhase)
load MOD
check('private stays private', true, PokeBattle_Battle.private_method_defined?(:pbEndOfRoundPhase))

# Errors in PokePal code never reach the game; the bridge stops after the first one.
define_game_battle
load MOD
stub_writes
b = PokeBattle_Battle.new
PokePalBridge.define_singleton_method(:write) { |_b, _s| raise 'boom' }
PokePalBridge.define_singleton_method(:log_error) { |e| WRITES << "logged #{e.message}" }
WRITES.clear
b.pbEndOfRoundPhase
b.pbEndOfRoundPhase
check('errors contained', ['logged boom'], WRITES)
check('game method still ran', [[:round], [:round]], b.calls)

# ---- State building and file writing against fake game objects ----
load MOD
PokePalBridge.instance_variable_set(:@disabled, false)
PokePalBridge.instance_variable_set(:@last, nil)
PokePalBridge.singleton_class.send(:remove_method, :write) if PokePalBridge.singleton_class.method_defined?(:write, false)
PokePalBridge.singleton_class.send(:remove_method, :log_error) if PokePalBridge.singleton_class.method_defined?(:log_error, false)
load MOD # re-defines the real write and log_error

Mon = Struct.new(:species, :form, :name, :level, :hp, :totalhp, :type1, :type2)
Battler = Struct.new(:index, :pokemon, :species, :form, :name, :level, :hp, :totalhp, :type1, :type2, :effects)
Field = Struct.new(:effect)
Trainer = Struct.new(:trainertype, :name)

def battler(index, species, hp: 40, types: [:NORMAL, nil], name: nil, effects: {})
  mon = Mon.new(species, 0, name || species.to_s.capitalize, 50, hp, 100, *types)
  Battler.new(index, mon, species, 0, name || species.to_s.capitalize, 50, hp, 100, *types, effects)
end

def fake_battle(battlers:, opponent: nil, double: false, online: false, field: :INDOOR)
  klass = online ? Class.new(PokeBattle_Battle) { def isOnline? = true } : PokeBattle_Battle
  fb = klass.allocate
  fb.instance_variable_set(:@calls, [])
  fb.define_singleton_method(:battlers) { battlers }
  fb.define_singleton_method(:opponent) { opponent }
  fb.define_singleton_method(:doublebattle) { double }
  fb.define_singleton_method(:field) { Field.new(field) }
  fb.define_singleton_method(:party1) { [battlers[0]&.pokemon, nil, Mon.new(:LUCARIO, 0, 'Rio', 79, 64, 100, :FIGHTING, :STEEL)] }
  fb.instance_variable_set(:@pokepal_id, 'b-1')
  fb
end

dir = Dir.mktmpdir('pokepal-mod')
PokePalBridge::Game.define_singleton_method(:save_dir) { dir }

gengar = battler(1, :GENGAR, types: [:GHOST, :POISON])
fb = fake_battle(battlers: [battler(0, :RIOLU), gengar, nil, nil], opponent: Trainer.new(:LEADER_SIRIUS, 'Sirius'))
state = PokePalBridge.build_state(fb, 'active')
check('schema keys', %w[schema bridgeVersion updatedAt battleId state isDouble field trainer foes party incoming], state.keys)
check('no incoming by default', nil, state['incoming'])
check('trainer', { 'type' => 'LEADER_SIRIUS', 'name' => 'Sirius' }, state['trainer'])
check('foe', [{ 'slot' => 0, 'name' => 'Gengar', 'species' => 'GENGAR', 'form' => 0, 'formName' => nil, 'level' => 50,
                'types' => %w[GHOST POISON], 'hpPercent' => 40, 'fainted' => false }], state['foes'])
check('foe has no extra keys (no moves, abilities, items)', %w[slot name species form formName level types hpPercent fainted], state['foes'][0].keys)
check('party', [['RIOLU', true], ['LUCARIO', false]], state['party'].map { |p| [p['species'], p['active']] })
check('field', { 'id' => 'INDOOR', 'name' => 'INDOOR' }, state['field'])

check('wild has no trainer', nil, PokePalBridge.build_state(fake_battle(battlers: [battler(0, :RIOLU), gengar]), 'active')['trainer'])
check('double trainer array uses the first', 'A',
      PokePalBridge.build_state(fake_battle(battlers: [battler(0, :RIOLU), gengar], opponent: [Trainer.new(:T, 'A'), Trainer.new(:T, 'B')]), 'active')['trainer']['name'])
single_with_placeholders = fake_battle(battlers: [battler(0, :RIOLU), gengar, battler(2, :MEW), battler(3, :MEWTWO)])
check('singles ignore battlers 2 and 3', ['GENGAR'], PokePalBridge.build_state(single_with_placeholders, 'active')['foes'].map { |f| f['species'] })
doubles = fake_battle(battlers: [battler(0, :RIOLU), gengar, battler(2, :MEW), battler(3, :MEWTWO)], double: true)
check('doubles list both foes', [['GENGAR', 0], ['MEWTWO', 1]], PokePalBridge.build_state(doubles, 'active')['foes'].map { |f| [f['species'], f['slot']] })
fainted = fake_battle(battlers: [battler(0, :RIOLU), battler(1, :GENGAR, hp: 0)])
check('fainted foe', [true, 0], PokePalBridge.build_state(fainted, 'active')['foes'].map { |f| [f['fainted'], f['hpPercent']] }.first)
empty_slot = fake_battle(battlers: [Battler.new(0, nil, 0, 0, '', 0, 0, 0, nil, nil, {}), Battler.new(1, nil, 0, 0, '', 0, 0, 0, nil, nil, {})])
check('empty battlers are skipped', [[], 0], [PokePalBridge.build_state(empty_slot, 'active')['foes'], 0])

# Illusion: the game's species/name already show the disguise; the real types must not leak.
zoroark = battler(1, :ZOROARK, types: [:DARK, nil], effects: { Illusion: Object.new })
check('illusion hides real types', [], PokePalBridge.build_state(fake_battle(battlers: [battler(0, :RIOLU), zoroark]), 'active')['foes'][0]['types'])

# Files: atomic write, unchanged states skipped, off switches, online battles.
path = File.join(dir, 'PokePal', 'battle_state.json')
live = fake_battle(battlers: [battler(0, :RIOLU), gengar], opponent: Trainer.new(:LEADER_SIRIUS, 'Sirius'))
PokePalBridge.write(live, 'active')
check('file written', true, File.exist?(path))
check('no temp file left', false, File.exist?(path + '.tmp'))
first = File.binread(path)
sleep 1.1
PokePalBridge.write(live, 'active')
check('unchanged state is not rewritten', first, File.binread(path))
PokePalBridge.write(live, 'ended')
check('state change is rewritten', true, File.binread(path).include?('"state":"ended"'))

File.write(File.join(dir, 'PokePal', 'disabled'), '')
File.delete(path)
live.define_singleton_method(:doublebattle) { true }
PokePalBridge.write(live, 'active')
check('disabled file stops writes', false, File.exist?(path))
File.delete(File.join(dir, 'PokePal', 'disabled'))

online = fake_battle(battlers: [battler(0, :RIOLU), gengar], online: true)
PokePalBridge.write(online, 'active')
check('online battle writes nothing', false, File.exist?(path))
check('online by class name when isOnline? is missing', true,
      PokePalBridge::Game.online?(Class.new { def self.name = 'PokeBattle_OnlineBattle' }.new))
safari = Object.new
check('battle without isOnline? is offline', false, PokePalBridge::Game.online?(safari))

PokePalBridge.write(live, 'active')
check('offline battle writes again', true, File.exist?(path))
check('no error log', false, File.exist?(File.join(dir, 'PokePal', 'bridge_error.log')))

# The "is about to send in" announcement (Battle_Scene.rb:1800 pbDisplayPausedMessage).
class PokeBattle_Scene
  attr_reader :shown
  def initialize(battle) = (@battle = battle; @shown = [])
  def pbDisplayPausedMessage(msg, *rest) = (@shown << msg; :shown)
end
load MOD
PokePalBridge::Game.define_singleton_method(:save_dir) { dir }
PokePalBridge.instance_variable_set(:@disabled, false)
PokePalBridge.instance_variable_set(:@last, nil)
File.delete(path) if File.exist?(path)
next_mon = Mon.new(:PORYGONZ, 0, 'Porygon-Z', 62, 100, 100, :NORMAL, nil)
fainted_mon = Mon.new(:PORYGONZ, 0, 'Porygon-Z', 62, 0, 100, :NORMAL, nil)
cinccino = battler(1, :CINCCINO, hp: 0)
incoming_battle = fake_battle(battlers: [battler(0, :RIOLU), cinccino], opponent: Trainer.new(:PRODIGY, 'Noel'))
incoming_battle.define_singleton_method(:party2) { [cinccino.pokemon, fainted_mon, nil, next_mon] }
scene = PokeBattle_Scene.new(incoming_battle)
check('scene method result passes through', :shown, scene.pbDisplayPausedMessage('Prodigy Noel is about to send in Porygon-Z.'))
check('incoming is in the file before the message is shown', true, File.binread(path).include?('"incoming":{"slot":3,"species":"PORYGONZ","form":0,"level":62,"types":["NORMAL"]}'))
check('incoming has no extra keys', %w[slot species form level types], incoming_battle.instance_variable_get(:@pokepal_incoming).keys)
scene.pbDisplayPausedMessage('Wild Rattata appeared!')
check('other messages leave it alone', 3, incoming_battle.instance_variable_get(:@pokepal_incoming)['slot'])
incoming_battle.pbOnActiveOne(battler(0, :RIOLU))
check('own send-out keeps it', true, !incoming_battle.instance_variable_get(:@pokepal_incoming).nil?)
incoming_battle.pbOnActiveOne(battler(1, :PORYGONZ))
check('foe send-out clears it', [nil, true], [incoming_battle.instance_variable_get(:@pokepal_incoming), File.binread(path).include?('"incoming":null')])
unknown = fake_battle(battlers: [battler(0, :RIOLU), cinccino])
unknown.define_singleton_method(:party2) { [cinccino.pokemon] }
PokeBattle_Scene.new(unknown).pbDisplayPausedMessage('Noel is about to send in Missingno.')
check('unknown name records nothing', nil, unknown.instance_variable_get(:@pokepal_incoming))
online_inc = fake_battle(battlers: [battler(0, :RIOLU), cinccino], online: true)
online_inc.define_singleton_method(:party2) { [next_mon] }
File.delete(path) if File.exist?(path)
PokeBattle_Scene.new(online_inc).pbDisplayPausedMessage('Noel is about to send in Porygon-Z.')
check('online records nothing', [nil, false], [online_inc.instance_variable_get(:@pokepal_incoming), File.exist?(path)])

# The only constants and globals the file adds.
check('no stray globals', [], global_variables.grep(/pokepal/i))
puts 'ok'
