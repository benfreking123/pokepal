# Runs with any Ruby >= 3.0: ruby mod/test/moves_test.rb (fight menu move markers)
require_relative 'support'

class Mv
  attr_reader :move, :type, :basedamage, :accuracy, :category
  def initialize(move, type, bp, acc, category = nil) = (@move = move; @type = type; @basedamage = bp; @accuracy = acc; @category = category)
  def pbType(_battler, t) = t
end
class Mon
  attr_reader :moves, :zmoves
  def initialize(moves, zmoves = nil) = (@moves = moves; @zmoves = zmoves)
end
class Foe
  attr_reader :index, :type1, :type2, :pokemon, :effects
  attr_accessor :hp
  def initialize(index, t1, t2 = nil, effects: {}) = (@index = index; @type1 = t1; @type2 = t2; @pokemon = true; @hp = 10; @effects = effects)
end
class Menu
  attr_accessor :battler, :index, :zButton, :visible
  def initialize(battler) = (@battler = battler; @index = 0; @zButton = 0; @visible = true)
  def disposed? = false
end

load MOD
PokePalOverlay.dispose

def fight_scene(foes, moves, zmoves = nil)
  b = Battle.new
  b.battlers = foes
  sc = PokeBattle_Scene.new(b)
  menu = Menu.new(Mon.new(moves, zmoves))
  sc.sprites['fightwindow'] = menu
  [sc, menu]
end

def marks(scene)
  PokePalOverlay.dispose
  write_overlay(overlay)
  tick(scene)
  PokePalOverlay.instance_variable_get(:@marks)
end

def marks_for(foes, mv) = marks(fight_scene(foes, [mv]).first)[0]
def moves_sprite = PokePalOverlay.instance_variable_get(:@moves_sprite)

moves = [Mv.new(:DISCHARGE, :ELECTRIC, 80, 100, :special), Mv.new(:THUNDERWAVE, :ELECTRIC, 0, 90, :status), Mv.new(:EARTHQUAKE, :GROUND, 100, 100, :physical),
         Mv.new(:ICEBEAM, :ICE, 90, 100, :special)]
sc, menu = fight_scene([Foe.new(1, :WATER, :FLYING)], moves)
check('markers: x4, none for status, x0 immune, x0 for a failing type', [['x4'], nil, ['x0'], ['x0']], marks(sc))
check('fight menu shows the marker sprite', true, moves_sprite.visible)
check('selected move details', 'Special  BP 80  Acc 100', PokePalOverlay.details_for(moves[0]))
check('a never-miss move', 'Physical  Acc ---', PokePalOverlay.details_for(Mv.new(:X, :NORMAL, 0, 0, :physical)))
check('status details', 'Status  Acc 90', PokePalOverlay.details_for(moves[1]))
check('physical details', 'Physical  BP 100  Acc 100', PokePalOverlay.details_for(moves[2]))

sc2, = fight_scene([Foe.new(1, :WATER), Foe.new(3, :GRASS, :GROUND)], moves)
check('doubles: one marker per foe, in battler order', [['x2', 'x0'], nil, ['x2', 'x1']], marks(sc2).first(3))

check('a field secondary type multiplies in (Ground gains Water)', ['x2'], marks_for([Foe.new(1, :FIRE)], Mv.new(:EARTHQUAKE, :GROUND, 100, 100, :physical)))
check('uses the engine type (Hidden Power, -ate)', ['x2'], marks_for([Foe.new(1, :GRASS)], Mv.new(:HIDDENPOWER, :FIRE, 60, 100, :special)))
check('field remap applies', ['x1'], marks_for([Foe.new(1, :GRASS)], Mv.new(:CRUNCH, :DARK, 80, 100, :physical)))
check('rules matched by move id', ['x2'], marks_for([Foe.new(1, :GRASS)], Mv.new(:FLYINGPRESS, :NORMAL, 100, 95, :physical)))
check('Illusion foe gets ?, never its real types', ['?'], marks_for([Foe.new(1, :GHOST, effects: { Illusion: true })], Mv.new(:TACKLE, :NORMAL, 40, 100, :physical)))
check('fainted foes are skipped', [[]], marks(fight_scene([Foe.new(1, :WATER).tap { |f| f.hp = 0 }], [moves[0]]).first))

zsc, zmenu = fight_scene([Foe.new(1, :WATER)], moves, [Mv.new(:GIGAVOLT, :ELECTRIC, 175, 0, :physical), nil, nil, nil])
zmenu.zButton = 2
check('Z moves are marked while the Z button is pressed', ['x2'], marks(zsc)[0])


# ---- frame cost: the steady state does no file access, parsing or redrawing ----
module Counting
  COUNTS = Hash.new(0)
  def mtime(*a) = (COUNTS[:mtime] += 1; super)
  def binread(*a) = (COUNTS[:read] += 1; super)
  def exist?(*a) = (COUNTS[:exist] += 1; super)
end
File.singleton_class.prepend(Counting)
class Bitmap; class << self; alias_method :orig_new, :new; def new(*a) = (Counting::COUNTS[:bitmap] += 1; orig_new(*a)); end; end

bsc, bmenu = fight_scene([Foe.new(1, :WATER, :FLYING)], moves)
PokePalOverlay.dispose
write_overlay(overlay)
tick(bsc)
Counting::COUNTS.clear
GC.start
alloc0 = GC.stat(:total_allocated_objects)
t0 = Process.clock_gettime(Process::CLOCK_MONOTONIC)
frames = 4000
frames.times { bsc.pbFrameUpdate(nil); bsc.pbGraphicsUpdate }
ms = (Process.clock_gettime(Process::CLOCK_MONOTONIC) - t0) * 1000
allocs = GC.stat(:total_allocated_objects) - alloc0
check('mtime is checked about every 6th update, not every one', true, Counting::COUNTS[:mtime] <= (frames * 2) / PokePalOverlay::POLL_FRAMES + 1)
check('no file is read while it is unchanged', 0, Counting::COUNTS[:read])
check('no bitmap is built while nothing changes', 0, Counting::COUNTS[:bitmap])
check('only the cheap disabled-file check touches the disk', true, Counting::COUNTS[:exist] <= Counting::COUNTS[:mtime] + 1)
per_frame_us = ms * 1000 / (frames * 2)
check("steady state is cheap (#{per_frame_us.round(2)} us and #{(allocs / (frames * 2.0)).round(2)} objects per update)", true, per_frame_us < 100 && allocs / (frames * 2.0) < 12)
puts format('frame cost: %.2f us per update, %.2f objects per update (menu open, nothing changing)', per_frame_us, allocs / (frames * 2.0))

sc.sprites['fightwindow'].visible = false
tick(sc)
check('markers hidden outside the fight menu', false, moves_sprite.visible)
sc.sprites['fightwindow'].visible = true
tick(sc)
check('shown again in the fight menu', true, moves_sprite.visible)
Input.press!
tick(sc)
check('F6 hides the markers too', false, moves_sprite.visible)
Input.press!
tick(sc)
check('F6 brings them back', true, moves_sprite.visible)
sc.pbEndBattle(:won)
check('battle end disposes the marker sprite', [0, 0], [Sprite::LIVE.size, Bitmap::LIVE.size])

broken, = fight_scene([Foe.new(1, :WATER)], [Object.new])
PokePalOverlay.instance_variable_set(:@ended_scene, nil)
write_overlay(overlay)
tick(broken)
check('a move error disables only the markers and logs', [true, true], [File.read(File.join(PP_DIR, 'overlay_error.log')).include?('NoMethodError'), Sprite::LIVE.any?])
check('and stays off', false, (tick(broken); moves_sprite.visible))

PokePalOverlay.instance_variable_set(:@moves_off, false)
class FightMenuButtons; def showMoveEffectivenessStatus; end; end
check('steps aside when ShowMoveEffectiveness is installed', true, PokePalOverlay.moves_off?)
puts 'moves mod ok'
