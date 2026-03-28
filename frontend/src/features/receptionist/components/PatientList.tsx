import type { Patient } from '../types/patient'
import { PatientCard } from './PatientCard'

interface CheckoutControls {
  isCheckingOutPatientId: string | null
  onCheckout: (patient: Patient) => void
}

interface PatientListProps {
  patients: Patient[]
  isOpeningMoreOptionsPatientId: string | null
  onOpenMoreOptions: (patient: Patient) => void
  checkoutControls?: CheckoutControls
}

export function PatientList({
  isOpeningMoreOptionsPatientId,
  onOpenMoreOptions,
  patients,
  checkoutControls,
}: PatientListProps) {
  return (
    <div className="space-y-4">
      {patients.map((patient) => (
        <PatientCard
          isOpeningMoreOptions={isOpeningMoreOptionsPatientId === patient.id}
          key={patient.id}
          onOpenMoreOptions={onOpenMoreOptions}
          patient={patient}
          checkoutAction={
            checkoutControls
              ? {
                  isCheckingOut: checkoutControls.isCheckingOutPatientId === patient.id,
                  onCheckout: checkoutControls.onCheckout,
                }
              : undefined
          }
        />
      ))}
    </div>
  )
}
