import { useEffect } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { patientEventStream } from '../services/mockPatientEventStream'
import {
  addPatientFromEventAtom,
  isReceptionOnlineAtom,
  removePatientFromEventAtom,
} from '../state/patientAtoms'

export function PatientEventBridge() {
  const isReceptionOnline = useAtomValue(isReceptionOnlineAtom)
  const addPatientFromEvent = useSetAtom(addPatientFromEventAtom)
  const removePatientFromEvent = useSetAtom(removePatientFromEventAtom)

  useEffect(() => {
    if (!isReceptionOnline) {
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
  }, [addPatientFromEvent, isReceptionOnline, removePatientFromEvent])

  return null
}
