import type { AssignmentCode, PatientCode } from '../types/patient'

const triageStyles = {
  GREEN: {
    badgeClassName: 'border-[var(--green-border)] bg-[var(--green-soft)] text-[var(--green-text)]',
    iconLabel: 'G',
    label: 'Green',
  },
  UNDEFINED: {
    badgeClassName: 'border-[var(--border-soft)] bg-[var(--surface-secondary)] text-[var(--text-secondary)]',
    iconLabel: 'U',
    label: 'Undefined',
  },
  YELLOW: {
    badgeClassName: 'border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--amber-text)]',
    iconLabel: 'Y',
    label: 'Yellow',
  },
} as const

interface TriageBadgeProps {
  triageState: AssignmentCode | PatientCode
}

export function TriageBadge({ triageState }: TriageBadgeProps) {
  const tone = triageStyles[triageState]

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${tone.badgeClassName}`}
    >
      <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-current/12 text-[10px] font-bold">
        {tone.iconLabel}
      </span>
      {tone.label}
    </span>
  )
}
