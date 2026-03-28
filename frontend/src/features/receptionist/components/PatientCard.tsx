import type { Patient } from '../types/patient'
import { TriageBadge } from './TriageBadge'

interface CheckoutAction {
  isCheckingOut: boolean
  onCheckout: (patient: Patient) => void
}

interface PatientCardProps {
  patient: Patient
  isOpeningMoreOptions?: boolean
  onOpenMoreOptions?: (patient: Patient) => void
  checkoutAction?: CheckoutAction
  showPatientId?: boolean
}

const admittedAtFormatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatAdmittedAt(value: string) {
  return admittedAtFormatter.format(new Date(value))
}

export function PatientCard({
  isOpeningMoreOptions = false,
  onOpenMoreOptions,
  patient,
  checkoutAction,
  showPatientId = true,
}: PatientCardProps) {
  const showMoreOptionsButton = typeof onOpenMoreOptions === 'function'
  const showActions = showMoreOptionsButton || Boolean(checkoutAction)

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
            <TriageBadge triageState={patient.triageState} />
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

        {showActions ? (
          <div
            className={`flex w-full flex-col gap-3 sm:w-auto ${
              checkoutAction ? 'sm:min-w-60 sm:flex-row' : 'sm:min-w-44'
            }`}
          >
            {showMoreOptionsButton ? (
              <button
                className="min-h-12 rounded-[1.05rem] border border-[var(--border-soft)] bg-white px-4 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
                disabled={isOpeningMoreOptions}
                onClick={() => onOpenMoreOptions(patient)}
                type="button"
              >
                {isOpeningMoreOptions ? 'Loading options...' : 'More Options'}
              </button>
            ) : null}
            {checkoutAction ? (
              <button
                className="min-h-12 rounded-[1.05rem] border border-[var(--red-border)] bg-[var(--red-soft)] px-4 py-3 text-sm font-semibold text-[var(--red-text)] transition hover:bg-[#f8dddb] disabled:cursor-not-allowed disabled:opacity-70"
                disabled={checkoutAction.isCheckingOut}
                onClick={() => checkoutAction.onCheckout(patient)}
                type="button"
              >
                {checkoutAction.isCheckingOut ? 'Checking out...' : 'Checkout'}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  )
}
