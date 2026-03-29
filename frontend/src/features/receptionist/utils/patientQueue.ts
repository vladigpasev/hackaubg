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
  specialty: string
  status: 'queued' | 'with_staff' | 'not_here'
  title: string
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
    title: visit.specialty,
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

export function getDoctorQueueLoad(patients: Patient[], doctorId: string) {
  return patients.reduce((count, patient) => {
    if (patient.checkedOutAt) {
      return count
    }

    return (
      count +
      getDoctorVisits(patient).filter(
        (visit) => visit.assignedDoctorId === doctorId && visit.status !== 'done',
      ).length
    )
  }, 0)
}

function getLabQueueLoad(patients: Patient[], doctorId: string) {
  return patients.reduce((count, patient) => {
    if (patient.checkedOutAt) {
      return count
    }

    return (
      count +
      getLabBatches(patient).reduce(
        (batchCount, batch) =>
          batchCount +
          batch.items.filter(
            (item) =>
              item.assignedDoctorId === doctorId &&
              item.status !== 'taken' &&
              item.status !== 'results_ready',
          ).length,
        0,
      )
    )
  }, 0)
}

export function getStaffQueueItems(patients: Patient[], doctorId: string, isTester: boolean) {
  const items: StaffQueueItem[] = []

  for (const patient of patients) {
    if (patient.checkedOutAt) {
      continue
    }

    if (isTester) {
      for (const batch of getCollectingLabBatches(patient)) {
        for (const item of batch.items) {
          if (
            item.assignedDoctorId !== doctorId ||
            item.status === 'taken' ||
            item.status === 'results_ready'
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
            specialty: item.testerSpecialty,
            status: item.status,
            title: item.testName,
          })
        }
      }

      for (const batch of getWaitingResultsBatches(patient)) {
        for (const item of batch.items) {
          if (item.assignedDoctorId !== doctorId || item.status !== 'taken') {
            continue
          }

          items.push({
            batchId: batch.id,
            code: item.code,
            createdAt: item.updatedAt,
            id: `${patient.id}:${batch.id}:${item.id}:results`,
            itemId: item.id,
            itemKind: 'lab_item',
            patientAdmittedAt: patient.admittedAt,
            patientId: patient.id,
            patientName: patient.name,
            specialty: item.testerSpecialty,
            status: 'queued',
            title: `${item.testName} results`,
          })
        }
      }

      continue
    }

    for (const visit of getPendingDoctorVisits(patient)) {
      if (visit.assignedDoctorId !== doctorId) {
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
        specialty: visit.specialty,
        status: visit.status === 'with_staff' ? 'with_staff' : visit.status === 'not_here' ? 'not_here' : 'queued',
        title: visit.isReturnVisit ? `Return to ${visit.specialty}` : visit.specialty,
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

export function getStaffCurrentItem(queueItems: StaffQueueItem[]) {
  return queueItems.find((item) => item.status === 'with_staff') ?? null
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

export function getLabQueueCount(patients: Patient[], doctorId: string) {
  return getLabQueueLoad(patients, doctorId)
}
