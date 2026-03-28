# UX Safety Rules

This project is hospital software. Every interaction must reduce ambiguity and make incorrect actions harder.

## Core Principles

- Prefer guided flows over dashboard complexity.
- Make the next safe action obvious at every step.
- Reduce the number of choices shown at once.
- Keep current patient status visible while decisions are being made.
- Design for tired, interrupted, and time-constrained users.

## Flow Rules

- Break complex tasks into clear steps.
- Use progress indicators only when they meaningfully reduce uncertainty.
- Show one recommended next action per step.
- Keep secondary options available but visually quieter.
- Avoid long, undifferentiated forms.

## Validation And Error Prevention

- Validate inline, near the field or control that needs attention.
- Explain what is wrong and what the user should do next.
- Prevent impossible states before submit when possible.
- Use confirmation dialogs only for irreversible or high-risk actions.
- Do not ask for confirmation on routine safe actions.

## Focus And Input Behavior

- Focus order must follow the visual order.
- Keyboard-only completion must be possible for primary workflows.
- Touch targets must remain comfortable on tablets and touch laptops.
- Avoid hidden shortcuts that bypass visible safety steps.

## Copy And Comprehension

- Labels must be short, specific, and task-oriented.
- Avoid jargon when a simpler term exists.
- Use verbs for actions and nouns for destinations or records.
- Error states must be plain language, not system language.

## Layout Rules For MVP Copy

- Keep labels short, explicit, and easy to scan.
- Do not depend on narrow controls or single-word labels to keep layouts intact.
- Prefer wrapping over truncation for critical instructions.
- Preserve alignment when messages become longer because of clinical detail.

## Alerting And Urgency

- Urgent items must be prominent without being visually chaotic.
- Distinguish acknowledge from dismiss and escalate from resolve.
- Never use ambiguous labels such as `Done` when the action changes a clinical state.
- Use clear severity order and keep that order consistent across all surfaces.

## Anti-Patterns

- No multi-column data walls as the default nurse workflow.
- No tiny badges, dense chip stacks, or low-contrast ghost actions for key tasks.
- No destructive controls placed beside the primary action without separation.
- No modals that hide critical patient context unless the action is high risk.
