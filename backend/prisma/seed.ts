import 'dotenv/config';
import { hash } from 'bcryptjs';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../generated/prisma/client';
import { getDatabaseUrl } from '../src/auth/auth.constants';

const demoUsers = [
  {
    username: 'registry.admissions',
    password: 'RegistryDemo!24',
    role: 'registry',
    isTester: false,
    specialties: [],
  },
  {
    username: 'nurse.elena',
    password: 'NurseWard!24',
    role: 'nurse',
    isTester: false,
    specialties: [],
  },
  {
    username: 'nurse.martin',
    password: 'NurseShift!24',
    role: 'nurse',
    isTester: false,
    specialties: [],
  },
  {
    username: 'doctor.nikola',
    password: 'DoctorICU!24',
    role: 'doctor',
    isTester: false,
    specialties: ['icu', 'pulmonology'],
  },
  {
    username: 'doctor.petrova',
    password: 'DoctorCardio!24',
    role: 'doctor',
    isTester: false,
    specialties: ['cardiology'],
  },
  {
    username: 'tester.lab',
    password: 'TesterLab!24',
    role: 'doctor',
    isTester: true,
    specialties: ['blood-test'],
  },
  {
    username: 'tester.scan',
    password: 'TesterScan!24',
    role: 'doctor',
    isTester: true,
    specialties: ['imaging', 'scanner'],
  },
] as const;

const adapter = new PrismaBetterSqlite3({
  url: getDatabaseUrl(),
});

const prisma = new PrismaClient({ adapter });

async function main() {
  for (const user of demoUsers) {
    const passwordHash = await hash(user.password, 12);

    await prisma.user.upsert({
      where: { username: user.username },
      update: {
        passwordHash,
        role: user.role,
        isTester: user.isTester,
        specialties: JSON.stringify(user.specialties),
      },
      create: {
        username: user.username,
        passwordHash,
        role: user.role,
        isTester: user.isTester,
        specialties: JSON.stringify(user.specialties),
      },
    });
  }

  console.log(`Seeded ${demoUsers.length} demo users.`);
}

main()
  .catch((error) => {
    console.error('Failed to seed demo users.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
