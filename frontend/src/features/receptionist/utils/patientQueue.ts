import type {
  AssignmentCode,
  DoctorProfile,
  Patient,
  PatientDoctorVisit,
  PatientAgendaEntry,
  PatientCode,
  PatientLabBatch,
  WorkspaceNotification,
} from '../types/patient'

export interface PatientOverviewSummary {
  checkoutReadyCount: number
  openVisitCount: number
  patientCount: number
  pendingLabItemCount: number
  unreadNotificationCount: number
  waitingResultsCount: number
}

export interface StaffQueueItem {
  batchId: string | null
  code: AssignmentCode
  createdAt: string
  id: string
  itemId: string
  itemKind: 'doctor_visit' | 'lab_item'
  patientAdmittedAt: string
  patientId: string
  patientName: string
  queueOrder: number
  specialty: string
  status: 'queued' | 'with_staff' | 'not_here'
  title: string
}

export interface PendingResultItem {
  batchId: string
  itemId: string
  patientAdmittedAt: string
  patientId: string
  patientName: string
  specialty: string
  takenAt: string
  takenByLabel: string | null
  testName: string
  updatedAt: string
}

export type PatientDisplayStatus =
  | 'checked_out'
  | 'done'
  | 'lab_collection'
  | 'results_ready'
  | 'waiting'
  | 'waiting_results'
  | 'with_staff'

interface AgendaCandidate {
  code: AssignmentCode
  createdAt: string
  id: string
  status: 'queued' | 'with_staff' | 'not_here'
  title: string
}

function timestamp(value: string) {
  return new Date(value).getTime()
}

function normalizeQueueSpecialty(value: string) {
  const normalized = value.trim().toLowerCase()

  if (normalized === 'blood-test' || normalized === 'blood test' || normalized === 'lab') {
    return 'laboratory medicine'
  }

  if (normalized === 'scanner' || normalized === 'imaging') {
    return 'radiology'
  }

  return normalized
}

function matchesSpecialty(specialties: string[], specialty: string) {
  const normalizedSpecialty = normalizeQueueSpecialty(specialty)
  return specialties.some((candidate) => normalizeQueueSpecialty(candidate) === normalizedSpecialty)
}

function getDoctorVisitTitle(visit: Pick<PatientDoctorVisit, 'isReturnVisit' | 'requestedByLabel' | 'specialty'>) {
  if (!visit.isReturnVisit) {
    return visit.specialty
  }

  if (visit.requestedByLabel.trim().toLowerCase() === 'lab results') {
    return `Return to ${visit.specialty}`
  }

  return `Return to ${visit.requestedByLabel}`
}

export function getCodePriority(code: AssignmentCode | PatientCode) {
  switch (code) {
    case 'YELLOW':
      return 0
    case 'GREEN':
      return 1
    case 'UNDEFINED':
      return 2
  }
}

export function isDoctorVisit(entry: PatientAgendaEntry): entry is PatientDoctorVisit {
  return entry.entryType === 'doctor_visit'
}

export function isLabBatch(entry: PatientAgendaEntry): entry is PatientLabBatch {
  return entry.entryType === 'lab_batch'
}

export function getDoctorVisits(patient: Patient) {
  return patient.agenda.filter(isDoctorVisit)
}

export function getLabBatches(patient: Patient) {
  return patient.agenda.filter(isLabBatch)
}

export function getLabItems(batch: PatientLabBatch) {
  return batch.items
}

function getBlockingBatch(patient: Patient, blockedByBatchId: string | null) {
  if (!blockedByBatchId) {
    return null
  }

  return getLabBatches(patient).find((batch) => batch.id === blockedByBatchId) ?? null
}

export function isVisitBlocked(patient: Patient, visit: PatientDoctorVisit) {
  const blockingBatch = getBlockingBatch(patient, visit.blockedByBatchId)

  if (!blockingBatch) {
    return false
  }

  return blockingBatch.status === 'collecting'
}

export function getPendingDoctorVisits(patient: Patient) {
  return getDoctorVisits(patient).filter((visit) => visit.status !== 'done' && !isVisitBlocked(patient, visit))
}

export function getBlockedDoctorVisits(patient: Patient) {
  return getDoctorVisits(patient).filter((visit) => visit.status !== 'done' && isVisitBlocked(patient, visit))
}

export function getCollectingLabBatches(patient: Patient) {
  return getLabBatches(patient).filter((batch) => batch.status === 'collecting')
}

export function getWaitingResultsBatches(patient: Patient) {
  return getLabBatches(patient).filter((batch) => batch.status === 'waiting_results')
}

export function getResultsReadyBatches(patient: Patient) {
  return getLabBatches(patient).filter((batch) => batch.status === 'results_ready')
}

export function getPendingLabItems(patient: Patient) {
  return getCollectingLabBatches(patient).flatMap((batch) =>
    batch.items.filter((item) => item.status !== 'taken' && item.status !== 'results_ready'),
  )
}

export function getPendingResultItemsForPatient(patient: Patient): PendingResultItem[] {
  return getLabBatches(patient)
    .flatMap((batch) =>
      batch.items
        .filter((item) => item.status === 'taken')
        .map<PendingResultItem>((item) => ({
          batchId: batch.id,
          itemId: item.id,
          patientAdmittedAt: patient.admittedAt,
          patientId: patient.id,
          patientName: patient.name,
          specialty: item.testerSpecialty,
          takenAt: item.takenAt ?? item.updatedAt,
          takenByLabel: item.takenByLabel,
          testName: item.testName,
          updatedAt: item.updatedAt,
        })),
    )
    .sort((left, right) => {
      const takenDelta = timestamp(left.takenAt) - timestamp(right.takenAt)

      if (takenDelta !== 0) {
        return takenDelta
      }

      return left.itemId.localeCompare(right.itemId)
    })
}

function compareCandidatePriority(left: AgendaCandidate, right: AgendaCandidate) {
  if (left.status === 'with_staff' || right.status === 'with_staff') {
    if (left.status === right.status) {
      return 0
    }

    return left.status === 'with_staff' ? -1 : 1
  }

  const codeDelta = getCodePriority(left.code) - getCodePriority(right.code)

  if (codeDelta !== 0) {
    return codeDelta
  }

  const createdAtDelta = timestamp(left.createdAt) - timestamp(right.createdAt)

  if (createdAtDelta !== 0) {
    return createdAtDelta
  }

  return left.id.localeCompare(right.id)
}

function getAgendaCandidates(patient: Patient): AgendaCandidate[] {
  const visitCandidates = getPendingDoctorVisits(patient).map<AgendaCandidate>((visit) => ({
    code: visit.code,
    createdAt: visit.createdAt,
    id: visit.id,
    status: visit.status === 'done' ? 'queued' : visit.status,
    title: getDoctorVisitTitle(visit),
  }))

  const labCandidates = getCollectingLabBatches(patient).flatMap((batch) =>
    batch.items
      .filter((item) => item.status !== 'taken' && item.status !== 'results_ready')
      .map<AgendaCandidate>((item) => ({
        code: item.code,
        createdAt: item.createdAt,
        id: `${batch.id}:${item.id}`,
        status: item.status === 'with_staff' ? 'with_staff' : item.status === 'not_here' ? 'not_here' : 'queued',
        title: item.testName,
      })),
  )

  return [...visitCandidates, ...labCandidates].sort(compareCandidatePriority)
}

export function getNextActionableCandidate(patient: Patient) {
  return getAgendaCandidates(patient)[0] ?? null
}

export function getPatientBoardCode(patient: Patient): PatientCode {
  if (patient.checkedOutAt) {
    return 'UNDEFINED'
  }

  return getNextActionableCandidate(patient)?.code ?? 'UNDEFINED'
}

export function getPatientNextDestinationLabel(patient: Patient) {
  return getNextActionableCandidate(patient)?.title ?? 'No next step'
}

export function canCheckoutPatient(patient: Patient) {
  if (patient.checkedOutAt) {
    return false
  }

  return (
    getDoctorVisits(patient).every((visit) => visit.status === 'done') &&
    getLabBatches(patient).every((batch) => batch.status === 'return_created')
  )
}

export function getPatientDisplayStatus(patient: Patient): PatientDisplayStatus {
  if (patient.checkedOutAt) {
    return 'checked_out'
  }

  if (
    getDoctorVisits(patient).some((visit) => visit.status === 'with_staff') ||
    getCollectingLabBatches(patient).some((batch) =>
      batch.items.some((item) => item.status === 'with_staff'),
    )
  ) {
    return 'with_staff'
  }

  if (getResultsReadyBatches(patient).length > 0) {
    return 'results_ready'
  }

  if (getCollectingLabBatches(patient).length > 0) {
    return 'lab_collection'
  }

  if (getWaitingResultsBatches(patient).length > 0) {
    return 'waiting_results'
  }

  if (getDoctorVisits(patient).some((visit) => visit.status !== 'done')) {
    return 'waiting'
  }

  return 'done'
}

export function sortPatientsForOverview(patients: Patient[]) {
  return [...patients].sort((left, right) => {
    const leftStatus = getPatientDisplayStatus(left)
    const rightStatus = getPatientDisplayStatus(right)
    const leftClosed = leftStatus === 'done' || leftStatus === 'checked_out'
    const rightClosed = rightStatus === 'done' || rightStatus === 'checked_out'

    if (leftClosed !== rightClosed) {
      return leftClosed ? 1 : -1
    }

    const codeDelta = getCodePriority(getPatientBoardCode(left)) - getCodePriority(getPatientBoardCode(right))

    if (codeDelta !== 0) {
      return codeDelta
    }

    const admittedDelta = timestamp(left.admittedAt) - timestamp(right.admittedAt)

    if (admittedDelta !== 0) {
      return admittedDelta
    }

    return left.id.localeCompare(right.id)
  })
}

export function buildPatientOverviewSummary(
  patients: Patient[],
  notifications: WorkspaceNotification[],
) {
  const activePatients = patients.filter((patient) => !patient.checkedOutAt)

  return {
    checkoutReadyCount: activePatients.filter(canCheckoutPatient).length,
    openVisitCount: activePatients.reduce(
      (count, patient) => count + getDoctorVisits(patient).filter((visit) => visit.status !== 'done').length,
      0,
    ),
    patientCount: activePatients.length,
    pendingLabItemCount: activePatients.reduce(
      (count, patient) => count + getPendingLabItems(patient).length,
      0,
    ),
    unreadNotificationCount: notifications.filter((notification) => !notification.readAt).length,
    waitingResultsCount: activePatients.reduce(
      (count, patient) => count + getWaitingResultsBatches(patient).length + getResultsReadyBatches(patient).length,
      0,
    ),
  } satisfies PatientOverviewSummary
}

export function getDoctorLabelById(doctors: DoctorProfile[], doctorId: string | null) {
  if (!doctorId) {
    return 'Unassigned'
  }

  return doctors.find((doctor) => doctor.id === doctorId)?.displayName ?? 'Unassigned'
}

export function getDoctorQueueLoad(patients: Patient[], specialties: string[], doctorId?: string | null) {
  return getStaffQueueItems(patients, specialties, false, doctorId).length
}

export function getStaffQueueItems(
  patients: Patient[],
  specialties: string[],
  isTester: boolean,
  doctorId?: string | null,
) {
  const items: StaffQueueItem[] = []

  for (const patient of patients) {
    if (patient.checkedOutAt) {
      continue
    }

    if (isTester) {
      for (const batch of getCollectingLabBatches(patient)) {
        for (const item of batch.items) {
          if (
            item.status === 'with_staff' ||
            item.status === 'taken' ||
            item.status === 'results_ready' ||
            !matchesSpecialty(specialties, item.testerSpecialty)
          ) {
            continue
          }

          items.push({
            batchId: batch.id,
            code: item.code,
            createdAt: item.createdAt,
            id: `${patient.id}:${batch.id}:${item.id}`,
            itemId: item.id,
            itemKind: 'lab_item',
            patientAdmittedAt: patient.admittedAt,
            patientId: patient.id,
            patientName: patient.name,
            queueOrder: item.queueOrder,
            specialty: item.testerSpecialty,
            status: item.status,
            title: item.testName,
          })
        }
      }

      continue
    }

    for (const visit of getPendingDoctorVisits(patient)) {
      if (
        visit.status === 'with_staff' ||
        !matchesSpecialty(specialties, visit.specialty) ||
        (visit.assignedDoctorId !== null && visit.assignedDoctorId !== doctorId)
      ) {
        continue
      }

      items.push({
        batchId: null,
        code: visit.code,
        createdAt: visit.createdAt,
        id: `${patient.id}:${visit.id}`,
        itemId: visit.id,
        itemKind: 'doctor_visit',
        patientAdmittedAt: patient.admittedAt,
        patientId: patient.id,
        patientName: patient.name,
        queueOrder: visit.queueOrder,
        specialty: visit.specialty,
        status: visit.status === 'not_here' ? 'not_here' : 'queued',
        title: getDoctorVisitTitle(visit),
      })
    }
  }

  return items.sort((left, right) =>
    compareCandidatePriority(
      {
        code: left.code,
        createdAt: left.createdAt,
        id: left.id,
        status: left.status,
        title: left.title,
      },
      {
        code: right.code,
        createdAt: right.createdAt,
        id: right.id,
        status: right.status,
        title: right.title,
      },
    ),
  )
}

export function getStaffCurrentItem(patients: Patient[], doctorId: string, isTester: boolean) {
  const items: StaffQueueItem[] = []

  for (const patient of patients) {
    if (patient.checkedOutAt) {
      continue
    }

    if (isTester) {
      for (const batch of getCollectingLabBatches(patient)) {
        for (const item of batch.items) {
          if (item.assignedDoctorId !== doctorId || item.status !== 'with_staff') {
            continue
          }

          items.push({
            batchId: batch.id,
            code: item.code,
            createdAt: item.createdAt,
            id: `${patient.id}:${batch.id}:${item.id}`,
            itemId: item.id,
            itemKind: 'lab_item',
            patientAdmittedAt: patient.admittedAt,
            patientId: patient.id,
            patientName: patient.name,
            queueOrder: 0,
            specialty: item.testerSpecialty,
            status: 'with_staff',
            title: item.testName,
          })
        }
      }

      continue
    }

    for (const visit of getPendingDoctorVisits(patient)) {
      if (visit.assignedDoctorId !== doctorId || visit.status !== 'with_staff') {
        continue
      }

      items.push({
        batchId: null,
        code: visit.code,
        createdAt: visit.createdAt,
        id: `${patient.id}:${visit.id}`,
        itemId: visit.id,
        itemKind: 'doctor_visit',
        patientAdmittedAt: patient.admittedAt,
        patientId: patient.id,
        patientName: patient.name,
        queueOrder: 0,
        specialty: visit.specialty,
        status: 'with_staff',
        title: visit.isReturnVisit ? `Return to ${visit.specialty}` : visit.specialty,
      })
    }
  }

  return items.sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt))[0] ?? null
}

export function getPendingResultItems(patients: Patient[]) {
  return patients
    .filter((patient) => !patient.checkedOutAt)
    .flatMap((patient) => getPendingResultItemsForPatient(patient))
    .sort((left, right) => {
      const takenDelta = timestamp(left.takenAt) - timestamp(right.takenAt)

      if (takenDelta !== 0) {
        return takenDelta
      }

      return left.itemId.localeCompare(right.itemId)
    })
}

export function getPatientAgendaPendingCount(patient: Patient) {
  return (
    getDoctorVisits(patient).filter((visit) => visit.status !== 'done').length +
    getPendingLabItems(patient).length
  )
}

export function getPatientGuidanceSummary(patient: Patient) {
  const candidate = getNextActionableCandidate(patient)

  if (!candidate) {
    return 'No next step'
  }

  return `${candidate.title} · ${candidate.code}`
}

export function getLabBatchLeadCode(batch: PatientLabBatch): AssignmentCode {
  return [...batch.items]
    .sort((left, right) => {
      const codeDelta = getCodePriority(left.code) - getCodePriority(right.code)

      if (codeDelta !== 0) {
        return codeDelta
      }

      return timestamp(left.createdAt) - timestamp(right.createdAt)
    })[0]?.code ?? batch.returnCode
}

export function getLabQueueCount(patients: Patient[], specialties: string[]) {
  return getStaffQueueItems(patients, specialties, true).length
}
