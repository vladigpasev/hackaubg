# Hospital Frontend Contributor Contract

This frontend is in a documentation-first setup phase. Do not invent features, routes, or interactions that contradict the documents in `docs/`.

## Product Direction

- Keep the UI clinically calm, visually light, and easy to scan under pressure.
- Use English only for the MVP.
- Optimize for low cognitive load and obvious next actions.

## Non-Negotiable UX Rules

- Keep screens simple. If a layout feels dense, reduce the amount of information before styling it further.
- Allow only one primary action per screen or panel.
- Do not use dense tables by default. Prefer roomy cards or spacious list rows.
- Everything must be fully responsive across mobile, tablet, laptop, desktop, and large monitors.
- Nothing may overflow its card, container, or viewport. Content must wrap, stack, or resize before it clips or spills outside the layout.
- Destructive actions must never use the primary button style.
- Color must never be the only way status is communicated. Pair color with icon, text, and placement.
- Primary controls must have a minimum hit target of `56px`.
- Secondary controls must have a minimum hit target of `48px`.
- Use confirmation only for irreversible or high-risk actions.
- Never hide urgent clinical state behind hover-only or low-contrast UI.

## Visual Direction

- Use the visual rules in `docs/design-system.md` as the canonical source.
- Beauty comes from proportion, whitespace, contrast, and calm hierarchy, not ornament.
- Prefer large controls, large labels, and obvious status groupings over compactness.
- Avoid dark-mode-first or dashboard-heavy aesthetics in this project phase.

## Working Rules For Future Agents

- Read the frontend docs before proposing UI structure.
- If a design idea increases cognitive load, ambiguity, or the chance of misclicks, reject it.
- Use English UI copy throughout the MVP unless a request explicitly changes the language strategy.
- Treat responsiveness as required, not optional. Verify that pills, badges, buttons, headings, and long copy remain inside their boxes at all sizes.
- When uncertain, simplify the flow instead of adding more controls or states.
