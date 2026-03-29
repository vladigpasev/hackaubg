import { TriageBadge } from './TriageBadge'
import { getDoctorLabelById, isVisitBlocked } from '../utils/patientQueue'
import type { DoctorProfile, Patient, PatientLabBatch } from '../types/patient'

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  month: 'short',
})

function formatTime(value: string) {
  return dateTimeFormatter.format(new Date(value))
}

function visitStatusLabel(status: Patient['agenda'][number] extends infer Entry
  ? Entry extends { entryType: 'doctor_visit'; status: infer Status }
    ? Status
    : never
  : never) {
  switch (status) {
    case 'with_staff':
      return 'With doctor'
    case 'queued':
      return 'Queued'
    case 'not_here':
      return 'Not here'
    case 'done':
      return 'Done'
  }
}

function batchStatusLabel(batch: PatientLabBatch) {
  switch (batch.status) {
    case 'collecting':
      return 'Collecting tests'
    case 'waiting_results':
      return 'Waiting for results'
    case 'results_ready':
      return 'Results ready'
    case 'return_created':
      return 'Return added'
  }
}

function itemStatusLabel(status: PatientLabBatch['items'][number]['status']) {
  switch (status) {
    case 'with_staff':
      return 'With lab'
    case 'queued':
      return 'Queued'
    case 'not_here':
      return 'Not here'
    case 'taken':
      return 'Taken'
    case 'results_ready':
      return 'Results ready'
  }
}

interface PatientAgendaTimelineProps {
  doctors: DoctorProfile[]
  patient: Patient
}

export function PatientAgendaTimeline({ doctors, patient }: PatientAgendaTimelineProps) {
  const sortedAgenda = [...patient.agenda].sort((left, right) => {
    const createdAtDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()

    if (createdAtDelta !== 0) {
      return createdAtDelta
    }

    return left.id.localeCompare(right.id)
  })

  if (sortedAgenda.length === 0) {
    return (
      <div className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-secondary)]">
        No agenda steps yet.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {sortedAgenda.map((entry) => {
        if (entry.entryType === 'doctor_visit') {
          const blocked = isVisitBlocked(patient, entry)

          return (
            <article
              key={entry.id}
              className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[var(--teal-border)] bg-[var(--teal-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--teal-strong)]">
                  Doctor
                </span>
                <TriageBadge triageState={entry.code} />
                <span className="rounded-full border border-[var(--border-soft)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                  {visitStatusLabel(entry.status)}
                </span>
                {entry.isReturnVisit ? (
                  <span className="rounded-full border border-[var(--blue-border)] bg-[var(--blue-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--blue-text)]">
                    Return
                  </span>
                ) : null}
                {blocked ? (
                  <span className="rounded-full border border-[var(--amber-border)] bg-[var(--amber-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--amber-text)]">
                    Blocked until tests are taken
                  </span>
                ) : null}
              </div>

              <div className="mt-3 flex flex-col gap-1">
                <p className="text-base font-semibold text-[var(--text-primary)]">{entry.specialty}</p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {getDoctorLabelById(doctors, entry.assignedDoctorId)}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {entry.requestedByLabel} · {formatTime(entry.createdAt)}
                </p>
                {entry.note ? (
                  <p className="text-sm text-[var(--text-secondary)]">{entry.note}</p>
                ) : null}
              </div>
            </article>
          )
        }

        return (
          <article
            key={entry.id}
            className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[var(--purple-border)] bg-[var(--purple-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--purple-text)]">
                Lab batch
              </span>
              <span className="rounded-full border border-[var(--border-soft)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                {batchStatusLabel(entry)}
              </span>
            </div>

            <div className="mt-3 flex flex-col gap-1">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Ordered by {entry.orderedByLabel}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Return to {entry.returnSpecialty} · {formatTime(entry.createdAt)}
              </p>
              {entry.note ? (
                <p className="text-sm text-[var(--text-secondary)]">{entry.note}</p>
              ) : null}
            </div>

            <div className="mt-3 space-y-2">
              {entry.items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[0.95rem] border border-[var(--border-soft)] bg-white px-3 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <TriageBadge triageState={item.code} />
                    <span className="rounded-full border border-[var(--border-soft)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
                      {itemStatusLabel(item.status)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{item.testName}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {item.testerSpecialty} · {getDoctorLabelById(doctors, item.assignedDoctorId)}
                  </p>
                  {item.resultsReadyAt ? (
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Results ready at {formatTime(item.resultsReadyAt)}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </article>
        )
      })}
    </div>
  )
}
