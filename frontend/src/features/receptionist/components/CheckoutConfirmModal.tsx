import type { Patient } from '../types/patient'
import { Modal } from './Modal'

interface CheckoutConfirmModalProps {
  open: boolean
  patient: Patient | null
  isSubmitting: boolean
  contextLabel?: string
  onClose: () => void
  onConfirm: () => void
}

export function CheckoutConfirmModal({
  contextLabel,
  isSubmitting,
  onClose,
  onConfirm,
  open,
  patient,
}: CheckoutConfirmModalProps) {
  return (
    <Modal
      contextLabel={contextLabel}
      description="Checkout removes the patient from the active queue through the live update flow."
      footer={
        <>
          <button
            className="min-h-12 rounded-[1.05rem] border border-[var(--border-soft)] bg-white px-5 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
            disabled={isSubmitting}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="min-h-12 rounded-[1.05rem] border border-[var(--red-border)] bg-[var(--red-soft)] px-5 py-3 text-sm font-semibold text-[var(--red-text)] transition hover:bg-[#f8dddb] disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSubmitting}
            onClick={onConfirm}
            type="button"
          >
            {isSubmitting ? 'Checking out...' : 'Yes, Checkout'}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      title="Confirm checkout"
    >
      <div className="rounded-[1.35rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4">
        <p className="text-base leading-7 text-[var(--text-secondary)]">
          {patient ? (
            <>
              Are you sure you want to checkout{' '}
              <span className="font-semibold text-[var(--text-primary)]">{patient.name}</span>?
            </>
          ) : (
            'Are you sure you want to checkout this patient?'
          )}
        </p>
      </div>
    </Modal>
  )
}
