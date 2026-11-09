"""Draws the overlay panel exactly where and how mod/PokePalOverlay.rb lays it out, on top of a screenshot.

python3 mod/mockup/render.py <scenario dir> <screenshot> <out.png> [panels.png]

The geometry (every rectangle, row and pill) comes from the mod's own layout code (layout.rb). The only stand-in is
the font: Reborn's pixel font is not available here, so a plain font is drawn without anti-aliasing at the game's
512x384 size and scaled up with nearest-neighbour, the way the game window scales.
"""
import json, subprocess, sys, os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'
SIZE = 11
font = ImageFont.truetype(FONT, SIZE)
COLORS = None

def widths():
    w = {chr(c): font.getlength(chr(c)) for c in range(32, 127)}
    w = {k: round(v) for k, v in w.items()}
    path = '/tmp/pokepal-widths.json'
    json.dump({'w': w, 'default': 6}, open(path, 'w'))
    return path

def layout(overlay_path, boxes):
    out = subprocess.check_output(['ruby', '-W0', os.path.join(HERE, 'layout.rb'), overlay_path, widths(), ';'.join(','.join(map(str, b)) for b in boxes)])
    return json.loads(out)

def colors():
    src = open(os.path.join(HERE, '..', 'PokePalOverlay.rb')).read()
    import re
    block = src[src.index('COLORS = {'):src.index('}.freeze', src.index('COLORS = {'))]
    return {m.group(1): tuple(int(x) for x in m.group(2).split(',')) for m in re.finditer(r'(\w+): \[(\d+), (\d+), (\d+)\]', block.replace('[', '[').replace(']', ']')) for _ in [0]} if False else {m.group(1): (int(m.group(2)), int(m.group(3)), int(m.group(4))) for m in re.finditer(r'(\w+): \[(\d+), (\d+), (\d+)\]', block)}

def draw_text(img, d, x, y, w, h, text, align, rgb, shadow):
    tw = font.getlength(text)
    if tw > w:
        tw = w  # the game squeezes over-wide text
    tx = x + (0 if align == 0 else (w - tw) / 2 if align == 1 else w - tw)
    bbox = font.getbbox('Ag')
    ty = y + (h - (bbox[3] - bbox[1])) / 2 - bbox[1]
    for dx, dy, col in ((1, 1, shadow), (0, 0, rgb)):
        d.text((round(tx + dx), round(ty + dy)), text, font=font, fill=col)

def render(lay, col):
    img = Image.new('RGB', (lay['w'], lay['h']), (0, 0, 0))
    d = ImageDraw.Draw(img)
    d.fontmode = '1'
    for op in lay['ops']:
        if op[0] == 'rect':
            _, x, y, w, h, rgb = op
            if w > 0 and h > 0:
                d.rectangle([x, y, x + w - 1, y + h - 1], fill=tuple(rgb))
        else:
            _, x, y, w, h, text, align, color = op
            draw_text(img, d, x, y, w, h, text, align, col[color], col['shadow'])
    return img

def main():
    scen, shot, out = sys.argv[1], sys.argv[2], sys.argv[3]
    col = colors()
    base = Image.open(shot).convert('RGB')
    sx, sy = base.width / 512, base.height / 384
    databox = [(298, 190, 214, 84)]
    lay = layout(os.path.join(scen, 'porygonz-prompt.json'), databox)
    panel = render(lay, col)
    big = panel.resize((round(panel.width * sx), round(panel.height * sy)), Image.NEAREST)
    # cover Ben's old panel (the new one is larger and at the same corner, so it is hidden underneath)
    base.paste(big, (round(lay['x'] * sx), round(lay['y'] * sy)))
    base.save(out)
    print('placed at', lay['x'], lay['y'], 'size', lay['w'], lay['h'], 'databox top', databox[0][1], 'gap', databox[0][1] - (lay['y'] + lay['h']))
    if len(sys.argv) > 4:
        names = ['bewear-prompt', 'bewear-field']
        panels = [render(layout(os.path.join(scen, n + '.json'), databox), col) for n in names]
        pw = sum(p.width for p in panels) + 12 * (len(panels) + 1)
        ph = max(p.height for p in panels) + 24
        canvas = Image.new('RGB', (pw, ph), (88, 168, 64))
        x = 12
        for p in panels:
            canvas.paste(p, (x, 12))
            x += p.width + 12
        canvas.resize((canvas.width * 3, canvas.height * 3), Image.NEAREST).save(sys.argv[4])

main()
