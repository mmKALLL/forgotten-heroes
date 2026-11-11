# Forgotten Heroes

A gritty, magical D&D 5e–flavoured travel-and-trade game. See [the design](docs/plans/2026-11-12-rebuild-design.md).

## Run

    pnpm install
    pnpm sync-assets   # copies images listed in assets.manifest.txt from ~/dnd5e (DND5E_DIR to override)
    pnpm dev

## Develop

- `pnpm test` runs the engine, content and UI tests
- `pnpm typecheck`
- `pnpm schemas` regenerates `data/_schema/` after changing `src/schema/`

## Content

All game content is JSON under `data/`, split by provenance:

| Folder | What | Committed |
|---|---|---|
| `data/original/` | Hand-authored by the designer | yes |
| `data/imported/` | Open-licensed (SRD, CC-BY) | yes |
| `data/imported-private/` | From copyrighted books, for personal play | **no** (gitignored) |
| `data/procedural/` | Parts tables used by runtime combinators | yes |
| `data/claude/` | Authored by Claude Code | yes |

Every file declares `kind` and `source`, and VS Code validates it through `$schema`.

## Credits

Committed third-party assets that require attribution are listed here. A full local record of every asset used, including the ones that are not committed, is kept in `CREDITS.md` (gitignored).

- None yet. Game-icons.net icons (CC BY 3.0) will be credited here when they are added.
