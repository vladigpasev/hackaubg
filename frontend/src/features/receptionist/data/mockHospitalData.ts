import type {
  CatalogOption,
  DoctorProfile,
  Patient,
  PatientDoctorTask,
  PatientNote,
  PatientTask,
  PatientTestItem,
  PatientTestRequest,
  WorkspaceNotification,
} from '../types/patient'

function buildNote(id: string, authorLabel: string, createdAt: string, text: string): PatientNote {
  return {
    id,
    authorLabel,
    createdAt,
    text,
  }
}

function buildDoctorTask(task: Omit<PatientDoctorTask, 'type'> & { type?: PatientDoctorTask['type'] }) {
  return {
    ...task,
    type: task.type ?? 'doctor_task',
  } satisfies PatientDoctorTask
}

function buildTestItem(item: PatientTestItem): PatientTestItem {
  return item
}

function buildTestRequest(request: PatientTestRequest): PatientTestRequest {
  return request
}

function buildPatient(patient: Patient): Patient {
  return patient
}

export const seededDoctorProfiles: DoctorProfile[] = [
  {
    id: 'DOC-201',
    username: 'dr.kalin.petrov',
    displayName: 'Dr. Kalin Petrov',
    specialties: ['Cardiology', 'Internal Medicine'],
    isTester: false,
  },
  {
    id: 'DOC-202',
    username: 'dr.maria.georgieva',
    displayName: 'Dr. Maria Georgieva',
    specialties: ['Orthopedics', 'General Surgery'],
    isTester: false,
  },
  {
    id: 'DOC-203',
    username: 'dr.nikolay.dimitrov',
    displayName: 'Dr. Nikolay Dimitrov',
    specialties: ['Neurology', 'Pulmonology'],
    isTester: false,
  },
  {
    id: 'DOC-204',
    username: 'dr.iva.stoyanova',
    displayName: 'Dr. Iva Stoyanova',
    specialties: ['Emergency Medicine', 'Infectious Diseases'],
    isTester: false,
  },
  {
    id: 'DOC-205',
    username: 'dr.teodora.ivanova',
    displayName: 'Dr. Teodora Ivanova',
    specialties: ['Radiology'],
    isTester: true,
  },
  {
    id: 'DOC-206',
    username: 'dr.pavel.marinov',
    displayName: 'Dr. Pavel Marinov',
    specialties: ['Laboratory Medicine'],
    isTester: true,
  },
]

export const specialtyCatalogSeed: CatalogOption[] = [
  { id: 'sp-1', label: 'Cardiology', keywords: ['cardio', 'heart'] },
  { id: 'sp-2', label: 'Emergency Medicine', keywords: ['emergency', 'urgent'] },
  { id: 'sp-3', label: 'General Surgery', keywords: ['surgeon', 'surgery'] },
  { id: 'sp-4', label: 'Infectious Diseases', keywords: ['infection', 'fever'] },
  { id: 'sp-5', label: 'Internal Medicine', keywords: ['adult', 'general physician'] },
  { id: 'sp-6', label: 'Laboratory Medicine', keywords: ['lab', 'analysis'] },
  { id: 'sp-7', label: 'Neurology', keywords: ['brain', 'nerves'] },
  { id: 'sp-8', label: 'Orthopedics', keywords: ['bones', 'fracture'] },
  { id: 'sp-9', label: 'Pulmonology', keywords: ['lungs', 'breathing'] },
  { id: 'sp-10', label: 'Radiology', keywords: ['scan', 'x-ray'] },
]

export const testCatalogSeed: CatalogOption[] = [
  {
    id: 'test-1',
    label: 'Blood Test',
    keywords: ['bloodwork', 'cbc'],
    testerSpecialty: 'Laboratory Medicine',
  },
  {
    id: 'test-2',
    label: 'Chest X-Ray',
    keywords: ['lungs', 'xray'],
    testerSpecialty: 'Radiology',
  },
  {
    id: 'test-3',
    label: 'CT Scan',
    keywords: ['ct', 'scanner'],
    testerSpecialty: 'Radiology',
  },
  {
    id: 'test-4',
    label: 'ECG',
    keywords: ['ekg', 'heart'],
    testerSpecialty: 'Laboratory Medicine',
  },
  {
    id: 'test-5',
    label: 'MRI',
    keywords: ['brain', 'scan'],
    testerSpecialty: 'Radiology',
  },
  {
    id: 'test-6',
    label: 'Respiratory Panel',
    keywords: ['virus', 'breathing'],
    testerSpecialty: 'Laboratory Medicine',
  },
  {
    id: 'test-7',
    label: 'Urine Test',
    keywords: ['sample', 'urine'],
    testerSpecialty: 'Laboratory Medicine',
  },
  {
    id: 'test-8',
    label: 'Ultrasound',
    keywords: ['echo', 'scan'],
    testerSpecialty: 'Radiology',
  },
]

const patient101Tasks: PatientTask[] = [
  buildDoctorTask({
    assignedDoctorId: 'DOC-201',
    code: 'yellow',
    completedAt: null,
    createdAt: '2026-03-28T08:10:00.000Z',
    id: 'DT-101',
    note: 'Chest discomfort and dizziness.',
    queueOrder: 1,
    requestedByLabel: 'Registry desk',
    sourceTaskId: null,
    specialty: 'Cardiology',
    status: 'queued',
    updatedAt: '2026-03-28T08:10:00.000Z',
  }),
]

const patient102Tasks: PatientTask[] = [
  buildDoctorTask({
    assignedDoctorId: 'DOC-202',
    code: 'green',
    completedAt: null,
    createdAt: '2026-03-28T08:24:00.000Z',
    id: 'DT-102',
    note: 'Right ankle pain after sports injury.',
    queueOrder: 1,
    requestedByLabel: 'Registry desk',
    sourceTaskId: null,
    specialty: 'Orthopedics',
    status: 'queued',
    updatedAt: '2026-03-28T08:24:00.000Z',
  }),
  buildDoctorTask({
    assignedDoctorId: 'DOC-205',
    code: 'unknown',
    completedAt: null,
    createdAt: '2026-03-28T08:26:00.000Z',
    id: 'DT-103',
    note: 'Possible follow-up imaging if swelling increases.',
    queueOrder: 1,
    requestedByLabel: 'Nurse station',
    sourceTaskId: null,
    specialty: 'Radiology',
    status: 'queued',
    updatedAt: '2026-03-28T08:26:00.000Z',
  }),
]

const patient103Tasks: PatientTask[] = [
  buildDoctorTask({
    assignedDoctorId: 'DOC-203',
    code: 'yellow',
    completedAt: '2026-03-28T08:52:00.000Z',
    createdAt: '2026-03-28T08:41:00.000Z',
    id: 'DT-104',
    note: 'Breathing is shallow. Needs imaging and lab panel.',
    queueOrder: 1,
    requestedByLabel: 'Registry desk',
    sourceTaskId: null,
    specialty: 'Pulmonology',
    status: 'done',
    updatedAt: '2026-03-28T08:52:00.000Z',
  }),
  buildTestRequest({
    code: 'yellow',
    createdAt: '2026-03-28T08:52:00.000Z',
    id: 'TR-101',
    items: [
      buildTestItem({
        assignedDoctorId: 'DOC-205',
        completedAt: '2026-03-28T09:08:00.000Z',
        completedByLabel: 'Dr. Teodora Ivanova',
        createdAt: '2026-03-28T08:52:00.000Z',
        id: 'TI-101',
        status: 'done',
        testName: 'Chest X-Ray',
        testerSpecialty: 'Radiology',
        updatedAt: '2026-03-28T09:08:00.000Z',
      }),
      buildTestItem({
        assignedDoctorId: 'DOC-206',
        completedAt: '2026-03-28T09:10:00.000Z',
        completedByLabel: 'Dr. Pavel Marinov',
        createdAt: '2026-03-28T08:52:00.000Z',
        id: 'TI-102',
        status: 'done',
        testName: 'Respiratory Panel',
        testerSpecialty: 'Laboratory Medicine',
        updatedAt: '2026-03-28T09:10:00.000Z',
      }),
    ],
    note: 'Pulmonary imaging and lab confirmation.',
    notificationId: 'NT-101',
    orderedByDoctorId: 'DOC-203',
    orderedByLabel: 'Dr. Nikolay Dimitrov',
    returnedAt: null,
    returnDoctorId: 'DOC-203',
    returnSpecialty: 'Pulmonology',
    sourceTaskId: 'DT-104',
    status: 'ready_for_return',
    type: 'test_request',
    updatedAt: '2026-03-28T09:10:00.000Z',
  }),
]

const patient104Tasks: PatientTask[] = [
  buildDoctorTask({
    assignedDoctorId: 'DOC-203',
    code: 'green',
    completedAt: null,
    createdAt: '2026-03-28T09:05:00.000Z',
    id: 'DT-105',
    note: 'Persistent headache and left hand numbness.',
    queueOrder: 0,
    requestedByLabel: 'Registry desk',
    sourceTaskId: null,
    specialty: 'Neurology',
    status: 'with_doctor',
    updatedAt: '2026-03-28T09:18:00.000Z',
  }),
]

const patient105Tasks: PatientTask[] = [
  buildDoctorTask({
    assignedDoctorId: 'DOC-201',
    code: 'green',
    completedAt: '2026-03-28T09:48:00.000Z',
    createdAt: '2026-03-28T09:22:00.000Z',
    id: 'DT-106',
    note: 'Stable and ready for discharge instructions.',
    queueOrder: 1,
    requestedByLabel: 'Registry desk',
    sourceTaskId: null,
    specialty: 'Internal Medicine',
    status: 'done',
    updatedAt: '2026-03-28T09:48:00.000Z',
  }),
]

const patient106Tasks: PatientTask[] = [
  buildDoctorTask({
    assignedDoctorId: 'DOC-201',
    code: 'unknown',
    completedAt: '2026-03-28T09:36:00.000Z',
    createdAt: '2026-03-28T09:30:00.000Z',
    id: 'DT-107',
    note: 'Initial review done. Waiting on tests and cardiology follow-up.',
    queueOrder: 1,
    requestedByLabel: 'Registry desk',
    sourceTaskId: null,
    specialty: 'Internal Medicine',
    status: 'done',
    updatedAt: '2026-03-28T09:36:00.000Z',
  }),
  buildDoctorTask({
    assignedDoctorId: 'DOC-201',
    code: 'green',
    completedAt: null,
    createdAt: '2026-03-28T09:42:00.000Z',
    id: 'DT-108',
    note: 'Cardiology review after lab and imaging.',
    queueOrder: 1,
    requestedByLabel: 'Nurse station',
    sourceTaskId: null,
    specialty: 'Cardiology',
    status: 'queued',
    updatedAt: '2026-03-28T09:42:00.000Z',
  }),
  buildTestRequest({
    code: 'green',
    createdAt: '2026-03-28T09:36:00.000Z',
    id: 'TR-102',
    items: [
      buildTestItem({
        assignedDoctorId: 'DOC-205',
        completedAt: null,
        completedByLabel: null,
        createdAt: '2026-03-28T09:36:00.000Z',
        id: 'TI-103',
        status: 'pending',
        testName: 'CT Scan',
        testerSpecialty: 'Radiology',
        updatedAt: '2026-03-28T09:36:00.000Z',
      }),
      buildTestItem({
        assignedDoctorId: 'DOC-206',
        completedAt: null,
        completedByLabel: null,
        createdAt: '2026-03-28T09:36:00.000Z',
        id: 'TI-104',
        status: 'pending',
        testName: 'Blood Test',
        testerSpecialty: 'Laboratory Medicine',
        updatedAt: '2026-03-28T09:36:00.000Z',
      }),
    ],
    note: 'Evaluate inflammation markers and chest imaging.',
    notificationId: null,
    orderedByDoctorId: 'DOC-201',
    orderedByLabel: 'Dr. Kalin Petrov',
    returnedAt: null,
    returnDoctorId: 'DOC-201',
    returnSpecialty: 'Cardiology',
    sourceTaskId: 'DT-107',
    status: 'pending',
    type: 'test_request',
    updatedAt: '2026-03-28T09:36:00.000Z',
  }),
]

export const seededPatients: Patient[] = [
  buildPatient({
    admittedAt: '2026-03-28T08:10:00.000Z',
    checkedOutAt: null,
    id: 'PT-101',
    lastUpdatedAt: '2026-03-28T08:10:00.000Z',
    name: 'Mila Petrova',
    notes: [
      buildNote(
        'NOTE-101',
        'Registry desk',
        '2026-03-28T08:10:00.000Z',
        'Arrived with chest discomfort and dizziness.',
      ),
    ],
    phoneNumber: '+359 888 101 101',
    tasks: patient101Tasks,
  }),
  buildPatient({
    admittedAt: '2026-03-28T08:24:00.000Z',
    checkedOutAt: null,
    id: 'PT-102',
    lastUpdatedAt: '2026-03-28T08:26:00.000Z',
    name: 'Georgi Ivanov',
    notes: [
      buildNote(
        'NOTE-102',
        'Registry desk',
        '2026-03-28T08:24:00.000Z',
        'Possible ankle sprain after a fall during sports.',
      ),
    ],
    phoneNumber: '+359 888 202 202',
    tasks: patient102Tasks,
  }),
  buildPatient({
    admittedAt: '2026-03-28T08:41:00.000Z',
    checkedOutAt: null,
    id: 'PT-103',
    lastUpdatedAt: '2026-03-28T09:10:00.000Z',
    name: 'Elena Nikolova',
    notes: [
      buildNote(
        'NOTE-103',
        'Nurse station',
        '2026-03-28T08:45:00.000Z',
        'Breathing is shallow. Saturation stable but monitored.',
      ),
      buildNote(
        'NOTE-104',
        'Dr. Nikolay Dimitrov',
        '2026-03-28T08:52:00.000Z',
        'Tests ordered before pulmonary review continues.',
      ),
    ],
    phoneNumber: '+359 888 303 303',
    tasks: patient103Tasks,
  }),
  buildPatient({
    admittedAt: '2026-03-28T09:05:00.000Z',
    checkedOutAt: null,
    id: 'PT-104',
    lastUpdatedAt: '2026-03-28T09:18:00.000Z',
    name: 'Anna Koleva',
    notes: [
      buildNote(
        'NOTE-105',
        'Registry desk',
        '2026-03-28T09:05:00.000Z',
        'Persistent headache and numbness in the left hand.',
      ),
    ],
    phoneNumber: '+359 888 404 404',
    tasks: patient104Tasks,
  }),
  buildPatient({
    admittedAt: '2026-03-28T09:22:00.000Z',
    checkedOutAt: null,
    id: 'PT-105',
    lastUpdatedAt: '2026-03-28T09:48:00.000Z',
    name: 'Viktor Dimitrov',
    notes: [
      buildNote(
        'NOTE-106',
        'Dr. Kalin Petrov',
        '2026-03-28T09:48:00.000Z',
        'Visit completed. Ready for registry checkout.',
      ),
    ],
    phoneNumber: '',
    tasks: patient105Tasks,
  }),
  buildPatient({
    admittedAt: '2026-03-28T09:30:00.000Z',
    checkedOutAt: null,
    id: 'PT-106',
    lastUpdatedAt: '2026-03-28T09:42:00.000Z',
    name: 'Boris Hristov',
    notes: [
      buildNote(
        'NOTE-107',
        'Registry desk',
        '2026-03-28T09:30:00.000Z',
        'Persistent fatigue with chest pressure after exertion.',
      ),
    ],
    phoneNumber: '+359 888 606 606',
    tasks: patient106Tasks,
  }),
]

export const seededNotifications: WorkspaceNotification[] = [
  {
    action: {
      patientId: 'PT-103',
      requestId: 'TR-101',
      type: 'send_back_to_doctor',
    },
    createdAt: '2026-03-28T09:10:00.000Z',
    id: 'NT-101',
    message: 'Elena Nikolova has completed all requested tests and can be sent back to pulmonology.',
    patientId: 'PT-103',
    readAt: null,
    targetDoctorId: null,
    targetRole: 'nurse',
    title: 'Tests ready',
    type: 'tests_ready',
  },
]
