import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PublicPatientSummaryCard } from '../features/public-patient/components/PublicPatientSummaryCard'
import { PublicPatientShell } from '../features/public-patient/components/PublicPatientShell'
import {
  createPublicPatientStream,
  getPublicPatientByPhoneNumber,
  isPublicPatientNotFoundError,
  parsePublicPatientStreamEvent,
} from '../features/public-patient/services/publicPatientApi'
import type { PublicPatientDetails } from '../features/public-patient/types/publicPatient'

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatTimestamp(timestamp: string) {
  return dateFormatter.format(new Date(timestamp))
}

function humanizeSlug(value: string) {
  return value
    .split('-')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function formatActor(value: string) {
  return value
    .split('.')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

export function PublicPatientDetailsPage() {
  const { phoneNumber = '' } = useParams()
  const decodedPhoneNumber = decodeURIComponent(phoneNumber).trim()
  const [patient, setPatient] = useState<PublicPatientDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isCheckedOut, setIsCheckedOut] = useState(false)
  const requestSequenceRef = useRef(0)

  const refreshPatient = useCallback(
    async ({
      notFoundMessage,
      preservePatient,
      setLoading = false,
    }: {
      notFoundMessage: string
      preservePatient: boolean
      setLoading?: boolean
    }) => {
      const requestId = requestSequenceRef.current + 1
      requestSequenceRef.current = requestId

      if (setLoading) {
        setIsLoading(true)
      }

      try {
        const nextPatient = await getPublicPatientByPhoneNumber(decodedPhoneNumber)

        if (requestId !== requestSequenceRef.current) {
          return null
        }

        setPatient(nextPatient)
        setError(null)
        return nextPatient
      } catch (nextError) {
        if (requestId !== requestSequenceRef.current) {
          return null
        }

        const isNotFound = isPublicPatientNotFoundError(nextError)

        if (!preservePatient) {
          setPatient(null)
        }

        if (isNotFound && preservePatient) {
          setIsCheckedOut(true)
        }

        setError(
          isNotFound
            ? notFoundMessage
            : nextError instanceof Error
              ? nextError.message
              : 'Patient details are unavailable right now. Please try again.',
        )

        return null
      } finally {
        if (setLoading && requestId === requestSequenceRef.current) {
          setIsLoading(false)
        }
      }
    },
    [decodedPhoneNumber],
  )

  useEffect(() => {
    if (!decodedPhoneNumber) {
      requestSequenceRef.current += 1
      setPatient(null)
      setError('Enter the patient phone number.')
      setIsCheckedOut(false)
      setIsLoading(false)
      return
    }

    setError(null)
    setIsCheckedOut(false)
    setPatient(null)
    void refreshPatient({
      notFoundMessage: 'No active patient record was found for this phone number.',
      preservePatient: false,
      setLoading: true,
    })

    return () => {
      requestSequenceRef.current += 1
    }
  }, [decodedPhoneNumber, refreshPatient])

  useEffect(() => {
    if (!patient?.id || isCheckedOut) {
      return
    }

    const stream = createPublicPatientStream(patient.id)
    let isClosed = false

    stream.onopen = () => {
      if (isClosed) {
        return
      }
    }

    stream.onmessage = (event) => {
      if (isClosed) {
        return
      }

      const payload = parsePublicPatientStreamEvent(event)
      const eventType = payload?.type ?? 'patient:update'

      if (eventType === 'patient:check-out') {
        requestSequenceRef.current += 1
        setIsCheckedOut(true)
        stream.close()
        isClosed = true
        return
      }

      void refreshPatient({
        notFoundMessage: 'This patient is no longer active in the live hospital queue.',
        preservePatient: true,
      })
    }

    stream.onerror = () => {}

    return () => {
      isClosed = true
      stream.close()
    }
  }, [decodedPhoneNumber, isCheckedOut, patient?.id, refreshPatient])

  if (isLoading) {
    return (
      <PublicPatientShell
        description="We are loading the latest patient snapshot and opening the patient-specific live stream."
        eyebrow="Public patient access"
        title="Loading patient page"
      >
        <section className="rounded-[2rem] border border-[var(--border-soft)] bg-white p-6 text-base text-[var(--text-secondary)] shadow-[0_20px_56px_rgba(19,56,78,0.06)]">
          Loading patient details...
        </section>
      </PublicPatientShell>
    )
  }

  if (!patient) {
    return (
      <PublicPatientShell
        description="If the phone number is correct, the patient may already be checked out or not currently active in the live queue."
        eyebrow="Public patient access"
        title="Patient not available"
      >
        <section className="rounded-[2rem] border border-[var(--red-border)] bg-[var(--red-soft)] p-6 shadow-[0_20px_56px_rgba(181,65,61,0.08)]">
          <p className="text-lg font-semibold text-[var(--red-text)]">
            {error ?? 'Patient details are unavailable right now.'}
          </p>
        </section>
      </PublicPatientShell>
    )
  }
  return (
    <PublicPatientShell
      description="This page shows the current live record for the active patient visit tied to the phone number used at check-in."
      eyebrow="Public patient access"
      title={patient.name}
    >
      <section className="space-y-5">
        {error ? (
          <section className="rounded-[1.5rem] border border-[var(--red-border)] bg-[var(--red-soft)] px-4 py-4 text-sm leading-6 text-[var(--red-text)]">
            {error}
          </section>
        ) : null}

        {isCheckedOut ? (
          <section className="rounded-[1.5rem] border border-[var(--amber-border)] bg-[var(--amber-soft)] px-4 py-4 text-sm leading-6 text-[var(--amber-text)]">
            This patient has been checked out of the active hospital queue. The snapshot below is the last live state
            seen before checkout.
          </section>
        ) : null}
        <PublicPatientSummaryCard patient={patient} showPatientId={false} />

        <section className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-[1.75rem] border border-[var(--border-soft)] bg-white p-5 shadow-[0_16px_36px_rgba(19,56,78,0.05)]">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              Notes
            </p>
            <div className="mt-4 space-y-3">
              {patient.notes.length === 0 ? (
                <p className="text-sm leading-6 text-[var(--text-secondary)]">No notes have been attached yet.</p>
              ) : (
                patient.notes.map((note, index) => (
                  <article
                    className="rounded-[1.2rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-3"
                    key={`${note}-${index}`}
                  >
                    <p className="text-sm leading-6 text-[var(--text-secondary)]">{note}</p>
                  </article>
                ))
              )}
            </div>
          </article>

          <article className="rounded-[1.75rem] border border-[var(--border-soft)] bg-white p-5 shadow-[0_16px_36px_rgba(19,56,78,0.05)]">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              Current queue
            </p>
            <div className="mt-4 space-y-3">
              {patient.queue.length === 0 ? (
                <p className="text-sm leading-6 text-[var(--text-secondary)]">
                  There are no pending queue items right now.
                </p>
              ) : (
                patient.queue.map((entry) => (
                  <article
                    className="rounded-[1.2rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-3"
                    key={`${entry.specialty}-${entry.timestamp}-${entry.refferedById}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-base font-semibold text-[var(--text-primary)]">
                        {humanizeSlug(entry.specialty)}
                      </p>
                      <span className="rounded-full border border-[var(--amber-border)] bg-[var(--amber-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--amber-text)]">
                        Waiting
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                      Requested by {formatActor(entry.refferedById)}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                      Added {formatTimestamp(entry.timestamp)}
                    </p>
                  </article>
                ))
              )}
            </div>
          </article>
        </section>

        <section className="rounded-[1.75rem] border border-[var(--border-soft)] bg-white p-5 shadow-[0_16px_36px_rgba(19,56,78,0.05)]">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            Referral history
          </p>
          <div className="mt-4 space-y-3">
            {patient.history.length === 0 ? (
              <p className="text-sm leading-6 text-[var(--text-secondary)]">No referral history is available yet.</p>
            ) : (
              patient.history.map((entry) => (
                <article
                  className="rounded-[1.2rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-3"
                  key={`${entry.specialty}-${entry.timestamp}-${entry.refferedById}-${entry.refferedToId}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-base font-semibold text-[var(--text-primary)]">
                      {humanizeSlug(entry.specialty)}
                    </p>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                        entry.isDone
                          ? 'border border-[var(--green-border)] bg-[var(--green-soft)] text-[var(--green-text)]'
                          : 'border border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--amber-text)]'
                      }`}
                    >
                      {entry.isDone ? 'Done' : 'Pending'}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                    {formatActor(entry.refferedById)} sent this case to {formatActor(entry.refferedToId)}.
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                    Logged {formatTimestamp(entry.timestamp)}
                  </p>
                </article>
              ))
            )}
          </div>
        </section>
      </section>
    </PublicPatientShell>
  )
}
