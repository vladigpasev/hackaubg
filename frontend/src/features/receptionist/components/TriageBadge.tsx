import type { TriageState } from '../types/patient'

const triageStyles = {
  GREEN: {
    badgeClassName: 'border-[var(--green-border)] bg-[var(--green-soft)] text-[var(--green-text)]',
    iconLabel: 'G',
    label: 'Green',
  },
  RED: {
    badgeClassName: 'border-[var(--red-border)] bg-[var(--red-soft)] text-[var(--red-text)]',
    iconLabel: 'R',
    label: 'Red',
  },
  YELLOW: {
    badgeClassName: 'border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--amber-text)]',
    iconLabel: 'Y',
    label: 'Yellow',
  },
} as const

interface TriageBadgeProps {
  triageState: TriageState
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
