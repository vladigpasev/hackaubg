import type { User } from '../../generated/prisma/client';
import type { AuthUser } from '../auth/auth.types';
import type { PatientDetailsResponseI } from '../patient/patient.dto';
import { PatientService } from '../patient/patient.service';
import { StreamService } from '../service/stream.service';
import { createRedisServiceMock } from '../test-utils/fake-redis';
import {
  readStoredPatientAgenda,
  writeStoredPatientAgenda,
} from './workspace.store';
import { WorkspaceService } from './workspace.service';
import type { StoredLabBatch } from './workspace.types';

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

  const testerUser: AuthUser = {
    username: 'tester.lab',
    role: 'doctor',
    isTester: true,
    specialties: ['Laboratory Medicine'],
  };

  beforeEach(async () => {
    redisService = createRedisServiceMock();
    patientService = {
      attachNote: jest.fn(),
      getAllPatients: jest.fn().mockResolvedValue([buildPatientCore()]),
      getPatientDetails: jest.fn().mockResolvedValue(buildPatientDetails()),
    };
    prismaService = {
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            buildUser('doctor.nikola', false, ['Cardiology']),
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

    await writeStoredPatientAgenda(redisService.client as never, 'PAT-1', [
      buildWaitingResultsBatch(),
    ]);
  });

  it('returns the patient to the ordering doctor when the last lab result is ready', async () => {
    await workspaceService.markLabItemResultsReady(testerUser, 'LAB-ITEM-1');

    const agendaAfterFirstResult = await readStoredPatientAgenda(
      redisService.client as never,
      'PAT-1',
    );
    const batchAfterFirstResult = agendaAfterFirstResult.find(
      (entry): entry is StoredLabBatch => entry.entryType === 'lab_batch',
    );

    expect(batchAfterFirstResult).toMatchObject({
      id: 'BATCH-1',
      status: 'waiting_results',
    });
    expect(batchAfterFirstResult?.items.map((item) => item.status)).toEqual([
      'results_ready',
      'taken',
    ]);
    expect(
      agendaAfterFirstResult.some(
        (entry) =>
          entry.entryType === 'doctor_visit' &&
          entry.isReturnVisit &&
          entry.sourceVisitId === 'VISIT-1',
      ),
    ).toBe(false);

    const result = await workspaceService.markLabItemResultsReady(
      testerUser,
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
      (entry) =>
        entry.entryType === 'doctor_visit' &&
        entry.isReturnVisit &&
        entry.sourceVisitId === 'VISIT-1',
    );

    expect(finalBatch).toMatchObject({
      id: 'BATCH-1',
      returnDoctorUsername: 'doctor.nikola',
      status: 'return_created',
    });
    expect(
      finalBatch?.items.every((item) => item.status === 'results_ready'),
    ).toBe(true);
    expect(returnVisit).toMatchObject({
      assignedDoctorUsername: 'doctor.nikola',
      isReturnVisit: true,
      specialty: 'Cardiology',
      sourceVisitId: 'VISIT-1',
      status: 'queued',
    });
    expect(
      result.patient.agenda.some(
        (entry) =>
          entry.entryType === 'doctor_visit' &&
          entry.isReturnVisit &&
          entry.specialty === 'Cardiology',
      ),
    ).toBe(true);
    expect(streamService.pushEvent).toHaveBeenLastCalledWith({
      type: 'workspace:refresh',
      data: { id: 'PAT-1' },
    });
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

function buildPatientCore() {
  return {
    admitted_at: new Date('2026-03-29T09:00:00.000Z'),
    id: 'PAT-1',
    name: 'Patient One',
    notes: [],
    phone_number: '+359888123456',
    triage_state: 'GREEN' as const,
  };
}

function buildPatientDetails(): PatientDetailsResponseI {
  return {
    ...buildPatientCore(),
    history: [],
    queue: [],
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
        assignedDoctorUsername: 'tester.lab',
        code: 'GREEN',
        status: 'taken',
        createdAt: '2026-03-29T09:10:00.000Z',
        updatedAt: '2026-03-29T09:16:00.000Z',
        takenAt: '2026-03-29T09:16:00.000Z',
        resultsReadyAt: null,
        takenByActorId: 'tester.lab',
        takenByLabel: 'Tester Lab',
        queueOrder: 0,
      },
      {
        id: 'LAB-ITEM-2',
        testName: 'Urine Test',
        testerSpecialty: 'Laboratory Medicine',
        assignedDoctorUsername: 'tester.lab',
        code: 'GREEN',
        status: 'taken',
        createdAt: '2026-03-29T09:11:00.000Z',
        updatedAt: '2026-03-29T09:18:00.000Z',
        takenAt: '2026-03-29T09:18:00.000Z',
        resultsReadyAt: null,
        takenByActorId: 'tester.lab',
        takenByLabel: 'Tester Lab',
        queueOrder: 1,
      },
    ],
  };
}
