import { hash } from 'bcryptjs';
import type { PrismaService } from '../../src/service/prisma.service';
import type { PatientService } from '../../src/patient/patient.service';
import type { RedisService } from '../../src/service/redis.service';
import {
  attachPatientNotePayloadSchema,
  checkInPayloadSchema,
  updatePatientPayloadSchema,
} from '../../src/patient/patient.dto';
import type { HistoryRecordI, QueueRecordI } from '../../src/patient/patient.type';
import {
  HOSPITAL_SEED_MANIFEST_KEY,
  PATIENT_PHONE_KEY_PREFIX,
  PATIENT_QUEUE_KEY_PREFIX,
  PATIENT_RECORD_KEY_PREFIX,
} from './constants';
import {
  allSeedUsers,
  doctors,
  nurses,
  registryUsers,
  testerDoctors,
  type SeedUserDefinition,
} from './data/staff.data';
import {
  buildPatientScenarios,
  type PatientScenarioSeed,
} from './data/patient-scenarios.data';

interface SeedManifest {
  seededAt: string;
  patientIds: string[];
  patientPhones: string[];
}

interface SeedSummary {
  users: SeedUserDefinition[];
  patients: {
    key: string;
    id: string;
    name: string;
    triage_state: string;
    queueCount: number;
    historyCount: number;
  }[];
}

export class HospitalSeedRunner {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patientService: PatientService,
    private readonly redisService: RedisService,
  ) {}

  async run(): Promise<SeedSummary> {
    await this.ensureRedisReady();
    await this.seedRegistryUsers();
    await this.seedNurses();
    await this.seedDoctors();
    const patients = await this.seedPatients();

    return {
      users: allSeedUsers,
      patients,
    };
  }

  private async seedRegistryUsers(): Promise<void> {
    await this.upsertUsers(registryUsers);
  }

  private async seedNurses(): Promise<void> {
    await this.upsertUsers(nurses);
  }

  private async seedDoctors(): Promise<void> {
    await this.upsertUsers([...doctors, ...testerDoctors]);
  }

  private async upsertUsers(users: SeedUserDefinition[]): Promise<void> {
    for (const user of users) {
      const passwordHash = await hash(user.password, 12);

      await this.prisma.user.upsert({
        where: { username: user.username },
        update: {
          passwordHash,
          role: user.role,
          isTester: user.isTester ?? false,
          specialties: JSON.stringify(user.specialties ?? []),
        },
        create: {
          username: user.username,
          passwordHash,
          role: user.role,
          isTester: user.isTester ?? false,
          specialties: JSON.stringify(user.specialties ?? []),
        },
      });
    }
  }

  private async seedPatients(): Promise<SeedSummary['patients']> {
    const scenarios = buildPatientScenarios();
    await this.cleanupSeededPatients(scenarios);

    const seededPatients: SeedSummary['patients'] = [];

    for (const scenario of scenarios) {
      const checkInPayload = checkInPayloadSchema.parse(scenario.checkIn);
      const patient = await this.patientService.checkIn(checkInPayload);

      if (scenario.update) {
        await this.patientService.updatePatient(
          patient.id,
          updatePatientPayloadSchema.parse(scenario.update),
        );
      }

      for (const note of scenario.notes) {
        await this.patientService.attachNote(
          patient.id,
          attachPatientNotePayloadSchema.parse({ note }),
        );
      }

      await this.applyPatientJourney(patient.id, scenario);
      const details = await this.patientService.getPatientDetails(patient.id);

      seededPatients.push({
        key: scenario.key,
        id: details.id,
        name: details.name,
        triage_state: details.triage_state,
        queueCount: details.queue.length,
        historyCount: details.history.length,
      });
    }

    await this.saveManifest({
      seededAt: new Date().toISOString(),
      patientIds: seededPatients.map((patient) => patient.id),
      patientPhones: scenarios.flatMap((scenario) => scenario.cleanupPhones),
    });

    return seededPatients;
  }

  private async ensureRedisReady(): Promise<void> {
    const client = this.redisService.client;

    if (!client.isOpen) {
      await client.connect();
    }

    try {
      await client.ping();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown Redis error';

      throw new Error(
        `Redis is required for the hospital seed. Unable to connect using REDIS_URL: ${message}`,
      );
    }
  }

  private async cleanupSeededPatients(
    scenarios: PatientScenarioSeed[],
  ): Promise<void> {
    const client = this.redisService.client;
    const existingManifest = await this.loadManifest();
    const patientIds = new Set(existingManifest?.patientIds ?? []);
    const patientPhones = new Set(existingManifest?.patientPhones ?? []);

    for (const scenario of scenarios) {
      for (const phone of scenario.cleanupPhones) {
        patientPhones.add(phone);
      }
    }

    for (const phone of patientPhones) {
      const patientId = await client.get(this.getPhoneLookupKey(phone));

      if (patientId) {
        patientIds.add(patientId);
      }
    }

    const keysToDelete = new Set<string>([HOSPITAL_SEED_MANIFEST_KEY]);

    for (const phone of patientPhones) {
      keysToDelete.add(this.getPhoneLookupKey(phone));
    }

    for (const patientId of patientIds) {
      keysToDelete.add(this.getPatientRecordKey(patientId));
      keysToDelete.add(this.getPatientQueueKey(patientId));
    }

    if (keysToDelete.size > 0) {
      await client.del([...keysToDelete]);
    }
  }

  private async applyPatientJourney(
    patientId: string,
    scenario: PatientScenarioSeed,
  ): Promise<void> {
    const client = this.redisService.client;
    const patientRecordKey = this.getPatientRecordKey(patientId);
    const patientQueueKey = this.getPatientQueueKey(patientId);
    const rawRecord = await client.get(patientRecordKey);

    if (!rawRecord) {
      throw new Error(`Seeded patient ${patientId} is missing from Redis.`);
    }

    let parsedRecord: unknown;

    try {
      parsedRecord = JSON.parse(rawRecord) as unknown;
    } catch {
      throw new Error(`Seeded patient ${patientId} has invalid Redis data.`);
    }

    if (!this.isObject(parsedRecord)) {
      throw new Error(`Seeded patient ${patientId} has invalid Redis data.`);
    }

    const nextRecord = {
      ...parsedRecord,
      admitted_at: scenario.admittedAt.toISOString(),
      history: scenario.history.map((entry) =>
        this.serializeHistoryRecord(entry),
      ),
    };

    // The current application exposes check-in/update/note flows via PatientService,
    // but referrals and queue state only exist in the Redis record contract.
    await client.set(patientRecordKey, JSON.stringify(nextRecord));
    await client.del(patientQueueKey);

    if (scenario.queue.length > 0) {
      await client.zAdd(
        patientQueueKey,
        scenario.queue.map((entry) => ({
          score: entry.timestamp.getTime(),
          value: JSON.stringify(this.serializeQueueRecord(entry)),
        })),
      );
    }
  }

  private serializeHistoryRecord(entry: HistoryRecordI) {
    return {
      ...entry,
      timestamp: entry.timestamp.toISOString(),
    };
  }

  private serializeQueueRecord(entry: QueueRecordI) {
    return {
      ...entry,
      timestamp: entry.timestamp.toISOString(),
    };
  }

  private async loadManifest(): Promise<SeedManifest | null> {
    const rawManifest = await this.redisService.client.get(
      HOSPITAL_SEED_MANIFEST_KEY,
    );

    if (!rawManifest) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawManifest) as SeedManifest;

      if (
        !parsed ||
        !Array.isArray(parsed.patientIds) ||
        !Array.isArray(parsed.patientPhones)
      ) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  private async saveManifest(manifest: SeedManifest): Promise<void> {
    await this.redisService.client.set(
      HOSPITAL_SEED_MANIFEST_KEY,
      JSON.stringify(manifest),
    );
  }

  private getPhoneLookupKey(phoneNumber: string): string {
    return `${PATIENT_PHONE_KEY_PREFIX}${phoneNumber}`;
  }

  private getPatientRecordKey(patientId: string): string {
    return `${PATIENT_RECORD_KEY_PREFIX}${patientId}`;
  }

  private getPatientQueueKey(patientId: string): string {
    return `${PATIENT_QUEUE_KEY_PREFIX}${patientId}`;
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
