import type { Patient } from '../types/patient'
import { PatientCard } from './PatientCard'

interface PatientListProps {
  patients: Patient[]
  isCheckingOutPatientId: string | null
  isOpeningMoreOptionsPatientId: string | null
  onCheckout: (patient: Patient) => void
  onOpenMoreOptions: (patient: Patient) => void
}

export function PatientList({
  isCheckingOutPatientId,
  isOpeningMoreOptionsPatientId,
  onCheckout,
  onOpenMoreOptions,
  patients,
}: PatientListProps) {
  return (
    <div className="space-y-4">
      {patients.map((patient) => (
        <PatientCard
          isCheckingOut={isCheckingOutPatientId === patient.id}
          isOpeningMoreOptions={isOpeningMoreOptionsPatientId === patient.id}
          key={patient.id}
          onCheckout={onCheckout}
          onOpenMoreOptions={onOpenMoreOptions}
          patient={patient}
        />
      ))}
    </div>
  )
}
