import type {
  CheckInPayloadI,
  UpdatePatientI,
} from '../../../src/patient/patient.dto';
import type { HistoryRecordI, QueueRecordI } from '../../../src/patient/patient.type';
import type { TriageState } from '../../../src/shared.types';

interface PatientHistoryStepSeed
  extends Omit<HistoryRecordI, 'timestamp'> {
  minutesAfterAdmission: number;
}

interface PatientQueueStepSeed extends Omit<QueueRecordI, 'timestamp'> {
  minutesAfterAdmission: number;
}

interface PatientScenarioSeedDefinition {
  key: string;
  admittedMinutesAgo: number;
  checkIn: CheckInPayloadI;
  update?: UpdatePatientI;
  notes: string[];
  history: PatientHistoryStepSeed[];
  queue: PatientQueueStepSeed[];
}

export interface PatientScenarioSeed {
  key: string;
  admittedAt: Date;
  cleanupPhones: string[];
  checkIn: CheckInPayloadI;
  update?: UpdatePatientI;
  notes: string[];
  history: HistoryRecordI[];
  queue: QueueRecordI[];
}

function historyStep(
  minutesAfterAdmission: number,
  reffered_by_id: string,
  specialty: string,
  triage_state: TriageState,
  reffered_to_id: string,
  is_done: boolean,
): PatientHistoryStepSeed {
  return {
    minutesAfterAdmission,
    reffered_by_id,
    specialty,
    triage_state,
    reffered_to_id,
    is_done,
  };
}

function queueStep(
  minutesAfterAdmission: number,
  reffered_by_id: string,
  specialty: string,
  triage_state: TriageState,
): PatientQueueStepSeed {
  return {
    minutesAfterAdmission,
    reffered_by_id,
    specialty,
    triage_state,
  };
}

const patientScenarioDefinitions: PatientScenarioSeedDefinition[] = [
  {
    key: 'stefan-ivanov-cardiology-workup',
    admittedMinutesAgo: 360,
    checkIn: {
      name: 'Stefan Ivanov',
      phone_number: '0889001001',
      triage_state: 'YELLOW',
    },
    notes: [
      'registry.frontdesk: Presented with chest tightness after climbing stairs.',
      'nurse.elena: ECG attached to chart, BP 152/96, pain currently 4/10.',
    ],
    history: [
      historyStep(
        15,
        'registry.frontdesk',
        'cardiology',
        'YELLOW',
        'doctor.petrova',
        true,
      ),
      historyStep(
        40,
        'doctor.petrova',
        'blood-test',
        'YELLOW',
        'tester.lab',
        true,
      ),
      historyStep(
        65,
        'doctor.petrova',
        'echocardiogram',
        'YELLOW',
        'tester.echo',
        true,
      ),
      historyStep(
        95,
        'doctor.petrova',
        'imaging',
        'YELLOW',
        'tester.scan',
        false,
      ),
    ],
    queue: [queueStep(95, 'doctor.petrova', 'imaging', 'YELLOW')],
  },
  {
    key: 'maria-georgieva-dehydration-phone-fix',
    admittedMinutesAgo: 210,
    checkIn: {
      name: 'Maria Georgieva',
      phone_number: '0889001992',
      triage_state: 'GREEN',
    },
    update: {
      phone_number: '0889001002',
      triage_state: 'YELLOW',
    },
    notes: [
      'registry.admissions: Family confirmed her mobile number was entered incorrectly at intake.',
      'nurse.martin: Dry mucous membranes, mild dizziness on standing.',
      'doctor.rahman: Ordered labs and oral rehydration, keep under observation.',
    ],
    history: [
      historyStep(
        20,
        'registry.admissions',
        'internal-medicine',
        'GREEN',
        'doctor.rahman',
        true,
      ),
      historyStep(
        55,
        'doctor.rahman',
        'blood-test',
        'YELLOW',
        'tester.lab',
        false,
      ),
    ],
    queue: [queueStep(55, 'doctor.rahman', 'blood-test', 'YELLOW')],
  },
  {
    key: 'petar-petrov-trauma-red',
    admittedMinutesAgo: 50,
    checkIn: {
      name: 'Petar Petrov',
      phone_number: '0889001003',
      triage_state: 'RED',
    },
    notes: [
      'registry.admissions: Brought in after a road accident, conscious but agitated.',
      'nurse.petya: Cervical collar applied and IV access secured.',
      'doctor.ilieva: FAST exam negative, left femur deformity noted.',
      'nurse.ivan: Analgesia given, preparing transfer to ICU bed.',
    ],
    history: [
      historyStep(
        5,
        'registry.admissions',
        'trauma',
        'RED',
        'doctor.ilieva',
        true,
      ),
      historyStep(
        18,
        'doctor.ilieva',
        'ct-scan',
        'RED',
        'tester.scan',
        true,
      ),
      historyStep(28, 'doctor.ilieva', 'icu', 'RED', 'doctor.nikola', false),
    ],
    queue: [queueStep(28, 'doctor.ilieva', 'icu', 'RED')],
  },
  {
    key: 'elena-koleva-copd-escalation',
    admittedMinutesAgo: 610,
    checkIn: {
      name: 'Elena Koleva',
      phone_number: '0889001004',
      triage_state: 'YELLOW',
    },
    update: {
      triage_state: 'RED',
    },
    notes: [
      'registry.night: Returned with worsening shortness of breath since early morning.',
      'nurse.elena: Started oxygen at 2 L/min, saturation improved from 88% to 92%.',
      'doctor.nikola: COPD exacerbation suspected, nebulizer and steroids started.',
      'nurse.petya: Work of breathing increased again during the last hour.',
    ],
    history: [
      historyStep(
        12,
        'registry.night',
        'pulmonology',
        'YELLOW',
        'doctor.nikola',
        true,
      ),
      historyStep(
        40,
        'doctor.nikola',
        'blood-test',
        'YELLOW',
        'tester.lab',
        true,
      ),
      historyStep(
        75,
        'doctor.nikola',
        'x-ray',
        'YELLOW',
        'tester.scan',
        true,
      ),
      historyStep(130, 'doctor.nikola', 'icu', 'RED', 'doctor.nikola', false),
    ],
    queue: [queueStep(130, 'doctor.nikola', 'icu', 'RED')],
  },
  {
    key: 'ivan-stoyanov-stroke-ruleout',
    admittedMinutesAgo: 155,
    checkIn: {
      name: 'Ivan Stoyanov',
      phone_number: '0889001005',
      triage_state: 'RED',
    },
    notes: [
      'registry.frontdesk: Sudden facial droop and slurred speech reported by spouse.',
      'nurse.martin: Stroke protocol initiated on arrival.',
      'doctor.dimitrov: CT negative for bleed, monitoring for ischemic event.',
    ],
    history: [
      historyStep(
        6,
        'registry.frontdesk',
        'neurology',
        'RED',
        'doctor.dimitrov',
        true,
      ),
      historyStep(
        18,
        'doctor.dimitrov',
        'ct-scan',
        'RED',
        'tester.scan',
        true,
      ),
      historyStep(
        32,
        'doctor.dimitrov',
        'blood-test',
        'RED',
        'tester.lab',
        true,
      ),
      historyStep(
        70,
        'doctor.dimitrov',
        'neurology',
        'RED',
        'doctor.dimitrov',
        false,
      ),
    ],
    queue: [queueStep(70, 'doctor.dimitrov', 'neurology', 'RED')],
  },
  {
    key: 'desislava-taneva-post-op-fever',
    admittedMinutesAgo: 830,
    checkIn: {
      name: 'Desislava Taneva',
      phone_number: '0889001006',
      triage_state: 'YELLOW',
    },
    notes: [
      'registry.night: Recent discharge after gallbladder surgery, now febrile.',
      'nurse.ivan: Temperature 38.6 C, incision site dry with no drainage.',
      'doctor.rahman: Concern for early post-op infection, cultures requested.',
    ],
    history: [
      historyStep(
        25,
        'registry.night',
        'infectious-disease',
        'YELLOW',
        'doctor.rahman',
        true,
      ),
      historyStep(
        80,
        'doctor.rahman',
        'blood-test',
        'YELLOW',
        'tester.lab',
        false,
      ),
      historyStep(
        110,
        'doctor.rahman',
        'imaging',
        'YELLOW',
        'tester.scan',
        false,
      ),
    ],
    queue: [
      queueStep(80, 'doctor.rahman', 'blood-test', 'YELLOW'),
      queueStep(110, 'doctor.rahman', 'imaging', 'YELLOW'),
    ],
  },
  {
    key: 'nikolay-rusev-pediatric-fever',
    admittedMinutesAgo: 190,
    checkIn: {
      name: 'Nikolay Rusev',
      phone_number: '0889001007',
      triage_state: 'GREEN',
    },
    notes: [
      'registry.admissions: Parent reports fever for two days and reduced appetite.',
      'doctor.todorov: Likely viral illness, maintaining fluids and awaiting reassessment.',
    ],
    history: [
      historyStep(
        10,
        'registry.admissions',
        'pediatrics',
        'GREEN',
        'doctor.todorov',
        true,
      ),
      historyStep(
        48,
        'doctor.todorov',
        'blood-test',
        'GREEN',
        'tester.lab',
        true,
      ),
    ],
    queue: [],
  },
  {
    key: 'stela-markova-fall-xray',
    admittedMinutesAgo: 280,
    checkIn: {
      name: 'Stela Markova',
      phone_number: '0889001008',
      triage_state: 'GREEN',
    },
    update: {
      triage_state: 'YELLOW',
    },
    notes: [
      'registry.frontdesk: Fell on wet stairs, unable to fully bear weight on right ankle.',
      'nurse.petya: Swelling increasing during observation, pain now 6/10.',
    ],
    history: [
      historyStep(
        14,
        'registry.frontdesk',
        'orthopedics',
        'GREEN',
        'doctor.ilieva',
        true,
      ),
      historyStep(
        40,
        'doctor.ilieva',
        'x-ray',
        'YELLOW',
        'tester.scan',
        false,
      ),
    ],
    queue: [queueStep(40, 'doctor.ilieva', 'x-ray', 'YELLOW')],
  },
  {
    key: 'asma-yilmaz-renal-colic',
    admittedMinutesAgo: 320,
    checkIn: {
      name: 'Asma Yilmaz',
      phone_number: '0889001009',
      triage_state: 'YELLOW',
    },
    notes: [
      'registry.admissions: Sudden right flank pain radiating to the groin.',
      'nurse.martin: Pain improved after analgesia, nausea persists.',
      'doctor.rahman: Differential includes renal colic, urinalysis pending.',
    ],
    history: [
      historyStep(
        16,
        'registry.admissions',
        'internal-medicine',
        'YELLOW',
        'doctor.rahman',
        true,
      ),
      historyStep(
        42,
        'doctor.rahman',
        'ultrasound',
        'YELLOW',
        'tester.echo',
        true,
      ),
      historyStep(
        60,
        'doctor.rahman',
        'urinalysis',
        'YELLOW',
        'tester.lab',
        false,
      ),
    ],
    queue: [queueStep(60, 'doctor.rahman', 'urinalysis', 'YELLOW')],
  },
  {
    key: 'georgi-atanasov-name-fix',
    admittedMinutesAgo: 75,
    checkIn: {
      name: 'Georgi Atansov',
      phone_number: '0889001010',
      triage_state: 'GREEN',
    },
    update: {
      name: 'Georgi Atanasov',
    },
    notes: [
      'registry.frontdesk: Name spelling corrected after ID check at the desk.',
      'nurse.ivan: Mild headache only, waiting for clinician availability.',
    ],
    history: [],
    queue: [],
  },
  {
    key: 'vesela-hristova-sepsis-watch',
    admittedMinutesAgo: 425,
    checkIn: {
      name: 'Vesela Hristova',
      phone_number: '0889001011',
      triage_state: 'YELLOW',
    },
    update: {
      triage_state: 'RED',
    },
    notes: [
      'registry.night: High fever and confusion reported by family.',
      'nurse.elena: Started IV fluids, lactate requested urgently.',
      'doctor.rahman: Sepsis pathway opened, broad-spectrum antibiotics started.',
      'nurse.martin: Blood pressure trending down despite fluids.',
    ],
    history: [
      historyStep(
        10,
        'registry.night',
        'infectious-disease',
        'YELLOW',
        'doctor.rahman',
        true,
      ),
      historyStep(
        25,
        'doctor.rahman',
        'blood-test',
        'RED',
        'tester.lab',
        true,
      ),
      historyStep(
        50,
        'doctor.rahman',
        'imaging',
        'RED',
        'tester.scan',
        false,
      ),
      historyStep(55, 'doctor.rahman', 'icu', 'RED', 'doctor.nikola', false),
    ],
    queue: [
      queueStep(50, 'doctor.rahman', 'imaging', 'RED'),
      queueStep(55, 'doctor.rahman', 'icu', 'RED'),
    ],
  },
  {
    key: 'kalin-bonev-cardiac-monitoring',
    admittedMinutesAgo: 1310,
    checkIn: {
      name: 'Kalin Bonev',
      phone_number: '0889001012',
      triage_state: 'YELLOW',
    },
    notes: [
      'registry.admissions: Palpitations started overnight and recurred this morning.',
      'nurse.petya: Telemetry shows intermittent supraventricular tachycardia.',
      'doctor.petrova: Monitoring response to rate control, keeping overnight.',
      'nurse.elena: No new chest pain, resting comfortably at present.',
    ],
    history: [
      historyStep(
        20,
        'registry.admissions',
        'cardiology',
        'YELLOW',
        'doctor.petrova',
        true,
      ),
      historyStep(
        70,
        'doctor.petrova',
        'echocardiogram',
        'YELLOW',
        'tester.echo',
        true,
      ),
      historyStep(
        105,
        'doctor.petrova',
        'blood-test',
        'YELLOW',
        'tester.lab',
        true,
      ),
      historyStep(
        210,
        'doctor.petrova',
        'cardiology',
        'YELLOW',
        'doctor.petrova',
        true,
      ),
    ],
    queue: [],
  },
  {
    key: 'yordan-savov-gastro-observation',
    admittedMinutesAgo: 110,
    checkIn: {
      name: 'Yordan Savov',
      phone_number: '0889001013',
      triage_state: 'GREEN',
    },
    notes: [
      'registry.frontdesk: Recurrent vomiting after suspected food poisoning.',
      'nurse.ivan: Tolerating small sips of water, abdominal pain remains mild.',
    ],
    history: [
      historyStep(
        12,
        'registry.frontdesk',
        'internal-medicine',
        'GREEN',
        'doctor.rahman',
        false,
      ),
    ],
    queue: [queueStep(12, 'registry.frontdesk', 'internal-medicine', 'GREEN')],
  },
  {
    key: 'milena-kostova-diabetic-dizziness',
    admittedMinutesAgo: 260,
    checkIn: {
      name: 'Milena Kostova',
      phone_number: '0889001014',
      triage_state: 'YELLOW',
    },
    notes: [
      'registry.admissions: Type 2 diabetic, nearly fainted at work.',
      'nurse.martin: Fingerstick glucose corrected after juice, dizziness improved slightly.',
      'doctor.rahman: Wants abdominal ultrasound before deciding on discharge.',
    ],
    history: [
      historyStep(
        14,
        'registry.admissions',
        'internal-medicine',
        'YELLOW',
        'doctor.rahman',
        true,
      ),
      historyStep(
        35,
        'doctor.rahman',
        'blood-test',
        'YELLOW',
        'tester.lab',
        true,
      ),
      historyStep(
        58,
        'doctor.rahman',
        'ultrasound',
        'YELLOW',
        'tester.echo',
        false,
      ),
    ],
    queue: [queueStep(58, 'doctor.rahman', 'ultrasound', 'YELLOW')],
  },
];

export function buildPatientScenarios(now = new Date()): PatientScenarioSeed[] {
  return patientScenarioDefinitions.map((scenario) => {
    const admittedAt = new Date(
      now.getTime() - scenario.admittedMinutesAgo * 60 * 1000,
    );

    const buildTimestamp = (minutesAfterAdmission: number) =>
      new Date(admittedAt.getTime() + minutesAfterAdmission * 60 * 1000);

    const cleanupPhones = [
      scenario.checkIn.phone_number.trim(),
      scenario.update?.phone_number?.trim(),
    ].filter((phone): phone is string => Boolean(phone));

    return {
      key: scenario.key,
      admittedAt,
      cleanupPhones,
      checkIn: scenario.checkIn,
      update: scenario.update,
      notes: scenario.notes,
      history: scenario.history.map(({ minutesAfterAdmission, ...entry }) => ({
        ...entry,
        timestamp: buildTimestamp(minutesAfterAdmission),
      })),
      queue: scenario.queue.map(({ minutesAfterAdmission, ...entry }) => ({
        ...entry,
        timestamp: buildTimestamp(minutesAfterAdmission),
      })),
    };
  });
}
