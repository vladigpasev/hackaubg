import type { Patient } from '../types/patient'
import { Modal } from './Modal'

interface PatientMoreOptionsModalProps {
  open: boolean
  patient: Patient | null
  onClose: () => void
}

export function PatientMoreOptionsModal({ onClose, open, patient }: PatientMoreOptionsModalProps) {
  return (
    <Modal
      description="This placeholder keeps the fetch-and-open flow ready for fuller patient details later without changing the receptionist list architecture."
      footer={
        <button
          className="min-h-12 rounded-[1.05rem] border border-[var(--border-soft)] bg-white px-5 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      }
      onClose={onClose}
      open={open}
      title={patient ? `${patient.name} options` : 'Patient options'}
    >
      <div className="space-y-4">
        {patient ? (
          <div className="rounded-[1.35rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              Current patient
            </p>
            <p className="mt-3 text-lg font-semibold text-[var(--text-primary)]">{patient.name}</p>
            <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{patient.phoneNumber}</p>
          </div>
        ) : null}

        <div className="rounded-[1.35rem] border border-[var(--border-soft)] bg-white px-4 py-4">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            Details panel
          </p>
          <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">Soon</p>
        </div>
      </div>
    </Modal>
  )
}
