# Panel layout: content, fitting and placement, with stand-in RGSS classes (no game needed).
require_relative 'support'
load MOD

TW = ->(s) { s.to_s.length * 7 }
P = PokePalOverlay

def op_texts(ops) = ops.select { |o| o[0] == :text }.map { |o| o[5] }
def chips(ops) = ops.select { |o| o[0] == :text && o[3] <= 80 && o[4] == P::CHIP_H }

bring = { 'incoming' => true, 'field' => { 'id' => 'GRASSY', 'name' => 'Grassy Terrain' },
          'foes' => [{ 'name' => 'Bewear', 'types' => %w[NORMAL FIGHTING], 'weak4' => [], 'weak2' => %w[FIGHTING FLYING PSYCHIC FAIRY] }],
          'picks' => [
            { 'name' => 'RazorBurn', 'hp' => 100, 'def' => { 'k' => 'resist', 't' => 'FIGHTING' }, 'off' => { 'm' => 'Air Slash', 'x' => 2, 't' => 'FLYING' } },
            { 'name' => 'Blunt', 'hp' => 80, 'def' => { 'k' => 'resist', 't' => 'FIGHTING' }, 'off' => { 'm' => 'Peck', 'x' => 1, 't' => 'FLYING' } },
            { 'name' => 'Trip', 'hp' => 15, 'def' => { 'k' => 'weak', 't' => 'FIGHTING' }, 'off' => { 'm' => 'Spark', 'x' => 0.5, 't' => 'ELECTRIC' } }
          ] }

ops, h = P.compose(bring, TW, 0)
texts = op_texts(ops)
check('header says vs the foe', true, texts.include?('vs Bewear'))
check('field name shown', true, texts.include?('Grassy Terrain'))
check('type pills, not words', true, %w[NOR FIG FLY PSY FAI].all? { |t| texts.include?(t) })
check('weakness groups are labelled', true, texts.include?('x2') && !texts.include?('x4'))
check('bring in label', true, texts.include?('Bring in'))
check('one line per pick with name, defence and offence', true, ['RazorBurn', 'res', 'Air Slash 2x', 'Blunt', 'Peck 1x', 'weak', 'Spark 0.5x'].all? { |t| texts.include?(t) })
check('a red weak pill is used for a weakness', true, ops.any? { |o| o[0] == :rect && o[5] == P::COLORS[:bad] })
check('no old tag text', false, texts.any? { |t| t =~ /super effectively|2x FIG/ })
check('panel is opaque', true, ops.first[0] == :rect && ops.first[5].length == 3)
check('all drawing stays inside the panel', true, ops.all? { |o| o[1] >= 0 && o[2] >= 0 && o[1] + o[3] <= P::PANEL_WIDTH && o[2] + o[4] <= h })

# Same row positions: every pick sits on its own ROW_H line.
ys = ops.select { |o| o[0] == :text && %w[RazorBurn Blunt Trip].include?(o[5]) }.map { |o| o[2] }
check('picks are one row apart', [P::ROW_H, P::ROW_H], ys.each_cons(2).map { |a, b| b - a })

# Level 0 is the tallest; every level is no taller than the one before and the minimum is small.
hs = (0..4).map { |l| P.compose(bring, TW, l)[1] }
check('fewer rows at higher levels', true, hs.each_cons(2).all? { |a, b| b <= a })
check('full panel stays well above a bottom-right data box', true, hs[0] <= 150)

fit_ops, fit_h, fits = P.fit_panel(bring, TW, 100)
check('shrinks to fit a short space', [true, true], [fits, fit_h <= 100])
check('keeps at least one pick when squeezed', true, op_texts(fit_ops).include?('RazorBurn'))
_, _, ok = P.fit_panel(bring, TW, 40)
check('reports when nothing fits', false, ok)

# Ties: when picks share a defence the note (speed) replaces the repeated pill.
tie = bring.merge('picks' => [
  { 'name' => 'Fast', 'hp' => 100, 'def' => { 'k' => 'resist', 't' => 'FIGHTING' }, 'note' => 'faster', 'off' => { 'm' => 'Air Slash', 'x' => 2, 't' => 'FLYING' } },
  { 'name' => 'Slow', 'hp' => 100, 'def' => { 'k' => 'resist', 't' => 'FIGHTING' }, 'note' => 'slower', 'off' => { 'm' => 'Air Slash', 'x' => 2, 't' => 'FLYING' } }])
t = op_texts(P.compose(tie, TW, 0)[0])
check('speed note shown for ties', [true, true, false], [t.include?('faster'), t.include?('slower'), t.include?('res')])

# Long names and moves are shortened to their column; the multiplier is always kept.
long = bring.merge('picks' => [{ 'name' => 'Extraordinarilylong', 'hp' => 50, 'def' => { 'k' => 'immune', 't' => 'GROUND' }, 'off' => { 'm' => 'Extremely Fast Dragon Dance', 'x' => 4, 't' => 'DRAGON' } }])
lt = op_texts(P.compose(long, TW, 0)[0])
check('names are fitted', true, lt.any? { |x| x.start_with?('Extra') && x.end_with?('..') && x.length * 7 <= P::NAME_W })
check('moves keep the multiplier', true, lt.any? { |x| x.start_with?('Extr') && x.end_with?('.. 4x') && x.length * 7 <= P::OFF_W - 6 })
check('immune is a word plus the type pill', true, lt.include?('imm') && lt.include?('GRO'))

# Old files (a text tag instead of rows) still draw.
legacy = overlay('picks' => [{ 'name' => 'Umbreon', 'tag' => 'immune Psychic' }])
check('legacy tag still shown', true, op_texts(P.compose(legacy, TW, 0)[0]).include?('immune Psychic'))

# Doubles: two foes.
two = bring.merge('incoming' => nil, 'foes' => [bring['foes'][0], { 'name' => 'Gengar', 'types' => %w[GHOST POISON], 'weak4' => [], 'weak2' => %w[GROUND PSYCHIC GHOST DARK] }])
_, th = P.compose(two, TW, 0)
check('two foes need more room than one', true, th > hs[0])

# Placement against data boxes.
class Box; attr_accessor :x, :y, :visible, :bitmap; def initialize(x, y, w, h) = (@x = x; @y = y; @visible = true; @bitmap = Bitmap.new(w, h)); def disposed? = false; end
singles = [[298, 190, 214, 82]]
sl = P.slots(singles)
check('singles: right side, above the player box', [Graphics.width - 240 - 4, 4, 190 - 4 - 4], sl[0])
check('singles: left side is free to the message box', 384 - 96 - 4 - 4, sl[1][2])
doubles = [[0, 8, 220, 60], [0, 60, 220, 60], [290, 150, 222, 60], [290, 200, 222, 60]]
dl = P.slots(doubles)
check('doubles: the left is blocked by the foe boxes', true, dl[1][2] < 10)
check('doubles: the right stops above the first player box', 150 - 4 - 4, dl[0][2])
lay = P.layout(bring, TW, doubles)
check('the panel never overlaps a box (doubles)', true, doubles.none? { |bx, by, bw, bh| lay[:x] < bx + bw && lay[:x] + lay[:w] > bx && lay[:y] < by + bh && lay[:y] + lay[:h] > by })
check('and is above the message box', true, lay[:y] + lay[:h] <= 384 - 96)
lay2 = P.layout(two, TW, doubles)
check('two foes in doubles still fit above the player boxes', true, lay2[:y] + lay2[:h] <= 150 - 4)
cramped = P.layout(bring, TW, [[0, 0, 512, 40]])
check('a blocked screen still returns something drawable', true, cramped[:h] > 0)

# The scene's own boxes are read.
sc = PokeBattle_Scene.new(Battle.new)
sc.sprites['battlebox0'] = Box.new(298, 192, 214, 80)
sc.sprites['battlebox1'] = Box.new(0, 34, 220, 60).tap { |b| b.visible = false }
check('visible boxes are obstacles', [[298, 192, 214, 80]], P.obstacles(sc))
sig = P.obstacle_sig(sc)
sc.sprites['battlebox0'].x = 310
check('moving a box changes the signature', true, P.obstacle_sig(sc) != sig)

# Through the frame hook: placed above the box, and re-placed when the box moves.
write_overlay(bring.merge('schema' => 1, 'rules' => RULES))
sc.sprites['battlebox0'].y = 192
tick(sc)
panel = Sprite::LIVE.find { |sp| sp.bitmap && sp.bitmap.width == P::PANEL_WIDTH }
check('panel sits above the data box', true, panel.y + panel.bitmap.height <= 192 - 4)
sc.sprites['battlebox0'].y = 120
tick(sc)
panel = Sprite::LIVE.find { |sp| sp.bitmap && sp.bitmap.width == P::PANEL_WIDTH }
check('and shrinks when the box rises', true, panel.y + panel.bitmap.height <= 120 - 4)
check('without leaking bitmaps', 2, Bitmap::LIVE.count { |b| b.width == P::PANEL_WIDTH || b.width == 8 })

puts 'panel ok'
