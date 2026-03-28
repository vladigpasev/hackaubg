# Hospital Frontend Foundation

This frontend is intentionally in a documentation-first setup phase. The app stack stays minimal while the product direction, UX rules, and contributor guidance are locked down for future implementation.

## Current Scope

- Product direction: simple, clinically calm, English-only for the MVP, and hard to misuse.
- Phase boundary: no runtime screens, routes, or business logic are being implemented yet.

## Source Of Truth

- `AGENTS.md`
- `docs/design-system.md`
- `docs/ux-safety-rules.md`
- `docs/content-localization.md`

## What This Phase Defines

- The clinical light visual direction.
- The button sizing and safe interaction constraints.
- The MVP English copy expectations.
- The rules future contributors and agents must follow when implementing UI.

## What This Phase Does Not Do

- It does not implement routes or page shells.
- It does not add a component library.
- It does not add design tokens in code.
- It does not change the current starter app beyond providing the documentation foundation.

## Working In This Repo

Run the existing frontend commands from `frontend/`:

```bash
npm run dev
npm run build
npm run lint
```
