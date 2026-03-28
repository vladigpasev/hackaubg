import type {
  HybridPatientOverlay,
  PatientTask,
  WorkspaceNotification,
} from '../types/patient'

const OVERLAY_STORAGE_KEY = 'hackaubg.hospital.overlay.v1'

interface HospitalOverlayStore {
  notifications: WorkspaceNotification[]
  patientOverlays: Record<string, HybridPatientOverlay>
}

function getEmptyOverlay(): HospitalOverlayStore {
  return {
    notifications: [],
    patientOverlays: {},
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitizeTasks(tasks: unknown): PatientTask[] {
  if (!Array.isArray(tasks)) {
    return []
  }

  return tasks.filter((task): task is PatientTask => isRecord(task) && typeof task.type === 'string') as PatientTask[]
}

function sanitizeNotifications(notifications: unknown): WorkspaceNotification[] {
  if (!Array.isArray(notifications)) {
    return []
  }

  return notifications.filter(
    (notification): notification is WorkspaceNotification =>
      isRecord(notification) &&
      typeof notification.id === 'string' &&
      typeof notification.title === 'string' &&
      typeof notification.message === 'string',
  ) as WorkspaceNotification[]
}

function sanitizeStore(value: unknown): HospitalOverlayStore {
  if (!isRecord(value)) {
    return getEmptyOverlay()
  }

  const rawOverlays = isRecord(value.patientOverlays) ? value.patientOverlays : {}
  const patientOverlays = Object.fromEntries(
    Object.entries(rawOverlays).map(([patientId, overlay]) => [
      patientId,
      {
        tasks: sanitizeTasks(isRecord(overlay) ? overlay.tasks : []),
      } satisfies HybridPatientOverlay,
    ]),
  )

  return {
    notifications: sanitizeNotifications(value.notifications),
    patientOverlays,
  }
}

export function loadOverlayStore(): HospitalOverlayStore {
  if (typeof window === 'undefined') {
    return getEmptyOverlay()
  }

  try {
    const raw = window.localStorage.getItem(OVERLAY_STORAGE_KEY)

    if (!raw) {
      return getEmptyOverlay()
    }

    return sanitizeStore(JSON.parse(raw) as unknown)
  } catch {
    return getEmptyOverlay()
  }
}

export function saveOverlayStore(store: HospitalOverlayStore) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(OVERLAY_STORAGE_KEY, JSON.stringify(store))
}

export function getPatientOverlay(store: HospitalOverlayStore, patientId: string): HybridPatientOverlay {
  return store.patientOverlays[patientId] ?? { tasks: [] }
}

export function writePatientOverlay(
  store: HospitalOverlayStore,
  patientId: string,
  overlay: HybridPatientOverlay,
) {
  store.patientOverlays[patientId] = {
    tasks: [...overlay.tasks],
  }
}

export function removePatientOverlay(store: HospitalOverlayStore, patientId: string) {
  delete store.patientOverlays[patientId]
  store.notifications = store.notifications.filter((notification) => notification.patientId !== patientId)
}

export function pruneOverlayStore(store: HospitalOverlayStore, activePatientIds: string[]) {
  const allowedPatientIds = new Set(activePatientIds)

  Object.keys(store.patientOverlays).forEach((patientId) => {
    if (!allowedPatientIds.has(patientId)) {
      delete store.patientOverlays[patientId]
    }
  })

  store.notifications = store.notifications.filter((notification) => {
    if (!notification.patientId) {
      return true
    }

    return allowedPatientIds.has(notification.patientId)
  })
}
