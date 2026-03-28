export const TRIAGE_STATES = ['GREEN', 'YELLOW', 'RED'] as const;

export type TriageState = (typeof TRIAGE_STATES)[number];
