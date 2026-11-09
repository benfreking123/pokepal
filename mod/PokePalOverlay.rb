# PokePal overlay: draws a small battle panel from the overlay.json that PokePal writes. Delete this file to uninstall.
# The panel only draws; PokePal computes the content. To switch it off without uninstalling, set ENABLED below to
# false, or create an empty file named "disabled" in the PokePal folder next to the save (the bridge honours it too).
# F6 shows and hides the panel in game. In the fight menu it also marks each of your moves with its effectiveness
# against the foes' visible types, and shows the selected move's category, power and accuracy.
module PokePalOverlay
  ENABLED = true unless const_defined?(:ENABLED, false)
  VERSION = '1.0.0' unless const_defined?(:VERSION, false)
  SCHEMA = 1 unless const_defined?(:SCHEMA, false)
  # The file's modification time is checked every POLL_FRAMES frames (about 6 times a second at 40 fps); the file
  # is only read and parsed when that time changed.
  POLL_FRAMES = 6 unless const_defined?(:POLL_FRAMES, false)
  # Set to true to append timing lines to <save dir>\PokePal\overlay_timing.log (how old the file was when drawn).
  DEBUG = false unless const_defined?(:DEBUG, false)
  STALE_SECONDS = 5 unless const_defined?(:STALE_SECONDS, false)
  # The panel sits at the top right, or the top left when that is blocked, and shrinks (fewer rows) rather than cover
  # a Pokémon's data box or the message box. Change these if it covers something else on your setup.
  PANEL_WIDTH = 240 unless const_defined?(:PANEL_WIDTH, false)
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

    # Battle_Move.rb:13 category is :physical, :special or :status; :190-206 betterCategory(type) also covers
    # Glitch, where the category follows the type. Z-moves keep the base move's category (Battle_Move.rb:51).
    def self.category(move, type = nil)
      return 'Status' if move.respond_to?(:pbIsStatus?) ? move.pbIsStatus? : move.category.to_s == 'status'
      c = move.respond_to?(:betterCategory) && type ? move.betterCategory(type.to_sym) : move.category
      c = c.to_s.downcase
      %w[physical special].include?(c) ? c.capitalize : nil
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
  @frames = POLL_FRAMES
  @last_frame = nil
  @checked_scene = nil
  @data_version = 0
  @drawn_version = nil
  @drawn_sig = nil
  @measure = nil
  @tw = nil
  @path = nil
  @m_version = nil
  @m_bid = nil
  @m_z = nil
  @m_idx = nil
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

  def self.dir
    @dir ||= File.join(Game.save_dir, 'PokePal')
  end

  def self.timing(text)
    return unless DEBUG
    Dir.mkdir(dir) unless File.directory?(dir)
    File.open(File.join(dir, 'overlay_timing.log'), 'a') { |f| f.puts("#{Time.now.strftime('%H:%M:%S.%L')} #{text}") }
  rescue StandardError
    nil
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
    @measure.dispose if @measure && !@measure.disposed?
    @sprite.bitmap.dispose if @sprite && !@sprite.disposed? && @sprite.bitmap && !@sprite.bitmap.disposed?
    @sprite.dispose if @sprite && !@sprite.disposed?
    @viewport.dispose if @viewport && !@viewport.disposed?
    @moves_sprite.bitmap.dispose if @moves_sprite && !@moves_sprite.disposed? && @moves_sprite.bitmap && !@moves_sprite.bitmap.disposed?
    @moves_sprite.dispose if @moves_sprite && !@moves_sprite.disposed?
    @sprite = @viewport = @scene = @data = @drawn = @mtime = @drawn_version = @drawn_sig = @measure = @tw = nil
    @moves_sprite = @moves_drawn = @marks = @marks_key = nil
    @frames = POLL_FRAMES
    @checked_scene = nil
    @m_bid = @m_version = nil
    @has_data = false
  end

  def self.switched_off?
    !ENABLED || File.exist?(File.join(dir, 'disabled'))
  end

  def self.read
    path = (@path ||= File.join(dir, 'overlay.json'))
    mtime = File.mtime(path)
    return nil if Time.now - mtime > STALE_SECONDS
    return @data if mtime == @mtime
    @mtime = mtime
    @data_version += 1
    timing("read file age=#{((Time.now - mtime) * 1000).round}ms")
    parsed = Json.parse(File.binread(path))
    @data = parsed.is_a?(Hash) && parsed['schema'] == SCHEMA ? parsed : nil
  rescue SystemCallError, Json::Error
    nil
  end

  # ---- Panel: layout as a list of drawing operations (pure, so tests and mockups can run it without the game) ----
  PAD = 6 unless const_defined?(:PAD, false)
  ROW_H = 18 unless const_defined?(:ROW_H, false)
  CHIP_H = 14 unless const_defined?(:CHIP_H, false)
  NAME_W = 64 unless const_defined?(:NAME_W, false)
  DEF_W = 66 unless const_defined?(:DEF_W, false)
  OFF_W = 88 unless const_defined?(:OFF_W, false)
  MESSAGE_BOX_H = 96 unless const_defined?(:MESSAGE_BOX_H, false)

  COLORS = {
    white: [248, 248, 248], gold: [255, 214, 102], grey: [168, 172, 190], shadow: [24, 26, 40],
    frame_out: [8, 8, 16], frame_mid: [226, 228, 240], frame_in: [92, 96, 120], body: [34, 38, 58],
    stripe_a: [48, 53, 78], stripe_b: [41, 45, 68], divider: [78, 84, 112],
    good: [44, 150, 72], great: [24, 128, 56], bad: [196, 60, 52], even: [92, 96, 118], poor: [196, 110, 44], none: [112, 44, 44], blue: [60, 112, 200],
    hp_good: [72, 200, 72], hp_mid: [232, 200, 48], hp_low: [224, 72, 56], hp_back: [20, 22, 34]
  }.freeze unless const_defined?(:COLORS, false)

  # The game's type colours (Pokémon Essentials gen 5 palette); unknown types are grey.
  TYPE_COLORS = {
    'NORMAL' => [168, 168, 120], 'FIGHTING' => [192, 48, 40], 'FLYING' => [168, 144, 240], 'POISON' => [160, 64, 160],
    'GROUND' => [224, 192, 104], 'ROCK' => [184, 160, 56], 'BUG' => [168, 184, 32], 'GHOST' => [112, 88, 152],
    'STEEL' => [184, 184, 208], 'FIRE' => [240, 128, 48], 'WATER' => [104, 144, 240], 'GRASS' => [120, 200, 80],
    'ELECTRIC' => [248, 208, 48], 'PSYCHIC' => [248, 88, 136], 'ICE' => [152, 216, 216], 'DRAGON' => [112, 56, 248],
    'DARK' => [112, 88, 72], 'FAIRY' => [238, 153, 172]
  }.freeze unless const_defined?(:TYPE_COLORS, false)

  def self.type_abbr(t)
    t.to_s[0, 3].upcase
  end

  def self.type_color(t)
    TYPE_COLORS[t.to_s.upcase] || COLORS[:even]
  end

  # Shortens text with ".." until it fits; `tw` measures a string in pixels.
  def self.fit(tw, text, max)
    text = text.to_s
    return text if tw.call(text) <= max
    text = text[0, text.length - 1] while text.length > 1 && tw.call(text + '..') > max
    text + '..'
  end

  def self.mult_label(x)
    x = x.to_f
    return '0x' if x == 0
    return "#{x.to_i}x" if x >= 1 && x == x.to_i
    format('%g', x) + 'x'
  end

  def self.mult_color(x)
    x = x.to_f
    return COLORS[:none] if x == 0
    return COLORS[:great] if x >= 4
    return COLORS[:good] if x > 1
    return COLORS[:even] if x == 1
    COLORS[:poor]
  end

  # ---- Type icons: the SWM sheet (32x12 cells in PBTypes id order, what the data box tags use), else the game's
  # Graphics/Icons/type<TYPE>.png scaled to 32x12, else drawn pills. Built once and kept. ----
  ICON_W = 32 unless const_defined?(:ICON_W, false)
  ICON_H = 12 unless const_defined?(:ICON_H, false)
  ICON_SHEET = 'patch/Mods/SWM - TypeBattleIcons.png' unless const_defined?(:ICON_SHEET, false)
  @icons = {}
  @sheet = nil

  # The index comes from the game's own PBTypes constants, never from a list kept here.
  def self.type_index(t)
    return nil unless defined?(::PBTypes)
    name = t.to_s.upcase.to_sym
    return nil unless ::PBTypes.const_defined?(name)
    i = ::PBTypes.const_get(name)
    i.is_a?(Integer) ? i : nil
  rescue StandardError
    nil
  end

  def self.icon_sheet
    @sheet = nil if @sheet && @sheet.disposed?
    return @sheet if @sheet
    return nil unless File.exist?(ICON_SHEET)
    bmp = Bitmap.new(ICON_SHEET)
    if bmp.width == ICON_W && bmp.height % ICON_H == 0
      @sheet = bmp
    else
      bmp.dispose
      nil
    end
  end

  def self.type_icon(t)
    key = t.to_s.upcase
    e = @icons[key]
    return (e || nil) if e == false || (e && !e[0].disposed?)
    @icons[key] = build_icon(key)
    @icons[key] || nil
  end

  def self.build_icon(key)
    idx = type_index(key)
    sheet = idx && icon_sheet
    return [sheet, Rect.new(0, idx * ICON_H, ICON_W, ICON_H)] if sheet && (idx + 1) * ICON_H <= sheet.height
    path = "Graphics/Icons/type#{key}.png"
    return false unless File.exist?(path)
    src = Bitmap.new(path)
    bmp = Bitmap.new(ICON_W, ICON_H)
    bmp.stretch_blt(Rect.new(0, 0, ICON_W, ICON_H), src, Rect.new(0, 0, src.width, src.height))
    src.dispose
    [bmp, Rect.new(0, 0, ICON_W, ICON_H)]
  rescue StandardError
    false
  end

  def self.icon_available?(t)
    !type_icon(t).nil?
  end

  def self.type_chip_w(tw, t)
    icon_available?(t) ? ICON_W : [tw.call(type_abbr(t)) + 6, 26].max
  end

  # A type pill: the game's icon when there is one, else a drawn pill. Returns its width.
  def self.type_chip(ops, tw, x, y, t, border = nil, width = nil)
    if icon_available?(t)
      ops << [:rect, x - 1, y, ICON_W + 2, CHIP_H, border] if border
      ops << [:icon, x, y + (CHIP_H - ICON_H) / 2, t.to_s.upcase]
      ICON_W
    else
      chip(ops, tw, x, y, type_abbr(t), type_color(t), width, border)
    end
  end

  def self.chip(ops, tw, x, y, label, rgb, width = nil, border = nil)
    w = width || [tw.call(label) + 4, 22].max
    ops << [:rect, x, y, w, CHIP_H, border || COLORS[:frame_out]]
    ops << [:rect, x + 1, y + 1, w - 2, CHIP_H - 2, rgb]
    ops << [:text, x, y, w, CHIP_H, label, 1, :white]
    w
  end

  def self.foe_rows(ops, tw, f, y, iw, incoming)
    ops << [:text, PAD, y, iw, ROW_H, "vs #{f['name']}", 0, :white]
    x = PAD + tw.call("vs #{f['name']}") + 6
    Array(f['types']).each do |t|
      x += type_chip(ops, tw, x, y + (ROW_H - CHIP_H) / 2, t) + 2
    end
    y += ROW_H
    groups = [['x4', Array(f['weak4']), COLORS[:gold]], ['x2', Array(f['weak2']), nil]].reject { |g| g[1].empty? }
    if groups.empty?
      ops << [:text, PAD, y, iw, CHIP_H, 'no weaknesses', 0, :grey]
      return y + CHIP_H + 3
    end
    groups.each do |label, types, border|
      ops << [:text, PAD, y, 18, CHIP_H, label, 0, border ? :gold : :white]
      x = PAD + 20
      types.each do |t|
        cw = type_chip_w(tw, t)
        if x + cw > PAD + iw
          y += CHIP_H + 3
          x = PAD + 20
        end
        x += type_chip(ops, tw, x, y, t, border) + 2
      end
      y += CHIP_H + 3
    end
    y
  end

  def self.def_chip(ops, tw, x, y, pick)
    if pick['note']
      return chip(ops, tw, x, y, pick['note'], pick['note'] == 'faster' ? COLORS[:good] : COLORS[:poor], DEF_W)
    end
    df = pick['def']
    return chip(ops, tw, x, y, pick['tag'].to_s, COLORS[:even], DEF_W) unless df.is_a?(Hash)
    word, rgb =
      case df['k']
      when 'weak' then ['weak', COLORS[:bad]]
      when 'immune' then ['imm', COLORS[:blue]]
      when 'resist' then ['res', COLORS[:good]]
      else ['even', COLORS[:even]]
      end
    return chip(ops, tw, x, y, word, rgb, DEF_W) unless df['t']
    ww = chip(ops, tw, x, y, word, rgb)
    type_chip(ops, tw, x + ww + 1, y, df['t'], nil, DEF_W - ww - 1)
    DEF_W
  end

  def self.off_chip(ops, tw, x, y, pick)
    o = pick['off']
    return unless o.is_a?(Hash)
    mult = mult_label(o['x'])
    name = o['m'] ? o['m'].to_s : type_abbr(o['t'])
    label = "#{fit(tw, name, OFF_W - 6 - tw.call(" #{mult}"))} #{mult}"
    chip(ops, tw, x, y, label, mult_color(o['x']), OFF_W)
  end

  def self.pick_row(ops, tw, p, y, i, iw)
    ops << [:rect, PAD, y, iw, ROW_H - 1, COLORS[i.even? ? :stripe_a : :stripe_b]]
    if p['stay']
      ops << [:rect, PAD, y, iw, 1, COLORS[:gold]] << [:rect, PAD, y + ROW_H - 2, iw, 1, COLORS[:gold]]
      ops << [:rect, PAD, y, 1, ROW_H - 1, COLORS[:gold]] << [:rect, PAD + iw - 1, y, 1, ROW_H - 1, COLORS[:gold]]
    end
    x = PAD + 3
    ops << [:text, x, y, NAME_W, ROW_H - 3, fit(tw, p['name'], NAME_W), 0, p['stay'] ? :gold : :white]
    hp = p['hp'].to_f.clamp(0, 100)
    ops << [:rect, x, y + ROW_H - 4, NAME_W, 2, COLORS[:hp_back]]
    fill = hp > 0 ? [(hp * NAME_W / 100.0).round, 1].max : 0
    ops << [:rect, x, y + ROW_H - 4, fill, 2, COLORS[hp > 50 ? :hp_good : hp > 20 ? :hp_mid : :hp_low]] if fill > 0
    x += NAME_W + 4
    cy = y + (ROW_H - 1 - CHIP_H) / 2
    def_chip(ops, tw, x, cy, p)
    off_chip(ops, tw, x + DEF_W + 3, cy, p)
  end

  # `level` drops optional rows, from none (0) to the minimum (4), so the panel can fit in the space it is given.
  def self.compose(d, tw, level)
    iw = PANEL_WIDTH - PAD * 2
    body = []
    y = PAD
    field = d['field'].is_a?(Hash) ? d['field']['name'].to_s : ''
    if level < 1 && !field.empty? && field != 'No field'
      body << [:text, PAD, y, iw, ROW_H - 2, field, 0, :gold]
      y += ROW_H - 2
    end
    Array(d['foes']).first(level >= 3 ? 1 : 2).each { |f| y = foe_rows(body, tw, f, y, iw, d['incoming']) }
    picks = Array(d['picks']).first(level >= 3 ? 1 : (level >= 2 ? 2 : 3))
    unless picks.empty?
      body << [:rect, PAD, y, iw, 1, COLORS[:divider]]
      y += 3
      label = d['incoming'] ? (picks[0]['stay'] ? 'Stay in' : 'Bring in') : 'Switch to'
      body << [:text, PAD, y, iw, ROW_H - 3, label, 0, :grey]
      y += ROW_H - 3
      picks.each_with_index do |p, i|
        pick_row(body, tw, p, y, i, iw)
        y += ROW_H
      end
    end
    h = y + PAD
    w = PANEL_WIDTH
    frame = [
      [:rect, 0, 0, w, h, COLORS[:frame_out]], [:rect, 1, 1, w - 2, h - 2, COLORS[:frame_mid]],
      [:rect, 2, 2, w - 4, h - 4, COLORS[:frame_in]], [:rect, 3, 3, w - 6, h - 6, COLORS[:body]]
    ]
    [frame + body, h]
  end

  # Picks the richest content that fits `max_h` pixels.
  def self.fit_panel(d, tw, max_h)
    ops, h = nil
    (0..4).each do |level|
      ops, h = compose(d, tw, level)
      return [ops, h, true] if h <= max_h
    end
    [ops, h, false]
  end

  # ---- Placement: stay clear of the Pokémon data boxes (Battle_Scene.rb: sprites "battlebox0".."battlebox3", set up
  # from PBScene::PLAYERBOX_*/FOEBOX_* constants) and of the message box along the bottom. ----
  BOX_KEYS = %w[battlebox0 battlebox1 battlebox2 battlebox3].freeze unless const_defined?(:BOX_KEYS, false)

  def self.obstacles(scene)
    sp = scene.respond_to?(:sprites) ? scene.sprites : nil
    out = []
    return out unless sp
    BOX_KEYS.each do |k|
      b = sp[k]
      next unless b && !b.disposed? && b.visible && b.bitmap && !b.bitmap.disposed?
      out << [b.x.to_i, b.y.to_i, b.bitmap.width, b.bitmap.height]
    end
    out
  end

  # A cheap number that changes when a data box appears, moves or goes away, so nothing is re-laid-out otherwise.
  def self.obstacle_sig(scene)
    sp = scene.respond_to?(:sprites) ? scene.sprites : nil
    return 0 unless sp
    sig = 1
    BOX_KEYS.each do |k|
      b = sp[k]
      next unless b && !b.disposed? && b.visible
      sig = (sig * 31 + b.x.to_i * 7 + b.y.to_i) & 0xFFFFFF
    end
    sig
  end

  # [x, y, max_height] for each place the panel may go, best first.
  def self.slots(obs)
    floor = Graphics.height - MESSAGE_BOX_H - PANEL_MARGIN
    [Graphics.width - PANEL_WIDTH - PANEL_MARGIN, PANEL_MARGIN].map do |x|
      limit = floor
      obs.each do |ox, oy, ow, oh|
        next unless ox < x + PANEL_WIDTH && ox + ow > x && oy + oh > PANEL_TOP
        limit = [limit, oy - PANEL_MARGIN].min
      end
      [x, PANEL_TOP, limit - PANEL_TOP]
    end
  end

  def self.layout(d, tw, obs)
    options = slots(obs).map { |x, y, max_h| [x, y, fit_panel(d, tw, max_h), max_h] }
    best = options.find { |o| o[2][2] } || options.max_by { |o| o[3] }
    x, y, (ops, h) = best
    { x: x, y: y, w: PANEL_WIDTH, h: h, ops: ops }
  end

  # ---- Drawing ----
  def self.set_font(bmp)
    if respond_to?(:pbSetSmallFont, true)
      pbSetSmallFont(bmp)
    else
      bmp.font.size = 13
    end
  end

  def self.measurer
    @measure = nil if @measure && @measure.disposed?
    unless @measure
      @measure = Bitmap.new(8, 8)
      set_font(@measure)
    end
    @tw ||= ->(text) { @measure.text_size(text.to_s).width }
  end

  def self.rgb(c, a = 255)
    Color.new(c[0], c[1], c[2], a)
  end

  def self.draw_op(bmp, op)
    case op[0]
    when :rect
      bmp.fill_rect(op[1], op[2], op[3], op[4], rgb(op[5])) if op[3] > 0 && op[4] > 0
    when :icon
      e = type_icon(op[3])
      bmp.blt(op[1], op[2], e[0], e[1]) if e
    when :text
      _, x, y, w, h, text, align, color = op
      bmp.font.color = rgb(COLORS[:shadow])
      bmp.draw_text(x + 1, y + 1, w, h, text, align)
      bmp.font.color = rgb(COLORS[color])
      bmp.draw_text(x, y, w, h, text, align)
    end
  end

  def self.draw(d, scene)
    measurer
    obs = obstacles(scene)
    lay = layout(d, @tw, obs)
    old = @sprite.bitmap
    bmp = Bitmap.new(lay[:w], lay[:h])
    set_font(bmp)
    lay[:ops].each { |op| draw_op(bmp, op) }
    @sprite.bitmap = bmp
    @sprite.x = lay[:x]
    @sprite.y = lay[:y]
    old.dispose if old && !old.disposed?
    lay
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

  # Runs every frame from the scene's frame and graphics updates (message waits only call the latter), so the
  # steady state does no file access, parsing, allocation or redrawing: it counts frames, checks F6, and every
  # POLL_FRAMES frames looks at the file's modification time.
  def self.frame(scene)
    fc = Graphics.respond_to?(:frame_count) ? Graphics.frame_count : nil
    return if fc && fc == @last_frame
    @last_frame = fc
    return if @ended_scene.equal?(scene) || @online_scene.equal?(scene)
    unless @checked_scene.equal?(scene)
      @checked_scene = scene
      battle = Game.battle_of(scene)
      return if battle.nil?
      dispose if @scene && !@scene.equal?(scene)
      @checked_scene = scene
      if Game.online?(battle)
        @online_scene = scene
        return
      end
      @online_scene = nil
    end
    if Game.toggle_pressed?
      @shown = !@shown
      @frames = POLL_FRAMES
    end
    @frames += 1
    polled = @frames >= POLL_FRAMES
    if polled
      @frames = 0
      if switched_off?
        dispose if @sprite
        return
      end
      d = read
      if d && @shown
        mt = @mtime
        ensure_sprite(scene)
        @mtime = mt
        @data = d
        sig = obstacle_sig(scene)
        if @drawn_version != @data_version || @drawn_sig != sig
          draw(d, scene)
          @drawn_version = @data_version
          @drawn_sig = sig
        end
        @has_data = true
      else
        @has_data = false
      end
    end
    return unless @sprite && !@sprite.disposed?
    vis = @has_data && @shown && @blocked == 0 && !Game.fight_menu_open?(scene)
    @sprite.visible = vis if @sprite.visible != vis
    update_moves(scene, polled)
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
      type = Game.move_type(m, battler)
      cat = Game.category(m, type)
      next nil if cat == 'Status'
      id = m.move.to_s
      foes.map do |f|
        ft = Game.foe_types(f)
        ft ? label(effectiveness(rules, type, id, cat, ft)) : '?'
      end
    end
  end

  def self.details_for(move, battler = nil)
    return nil if move.nil?
    cat = Game.category(move, battler ? Game.move_type(move, battler) : nil)
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

  def self.draw_moves(index, moves, marks, battler)
    key = [index, marks, details_for(moves[index], battler)]
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

  def self.hide_moves
    @moves_sprite.visible = false if @moves_sprite.visible
  end

  def self.update_moves(scene, polled)
    return unless @moves_sprite && !@moves_sprite.disposed?
    menu = nil
    unless moves_off?
      menu = Game.fight_menu(scene) if @has_data && @shown && @blocked == 0
      rules = @data && @data['rules']
      menu = nil unless rules.is_a?(Hash)
    end
    return hide_moves unless menu
    begin
      battler = menu.battler
      bid = battler.object_id
      z = menu.zButton
      idx = menu.index
      if bid != @m_bid || z != @m_z || idx != @m_idx || @data_version != @m_version
        t0 = DEBUG ? Time.now : nil
        battle = Game.battle_of(scene)
        moves = Game.menu_moves(menu)
        if bid != @m_bid || z != @m_z || @data_version != @m_version || polled
          @marks = marks_for(moves, battler, Game.foes(battle), rules)
        end
        @m_bid = bid
        @m_z = z
        @m_idx = idx
        @m_version = @data_version
        draw_moves(idx, moves, @marks, battler)
        timing("moves redraw #{((Time.now - t0) * 1000).round(1)}ms") if t0
      end
      @moves_sprite.visible = true unless @moves_sprite.visible
    rescue StandardError => e
      @moves_off = true
      log_error(e)
      hide_moves
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
        current.bind_call(self, *args, **kwargs, &block)
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
    wrap(::PokeBattle_Scene, :pbGraphicsUpdate, after: ->(s) { frame(s) })
    wrap(::PokeBattle_Scene, :pbEndBattle, before: ->(s) { @ended_scene = s; dispose })
    wrap(::PokeBattle_Scene, :pbShowBattleStats, before: ->(_s) { block }, after: ->(_s) { unblock })
  end
end

PokePalOverlay.install_hooks
