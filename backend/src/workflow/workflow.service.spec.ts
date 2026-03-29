import { ConflictException, NotFoundException } from '@nestjs/common';
import type { User } from '../../generated/prisma/client';
import type { AuthUser } from '../auth/auth.types';
import type { PatientDetailsResponseI } from '../patient/patient.dto';
import type { QueueRecordI } from '../patient/patient.type';
import { PatientService } from '../patient/patient.service';
import { MatcherService } from '../service/matcher.service';
import { StreamService } from '../service/stream.service';
import { createRedisServiceMock } from '../test-utils/fake-redis';
import {
  getDoctorCurrentPatientKey,
  getPatientCurrentAssignmentKey,
  getPatientQueueKey,
  getPatientRecordKey,
  getTriagePriority,
  parseStoredPatientRecordString,
  readPatientQueue,
  serializePatientRecord,
  serializeQueueRecord,
} from './workflow.store';
import { WorkflowService } from './workflow.service';

describe('WorkflowService', () => {
  let redisService: ReturnType<typeof createRedisServiceMock>;
  let matcherService: jest.Mocked<
    Pick<MatcherService, 'getDoctorByUsername' | 'matchPatientsToDoctor'>
  >;
  let streamService: jest.Mocked<Pick<StreamService, 'pushEvent'>>;
  let patientService: PatientService;
  let workflowService: WorkflowService;

  const doctorUser: AuthUser = {
    username: 'doctor.nikola',
    role: 'doctor',
    isTester: false,
    specialties: ['icu'],
  };
  const testerUser: AuthUser = {
    username: 'tester.lab',
    role: 'doctor',
    isTester: true,
    specialties: ['blood-test'],
  };

  beforeEach(() => {
    redisService = createRedisServiceMock();
    matcherService = {
      getDoctorByUsername: jest.fn<Promise<User | null>, [string]>(),
      matchPatientsToDoctor: jest.fn<Promise<User | null>, [string?]>(),
    };
    matcherService.matchPatientsToDoctor.mockResolvedValue(null);
    matcherService.getDoctorByUsername.mockResolvedValue(null);
    streamService = {
      pushEvent: jest.fn(),
    };
    patientService = new PatientService(
      redisService as never,
      streamService as never,
    );
    workflowService = new WorkflowService(
      redisService as never,
      matcherService as never,
      streamService as never,
      patientService,
    );
  });

  it('enqueues a referral and emits a resolved queue snapshot', async () => {
    const patient = buildPatient({ id: 'patient-1' });
    await seedPatient(redisService, patient);

    await workflowService.sendPatient(doctorUser, {
      patient: patient.id,
      specialty: 'cardiology',
      triage: 'YELLOW',
    });

    const queue = await readPatientQueue(
      redisService.client as never,
      patient.id,
    );

    expect(matcherService.matchPatientsToDoctor).toHaveBeenCalledWith();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      specialty: 'cardiology',
      triage_state: 'YELLOW',
      reffered_by_id: doctorUser.username,
    });
    expect(streamService.pushEvent).toHaveBeenLastCalledWith({
      type: 'patient:update',
      data: {
        id: patient.id,
        queue,
      },
    });
  });

  it('returns 404 when sending a referral for a missing patient', async () => {
    await expect(
      workflowService.sendPatient(doctorUser, {
        patient: 'missing',
        specialty: 'cardiology',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects freeing a doctor without an active patient', async () => {
    await expect(workflowService.freeDoctor(doctorUser)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('marks released doctor history as completed for non-testers', async () => {
    const patient = buildPatient({
      id: 'patient-2',
      queue: [
        buildQueueRecord({
          specialty: 'cardiology',
          reffered_by_id: 'registry.admissions',
          timestamp: new Date('2026-03-29T10:00:00.000Z'),
        }),
      ],
    });
    const currentAssignment = buildQueueRecord({
      specialty: 'imaging',
      triage_state: 'YELLOW',
      reffered_by_id: 'registry.admissions',
      timestamp: new Date('2026-03-29T10:05:00.000Z'),
    });
    await seedPatient(redisService, patient);
    await redisService.client.set(
      getDoctorCurrentPatientKey(doctorUser.username),
      patient.id,
    );
    await redisService.client.set(
      getPatientCurrentAssignmentKey(patient.id),
      serializeQueueRecord(currentAssignment),
    );

    await workflowService.freeDoctor(doctorUser);

    const storedRecord = await redisService.client.get(
      getPatientRecordKey(patient.id),
    );
    const parsedRecord = storedRecord
      ? parseStoredPatientRecordString(storedRecord)
      : null;

    expect(parsedRecord?.history).toHaveLength(1);
    expect(parsedRecord?.history[0]).toMatchObject({
      specialty: 'imaging',
      triage_state: 'YELLOW',
      reffered_by_id: 'registry.admissions',
      reffered_to_id: doctorUser.username,
      is_done: true,
    });
    expect(matcherService.matchPatientsToDoctor).toHaveBeenCalledWith(
      patient.id,
    );
    expect(
      await redisService.client.get(
        getDoctorCurrentPatientKey(doctorUser.username),
      ),
    ).toBeNull();
    expect(
      await redisService.client.get(getPatientCurrentAssignmentKey(patient.id)),
    ).toBeNull();
  });

  it('marks released doctor history as unfinished for testers', async () => {
    const patient = buildPatient({ id: 'patient-3' });
    const currentAssignment = buildQueueRecord({
      specialty: 'blood-test',
      triage_state: 'GREEN',
      reffered_by_id: 'doctor.nikola',
      timestamp: new Date('2026-03-29T11:05:00.000Z'),
    });
    await seedPatient(redisService, patient);
    await redisService.client.set(
      getDoctorCurrentPatientKey(testerUser.username),
      patient.id,
    );
    await redisService.client.set(
      getPatientCurrentAssignmentKey(patient.id),
      serializeQueueRecord(currentAssignment),
    );

    await workflowService.freeDoctor(testerUser);

    const storedRecord = await redisService.client.get(
      getPatientRecordKey(patient.id),
    );
    const parsedRecord = storedRecord
      ? parseStoredPatientRecordString(storedRecord)
      : null;

    expect(parsedRecord?.history[0]?.is_done).toBe(false);
  });

  it('does not requeue until the last unfinished test for the referring doctor is done', async () => {
    const patient = buildPatient({
      id: 'patient-4',
      history: [
        buildHistoryRecord({
          specialty: 'blood-test',
          reffered_by_id: doctorUser.username,
          is_done: false,
        }),
        buildHistoryRecord({
          specialty: 'scanner',
          reffered_by_id: doctorUser.username,
          is_done: false,
        }),
      ],
    });
    await seedPatient(redisService, patient);

    await workflowService.finishTest({
      patient: patient.id,
      specialty: 'blood-test',
    });

    const queue = await readPatientQueue(
      redisService.client as never,
      patient.id,
    );
    const storedRecord = await redisService.client.get(
      getPatientRecordKey(patient.id),
    );
    const parsedRecord = storedRecord
      ? parseStoredPatientRecordString(storedRecord)
      : null;

    expect(queue).toHaveLength(0);
    expect(parsedRecord?.history.map((entry) => entry.is_done)).toEqual([
      true,
      false,
    ]);
    expect(matcherService.matchPatientsToDoctor).not.toHaveBeenCalled();
  });

  it('requeues the patient when the last unfinished test is completed', async () => {
    const patient = buildPatient({
      id: 'patient-5',
      history: [
        buildHistoryRecord({
          specialty: 'blood-test',
          triage_state: 'YELLOW',
          reffered_by_id: doctorUser.username,
          is_done: false,
        }),
      ],
    });
    await seedPatient(redisService, patient);
    matcherService.getDoctorByUsername.mockResolvedValue(
      buildDoctor({
        username: doctorUser.username,
        specialties: JSON.stringify(['icu', 'pulmonology']),
      }),
    );

    await workflowService.finishTest({
      patient: patient.id,
      specialty: 'blood-test',
    });

    const queue = await readPatientQueue(
      redisService.client as never,
      patient.id,
    );

    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      specialty: 'icu',
      triage_state: 'YELLOW',
      reffered_by_id: doctorUser.username,
    });
    expect(matcherService.matchPatientsToDoctor).toHaveBeenCalledWith();
  });

  it('returns 404 when finishing a test for a missing patient', async () => {
    await expect(
      workflowService.finishTest({
        patient: 'missing',
        specialty: 'blood-test',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

function buildPatient(
  overrides: Partial<PatientDetailsResponseI> &
    Pick<PatientDetailsResponseI, 'id'>,
): PatientDetailsResponseI {
  return {
    id: overrides.id,
    name: overrides.name ?? 'Test Patient',
    phone_number:
      overrides.phone_number ?? `0888${overrides.id.padStart(6, '0')}`,
    triage_state: overrides.triage_state ?? 'GREEN',
    admitted_at: overrides.admitted_at ?? new Date('2026-03-29T09:00:00.000Z'),
    notes: overrides.notes ?? [],
    history: overrides.history ?? [],
    queue: overrides.queue ?? [],
  };
}

function buildQueueRecord(overrides: Partial<QueueRecordI>): QueueRecordI {
  return {
    timestamp: overrides.timestamp ?? new Date('2026-03-29T09:30:00.000Z'),
    triage_state: overrides.triage_state ?? 'GREEN',
    specialty: overrides.specialty ?? 'cardiology',
    reffered_by_id: overrides.reffered_by_id ?? 'registry.admissions',
  };
}

function buildHistoryRecord(
  overrides: Partial<PatientDetailsResponseI['history'][number]>,
): PatientDetailsResponseI['history'][number] {
  return {
    reffered_by_id: overrides.reffered_by_id ?? 'doctor.nikola',
    specialty: overrides.specialty ?? 'blood-test',
    triage_state: overrides.triage_state ?? 'GREEN',
    reffered_to_id: overrides.reffered_to_id ?? 'tester.lab',
    is_done: overrides.is_done ?? false,
    timestamp: overrides.timestamp ?? new Date('2026-03-29T09:45:00.000Z'),
  };
}

function buildDoctor(overrides: Partial<User> & Pick<User, 'username'>): User {
  return {
    username: overrides.username,
    passwordHash: overrides.passwordHash ?? 'hash',
    role: overrides.role ?? 'doctor',
    isTester: overrides.isTester ?? false,
    specialties: overrides.specialties ?? JSON.stringify(['icu']),
  };
}

async function seedPatient(
  redisService: ReturnType<typeof createRedisServiceMock>,
  patient: PatientDetailsResponseI,
): Promise<void> {
  await redisService.client.set(
    getPatientRecordKey(patient.id),
    JSON.stringify(serializePatientRecord(patient)),
  );

  if (patient.queue.length > 0) {
    await redisService.client.zAdd(
      getPatientQueueKey(patient.id),
      patient.queue.map((entry) => ({
        score: getTriagePriority(entry.triage_state),
        value: serializeQueueRecord(entry),
      })),
    );
  }
}
