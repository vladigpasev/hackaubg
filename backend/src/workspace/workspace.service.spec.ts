import { ConflictException } from '@nestjs/common';
import type { User } from '../../generated/prisma/client';
import type { AuthUser } from '../auth/auth.types';
import type { PatientDetailsResponseI } from '../patient/patient.dto';
import { PatientService } from '../patient/patient.service';
import { StreamService } from '../service/stream.service';
import { createRedisServiceMock } from '../test-utils/fake-redis';
import {
  readStoredPatientAgenda,
  readStoredPatientNotifications,
  writeStoredPatientAgenda,
  writeStoredPatientNotifications,
} from './workspace.store';
import { WorkspaceService } from './workspace.service';
import type {
  StoredDoctorVisit,
  StoredLabBatch,
  StoredLabItem,
  StoredPatientNotification,
} from './workspace.types';

describe('WorkspaceService', () => {
  let redisService: ReturnType<typeof createRedisServiceMock>;
  let patientService: jest.Mocked<
    Pick<PatientService, 'attachNote' | 'getAllPatients' | 'getPatientDetails'>
  >;
  let prismaService: {
    user: {
      findMany: jest.Mock;
    };
  };
  let streamService: jest.Mocked<Pick<StreamService, 'pushEvent'>>;
  let workspaceService: WorkspaceService;

  const doctorUser: AuthUser = {
    username: 'doctor.nikola',
    role: 'doctor',
    isTester: false,
    specialties: ['Cardiology'],
  };

  const secondDoctorUser: AuthUser = {
    username: 'doctor.petrova',
    role: 'doctor',
    isTester: false,
    specialties: ['Cardiology'],
  };

  const testerUser: AuthUser = {
    username: 'tester.lab',
    role: 'doctor',
    isTester: true,
    specialties: ['Laboratory Medicine'],
  };

  const nurseUser: AuthUser = {
    username: 'nurse.elena',
    role: 'nurse',
    isTester: false,
    specialties: [],
  };

  beforeEach(() => {
    redisService = createRedisServiceMock();
    patientService = {
      attachNote: jest.fn(),
      getAllPatients: jest.fn().mockResolvedValue([buildPatientCore()]),
      getPatientDetails: jest.fn().mockResolvedValue(buildPatientDetails()),
    };
    prismaService = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          buildUser('doctor.nikola', false, ['Cardiology']),
          buildUser('doctor.petrova', false, ['Cardiology']),
          buildUser('tester.lab', true, ['Laboratory Medicine']),
        ]),
      },
    };
    streamService = {
      pushEvent: jest.fn(),
    };
    workspaceService = new WorkspaceService(
      patientService as never,
      prismaService as never,
      redisService as never,
      streamService as never,
    );
  });

  it('accepts the highest-priority patient from the shared specialty queue', async () => {
    patientService.getAllPatients.mockResolvedValue([
      buildPatientCore('PAT-1', 'Patient One'),
      buildPatientCore('PAT-2', 'Patient Two'),
    ]);
    patientService.getPatientDetails.mockImplementation(async (patientId) =>
      buildPatientDetails(patientId, patientId === 'PAT-1' ? 'Patient One' : 'Patient Two'),
    );

    await writeStoredPatientAgenda(redisService.client as never, 'PAT-1', [
      buildQueuedDoctorVisit('VISIT-1', 'Cardiology', 'GREEN', '2026-03-29T09:05:00.000Z'),
    ]);
    await writeStoredPatientAgenda(redisService.client as never, 'PAT-2', [
      buildQueuedDoctorVisit('VISIT-2', 'Cardiology', 'YELLOW', '2026-03-29T09:06:00.000Z'),
    ]);

    const result = await workspaceService.acceptNextDoctorVisit(secondDoctorUser);

    const patientOneAgenda = await readStoredPatientAgenda(
      redisService.client as never,
      'PAT-1',
    );
    const patientTwoAgenda = await readStoredPatientAgenda(
      redisService.client as never,
      'PAT-2',
    );

    expect(result.patient.id).toBe('PAT-2');
    expect(patientOneAgenda[0]).toMatchObject({
      assignedDoctorUsername: null,
      queueOrder: 1,
      status: 'queued',
    });
    expect(patientTwoAgenda[0]).toMatchObject({
      assignedDoctorUsername: 'doctor.petrova',
      queueOrder: 0,
      status: 'with_staff',
    });
  });

  it('releases a not-here patient back into the shared queue behind normal queued items', async () => {
    patientService.getAllPatients.mockResolvedValue([
      buildPatientCore('PAT-1', 'Patient One'),
      buildPatientCore('PAT-2', 'Patient Two'),
    ]);
    patientService.getPatientDetails.mockImplementation(async (patientId) =>
      buildPatientDetails(patientId, patientId === 'PAT-1' ? 'Patient One' : 'Patient Two'),
    );

    await writeStoredPatientAgenda(redisService.client as never, 'PAT-1', [
      buildQueuedDoctorVisit('VISIT-1', 'Cardiology', 'GREEN', '2026-03-29T09:05:00.000Z'),
    ]);
    await writeStoredPatientAgenda(redisService.client as never, 'PAT-2', [
      buildQueuedDoctorVisit('VISIT-2', 'Cardiology', 'GREEN', '2026-03-29T09:06:00.000Z'),
    ]);

    await workspaceService.acceptNextDoctorVisit(doctorUser);
    await workspaceService.markDoctorVisitNotHere(doctorUser, 'VISIT-1');

    const patientOneAgenda = await readStoredPatientAgenda(
      redisService.client as never,
      'PAT-1',
    );
    const patientTwoAgenda = await readStoredPatientAgenda(
      redisService.client as never,
      'PAT-2',
    );

    expect(patientOneAgenda[0]).toMatchObject({
      assignedDoctorUsername: null,
      queueOrder: 2,
      status: 'not_here',
    });
    expect(patientTwoAgenda[0]).toMatchObject({
      assignedDoctorUsername: null,
      queueOrder: 1,
      status: 'queued',
    });
  });

  it('creates a newest-first nurse notification when a patient is marked as not here', async () => {
    await writeStoredPatientAgenda(redisService.client as never, 'PAT-1', [
      buildQueuedDoctorVisit('VISIT-1', 'Cardiology', 'GREEN', '2026-03-29T09:05:00.000Z'),
    ]);
    await writeStoredPatientNotifications(redisService.client as never, 'PAT-1', [
      {
        agendaEntryId: 'VISIT-0',
        createdAt: '2026-03-28T06:30:00.000Z',
        id: 'NOTIF-OLDER',
        message: 'Older guidance',
        patientId: 'PAT-1',
        readAt: null,
        targetDoctorUsername: null,
        targetRole: 'nurse',
        title: 'Guide patient',
        type: 'patient_guidance',
      } satisfies StoredPatientNotification,
    ]);

    await workspaceService.acceptNextDoctorVisit(doctorUser);
    const result = await workspaceService.markDoctorVisitNotHere(
      doctorUser,
      'VISIT-1',
    );
    const notifications = await readStoredPatientNotifications(
      redisService.client as never,
      'PAT-1',
    );

    expect(notifications[0]).toMatchObject({
      readAt: null,
      targetRole: 'nurse',
      title: 'Patient not here',
      type: 'patient_guidance',
    });
    expect(notifications[0].message).toContain('Please locate them');
    expect(notifications[1]?.id).toBe('NOTIF-OLDER');
    expect(result.notifications[0]?.title).toBe('Patient not here');
  });

  it('frees the tester after collecting a test so the next patient can be accepted', async () => {
    patientService.getAllPatients.mockResolvedValue([
      buildPatientCore('PAT-1', 'Patient One'),
      buildPatientCore('PAT-2', 'Patient Two'),
    ]);
    patientService.getPatientDetails.mockImplementation(async (patientId) =>
      buildPatientDetails(patientId, patientId === 'PAT-1' ? 'Patient One' : 'Patient Two'),
    );

    await writeStoredPatientAgenda(redisService.client as never, 'PAT-1', [
      buildCollectingBatch('BATCH-1', 'LAB-ITEM-1', '2026-03-29T09:10:00.000Z'),
    ]);
    await writeStoredPatientAgenda(redisService.client as never, 'PAT-2', [
      buildCollectingBatch('BATCH-2', 'LAB-ITEM-2', '2026-03-29T09:11:00.000Z'),
    ]);

    await workspaceService.acceptNextLabItem(testerUser);
    await workspaceService.markLabItemTaken(testerUser, 'LAB-ITEM-1');
    const result = await workspaceService.acceptNextLabItem(testerUser);

    const firstAgenda = await readStoredPatientAgenda(
      redisService.client as never,
      'PAT-1',
    );
    const secondAgenda = await readStoredPatientAgenda(
      redisService.client as never,
      'PAT-2',
    );

    expect(result.patient.id).toBe('PAT-2');
    expect((firstAgenda[0] as StoredLabBatch).items[0]).toMatchObject({
      assignedDoctorUsername: null,
      status: 'taken',
    });
    expect((secondAgenda[0] as StoredLabBatch).items[0]).toMatchObject({
      assignedDoctorUsername: 'tester.lab',
      status: 'with_staff',
    });
  });

  it('allows non-servicing staff to mark results ready and creates a return visit for the ordering doctor', async () => {
    await writeStoredPatientAgenda(redisService.client as never, 'PAT-1', [
      buildWaitingResultsBatch(),
    ]);

    await workspaceService.markLabItemResultsReady(nurseUser, 'LAB-ITEM-1');
    const result = await workspaceService.markLabItemResultsReady(
      nurseUser,
      'LAB-ITEM-2',
    );

    const finalAgenda = await readStoredPatientAgenda(
      redisService.client as never,
      'PAT-1',
    );
    const finalBatch = finalAgenda.find(
      (entry): entry is StoredLabBatch => entry.entryType === 'lab_batch',
    );
    const returnVisit = finalAgenda.find(
      (entry): entry is StoredDoctorVisit =>
        entry.entryType === 'doctor_visit' &&
        entry.isReturnVisit &&
        entry.sourceVisitId === 'VISIT-1',
    );

    expect(finalBatch).toMatchObject({
      id: 'BATCH-1',
      returnDoctorUsername: 'doctor.nikola',
      status: 'return_created',
    });
    expect(finalBatch?.items.every((item) => item.status === 'results_ready')).toBe(true);
    expect(finalBatch?.items.every((item) => item.assignedDoctorUsername === null)).toBe(true);
    expect(finalBatch?.items.every((item) => item.resultsReadyByLabel === 'Nurse station')).toBe(true);
    expect(returnVisit).toMatchObject({
      assignedDoctorUsername: 'doctor.nikola',
      isReturnVisit: true,
      requestedByLabel: 'Dr. Nikola',
      specialty: 'Cardiology',
      sourceVisitId: 'VISIT-1',
      status: 'queued',
    });
    expect(
      result.patient.agenda.some(
        (entry) =>
          entry.entryType === 'doctor_visit' &&
          entry.isReturnVisit &&
          entry.assignedDoctorId !== null,
      ),
    ).toBe(true);
  });

  it('does not let another doctor accept a return visit reserved for the ordering doctor', async () => {
    patientService.getAllPatients.mockResolvedValue([
      buildPatientCore('PAT-1', 'Patient One'),
      buildPatientCore('PAT-2', 'Patient Two'),
    ]);
    patientService.getPatientDetails.mockImplementation(async (patientId) =>
      buildPatientDetails(patientId, patientId === 'PAT-1' ? 'Patient One' : 'Patient Two'),
    );

    await writeStoredPatientAgenda(redisService.client as never, 'PAT-1', [
      buildQueuedDoctorVisit(
        'VISIT-RETURN',
        'Cardiology',
        'YELLOW',
        '2026-03-29T09:05:00.000Z',
        {
          assignedDoctorUsername: 'doctor.nikola',
          isReturnVisit: true,
          requestedByLabel: 'Dr. Nikola',
          sourceVisitId: 'VISIT-SOURCE',
        },
      ),
    ]);
    await writeStoredPatientAgenda(redisService.client as never, 'PAT-2', [
      buildQueuedDoctorVisit('VISIT-SHARED', 'Cardiology', 'GREEN', '2026-03-29T09:06:00.000Z'),
    ]);

    const secondDoctorResult =
      await workspaceService.acceptNextDoctorVisit(secondDoctorUser);
    const firstDoctorResult = await workspaceService.acceptNextDoctorVisit(
      doctorUser,
    );

    expect(secondDoctorResult.patient.id).toBe('PAT-2');
    expect(firstDoctorResult.patient.id).toBe('PAT-1');
  });

  it('rejects queue mutations while the shared lock is held', async () => {
    await writeStoredPatientAgenda(redisService.client as never, 'PAT-1', [
      buildQueuedDoctorVisit('VISIT-1', 'Cardiology', 'GREEN', '2026-03-29T09:05:00.000Z'),
    ]);
    await redisService.client.set('workspace:queue:lock', 'held', { NX: true });

    await expect(workspaceService.acceptNextDoctorVisit(doctorUser)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

function buildUser(
  username: string,
  isTester: boolean,
  specialties: string[],
): User {
  return {
    username,
    passwordHash: 'secret',
    role: 'doctor',
    isTester,
    specialties: JSON.stringify(specialties),
  };
}

function buildPatientCore(id = 'PAT-1', name = 'Patient One') {
  return {
    admitted_at: new Date('2026-03-29T09:00:00.000Z'),
    id,
    name,
    notes: [],
    phone_number: '+359888123456',
    triage_state: 'GREEN' as const,
  };
}

function buildPatientDetails(
  id = 'PAT-1',
  name = 'Patient One',
): PatientDetailsResponseI {
  return {
    ...buildPatientCore(id, name),
    history: [],
    queue: [],
  };
}

function buildQueuedDoctorVisit(
  id: string,
  specialty: string,
  code: 'GREEN' | 'YELLOW',
  createdAt: string,
  overrides: Partial<StoredDoctorVisit> = {},
): StoredDoctorVisit {
  return {
    id,
    entryType: 'doctor_visit',
    specialty,
    requestedByActorId: 'registry.frontdesk',
    requestedByLabel: 'Registry desk',
    assignedDoctorUsername: null,
    code,
    status: 'queued',
    note: '',
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
    sourceVisitId: null,
    blockedByBatchId: null,
    isReturnVisit: false,
    queueOrder: 0,
    ...overrides,
  };
}

function buildCollectingBatch(
  batchId: string,
  itemId: string,
  createdAt: string,
): StoredLabBatch {
  return {
    id: batchId,
    entryType: 'lab_batch',
    status: 'collecting',
    orderedByActorId: 'doctor.nikola',
    orderedByLabel: 'Dr. Nikola',
    returnDoctorUsername: 'doctor.nikola',
    returnSpecialty: 'Cardiology',
    returnCode: 'GREEN',
    note: '',
    createdAt,
    updatedAt: createdAt,
    resultsReadyAt: null,
    returnCreatedAt: null,
    sourceVisitId: `VISIT-${batchId}`,
    items: [
      buildQueuedLabItem(itemId, createdAt),
    ],
  };
}

function buildQueuedLabItem(id: string, createdAt: string): StoredLabItem {
  return {
    id,
    testName: 'Blood Test',
    testerSpecialty: 'Laboratory Medicine',
    assignedDoctorUsername: null,
    code: 'GREEN',
    status: 'queued',
    createdAt,
    updatedAt: createdAt,
    takenAt: null,
    resultsReadyAt: null,
    takenByActorId: null,
    takenByLabel: null,
    resultsReadyByActorId: null,
    resultsReadyByLabel: null,
    queueOrder: 0,
  };
}

function buildWaitingResultsBatch(): StoredLabBatch {
  return {
    id: 'BATCH-1',
    entryType: 'lab_batch',
    status: 'waiting_results',
    orderedByActorId: 'doctor.nikola',
    orderedByLabel: 'Dr. Nikola',
    returnDoctorUsername: 'doctor.nikola',
    returnSpecialty: 'Cardiology',
    returnCode: 'GREEN',
    note: '',
    createdAt: '2026-03-29T09:10:00.000Z',
    updatedAt: '2026-03-29T09:20:00.000Z',
    resultsReadyAt: null,
    returnCreatedAt: null,
    sourceVisitId: 'VISIT-1',
    items: [
      {
        id: 'LAB-ITEM-1',
        testName: 'Blood Test',
        testerSpecialty: 'Laboratory Medicine',
        assignedDoctorUsername: null,
        code: 'GREEN',
        status: 'taken',
        createdAt: '2026-03-29T09:10:00.000Z',
        updatedAt: '2026-03-29T09:16:00.000Z',
        takenAt: '2026-03-29T09:16:00.000Z',
        resultsReadyAt: null,
        takenByActorId: 'tester.lab',
        takenByLabel: 'Tester Lab',
        resultsReadyByActorId: null,
        resultsReadyByLabel: null,
        queueOrder: 0,
      },
      {
        id: 'LAB-ITEM-2',
        testName: 'Urine Test',
        testerSpecialty: 'Laboratory Medicine',
        assignedDoctorUsername: null,
        code: 'GREEN',
        status: 'taken',
        createdAt: '2026-03-29T09:11:00.000Z',
        updatedAt: '2026-03-29T09:18:00.000Z',
        takenAt: '2026-03-29T09:18:00.000Z',
        resultsReadyAt: null,
        takenByActorId: 'tester.lab',
        takenByLabel: 'Tester Lab',
        resultsReadyByActorId: null,
        resultsReadyByLabel: null,
        queueOrder: 0,
      },
    ],
  };
}
