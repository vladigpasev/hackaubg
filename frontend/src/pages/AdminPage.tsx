import { useState, type FormEvent } from 'react'
import { formatRoleLabel } from '../auth/roles'
import { useAuth } from '../auth/useAuth'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '')

interface ArchivedUser {
  username: string
  role: string
  isTester: boolean
  specialties: string[]
}

interface ArchivedPatient {
  id: string
  name: string
  phone_number: string
  triage_state: string
  admitted_at: string
  notes: string[]
}

interface ArchiveResponse {
  date: string
  users: Record<string, ArchivedUser>
  patients: ArchivedPatient[]
}

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function toLocalDateTimeInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value))
}

function getErrorMessage(payload: unknown, fallbackMessage: string) {
  if (!payload || typeof payload !== 'object' || !('message' in payload)) {
    return fallbackMessage
  }

  const message = (payload as { message?: unknown }).message

  if (typeof message === 'string' && message.trim().length > 0) {
    return message
  }

  if (Array.isArray(message)) {
    const firstMessage = message.find((item): item is string => typeof item === 'string' && item.trim().length > 0)

    if (firstMessage) {
      return firstMessage
    }
  }

  return fallbackMessage
}

async function fetchArchive(dateTimeValue: string): Promise<ArchiveResponse> {
  const targetDate = new Date(dateTimeValue)

  if (Number.isNaN(targetDate.getTime())) {
    throw new Error('Enter a valid date and time.')
  }

  const response = await fetch(
    `${API_BASE_URL}/patient/archive/${encodeURIComponent(targetDate.toISOString())}`,
    {
      credentials: 'include',
      method: 'GET',
    },
  )

  const payload: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      getErrorMessage(payload, 'Archived records are unavailable right now.'),
    )
  }

  return payload as ArchiveResponse
}

export function AdminPage() {
  const { logout, user } = useAuth()
  const activeUser = user!
  const [archive, setArchive] = useState<ArchiveResponse | null>(null)
  const [dateTimeValue, setDateTimeValue] = useState(() =>
    toLocalDateTimeInputValue(new Date()),
  )
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const archivedUsers = archive
    ? Object.values(archive.users).sort((left, right) =>
        left.username.localeCompare(right.username),
      )
    : []

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const nextArchive = await fetchArchive(dateTimeValue)
      setArchive(nextArchive)
    } catch (nextError) {
      setArchive(null)
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Archived records are unavailable right now.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[var(--app-bg)] px-4 py-6 text-[var(--text-primary)] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="rounded-[1.5rem] border border-[var(--border-soft)] bg-white/92 p-5 shadow-[0_18px_50px_rgba(19,56,78,0.06)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--teal-border)] bg-[var(--teal-soft)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--teal-strong)]">
                Archive console
              </span>
              <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">
                Review archived hospital state by Sofia date.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
                Use an exact date and time to load the archive bundle resolved on the backend. This page is limited to
                admin users and keeps archival inspection separate from the live clinical queue.
              </p>
            </div>

            <div className="flex w-full max-w-md flex-col gap-3 rounded-[1.25rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Signed in
                </p>
                <p className="mt-2 text-base font-semibold text-[var(--text-primary)]">
                  {activeUser.username}
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {formatRoleLabel(activeUser.role)} access is active.
                </p>
              </div>
              <button
                className="min-h-12 rounded-full border border-[var(--border-soft)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
                onClick={() => {
                  void logout()
                }}
                type="button"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-6 xl:grid-cols-[minmax(320px,360px)_minmax(0,1fr)]">
          <section className="rounded-[1.35rem] border border-[var(--border-soft)] bg-white p-5 shadow-[0_16px_36px_rgba(19,56,78,0.05)]">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Archive lookup
            </p>
            <form className="mt-4 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
              <label className="block">
                <span className="text-sm font-semibold text-[var(--text-primary)]">Date and time</span>
                <input
                  className="mt-2 min-h-12 w-full rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-2.5 text-sm outline-none transition focus:border-[var(--teal-strong)]"
                  onChange={(event) => setDateTimeValue(event.target.value)}
                  type="datetime-local"
                  value={dateTimeValue}
                />
              </label>

              <p className="text-sm leading-6 text-[var(--text-secondary)]">
                The backend resolves the archive folder using Sofia time and reads archived patients plus the archived
                users summary from the same bundle.
              </p>

              <button
                className="min-h-12 w-full rounded-[1rem] border border-[var(--teal-strong)] bg-[var(--teal)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--teal-strong)] disabled:opacity-60"
                disabled={isLoading}
                type="submit"
              >
                {isLoading ? 'Loading archive...' : 'Load archive'}
              </button>
            </form>

            {error ? (
              <div className="mt-4 rounded-[1rem] border border-[var(--red-border)] bg-[var(--red-soft)] p-4 text-sm font-semibold text-[var(--red-text)]">
                {error}
              </div>
            ) : null}
          </section>

          <section className="space-y-6">
            <section className="grid gap-3 sm:grid-cols-3">
              {[
                ['Archive date', archive?.date ?? 'Not loaded'],
                ['Archived users', archive ? String(archivedUsers.length) : '0'],
                ['Archived patients', archive ? String(archive.patients.length) : '0'],
              ].map(([label, value]) => (
                <article
                  key={label}
                  className="rounded-[1rem] border border-[var(--border-soft)] bg-white px-4 py-4 shadow-[0_12px_32px_rgba(19,56,78,0.04)]"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    {label}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-[var(--text-primary)] break-words">{value}</p>
                </article>
              ))}
            </section>

            <section className="rounded-[1.35rem] border border-[var(--border-soft)] bg-white p-5 shadow-[0_16px_36px_rgba(19,56,78,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Archived users</h2>
                {archive ? (
                  <span className="text-xs text-[var(--text-muted)]">Sorted by username</span>
                ) : null}
              </div>

              {!archive ? (
                <div className="mt-4 rounded-[1rem] bg-[var(--surface-soft)] px-4 py-10 text-center text-sm text-[var(--text-secondary)]">
                  Load an archive to inspect the users snapshot.
                </div>
              ) : archivedUsers.length === 0 ? (
                <div className="mt-4 rounded-[1rem] bg-[var(--surface-soft)] px-4 py-10 text-center text-sm text-[var(--text-secondary)]">
                  No archived users were found for this date.
                </div>
              ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {archivedUsers.map((archivedUser) => (
                    <article
                      key={archivedUser.username}
                      className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-[var(--teal-border)] bg-[var(--teal-soft)] px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--teal-strong)]">
                          {archivedUser.role}
                        </span>
                        {archivedUser.isTester ? (
                          <span className="rounded-full border border-[var(--amber-border)] bg-[var(--amber-soft)] px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--amber-text)]">
                            Tester
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{archivedUser.username}</p>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        {archivedUser.specialties.length > 0
                          ? archivedUser.specialties.join(' • ')
                          : 'No specialties archived'}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-[1.35rem] border border-[var(--border-soft)] bg-white p-5 shadow-[0_16px_36px_rgba(19,56,78,0.05)]">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Archived patients</h2>

              {!archive ? (
                <div className="mt-4 rounded-[1rem] bg-[var(--surface-soft)] px-4 py-10 text-center text-sm text-[var(--text-secondary)]">
                  Load an archive to inspect archived patients.
                </div>
              ) : archive.patients.length === 0 ? (
                <div className="mt-4 rounded-[1rem] bg-[var(--surface-soft)] px-4 py-10 text-center text-sm text-[var(--text-secondary)]">
                  No patients were archived for this date.
                </div>
              ) : (
                <div className="mt-4 grid gap-3">
                  {archive.patients.map((patient) => (
                    <article
                      key={patient.id}
                      className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-[var(--border-soft)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                          {patient.triage_state}
                        </span>
                        <span className="rounded-full border border-[var(--border-soft)] bg-white px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                          {patient.id}
                        </span>
                      </div>
                      <h3 className="mt-3 text-base font-semibold text-[var(--text-primary)]">{patient.name}</h3>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">{patient.phone_number}</p>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        Admitted {formatDateTime(patient.admitted_at)}
                      </p>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        Notes archived: {patient.notes.length}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>
        </section>
      </div>
    </main>
  )
}
