import { formatRoleLabel } from '../../../auth/roles'

export type StaffBadgeRole = 'registry' | 'nurse' | 'doctor' | 'admin'
export type AdminTriageState = 'GREEN' | 'YELLOW' | 'RED'

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function SummaryCard({
  label,
  value,
  description,
}: {
  label: string
  value: string
  description?: string
}) {
  return (
    <article className="rounded-[1.05rem] border border-[var(--border-soft)] bg-white px-4 py-4 shadow-[0_12px_32px_rgba(19,56,78,0.04)]">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)] break-words">{value}</p>
      {description ? <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{description}</p> : null}
    </article>
  )
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-[1rem] border border-dashed border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-10 text-center text-sm text-[var(--text-secondary)]">
      {message}
    </div>
  )
}

export function RoleBadge({ role }: { role: StaffBadgeRole }) {
  const tones: Record<StaffBadgeRole, string> = {
    admin: 'border-[var(--blue-border)] bg-[var(--blue-soft)] text-[var(--blue-text)]',
    doctor: 'border-[var(--teal-border)] bg-[var(--teal-soft)] text-[var(--teal-strong)]',
    nurse: 'border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--amber-text)]',
    registry: 'border-[var(--border-soft)] bg-white text-[var(--text-secondary)]',
  }

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${tones[role]}`}
    >
      {formatRoleLabel(role)}
    </span>
  )
}

export function TriageBadge({ triageState }: { triageState: AdminTriageState }) {
  const config =
    triageState === 'RED'
      ? {
          dotTone: 'bg-[var(--red-text)]',
          label: 'Critical',
          tone: 'border-[var(--red-border)] bg-[rgba(226,92,92,0.10)] text-[var(--red-text)]',
        }
      : triageState === 'YELLOW'
        ? {
            dotTone: 'bg-[var(--amber-text)]',
            label: 'Urgent',
            tone: 'border-[var(--amber-border)] bg-[rgba(227,166,52,0.12)] text-[var(--amber-text)]',
          }
        : {
            dotTone: 'bg-[var(--green-text)]',
            label: 'Stable',
            tone: 'border-[var(--green-border)] bg-[rgba(82,171,116,0.12)] text-[var(--green-text)]',
          }

  return (
    <span
      aria-label={`Triage ${config.label.toLowerCase()}`}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold tracking-[0.04em] ${config.tone}`}
      title={`Triage ${config.label.toLowerCase()}`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${config.dotTone}`} />
      <span>{config.label}</span>
    </span>
  )
}

function formatSpecialtyLabel(value: string) {
  const normalized = value.trim().replace(/[_-]+/g, ' ')

  if (normalized.length === 0) {
    return normalized
  }

  return normalized
    .split(/\s+/)
    .map((segment) => {
      const upper = segment.toUpperCase()

      if (['ICU', 'CT', 'MRI', 'ECG'].includes(upper)) {
        return upper
      }

      if (upper === 'XRAY' || upper === 'XRAY') {
        return 'X-Ray'
      }

      return `${segment[0]?.toUpperCase() ?? ''}${segment.slice(1).toLowerCase()}`
    })
    .join(' ')
}

export function SpecialtyList({
  emptyLabel = 'No specialties configured',
  specialties,
}: {
  emptyLabel?: string
  specialties: string[]
}) {
  if (specialties.length === 0) {
    return <p className="text-sm text-[var(--text-secondary)]">{emptyLabel}</p>
  }

  return (
    <div className="flex flex-wrap gap-2">
      {specialties.map((specialty) => (
        <span
          key={specialty}
          className="rounded-full border border-[var(--teal-border)] bg-[var(--teal-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--teal-strong)]"
        >
          {formatSpecialtyLabel(specialty)}
        </span>
      ))}
    </div>
  )
}
