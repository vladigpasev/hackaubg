import { PatientQueueRolePage } from './PatientQueueRolePage'

export function RegistryPage() {
  return (
    <PatientQueueRolePage
      canCheckoutPatients
      canRegisterPatients
      contextLabel="Registry desk"
    />
  )
}
