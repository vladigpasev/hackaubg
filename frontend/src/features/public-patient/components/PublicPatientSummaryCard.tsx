import type { PublicPatientDetails, PublicPatientTriageState } from '../types/publicPatient'

interface PublicPatientSummaryCardProps {
  patient: Pick<PublicPatientDetails, 'admittedAt' | 'id' | 'name' | 'phoneNumber' | 'triageState'>
  showPatientId?: boolean
}

const admittedAtFormatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const triageTone = {
  green: {
    badgeClassName: 'border-[var(--green-border)] bg-[var(--green-soft)] text-[var(--green-text)]',
    iconLabel: 'G',
    label: 'Green',
  },
  red: {
    badgeClassName: 'border-[var(--red-border)] bg-[var(--red-soft)] text-[var(--red-text)]',
    iconLabel: 'R',
    label: 'Red',
  },
  yellow: {
    badgeClassName: 'border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--amber-text)]',
    iconLabel: 'Y',
    label: 'Yellow',
  },
} as const satisfies Record<
  PublicPatientTriageState,
  {
    badgeClassName: string
    iconLabel: string
    label: string
  }
>

function formatAdmittedAt(value: string) {
  return admittedAtFormatter.format(new Date(value))
}

function PublicPatientTriageBadge({ triageState }: { triageState: PublicPatientTriageState }) {
  const tone = triageTone[triageState]

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

export function PublicPatientSummaryCard({
  patient,
  showPatientId = true,
}: PublicPatientSummaryCardProps) {
  return (
    <article className="rounded-[1.5rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="max-w-full text-lg font-semibold break-words sm:text-xl">{patient.name}</h3>
            {showPatientId ? (
              <span className="inline-flex max-w-full rounded-full border border-[var(--border-soft)] bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)] sm:text-sm">
                {patient.id}
              </span>
            ) : null}
            <PublicPatientTriageBadge triageState={patient.triageState} />
          </div>

          <div className="mt-3 flex flex-col gap-1 text-sm leading-6 text-[var(--text-secondary)] sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-2">
            <p>
              <span className="font-semibold text-[var(--text-primary)]">Phone:</span> {patient.phoneNumber}
            </p>
            <p>
              <span className="font-semibold text-[var(--text-primary)]">Admitted:</span>{' '}
              {formatAdmittedAt(patient.admittedAt)}
            </p>
          </div>
        </div>
      </div>
    </article>
  )
}
