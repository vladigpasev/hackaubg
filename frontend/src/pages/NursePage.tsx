import { PatientQueueRolePage } from './PatientQueueRolePage'

export function NursePage() {
  return (
    <PatientQueueRolePage
      canCheckoutPatients={false}
      canRegisterPatients={false}
      contextLabel="Nurse station"
    />
  )
}
