#!/usr/bin/env python3
"""Generate texture sheets with gpt-image-2.5-sunburst and turn them into game textures.

Each sheet is one square (1:1) image at the largest size the model accepts, quality "medium",
holding a 3x3 grid of nine textures described by tools/texture-catalog.json. Every cell is cut out,
made seamless, resized and packed into dist/materials/generated/<sheet>.webp, and
dist/materials/generated/manifest.json tells the game which materials use which texture.

The API key is read from the OPENAI_API_KEY environment variable and never written anywhere.
Raw images are cached in .texture-cache/ (git-ignored) so a sheet is paid for only once.

  python3 .claude/skills/gpt-image-textures/generate.py --dry-run          # show prompts, no API call
  python3 .claude/skills/gpt-image-textures/generate.py                    # every missing sheet
  python3 .claude/skills/gpt-image-textures/generate.py --sheets surfaces-1 exteriors-stone
  python3 .claude/skills/gpt-image-textures/generate.py --reprocess        # re-cut cached images only
  python3 .claude/skills/gpt-image-textures/generate.py --test-pattern --out /tmp/x  # offline pipeline test
"""
import argparse, base64, json, math, os, random, sys, time, urllib.error, urllib.request
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
CATALOG = ROOT / 'tools' / 'texture-catalog.json'
MODEL = 'gpt-image-2.5-sunburst'
QUALITY = 'medium'
# Largest first; the first size the API accepts is remembered in the cache.
SIZES = ['4096x4096', '3840x3840', '3072x3072', '2880x2880', '2560x2560', '2048x2048', '1536x1536', '1024x1024']
GRID = 3


def build_prompt(sheet):
    cells = []
    for index, slot in enumerate(sheet['slots']):
        row, col = divmod(index, GRID)
        cells.append(f"Row {row + 1}, column {col + 1}: {slot['prompt']}; the cell shows about "
                     f"{slot['meters']:g} m x {slot['meters']:g} m of the surface.")
    return ('One square image divided into an exact 3 by 3 grid of nine equal square cells, separated by thin '
            'straight pure black lines of equal width. Each cell is a different seamless, tileable, photorealistic '
            'material texture photographed straight on (orthographic, no perspective, no vanishing lines), lit by '
            'soft even overcast daylight with no cast shadows, no vignetting and no bright reflections. Fill every '
            'cell edge to edge with the material only: no text, labels, numbers, logos, people, plants (unless the '
            'material is a plant), objects, borders or frames inside the cells. Keep the scale consistent with the '
            'stated size. ' + ' '.join(cells))


def request_json(url, payload, key, timeout=600):
    body = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=body, method='POST', headers={
        'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        try:
            return error.code, json.loads(error.read())
        except Exception:
            return error.code, {'error': {'message': str(error)}}


def generate_image(prompt, key, cache):
    sizes = [cache['size']] if cache.get('size') else SIZES
    for size in sizes:
        for attempt in range(5):
            status, data = request_json('https://api.openai.com/v1/images/generations', {
                'model': MODEL, 'prompt': prompt, 'size': size, 'quality': QUALITY, 'n': 1,
                'output_format': 'png'}, key)
            if status == 200:
                cache['size'] = size
                return base64.b64decode(data['data'][0]['b64_json']), size
            error = data.get('error', {})
            message = error.get('message', '')
            if error.get('code') in ('credit_balance_exhausted', 'insufficient_quota') or status in (401, 403):
                sys.exit(f'OpenAI API refused the request ({status}): {message}')
            if status == 400 and (error.get('param') == 'size' or 'size' in message.lower()):
                print(f'  size {size} not accepted, trying a smaller one')
                break
            if status in (429, 500, 502, 503, 504):
                wait = 2 ** attempt * 5
                print(f'  {status}, retrying in {wait}s: {message[:120]}')
                time.sleep(wait)
                continue
            sys.exit(f'OpenAI API error ({status}): {message}')
        else:
            sys.exit('OpenAI API kept failing; try again later')
    sys.exit('No square size was accepted')


def seamless(tile):
    """Blend the tile with a copy shifted by half its size, so opposite edges meet without a seam."""
    size = tile.width
    shifted = ImageChops.offset(tile, size // 2, size // 2)
    mask = Image.new('L', (size, size))
    band = size * .22
    pixels = mask.load()
    for y in range(size):
        dy = min(y, size - 1 - y)
        for x in range(size):
            d = min(dy, min(x, size - 1 - x))
            t = min(1., d / band)
            pixels[x, y] = int(255 * t * t * (3 - 2 * t))
    return Image.composite(tile, shifted, mask)


def linear_luminance(tile):
    small = tile.resize((48, 48), Image.BILINEAR).convert('RGB')
    total = 0.
    for r, g, b in small.getdata():
        lin = [((c / 255 + .055) / 1.055) ** 2.4 if c > 10 else c / 255 / 12.92 for c in (r, g, b)]
        total += .2126 * lin[0] + .7152 * lin[1] + .0722 * lin[2]
    return total / (48 * 48)


def cut_sheet(raw, tile_size):
    image = Image.open(raw).convert('RGB')
    side = min(image.size)
    image = image.crop((0, 0, side, side))
    cell = side / GRID
    inset = cell * .045
    atlas = Image.new('RGB', (tile_size * GRID, tile_size * GRID))
    lumas = []
    for index in range(GRID * GRID):
        row, col = divmod(index, GRID)
        box = (round(col * cell + inset), round(row * cell + inset), round((col + 1) * cell - inset), round((row + 1) * cell - inset))
        tile = image.crop(box).resize((tile_size, tile_size), Image.LANCZOS)
        tile = seamless(tile)
        lumas.append(round(linear_luminance(tile), 4))
        atlas.paste(tile, (col * tile_size, row * tile_size))
    return atlas, lumas


def test_pattern(sheet, path, size=1536):
    """An offline stand-in for a generated sheet, to test cutting and the game without the API."""
    rng = random.Random(sheet['id'])
    image = Image.new('RGB', (size, size), 'black')
    draw = ImageDraw.Draw(image)
    cell = size // GRID
    for index in range(GRID * GRID):
        row, col = divmod(index, GRID)
        base = [rng.randint(60, 200) for _ in range(3)]
        x0, y0 = col * cell + 6, row * cell + 6
        draw.rectangle((x0, y0, x0 + cell - 12, y0 + cell - 12), fill=tuple(base))
        bricks = rng.randint(4, 12)
        for k in range(bricks * 2):
            y = y0 + k * (cell - 12) // (bricks * 2)
            draw.line((x0, y, x0 + cell - 12, y), fill=tuple(int(c * .6) for c in base), width=3)
    image.filter(ImageFilter.GaussianBlur(.6)).save(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--sheets', nargs='*', help='sheet ids (default: all)')
    parser.add_argument('--dry-run', action='store_true', help='print prompts without calling the API')
    parser.add_argument('--force', action='store_true', help='generate again even if a cached image exists')
    parser.add_argument('--reprocess', action='store_true', help='only re-cut cached images')
    parser.add_argument('--test-pattern', action='store_true', help='use synthetic sheets instead of the API')
    parser.add_argument('--tile', type=int, default=512, help='pixel size of each texture in the atlas')
    parser.add_argument('--out', default=str(ROOT / 'dist' / 'materials' / 'generated'))
    parser.add_argument('--cache', default=str(ROOT / '.texture-cache'))
    args = parser.parse_args()

    catalog = json.loads(CATALOG.read_text())
    sheets = [s for s in catalog['sheets'] if not args.sheets or s['id'] in args.sheets]
    unknown = set(args.sheets or []) - {s['id'] for s in catalog['sheets']}
    if unknown:
        sys.exit('Unknown sheet ids: ' + ', '.join(sorted(unknown)))
    out, cache_dir = Path(args.out), Path(args.cache)
    out.mkdir(parents=True, exist_ok=True)
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file = cache_dir / 'cache.json'
    cache = json.loads(cache_file.read_text()) if cache_file.exists() else {}

    if args.dry_run:
        for sheet in sheets:
            print(f"== {sheet['id']}  ({MODEL}, 1:1 largest size, quality {QUALITY})\n{build_prompt(sheet)}\n")
        return
    key = os.environ.get('OPENAI_API_KEY', '')
    if not (args.reprocess or args.test_pattern) and not key:
        sys.exit('Set OPENAI_API_KEY to generate images (it is never stored).')

    manifest_path = out / 'manifest.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    entries = {s['id']: s for s in manifest.get('sheets', [])}
    for sheet in sheets:
        raw = cache_dir / f"{sheet['id']}{'-test' if args.test_pattern else ''}.png"
        if args.test_pattern:
            test_pattern(sheet, raw)
        elif not raw.exists() or args.force:
            if args.reprocess:
                print(f"skip {sheet['id']}: nothing cached")
                continue
            print(f"generating {sheet['id']} with {MODEL} ...")
            png, size = generate_image(build_prompt(sheet), key, cache)
            raw.write_bytes(png)
            cache.setdefault('sheets', {})[sheet['id']] = {'size': size, 'time': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
            cache_file.write_text(json.dumps(cache, indent=1))
            print(f'  {size}, {len(png) // 1024} KB')
        atlas, lumas = cut_sheet(raw, args.tile)
        file = f"{sheet['id']}.webp"
        atlas.save(out / file, 'WEBP', quality=88, method=6)
        entries[sheet['id']] = {'id': sheet['id'], 'file': file, 'slots': [
            {k: slot[k] for k in ('id', 'materials', 'meters', 'tint', 'roughness', 'relief')} | {'luma': luma}
            for slot, luma in zip(sheet['slots'], lumas)]}
        print(f"  wrote {file} ({(out / file).stat().st_size // 1024} KB)")

    order = [s['id'] for s in catalog['sheets']]
    manifest = {'version': 1, 'model': MODEL, 'quality': QUALITY, 'size': cache.get('size'), 'tile': args.tile,
                'grid': GRID, 'sheets': sorted(entries.values(), key=lambda s: order.index(s['id']) if s['id'] in order else 99)}
    manifest_path.write_text(json.dumps(manifest, indent=1) + '\n')
    print(f"manifest: {len(manifest['sheets'])} sheets, {sum(len(s['slots']) for s in manifest['sheets'])} textures")


if __name__ == '__main__':
    main()
