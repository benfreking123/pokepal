# PokePal overlay: draws a small battle panel from the overlay.json that PokePal writes. Delete this file to uninstall.
# The panel only draws; PokePal computes the content. To switch it off without uninstalling, set ENABLED below to
# false, or create an empty file named "disabled" in the PokePal folder next to the save (the bridge honours it too).
# F6 shows and hides the panel in game. In the fight menu it also marks each of your moves with its effectiveness
# against the foes' visible types, and shows the selected move's category, power and accuracy.
module PokePalOverlay
  ENABLED = true unless const_defined?(:ENABLED, false)
  VERSION = '1.0.0' unless const_defined?(:VERSION, false)
  SCHEMA = 1 unless const_defined?(:SCHEMA, false)
  POLL_SECONDS = 0.5 unless const_defined?(:POLL_SECONDS, false)
  STALE_SECONDS = 5 unless const_defined?(:STALE_SECONDS, false)
  # Panel position and size at the top right of the screen. Change these if it covers something on your setup.
  PANEL_WIDTH = 168 unless const_defined?(:PANEL_WIDTH, false)
  PANEL_MARGIN = 4 unless const_defined?(:PANEL_MARGIN, false)
  PANEL_TOP = 4 unless const_defined?(:PANEL_TOP, false)
  # Fight menu move markers (x2, x4, 1/2, 1/4, x0). Set to false to keep only the battle panel.
  MOVE_MARKS = true unless const_defined?(:MOVE_MARKS, false)
  # Survives F12 soft resets, which re-run every script in the same Ruby VM.
  HOOKED = {} unless const_defined?(:HOOKED, false)

  # Small JSON reader so the mod needs no gems (the game's Ruby may not ship the json library).
  module Json
    class Error < StandardError; end

    def self.parse(text)
      @s = text.to_s.dup.force_encoding('UTF-8')
      @i = 0
      v = value
      ws
      raise Error, 'trailing data' if @i < @s.length
      v
    end

    def self.ws
      @i += 1 while @i < @s.length && " \t\r\n".include?(@s[@i])
    end

    def self.value
      ws
      c = @s[@i]
      case c
      when '{' then object
      when '[' then array
      when '"' then string
      when 't' then literal('true', true)
      when 'f' then literal('false', false)
      when 'n' then literal('null', nil)
      else number
      end
    end

    def self.literal(word, v)
      raise Error, 'bad literal' unless @s[@i, word.length] == word
      @i += word.length
      v
    end

    def self.number
      m = /\A-?\d+(\.\d+)?([eE][-+]?\d+)?/.match(@s[@i..])
      raise Error, 'bad number' unless m
      @i += m[0].length
      m[1] || m[2] ? m[0].to_f : m[0].to_i
    end

    def self.string
      @i += 1
      out = +''
      loop do
        c = @s[@i]
        raise Error, 'unterminated string' if c.nil?
        @i += 1
        break if c == '"'
        if c == '\\'
          e = @s[@i]
          @i += 1
          case e
          when 'n' then out << "\n"
          when 't' then out << "\t"
          when 'r' then out << "\r"
          when 'b' then out << "\b"
          when 'f' then out << "\f"
          when 'u'
            out << [@s[@i, 4].hex].pack('U')
            @i += 4
          else out << e.to_s
          end
        else
          out << c
        end
      end
      out
    end

    def self.array
      @i += 1
      out = []
      ws
      if @s[@i] == ']'
        @i += 1
        return out
      end
      loop do
        out << value
        ws
        c = @s[@i]
        @i += 1
        break if c == ']'
        raise Error, 'bad array' unless c == ','
      end
      out
    end

    def self.object
      @i += 1
      out = {}
      ws
      if @s[@i] == '}'
        @i += 1
        return out
      end
      loop do
        ws
        raise Error, 'bad key' unless @s[@i] == '"'
        k = string
        ws
        raise Error, 'bad object' unless @s[@i] == ':'
        @i += 1
        out[k] = value
        ws
        c = @s[@i]
        @i += 1
        break if c == '}'
        raise Error, 'bad object' unless c == ','
      end
      out
    end
  end

  # Every game-specific call lives here (Reborn 19.5.0).
  module Game
    # Battle.rb:363 (false) and Online/Battle_Online.rb:30 (true); same check as the bridge.
    def self.online?(battle)
      return true if battle.respond_to?(:isOnline?) && battle.isOnline?
      battle.class.ancestors.any? { |k| k.name.to_s =~ /Online/ }
    end

    # RTP.rb:80-82
    def self.save_dir
      File.dirname(RTP.getSaveFileName('Game.rxdata'))
    end

    def self.toggle_pressed?
      Input.const_defined?(:F6) && Input.trigger?(Input::F6)
    end

    # Battle_Scene.rb:1719 pbShowWindow shows the fight menu by making "fightwindow" visible.
    def self.fight_menu_open?(scene)
      w = scene.sprites['fightwindow']
      !!(w && !w.disposed? && w.visible)
    end

    # Battle_Scene.rb:218 FightMenuDisplay (battler, index, zButton readers) is the scene's "fightwindow".
    def self.fight_menu(scene)
      w = scene.sprites['fightwindow']
      w && !w.disposed? && w.visible && w.respond_to?(:battler) ? w : nil
    end

    # The moves the buttons show: the battler's, or its Z-moves while the Z button is pressed (Battle_Scene.rb:392-409).
    def self.menu_moves(menu)
      b = menu.battler
      return [] unless b && b.moves
      moves = b.moves.to_a.dup
      if menu.zButton == 2 && b.zmoves
        b.zmoves.each_with_index { |z, i| moves[i] = z unless z.nil? }
      end
      moves.first(4)
    end

    # Foes still in the fight, by battler index. Battle_Scene.rb:2859 uses pbIsOpposing?(index).
    def self.foes(battle)
      battle.battlers.compact.select { |b| battle.pbIsOpposing?(b.index) && b.pokemon && b.hp.to_i > 0 }
    end

    # Same rule as the bridge: an Illusion foe's real types must not leak.
    def self.foe_types(b)
      effects = b.respond_to?(:effects) ? b.effects : nil
      return nil if effects.is_a?(Hash) && effects[:Illusion]
      [b.type1, b.type2].compact.uniq.map(&:to_s)
    end

    # Battle_Scene.rb:432 pbType(battler, type) is the move's type after Hidden Power, -ate abilities and field changes.
    def self.move_type(move, battler)
      move.pbType(battler, move.type).to_s
    end

    def self.category(move)
      return 'Status' if move.basedamage.to_i <= 0
      c = move.respond_to?(:category) ? move.category : nil
      c = c.to_s.downcase
      return c.capitalize if %w[physical special].include?(c)
      nil
    end

    def self.battle_of(scene)
      scene.instance_variable_get(:@battle)
    end
  end

  @disabled = false
  @shown = true
  @scene = nil
  @viewport = nil
  @sprite = nil
  @data = nil
  @drawn = nil
  @mtime = nil
  @next_poll = 0.0
  @blocked = 0
  @online_scene = nil
  @ended_scene = nil
  @has_data = false
  @moves = nil
  @moves_sprite = nil
  @moves_drawn = nil
  @moves_off = false
  @marks = nil
  @marks_key = nil
  @marks_at = 0.0

  def self.dir
    File.join(Game.save_dir, 'PokePal')
  end

  def self.log_error(e)
    Dir.mkdir(dir) unless File.directory?(dir)
    File.open(File.join(dir, 'overlay_error.log'), 'a') do |f|
      f.puts("#{Time.now} #{e.class}: #{e.message}")
      f.puts((e.backtrace || []).first(5).join("\n"))
    end
  rescue StandardError
    nil
  end

  def self.safely
    return if @disabled
    yield
  rescue StandardError => e
    @disabled = true
    log_error(e)
    begin
      dispose
    rescue StandardError
      nil
    end
  end

  def self.dispose
    @sprite.bitmap.dispose if @sprite && !@sprite.disposed? && @sprite.bitmap && !@sprite.bitmap.disposed?
    @sprite.dispose if @sprite && !@sprite.disposed?
    @viewport.dispose if @viewport && !@viewport.disposed?
    @moves_sprite.bitmap.dispose if @moves_sprite && !@moves_sprite.disposed? && @moves_sprite.bitmap && !@moves_sprite.bitmap.disposed?
    @moves_sprite.dispose if @moves_sprite && !@moves_sprite.disposed?
    @sprite = @viewport = @scene = @data = @drawn = @mtime = nil
    @moves_sprite = @moves_drawn = @marks = @marks_key = nil
    @next_poll = 0.0
    @has_data = false
  end

  def self.switched_off?
    !ENABLED || File.exist?(File.join(dir, 'disabled'))
  end

  def self.read
    path = File.join(dir, 'overlay.json')
    mtime = File.mtime(path)
    return nil if Time.now - mtime > STALE_SECONDS
    return @data if mtime == @mtime
    @mtime = mtime
    parsed = Json.parse(File.binread(path))
    @data = parsed.is_a?(Hash) && parsed['schema'] == SCHEMA ? parsed : nil
  rescue SystemCallError, Json::Error
    nil
  end

  def self.abbr(names)
    Array(names).map { |n| n.to_s[0, 3].upcase }
  end

  def self.rows(d)
    out = [[:title, d['field'].is_a?(Hash) ? d['field']['name'].to_s : '']]
    Array(d['foes']).each do |f|
      out << [:foe, "#{f['name']}  #{Array(f['types']).join('/')}"]
      w4 = abbr(f['weak4'])
      w2 = abbr(f['weak2'])
      out << [:weak, "4x #{w4.join(' ')}"] unless w4.empty?
      out << [:weak, "2x #{w2.join(' ')}"] unless w2.empty?
    end
    Array(d['picks']).each_with_index do |p, i|
      out << [:head, 'Switch'] if i == 0
      out << [:pick, "#{p['name']}", p['tag'].to_s]
    end
    out
  end

  def self.draw(d)
    list = rows(d)
    key = list.inspect
    return if key == @drawn
    @drawn = key
    line = 15
    height = list.length * line + 8
    old = @sprite.bitmap
    bmp = Bitmap.new(PANEL_WIDTH, height)
    bmp.font.size = 13
    bmp.fill_rect(0, 0, PANEL_WIDTH, height, Color.new(10, 10, 20, 150))
    list.each_with_index do |(kind, a, b), i|
      y = 4 + i * line
      case kind
      when :title
        bmp.font.color = Color.new(255, 220, 120)
        bmp.draw_text(5, y, PANEL_WIDTH - 10, line, a)
      when :weak
        bmp.font.color = a.start_with?('4') ? Color.new(255, 130, 110) : Color.new(255, 255, 255)
        bmp.draw_text(5, y, PANEL_WIDTH - 10, line, a)
      when :pick
        bmp.fill_rect(4, y + 1, PANEL_WIDTH - 8, line - 2, Color.new(60, 90, 160, 200))
        bmp.font.color = Color.new(255, 255, 255)
        bmp.draw_text(7, y, 70, line, a)
        bmp.font.color = Color.new(190, 230, 255)
        bmp.draw_text(78, y, PANEL_WIDTH - 84, line, b)
      else
        bmp.font.color = Color.new(200, 200, 200)
        bmp.draw_text(5, y, PANEL_WIDTH - 10, line, a)
      end
    end
    @sprite.bitmap = bmp
    old.dispose if old && !old.disposed?
  end

  def self.ensure_sprite(scene)
    return if @sprite && !@sprite.disposed? && @scene.equal?(scene)
    dispose
    @scene = scene
    @ended_scene = nil
    @viewport = Viewport.new(0, 0, Graphics.width, Graphics.height)
    @viewport.z = 100_000
    @sprite = Sprite.new(@viewport)
    @sprite.x = Graphics.width - PANEL_WIDTH - PANEL_MARGIN
    @sprite.y = PANEL_TOP
    @sprite.visible = false
    @moves_sprite = Sprite.new(@viewport)
    @moves_sprite.x = 0
    @moves_sprite.y = Graphics.height - 96
    @moves_sprite.visible = false
  end

  # Runs from the scene's per-frame update, so it must stay cheap: one clock read per frame, and the
  # file only when the poll interval has passed.
  def self.frame(scene)
    battle = Game.battle_of(scene)
    return if battle.nil?
    if @scene && !@scene.equal?(scene)
      dispose
    end
    return if @ended_scene.equal?(scene)
    if @online_scene && !@online_scene.equal?(scene)
      @online_scene = nil
    end
    return if @online_scene.equal?(scene)
    if !@scene && Game.online?(battle)
      @online_scene = scene
      return
    end
    if Game.toggle_pressed?
      @shown = !@shown
      @next_poll = 0.0
    end
    now = Time.now.to_f
    if now >= @next_poll
      @next_poll = now + POLL_SECONDS
      if switched_off?
        dispose if @sprite
        return
      end
      d = read
      if d && @shown
        ensure_sprite(scene)
        @data = d
        draw(d)
        @has_data = true
      else
        @has_data = false
      end
    end
    return unless @sprite && !@sprite.disposed?
    @sprite.visible = @has_data && @shown && @blocked == 0 && !Game.fight_menu_open?(scene)
    update_moves(scene, now)
  end

  PILL_W = 27 unless const_defined?(:PILL_W, false)
  PILL_H = 13 unless const_defined?(:PILL_H, false)

  def self.moves_off?
    !MOVE_MARKS || @moves_off ||
      (defined?(::FightMenuButtons) && (::FightMenuButtons.method_defined?(:showMoveEffectivenessStatus) ||
                                         ::FightMenuButtons.private_method_defined?(:showMoveEffectivenessStatus)))
  end

  # A move's multiplier against one foe's visible types, from the rules PokePal sent (the game's chart with the
  # field's changes applied). Only types are used: never abilities, items or moves of the foe.
  def self.effectiveness(rules, type, move_id, category, foe_types)
    return 0.0 if Array(rules['failing']).include?(type)
    atk = type
    r = Array(rules['remap']).find { |x| x['from'] == type }
    atk = r['to'] if r
    chart = rules['chart'] || {}
    cell = ->(a, d) { ((chart[a] || {})[d] || 1).to_f }
    total = foe_types.inject(1.0) { |m, d| m * cell.call(atk, d) }
    Array(rules['secondary']).each do |x|
      next if x['on'] && x['on'] != type
      next if x['ids'] && !x['ids'].include?(move_id)
      next if x['cat'] && x['cat'] != category.to_s.downcase
      opts = x['add'] ? [x['add']] : Array(x['oneOf'])
      next if opts.empty?
      total *= opts.map { |t| foe_types.inject(1.0) { |m, d| m * cell.call(t, d) } }.max
    end
    total
  end

  def self.label(mult)
    return 'x0' if mult <= 0
    return '1/4' if mult <= 0.25
    return '1/2' if mult < 1
    return 'x1' if mult == 1
    mult <= 2 ? 'x2' : 'x4'
  end

  def self.marks_for(moves, battler, foes, rules)
    moves.map do |m|
      next nil if m.nil?
      cat = Game.category(m)
      next nil if cat == 'Status'
      type = Game.move_type(m, battler)
      id = m.move.to_s
      foes.map do |f|
        ft = Game.foe_types(f)
        ft ? label(effectiveness(rules, type, id, cat, ft)) : '?'
      end
    end
  end

  def self.details_for(move)
    return nil if move.nil?
    cat = Game.category(move)
    parts = []
    parts << cat if cat
    parts << (move.basedamage.to_i > 0 ? "BP #{move.basedamage.to_i}" : nil) if cat != 'Status'
    if move.respond_to?(:accuracy)
      acc = move.accuracy.to_i
      parts << (acc > 0 ? "Acc #{acc}" : 'Acc ---')
    end
    parts.compact.join('  ')
  end

  PILL_COLORS = {
    'x4' => [30, 140, 60], 'x2' => [50, 160, 80], 'x1' => [90, 90, 105],
    '1/2' => [200, 110, 40], '1/4' => [190, 70, 40], 'x0' => [70, 40, 40], '?' => [90, 90, 105]
  }.freeze unless const_defined?(:PILL_COLORS, false)

  def self.draw_moves(index, moves, marks)
    key = [index, marks, details_for(moves[index])]
    return if key == @moves_drawn
    @moves_drawn = key
    old = @moves_sprite.bitmap
    bmp = Bitmap.new(Graphics.width, 96)
    bmp.font.size = 11
    marks.each_with_index do |m, i|
      next if m.nil? || m.empty?
      x = (i % 2 == 0 ? 4 : 192) + 192 - 4 - m.length * PILL_W
      y = (i / 2 == 0 ? 6 : 48) + 1
      m.each_with_index do |lab, j|
        c = PILL_COLORS[lab] || PILL_COLORS['x1']
        px = x + j * PILL_W
        bmp.fill_rect(px, y, PILL_W - 2, PILL_H, Color.new(0, 0, 0, 200))
        bmp.fill_rect(px + 1, y + 1, PILL_W - 4, PILL_H - 2, Color.new(c[0], c[1], c[2], 255))
        bmp.font.color = Color.new(255, 255, 255)
        bmp.draw_text(px, y - 1, PILL_W - 2, PILL_H, lab, 1)
      end
    end
    text = key[2]
    if text
      bmp.font.size = 13
      bmp.font.color = Color.new(255, 255, 255)
      bmp.draw_text(326, 1, Graphics.width - 330, 17, text, 1)
    end
    @moves_sprite.bitmap = bmp
    old.dispose if old && !old.disposed?
  end

  def self.update_moves(scene, now)
    return unless @moves_sprite && !@moves_sprite.disposed?
    menu = nil
    unless moves_off?
      menu = Game.fight_menu(scene) if @has_data && @shown && @blocked == 0
      rules = @data && @data['rules']
      menu = nil unless rules.is_a?(Hash)
    end
    return @moves_sprite.visible = false unless menu
    begin
      battle = Game.battle_of(scene)
      moves = Game.menu_moves(menu)
      foes = Game.foes(battle)
      key = [menu.battler.object_id, menu.zButton, foes.map { |f| [f.index, Game.foe_types(f)] }, @mtime]
      if key != @marks_key || now >= @marks_at
        @marks_key = key
        @marks_at = now + POLL_SECONDS
        @marks = marks_for(moves, menu.battler, foes, rules)
      end
      draw_moves(menu.index, moves, @marks)
      @moves_sprite.visible = true
    rescue StandardError => e
      @moves_off = true
      log_error(e)
      @moves_sprite.visible = false
    end
  end

  def self.block
    @blocked += 1
    @sprite.visible = false if @sprite && !@sprite.disposed?
  end

  def self.unblock
    @blocked -= 1 if @blocked > 0
  end

  # Wraps klass#name by redefining it around the method that is current at load time, the way the bridge does,
  # so it chains with alias-based mods loaded before or after this file and never wraps itself twice. Not
  # Module#prepend: Battle_Clauses.rb aliases methods, and an alias taken over a prepended module recurses.
  def self.wrap(klass, name, before: nil, after: nil)
    return false unless klass.method_defined?(name) || klass.private_method_defined?(name)
    key = "#{klass}##{name}"
    current = klass.instance_method(name)
    return true if HOOKED[key] == current
    visibility = if klass.private_method_defined?(name) then :private
                 elsif klass.protected_method_defined?(name) then :protected
                 else :public
                 end
    klass.send(:define_method, name) do |*args, **kwargs, &block|
      PokePalOverlay.safely { before.call(self) } if before
      begin
        current.bind(self).call(*args, **kwargs, &block)
      ensure
        PokePalOverlay.safely { after.call(self) } if after
      end
    end
    klass.send(visibility, name)
    HOOKED[key] = klass.instance_method(name)
    true
  end

  # Battle_Scene.rb:1680 class PokeBattle_Scene (also reopened in Battle_TestEnvironment.rb:1111),
  # :1890 pbFrameUpdate(cw, update_cw = true), :2473 pbEndBattle(result), :2923 calls pbShowBattleStats
  # (defined outside the copied scripts, so it is wrapped only when present).
  def self.install_hooks
    return unless defined?(::PokeBattle_Scene)
    wrap(::PokeBattle_Scene, :pbFrameUpdate, after: ->(s) { frame(s) })
    wrap(::PokeBattle_Scene, :pbEndBattle, before: ->(s) { @ended_scene = s; dispose })
    wrap(::PokeBattle_Scene, :pbShowBattleStats, before: ->(_s) { block }, after: ->(_s) { unblock })
  end
end

PokePalOverlay.install_hooks
