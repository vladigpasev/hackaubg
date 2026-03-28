import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PatientService } from '../src/patient/patient.service';
import { PrismaService } from '../src/service/prisma.service';
import { RedisService } from '../src/service/redis.service';
import { HospitalSeedRunner } from './seed/hospital.seed';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const patientService = app.get(PatientService);
    const redisService = app.get(RedisService);
    const runner = new HospitalSeedRunner(prisma, patientService, redisService);
    const summary = await runner.run();

    console.log(
      [
        `Seeded ${summary.users.length} staff accounts.`,
        `Seeded ${summary.patients.length} active patients with live hospital journeys.`,
      ].join(' '),
    );
    console.log('Demo logins:');

    for (const user of summary.users) {
      const flags = [
        user.role,
        user.isTester ? 'tester' : null,
        user.specialties?.length ? user.specialties.join(', ') : null,
      ].filter((value): value is string => Boolean(value));

      console.log(`- ${user.username} / ${user.password} (${flags.join(' | ')})`);
    }

    console.log('Seeded patient scenarios:');

    for (const patient of summary.patients) {
      console.log(
        `- ${patient.name} [${patient.triage_state}] history=${patient.historyCount} queue=${patient.queueCount}`,
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error('Failed to seed hospital demo data.');
  console.error(error);
  process.exitCode = 1;
});
