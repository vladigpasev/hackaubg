# Content And Localization

The MVP uses English only. Copy decisions must preserve clinical clarity, fast scanning, and safe action wording. Localization can come later without changing the core UX rules.

## Tone

- Calm, direct, and operational.
- Respectful and human, never robotic.
- Short enough to scan quickly.
- Precise enough to support safe clinical action.

## Terminology Direction

- Prefer simple clinical wording over administrative jargon.
- Keep one approved term per concept when possible.
- Use nouns for records and statuses, verbs for actions.
- Avoid synonyms that suggest different severity levels for the same state.

## Preferred Terminology

- `Critical`
- `Stable`
- `Needs attention`
- `Escalate`
- `Acknowledge`
- `Continue`
- `Open`
- `Save`

## Severity Wording

- Use one consistent order across the system:
  `Critical`, `High`, `Needs attention`, `Stable`, `Complete`.
- Do not mix urgency language and progress language inside the same label.
- If a state is urgent, the action label should remain explicit, not abstract.

## Empty, Loading, And Error Copy

- Empty states should explain what is missing and what the next useful action is.
- Loading states should use calm operational wording such as `Loading patient details`.
- Error messages should name the problem and the recovery path.
- Avoid vague copy such as `Something went wrong`.

## Truncation Rules

- Do not truncate patient names, alert severity, or the main action label when avoidable.
- Prefer wrapping for critical instructions and clinical status text.
- If truncation is unavoidable, preserve the most identifying information first.
- Never rely on hover to reveal critical hidden text.
- Copy must stay inside its container at every viewport size.

## Names, Time, And Identifiers

- Preserve full patient names wherever the layout allows.
- Show timestamps in one consistent English-language format across the MVP.
- Keep patient IDs visually distinct from names.
- Do not overload a single line with name, ID, room, and status without spacing or grouping.

## Writing Rules For Buttons And Labels

- Use explicit verbs: `Start intake`, `Open patient`, `Send to doctor`.
- Keep high-risk actions unmistakable.
- Avoid generic labels such as `Submit`, `Continue` when a more specific label improves safety.
- Make sure labels remain clear at the planned large control sizes.
