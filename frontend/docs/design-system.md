# Design System

This document is the canonical visual specification for the hospital frontend foundation. It defines the visual language that future implementation work must follow.

## Design Goals

- Simple enough for high-stress clinical use.
- Beautiful through calm spacing, strong contrast, and restraint.
- Hard to misuse through large controls and explicit states.
- Readable in English-first clinical workflows, without depending on narrow labels or cramped controls.

## Typography

- Primary UI typeface: `Atkinson Hyperlegible Next`.
- Use the same typeface for navigation, labels, forms, buttons, tables if ever introduced, and body copy.
- Favor medium and semibold weights over thin or highly stylized weights.
- Default body size should read comfortably at arm's length on clinical workstations.
- Avoid decorative display fonts in v1. Hierarchy should come from size, spacing, and weight.

## Color System

### Base Surfaces

- App background: off-white with a slight ice tint.
- Primary panels: clean white.
- Secondary panels: very pale blue-gray.
- Borders: soft cool gray with enough contrast to define groups clearly.
- Primary text: deep slate.
- Secondary text: muted slate.

### Action And Status Colors

- Primary action: teal.
- Warning or requires-attention state: amber.
- Success or stable state: green.
- Critical or urgent state: red.
- Informational accent: cool blue only when needed for orientation, not as the main brand color.

### Usage Rules

- Reserve the strongest saturation for actions and urgent states.
- Do not fill large page areas with saturated colors.
- Do not use status colors decoratively.
- Every status treatment must include an icon and a text label in addition to color.

## Spacing And Shape

- Use an `8px` base spacing scale.
- Prefer generous vertical spacing between sections.
- Use large radii for cards, drawers, and grouped panels.
- Keep cards roomy enough to show one primary action without crowding.
- Avoid hairline spacing and tightly packed badge clusters.

## Layout Principles

- Favor one dominant content column with optional secondary context, not multi-panel complexity by default.
- Put the primary action in a predictable location near the main task.
- Group related information into clearly separated cards or sections.
- Keep page headers compact but clear, with the page purpose and next action visible immediately.

## Controls

- Primary buttons: minimum height `56px`.
- Secondary buttons and segmented controls: minimum height `48px`.
- Form fields should feel large, obvious, and easy to tap on touch devices.
- Use icon-plus-label buttons for important actions when the icon improves recognition.
- Avoid icon-only controls for critical actions.

## Status Patterns

- Status chips should be large enough to read quickly, not miniature pills.
- Each chip must contain an icon, label, and consistent severity mapping.
- Use the same status ordering everywhere:
  `critical`, `high`, `attention`, `stable`, `complete`.
- Do not overload one label with multiple meanings.

## Motion And Feedback

- Keep motion minimal and purposeful.
- Use quick fades or subtle slides to confirm state changes or panel transitions.
- Do not animate urgent content in ways that distract or create anxiety.
- Feedback should be immediate and local to the action taken.

## Accessibility Baseline

- Maintain strong text-to-background contrast on all surfaces.
- Never rely on color alone.
- Preserve readable line lengths and support common browser zoom levels used in clinical settings.
- Ensure the system remains legible at browser zoom levels used in clinical settings.
