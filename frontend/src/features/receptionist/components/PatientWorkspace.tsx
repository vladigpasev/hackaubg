import type { Patient } from '../types/patient'
import type { FeedbackState } from '../hooks/usePatientWorkspace'
import type { PatientQueueSummary } from '../utils/buildPatientQueueSummary'
import { PatientList } from './PatientList'

interface CheckoutControls {
  isCheckingOutPatientId: string | null
  onCheckout: (patient: Patient) => void
}

interface RegisterAction {
  label: string
  onOpen: () => void
}

interface PatientWorkspaceProps {
  badgeLabel: string
  username: string
  isOnline: boolean
  onGoOffline: () => void
  onGoOnline: () => void
  onSignOut: () => Promise<void>
  patients: Patient[]
  summary: PatientQueueSummary
  isLoading: boolean
  loadError: string | null
  onRetryLoad: () => void
  isOpeningMoreOptionsPatientId: string | null
  onOpenMoreOptions: (patient: Patient) => void
  checkoutControls?: CheckoutControls | null
  registerAction?: RegisterAction | null
  feedback: FeedbackState | null
}

export function PatientWorkspace({
  badgeLabel,
  checkoutControls,
  feedback,
  isLoading,
  isOnline,
  isOpeningMoreOptionsPatientId,
  loadError,
  onGoOffline,
  onGoOnline,
  onOpenMoreOptions,
  onRetryLoad,
  onSignOut,
  patients,
  registerAction,
  summary,
  username,
}: PatientWorkspaceProps) {
  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)]">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-5 px-5 py-6 sm:px-8 lg:px-10">
        <div className="relative">
          <div
            aria-hidden={isOnline ? undefined : 'true'}
            className={isOnline ? 'space-y-5' : 'pointer-events-none space-y-5 blur-[6px]'}
          >
            <header className="flex flex-col gap-4 rounded-[1.75rem] border border-[var(--border-soft)] bg-white/90 px-5 py-4 shadow-[0_24px_80px_rgba(21,54,74,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="min-w-0">
                <div className="inline-flex max-w-full flex-wrap items-center gap-3 rounded-full border border-[var(--teal-border)] bg-[var(--teal-soft)] px-4 py-2 text-sm font-semibold tracking-[0.18em] text-[var(--teal-strong)] uppercase">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--teal)]" />
                  {badgeLabel}
                </div>
                <h1 className="mt-3 text-3xl font-semibold leading-tight break-words sm:text-4xl">
                  Patients
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                <span
                  className={`inline-flex max-w-full items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold ${
                    isOnline
                      ? 'border border-[var(--green-border)] bg-[var(--green-soft)] text-[var(--green-text)]'
                      : 'border border-[var(--border-soft)] bg-[var(--surface-secondary)] text-[var(--text-secondary)]'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full bg-current/12 text-[10px] font-bold ${
                      isOnline
                        ? ''
                        : 'border border-[var(--border-soft)] bg-white text-[var(--text-secondary)]'
                    }`}
                  >
                    {isOnline ? 'OK' : 'PA'}
                  </span>
                  {isOnline ? 'Live' : 'On break'}
                </span>
                <div className="rounded-full border border-[var(--border-soft)] bg-white px-4 py-2 text-sm text-[var(--text-secondary)]">
                  <span className="font-semibold text-[var(--text-primary)]">{username}</span>
                </div>
                {isOnline ? (
                  <button
                    className="min-h-12 rounded-[1rem] border border-[var(--border-soft)] bg-white px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
                    onClick={onGoOffline}
                    type="button"
                  >
                    Take a break
                  </button>
                ) : null}
                <button
                  className="min-h-12 rounded-[1rem] border border-[var(--border-soft)] bg-white px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
                  onClick={() => {
                    void onSignOut()
                  }}
                  type="button"
                >
                  Sign out
                </button>
              </div>
            </header>

            <section className="grid gap-4 sm:grid-cols-3">
              <article className="rounded-[1.5rem] border border-[var(--border-soft)] bg-white px-4 py-4 shadow-[0_16px_36px_rgba(19,56,78,0.05)]">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Total queue
                </p>
                <p className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">
                  {summary.totalCount}
                </p>
              </article>

              <article className="rounded-[1.5rem] border border-[var(--border-soft)] bg-white px-4 py-4 shadow-[0_16px_36px_rgba(19,56,78,0.05)]">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Needs attention
                </p>
                <p className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">
                  {summary.attentionCount}
                </p>
              </article>

              <article className="rounded-[1.5rem] border border-[var(--border-soft)] bg-white px-4 py-4 shadow-[0_16px_36px_rgba(19,56,78,0.05)]">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  First in queue
                </p>
                <p className="mt-3 text-lg font-semibold text-[var(--text-primary)]">
                  {summary.firstInQueueLabel}
                </p>
              </article>
            </section>

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <section className="rounded-[2rem] border border-[var(--border-soft)] bg-white p-5 shadow-[0_18px_50px_rgba(19,56,78,0.06)] sm:p-6">
                <div className="flex flex-col gap-4 border-b border-[var(--border-soft)] pb-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-semibold break-words">Current queue</h2>
                    <span className="inline-flex rounded-full border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-1.5 text-sm font-semibold text-[var(--text-secondary)]">
                      {summary.totalCount} patients
                    </span>
                  </div>

                  {registerAction ? (
                    <button
                      className="min-h-14 rounded-[1.2rem] border border-[var(--teal-strong)] bg-[var(--teal)] px-5 text-base font-semibold text-white shadow-[0_18px_40px_rgba(15,143,138,0.22)] transition hover:bg-[var(--teal-strong)]"
                      onClick={registerAction.onOpen}
                      type="button"
                    >
                      {registerAction.label}
                    </button>
                  ) : null}
                </div>

                <div className="mt-5">
                  {isLoading ? (
                    <div className="rounded-[1.5rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-8 text-center text-sm leading-6 text-[var(--text-secondary)]">
                      Loading patients...
                    </div>
                  ) : loadError ? (
                    <div className="rounded-[1.5rem] border border-[var(--red-border)] bg-[var(--red-soft)] p-4">
                      <p className="text-sm font-semibold text-[var(--red-text)]">{loadError}</p>
                      <button
                        className="mt-4 min-h-12 rounded-[1.05rem] border border-[var(--border-soft)] bg-white px-4 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
                        onClick={onRetryLoad}
                        type="button"
                      >
                        Retry
                      </button>
                    </div>
                  ) : patients.length === 0 ? (
                    <div className="rounded-[1.5rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-8 text-center">
                      <p className="text-lg font-semibold text-[var(--text-primary)]">No patients yet.</p>
                    </div>
                  ) : (
                    <PatientList
                      checkoutControls={checkoutControls ?? undefined}
                      isOpeningMoreOptionsPatientId={isOpeningMoreOptionsPatientId}
                      onOpenMoreOptions={onOpenMoreOptions}
                      patients={patients}
                    />
                  )}
                </div>
              </section>

              <aside className="hidden xl:flex xl:flex-col xl:gap-5">
                <section className="rounded-[1.75rem] border border-[var(--border-soft)] bg-white p-5 shadow-[0_16px_36px_rgba(19,56,78,0.05)]">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    Triage overview
                  </p>
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between rounded-[1.1rem] border border-[var(--border-soft)] bg-[var(--surface-secondary)] px-4 py-3">
                      <span className="font-semibold text-[var(--text-secondary)]">Unknown</span>
                      <span className="text-lg font-semibold text-[var(--text-secondary)]">
                        {summary.triageCounts.unknown}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-[1.1rem] border border-[var(--green-border)] bg-[var(--green-soft)] px-4 py-3">
                      <span className="font-semibold text-[var(--green-text)]">Green</span>
                      <span className="text-lg font-semibold text-[var(--green-text)]">
                        {summary.triageCounts.green}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-[1.1rem] border border-[var(--amber-border)] bg-[var(--amber-soft)] px-4 py-3">
                      <span className="font-semibold text-[var(--amber-text)]">Yellow</span>
                      <span className="text-lg font-semibold text-[var(--amber-text)]">
                        {summary.triageCounts.yellow}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-[1.1rem] border border-[var(--red-border)] bg-[var(--red-soft)] px-4 py-3">
                      <span className="font-semibold text-[var(--red-text)]">Red</span>
                      <span className="text-lg font-semibold text-[var(--red-text)]">
                        {summary.triageCounts.red}
                      </span>
                    </div>
                  </div>
                </section>
              </aside>
            </section>
          </div>

          {!isOnline ? (
            <div className="absolute inset-0 z-10 flex items-start justify-center rounded-[2rem] bg-[rgba(244,248,251,0.38)] px-4 py-4 sm:items-center sm:py-6">
              <div className="w-full max-w-md rounded-[1.75rem] border border-[var(--border-soft)] bg-white/96 p-6 text-center shadow-[0_24px_80px_rgba(21,54,74,0.12)] backdrop-blur">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Break mode
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
                  You are offline for updates.
                </h2>
                <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                  Live patient events are paused until you reconnect.
                </p>
                <button
                  className="mt-5 min-h-14 rounded-[1.2rem] border border-[var(--teal-strong)] bg-[var(--teal)] px-5 text-base font-semibold text-white shadow-[0_18px_40px_rgba(15,143,138,0.22)] transition hover:bg-[var(--teal-strong)]"
                  onClick={onGoOnline}
                  type="button"
                >
                  Get back online
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {feedback ? (
        <div className="pointer-events-none fixed right-4 bottom-4 z-40 w-full max-w-sm sm:right-6 sm:bottom-6">
          <section
            className={`rounded-[1.35rem] border px-4 py-3 text-base font-semibold leading-6 shadow-[0_24px_60px_rgba(18,42,56,0.2)] backdrop-blur ${
              feedback.tone === 'success'
                ? 'border-[var(--teal-strong)] bg-[var(--teal-soft)] text-[var(--teal-strong)]'
                : 'border-[var(--red-text)] bg-[var(--red-soft)] text-[var(--red-text)]'
            }`}
            role="status"
          >
            {feedback.message}
          </section>
        </div>
      ) : null}
    </main>
  )
}
