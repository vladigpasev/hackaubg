import type { PatientCheckoutEvent, Patient } from '../types/patient'

export interface PatientEventMap {
  'patient:new': Patient
  'patient:checkout': PatientCheckoutEvent
}

type EventName = keyof PatientEventMap
type EventListener<TEventName extends EventName> = (payload: PatientEventMap[TEventName]) => void

class MockPatientEventStream {
  private listeners = new Map<EventName, Set<EventListener<EventName>>>()

  subscribe<TEventName extends EventName>(
    eventName: TEventName,
    callback: EventListener<TEventName>,
  ): () => void {
    const currentListeners =
      this.listeners.get(eventName) ?? new Set<EventListener<TEventName>>()

    currentListeners.add(callback)
    this.listeners.set(eventName, currentListeners as Set<EventListener<EventName>>)

    return () => {
      const registeredListeners = this.listeners.get(eventName)

      if (!registeredListeners) {
        return
      }

      registeredListeners.delete(callback as EventListener<EventName>)

      if (registeredListeners.size === 0) {
        this.listeners.delete(eventName)
      }
    }
  }

  emit<TEventName extends EventName>(eventName: TEventName, payload: PatientEventMap[TEventName]) {
    const listeners = this.listeners.get(eventName)

    if (!listeners || listeners.size === 0) {
      return
    }

    window.setTimeout(() => {
      listeners.forEach((listener) => {
        listener(payload)
      })
    }, 0)
  }
}

export const patientEventStream = new MockPatientEventStream()
