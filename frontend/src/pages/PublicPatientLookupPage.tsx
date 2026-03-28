import { useNavigate } from 'react-router-dom'
import { PublicPatientLookupForm } from '../features/public-patient/components/PublicPatientLookupForm'
import { PublicPatientShell } from '../features/public-patient/components/PublicPatientShell'

export function PublicPatientLookupPage() {
  const navigate = useNavigate()

  return (
    <PublicPatientShell
      description="Enter the phone number used during registration to view the current hospital status, triage, notes, referrals, and live updates for that patient."
      eyebrow="Public patient access"
      title="Track your hospital visit."
    >
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] xl:items-stretch">
        <article className="rounded-[2rem] border border-[var(--border-soft)] bg-white p-6 shadow-[0_20px_56px_rgba(19,56,78,0.06)] sm:p-7 lg:p-8">
          <PublicPatientLookupForm
            onSubmit={(phoneNumber) => {
              navigate(`/public/patient/${encodeURIComponent(phoneNumber)}`)
            }}
          />
        </article>

        <aside className="relative overflow-hidden rounded-[2rem] border border-[var(--border-soft)] bg-[linear-gradient(160deg,rgba(255,255,255,0.98)_0%,rgba(230,246,245,0.95)_48%,rgba(237,244,247,0.95)_100%)] p-6 shadow-[0_24px_70px_rgba(19,56,78,0.08)] sm:p-7 lg:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-12 right-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(15,143,138,0.22),_transparent_70%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 left-0 h-44 w-44 translate-x-[-28%] translate-y-[24%] rounded-full bg-[radial-gradient(circle,_rgba(75,131,184,0.18),_transparent_72%)]"
          />

          <div className="relative">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--teal-strong)]">
              Patient snapshot
            </p>
            <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.03em] text-[var(--text-primary)]">
              One number opens the live visit board.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
              The patient page is designed like a calm status board: clear triage, current notes, pending steps, and a
              live stream connection that keeps the record fresh while care teams update it.
            </p>

            <div className="mt-7 grid gap-3 sm:gap-4">
              <article className="rounded-[1.4rem] border border-white/80 bg-white/88 p-4 shadow-[0_14px_30px_rgba(19,56,78,0.06)] backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    Active page
                  </p>
                  <span className="inline-flex items-center gap-2 rounded-full border border-[var(--green-border)] bg-[var(--green-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--green-text)]">
                    <span className="h-2 w-2 rounded-full bg-[var(--green)]" />
                    Live
                  </span>
                </div>
                <p className="mt-3 text-lg font-semibold text-[var(--text-primary)]">
                  Status, notes, referrals, and queue updates in one place.
                </p>
              </article>

              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <article className="rounded-[1.3rem] border border-white/80 bg-white/78 px-4 py-4 backdrop-blur">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    Triage
                  </p>
                  <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">Immediate clarity</p>
                </article>

                <article className="rounded-[1.3rem] border border-white/80 bg-white/78 px-4 py-4 backdrop-blur">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    Notes
                  </p>
                  <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">Care team context</p>
                </article>

                <article className="rounded-[1.3rem] border border-white/80 bg-white/78 px-4 py-4 backdrop-blur">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    Queue
                  </p>
                  <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">Pending next steps</p>
                </article>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </PublicPatientShell>
  )
}
