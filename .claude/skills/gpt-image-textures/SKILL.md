---
name: gpt-image-textures
description: Generate game textures with OpenAI gpt-image-2.5-sunburst (square 1:1, the largest size the model accepts, quality "medium"), nine textures per image in a 3x3 grid, and wire them into the ATLANTIS renderer. Use when asked to generate, add or regenerate image textures (画像生成テクスチャ, テクスチャ生成, ビルの外観テクスチャ) for this game.
---

# Image-generated textures (gpt-image-2.5-sunburst)

Every request makes **one square image holding nine textures** (3 columns x 3 rows).

- Model: `gpt-image-2.5-sunburst`
- Aspect: 1:1. The script asks for the largest square size first (4096, 3840, 3072, ...) and
  keeps the first one the API accepts.
- Quality: `medium`
- Output: PNG from the API, cached in `.texture-cache/` (git-ignored) so nothing is paid for twice.

## Files

| File | Role |
| --- | --- |
| `tools/texture-catalog.json` | Sheets of nine textures: prompt, the world materials that use each one, tile size in meters, tint, roughness, relief |
| `.claude/skills/gpt-image-textures/generate.py` | Calls the API, cuts each cell, makes it seamless, writes the atlas and the manifest |
| `dist/materials/generated/<sheet>.webp` | 3x3 atlas of 512 px seamless tiles (commit these) |
| `dist/materials/generated/manifest.json` | What the game loads (commit this) |
| `dist/generated-textures.js` | Loads the atlases in the browser and builds the material table |
| `dist/architecture-shader.js` (`photoLayer`, `photoMaterial`) | Applies them; a building keeps one variant on all its parts |

The catalog has 10 sheets (90 textures): `surfaces-1` to `surfaces-4` cover the surfaces that had only
procedural textures (36), and `exteriors-*` add building exteriors, roofs and streets (54).

## Steps

1. The key must be in `OPENAI_API_KEY` for the command only. Never write it into the repository, a
   commit, a log or the manifest. If the user pasted it in chat, keep it in a file outside the
   repository (for example the scratchpad) with mode 600 and read it from there.
2. Check the prompts without paying: `python3 .claude/skills/gpt-image-textures/generate.py --dry-run`
3. Generate the missing sheets (each call takes about a minute):
   ```
   OPENAI_API_KEY=... python3 .claude/skills/gpt-image-textures/generate.py
   ```
   `--sheets <id> ...` limits the run, `--force` regenerates cached sheets, `--reprocess` only re-cuts
   cached images (after changing cutting or tile size), `--test-pattern --out <dir>` runs the whole
   pipeline offline with synthetic sheets (never commit those).
4. Look at every atlas in `dist/materials/generated/` before shipping: a cell with text, a frame,
   perspective or the wrong material should be regenerated with a sharper prompt.
5. Render the game (for example the photo harness) and compare with the procedural look.
6. Run `npm test`, then commit the `.webp` atlases and `manifest.json`.

## Adding textures

Append slots to a sheet in `tools/texture-catalog.json` (keep nine per sheet) or add a sheet.
`materials` are world material ids (see `materialLayers` in `dist/architecture-materials.js`); each
material can use up to eight textures. `tint` 0 keeps the photo's colors, 1 keeps only its light and
shade and colors it with each building's own color (use it for paint, render and fabrics).

## Errors

- `credit_balance_exhausted` / `insufficient_quota`: the account has no API credit. Ask the user to add
  credit at https://platform.openai.com/settings/organization/billing/ and run again; cached sheets are
  kept.
- 401: the key is wrong or revoked.
