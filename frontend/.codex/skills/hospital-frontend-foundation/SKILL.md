---
name: hospital-frontend-foundation
description: Use when designing or implementing frontend work in this repo for the hospital product. Applies the project's visual direction, English-only MVP copy policy, simple-first UX rules, and color system before proposing UI structure.
---

# Hospital Frontend Foundation

Use this skill for frontend planning, design, and implementation work in this repository.

## Required Reading

Read these files before proposing UI structure, copy, or interaction patterns:

- `../../../AGENTS.md`
- `../../../docs/design-system.md`
- `../../../docs/ux-safety-rules.md`

## What This Skill Enforces

- The MVP uses English UI copy only.
- The UI must remain simple, spacious, calm, and hard to misuse.
- Large controls, strong contrast, and clear action hierarchy are preferred over dense information layouts.
- Color is never the only status signal.
- Use the documented clinical-light palette and keep saturation focused on actions and urgent states.

## Reject These Patterns

- Dense dashboard walls and spreadsheet-style default layouts.
- Multiple competing primary actions in one view.
- Tiny hit targets, icon-only critical actions, or low-contrast urgent states.

## Usage

- For visual decisions, treat `design-system.md` as the source of truth.
- For interaction safety, treat `ux-safety-rules.md` as the source of truth.
- If a request conflicts with the docs, follow the docs and simplify the solution.
