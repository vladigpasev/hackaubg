import { useEffect } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { patientEventStream } from '../services/mockPatientEventStream'
import {
  addPatientFromEventAtom,
  isPatientQueueOnlineAtom,
  removePatientFromEventAtom,
} from '../state/patientAtoms'

export function PatientEventBridge() {
  const isPatientQueueOnline = useAtomValue(isPatientQueueOnlineAtom)
  const addPatientFromEvent = useSetAtom(addPatientFromEventAtom)
  const removePatientFromEvent = useSetAtom(removePatientFromEventAtom)

  useEffect(() => {
    if (!isPatientQueueOnline) {
      return
    }

    const unsubscribePatientNew = patientEventStream.subscribe('patient:new', addPatientFromEvent)
    const unsubscribePatientCheckout = patientEventStream.subscribe(
      'patient:checkout',
      removePatientFromEvent,
    )

    return () => {
      unsubscribePatientNew()
      unsubscribePatientCheckout()
    }
  }, [addPatientFromEvent, isPatientQueueOnline, removePatientFromEvent])

  return null
}
