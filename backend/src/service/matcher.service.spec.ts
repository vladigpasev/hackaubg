import type { User } from '../../generated/prisma/client';
import type { PatientDetailsResponseI } from '../patient/patient.dto';
import type { QueueRecordI } from '../patient/patient.type';
import { createRedisServiceMock } from '../test-utils/fake-redis';
import {
  getDoctorCurrentPatientKey,
  getTriagePriority,
  readCurrentAssignment,
  readPatientQueue,
  serializePatientRecord,
  serializeQueueRecord,
  getPatientRecordKey,
  getPatientQueueKey,
} from '../workflow/workflow.store';
import { MatcherService } from './matcher.service';
import { StreamService } from './stream.service';

describe('MatcherService', () => {
  let redisService: ReturnType<typeof createRedisServiceMock>;
  let prismaService: {
    user: {
      findMany: jest.Mock<Promise<User[]>, []>;
      findUnique: jest.Mock<
        Promise<User | null>,
        [{ where: { username: string } }]
      >;
    };
    specialityWaterfall: {
      findMany: jest.Mock<
        Promise<Array<{ speciality: string; waterfall: string }>>,
        []
      >;
    };
  };
  let streamService: jest.Mocked<Pick<StreamService, 'pushEvent'>>;
  let matcherService: MatcherService;

  beforeEach(() => {
    redisService = createRedisServiceMock();
    prismaService = {
      user: {
        findMany: jest.fn<Promise<User[]>, []>(),
        findUnique: jest.fn<
          Promise<User | null>,
          [{ where: { username: string } }]
        >(),
      },
      specialityWaterfall: {
        findMany: jest.fn<
          Promise<Array<{ speciality: string; waterfall: string }>>,
          []
        >(),
      },
    };
    streamService = {
      pushEvent: jest.fn(),
    };
    matcherService = new MatcherService(
      prismaService as never,
      redisService as never,
      streamService as never,
    );
  });

  it('matches the highest-priority patient and resolves waterfall fallback specialties', async () => {
    prismaService.user.findMany.mockResolvedValue([
      buildDoctor({
        username: 'doctor.pulmo',
        specialties: JSON.stringify(['pulmonology']),
      }),
    ]);
    prismaService.specialityWaterfall.findMany.mockResolvedValue([
      {
        speciality: 'surgery',
        waterfall: JSON.stringify(['pulmonology']),
      },
    ]);
    await seedPatient(
      redisService,
      buildPatient({
        id: 'patient-red',
        triage_state: 'RED',
        queue: [
          buildQueueRecord({
            specialty: 'surgery',
            triage_state: 'YELLOW',
            timestamp: new Date('2026-03-29T08:00:00.000Z'),
          }),
        ],
      }),
    );
    await seedPatient(
      redisService,
      buildPatient({
        id: 'patient-green',
        triage_state: 'GREEN',
        queue: [
          buildQueueRecord({
            specialty: 'pulmonology',
            triage_state: 'GREEN',
            timestamp: new Date('2026-03-29T08:05:00.000Z'),
          }),
        ],
      }),
    );

    const matchedDoctor =
      await matcherService.matchPatientsToDoctor('patient-red');
    const currentAssignment = await readCurrentAssignment(
      redisService.client as never,
      'patient-red',
    );

    expect(matchedDoctor?.username).toBe('doctor.pulmo');
    expect(
      await redisService.client.get(getDoctorCurrentPatientKey('doctor.pulmo')),
    ).toBe('patient-red');
    expect(currentAssignment).toMatchObject({
      specialty: 'pulmonology',
      triage_state: 'YELLOW',
    });
    expect(
      await readPatientQueue(redisService.client as never, 'patient-red'),
    ).toHaveLength(0);
    expect(
      await readPatientQueue(redisService.client as never, 'patient-green'),
    ).toHaveLength(1);
  });

  it('removes only the matched queue entry when multiple assignments share the same specialty', async () => {
    prismaService.user.findMany.mockResolvedValue([
      buildDoctor({
        username: 'doctor.cardio',
        specialties: JSON.stringify(['cardiology']),
      }),
    ]);
    prismaService.specialityWaterfall.findMany.mockResolvedValue([]);
    await seedPatient(
      redisService,
      buildPatient({
        id: 'patient-queue',
        queue: [
          buildQueueRecord({
            specialty: 'cardiology',
            reffered_by_id: 'doctor.one',
            timestamp: new Date('2026-03-29T08:00:00.000Z'),
          }),
          buildQueueRecord({
            specialty: 'cardiology',
            reffered_by_id: 'doctor.two',
            timestamp: new Date('2026-03-29T08:01:00.000Z'),
          }),
        ],
      }),
    );

    await matcherService.matchPatientsToDoctor('patient-queue');

    const remainingQueue = await readPatientQueue(
      redisService.client as never,
      'patient-queue',
    );
    const currentAssignment = await readCurrentAssignment(
      redisService.client as never,
      'patient-queue',
    );

    expect(remainingQueue).toHaveLength(1);
    expect(remainingQueue[0].reffered_by_id).toBe('doctor.two');
    expect(currentAssignment?.reffered_by_id).toBe('doctor.one');
  });
});

function buildDoctor(overrides: Partial<User> & Pick<User, 'username'>): User {
  return {
    username: overrides.username,
    passwordHash: overrides.passwordHash ?? 'hash',
    role: overrides.role ?? 'doctor',
    isTester: overrides.isTester ?? false,
    specialties: overrides.specialties ?? JSON.stringify(['cardiology']),
  };
}

function buildPatient(
  overrides: Partial<PatientDetailsResponseI> &
    Pick<PatientDetailsResponseI, 'id'>,
): PatientDetailsResponseI {
  return {
    id: overrides.id,
    name: overrides.name ?? 'Matched Patient',
    phone_number:
      overrides.phone_number ?? `0888${overrides.id.padStart(6, '0')}`,
    triage_state: overrides.triage_state ?? 'GREEN',
    admitted_at: overrides.admitted_at ?? new Date('2026-03-29T07:30:00.000Z'),
    notes: overrides.notes ?? [],
    history: overrides.history ?? [],
    queue: overrides.queue ?? [],
  };
}

function buildQueueRecord(overrides: Partial<QueueRecordI>): QueueRecordI {
  return {
    timestamp: overrides.timestamp ?? new Date('2026-03-29T08:30:00.000Z'),
    triage_state: overrides.triage_state ?? 'GREEN',
    specialty: overrides.specialty ?? 'cardiology',
    reffered_by_id: overrides.reffered_by_id ?? 'registry.admissions',
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
