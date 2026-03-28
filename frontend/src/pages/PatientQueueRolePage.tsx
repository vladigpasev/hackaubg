import { useAuth } from '../auth/useAuth'
import { CheckoutConfirmModal } from '../features/receptionist/components/CheckoutConfirmModal'
import { PatientMoreOptionsModal } from '../features/receptionist/components/PatientMoreOptionsModal'
import { PatientWorkspace } from '../features/receptionist/components/PatientWorkspace'
import { RegisterPatientModal } from '../features/receptionist/components/RegisterPatientModal'
import { PatientEventBridge } from '../features/receptionist/realtime/PatientEventBridge'
import { usePatientWorkspace } from '../features/receptionist/hooks/usePatientWorkspace'

interface PatientQueueRolePageProps {
  contextLabel: string
  canRegisterPatients: boolean
  canCheckoutPatients: boolean
}

export function PatientQueueRolePage({
  canCheckoutPatients,
  canRegisterPatients,
  contextLabel,
}: PatientQueueRolePageProps) {
  const { logout, user } = useAuth()
  const activeUser = user!
  const workspace = usePatientWorkspace({
    canCheckoutPatients,
    canRegisterPatients,
  })

  return (
    <>
      <PatientEventBridge />
      <PatientWorkspace
        badgeLabel={contextLabel}
        checkoutControls={workspace.checkoutControls}
        feedback={workspace.feedback}
        isLoading={workspace.isLoading}
        isOnline={workspace.isPatientQueueOnline}
        isOpeningMoreOptionsPatientId={workspace.patientDetailsControls.isOpeningMoreOptionsPatientId}
        loadError={workspace.loadError}
        onGoOffline={workspace.goOffline}
        onGoOnline={workspace.goOnline}
        onOpenMoreOptions={workspace.patientDetailsControls.onOpenMoreOptions}
        onRetryLoad={workspace.reloadPatients}
        onSignOut={logout}
        patients={workspace.patients}
        registerAction={
          workspace.registerControls
            ? {
                label: 'Register New Patient',
                onOpen: workspace.registerControls.onOpen,
              }
            : null
        }
        summary={workspace.summary}
        username={activeUser.username}
      />

      {workspace.registerControls ? (
        <RegisterPatientModal
          contextLabel={contextLabel}
          isSubmitting={workspace.registerControls.isSubmitting}
          onClose={workspace.registerControls.onClose}
          onSubmit={workspace.registerControls.onSubmit}
          open={workspace.registerControls.open}
        />
      ) : null}

      {workspace.checkoutControls ? (
        <CheckoutConfirmModal
          contextLabel={contextLabel}
          isSubmitting={workspace.checkoutControls.modal.isSubmitting}
          onClose={workspace.checkoutControls.modal.onClose}
          onConfirm={workspace.checkoutControls.modal.onConfirm}
          open={workspace.checkoutControls.modal.open}
          patient={workspace.checkoutControls.modal.patient}
        />
      ) : null}

      <PatientMoreOptionsModal
        contextLabel={contextLabel}
        onClose={workspace.patientDetailsControls.onClose}
        open={workspace.patientDetailsControls.open}
        patient={workspace.patientDetailsControls.patient}
      />
    </>
  )
}
