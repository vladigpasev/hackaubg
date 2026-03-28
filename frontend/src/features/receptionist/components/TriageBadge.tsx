import type { TriageState } from '../types/patient'

const triageStyles = {
  unknown: {
    label: 'Unknown',
    badgeClassName: 'border-[var(--border-soft)] bg-[var(--surface-secondary)] text-[var(--text-secondary)]',
    iconLabel: '?',
  },
  green: {
    label: 'Green',
    badgeClassName: 'border-[var(--green-border)] bg-[var(--green-soft)] text-[var(--green-text)]',
    iconLabel: 'G',
  },
  yellow: {
    label: 'Yellow',
    badgeClassName: 'border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--amber-text)]',
    iconLabel: 'Y',
  },
  red: {
    label: 'Red',
    badgeClassName: 'border-[var(--red-border)] bg-[var(--red-soft)] text-[var(--red-text)]',
    iconLabel: 'R',
  },
} as const

interface TriageBadgeProps {
  triageState: TriageState
}

export function TriageBadge({ triageState }: TriageBadgeProps) {
  const tone = triageStyles[triageState]

  return (
    <span
      className={`inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${tone.badgeClassName}`}
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-current/12 text-[10px] font-bold">
        {tone.iconLabel}
      </span>
      {tone.label}
    </span>
  )
}
