import type {
  DoctorProfile,
  Patient,
  PatientDoctorTask,
  PatientTask,
  PatientTestRequest,
  TriageCode,
  WorkspaceNotification,
} from '../types/patient'

export interface PatientOverviewSummary {
  checkoutReadyCount: number
  openDoctorTaskCount: number
  patientCount: number
  pendingTestCount: number
  readyReturnCount: number
  unreadNotificationCount: number
}

export interface DoctorQueueItem {
  code: TriageCode
  createdAt: string
  id: string
  kind: 'doctor_task' | 'test_item'
  patientAdmittedAt: string
  patientId: string
  patientName: string
  specialty: string
  status: 'queued' | 'with_doctor' | 'not_here' | 'pending'
  taskId: string
  taskType: PatientDoctorTask['type'] | 'test_item'
  testItemId: string | null
  testRequestId: string | null
  title: string
}

export type PatientDisplayStatus =
  | 'checked_out'
  | 'done'
  | 'tests_pending'
  | 'tests_ready'
  | 'waiting'
  | 'with_doctor'

function timestamp(value: string) {
  return new Date(value).getTime()
}

export function getTriagePriority(code: TriageCode) {
  switch (code) {
    case 'yellow':
      return 0
    case 'green':
      return 1
    case 'unknown':
      return 2
  }
}

export function isDoctorTask(task: PatientTask): task is PatientDoctorTask {
  return task.type === 'doctor_task' || task.type === 'return_to_doctor_task'
}

export function isTestRequestTask(task: PatientTask): task is PatientTestRequest {
  return task.type === 'test_request'
}

export function getDoctorTasks(patient: Patient) {
  return patient.tasks.filter(isDoctorTask)
}

export function getTestRequests(patient: Patient) {
  return patient.tasks.filter(isTestRequestTask)
}

export function getActiveDoctorTasks(patient: Patient) {
  return getDoctorTasks(patient).filter((task) => task.status !== 'done')
}

export function getPendingTestItems(patient: Patient) {
  return getTestRequests(patient).flatMap((request) =>
    request.items.filter((item) => item.status === 'pending'),
  )
}

export function getReadyReturnRequests(patient: Patient) {
  return getTestRequests(patient).filter((request) => request.status === 'ready_for_return')
}

export function canCheckoutPatient(patient: Patient) {
  if (patient.checkedOutAt) {
    return false
  }

  return (
    getActiveDoctorTasks(patient).length === 0 &&
    getPendingTestItems(patient).length === 0 &&
    getReadyReturnRequests(patient).length === 0
  )
}

export function getPatientDisplayStatus(patient: Patient): PatientDisplayStatus {
  if (patient.checkedOutAt) {
    return 'checked_out'
  }

  if (getActiveDoctorTasks(patient).some((task) => task.status === 'with_doctor')) {
    return 'with_doctor'
  }

  if (getReadyReturnRequests(patient).length > 0) {
    return 'tests_ready'
  }

  if (getPendingTestItems(patient).length > 0) {
    return 'tests_pending'
  }

  if (getActiveDoctorTasks(patient).length > 0) {
    return 'waiting'
  }

  return 'done'
}

export function getPatientPriorityCode(patient: Patient): TriageCode | null {
  const candidateCodes = [
    ...getActiveDoctorTasks(patient).map((task) => task.code),
    ...getTestRequests(patient)
      .filter((request) => request.status !== 'returned')
      .map((request) => request.code),
  ]

  if (candidateCodes.length === 0) {
    return null
  }

  return [...candidateCodes].sort((left, right) => getTriagePriority(left) - getTriagePriority(right))[0]
}

export function sortPatientsForOverview(patients: Patient[]) {
  return [...patients].sort((left, right) => {
    const leftStatus = getPatientDisplayStatus(left)
    const rightStatus = getPatientDisplayStatus(right)
    const leftIsClosed = leftStatus === 'done' || leftStatus === 'checked_out'
    const rightIsClosed = rightStatus === 'done' || rightStatus === 'checked_out'

    if (leftIsClosed !== rightIsClosed) {
      return leftIsClosed ? 1 : -1
    }

    const leftPriorityCode = getPatientPriorityCode(left)
    const rightPriorityCode = getPatientPriorityCode(right)

    if (leftPriorityCode && rightPriorityCode) {
      const priorityDelta = getTriagePriority(leftPriorityCode) - getTriagePriority(rightPriorityCode)

      if (priorityDelta !== 0) {
        return priorityDelta
      }
    } else if (leftPriorityCode || rightPriorityCode) {
      return leftPriorityCode ? -1 : 1
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
    openDoctorTaskCount: activePatients.reduce(
      (count, patient) => count + getActiveDoctorTasks(patient).length,
      0,
    ),
    patientCount: activePatients.length,
    pendingTestCount: activePatients.reduce(
      (count, patient) => count + getPendingTestItems(patient).length,
      0,
    ),
    readyReturnCount: activePatients.reduce(
      (count, patient) => count + getReadyReturnRequests(patient).length,
      0,
    ),
    unreadNotificationCount: notifications.filter((notification) => !notification.readAt).length,
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
      getActiveDoctorTasks(patient).filter((task) => task.assignedDoctorId === doctorId).length
    )
  }, 0)
}

function compareQueuePriority(
  leftCode: TriageCode,
  leftCreatedAt: string,
  leftId: string,
  rightCode: TriageCode,
  rightCreatedAt: string,
  rightId: string,
) {
  const priorityDelta = getTriagePriority(leftCode) - getTriagePriority(rightCode)

  if (priorityDelta !== 0) {
    return priorityDelta
  }

  const createdAtDelta = timestamp(leftCreatedAt) - timestamp(rightCreatedAt)

  if (createdAtDelta !== 0) {
    return createdAtDelta
  }

  return leftId.localeCompare(rightId)
}

export function getDoctorQueueItems(patients: Patient[], doctorId: string) {
  const items: DoctorQueueItem[] = []

  for (const patient of patients) {
    if (patient.checkedOutAt) {
      continue
    }

    for (const task of getDoctorTasks(patient)) {
      if (task.assignedDoctorId !== doctorId || task.status === 'done') {
        continue
      }

      items.push({
        code: task.code,
        createdAt: task.createdAt,
        id: `${patient.id}:${task.id}`,
        kind: 'doctor_task',
        patientAdmittedAt: patient.admittedAt,
        patientId: patient.id,
        patientName: patient.name,
        specialty: task.specialty,
        status: task.status,
        taskId: task.id,
        taskType: task.type,
        testItemId: null,
        testRequestId: null,
        title: task.type === 'return_to_doctor_task' ? `Return to ${task.specialty}` : task.specialty,
      })
    }

    for (const request of getTestRequests(patient)) {
      if (request.status !== 'pending') {
        continue
      }

      for (const item of request.items) {
        if (item.assignedDoctorId !== doctorId || item.status !== 'pending') {
          continue
        }

        items.push({
          code: request.code,
          createdAt: item.createdAt,
          id: `${patient.id}:${request.id}:${item.id}`,
          kind: 'test_item',
          patientAdmittedAt: patient.admittedAt,
          patientId: patient.id,
          patientName: patient.name,
          specialty: item.testerSpecialty,
          status: 'pending',
          taskId: request.id,
          taskType: 'test_item',
          testItemId: item.id,
          testRequestId: request.id,
          title: item.testName,
        })
      }
    }
  }

  return items.sort((left, right) => {
    if (left.status === 'with_doctor' || right.status === 'with_doctor') {
      if (left.status === right.status) {
        return 0
      }

      return left.status === 'with_doctor' ? -1 : 1
    }

    return compareQueuePriority(
      left.code,
      left.createdAt,
      left.id,
      right.code,
      right.createdAt,
      right.id,
    )
  })
}

export function getDoctorCurrentItem(queueItems: DoctorQueueItem[]) {
  return queueItems.find((item) => item.kind === 'doctor_task' && item.status === 'with_doctor') ?? null
}
