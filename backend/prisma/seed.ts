import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const roles = [
  {
    code: 'ADMIN',
    name: 'Administrator',
    description: 'Full access to the bootstrap environment.',
  },
  {
    code: 'PATIENT',
    name: 'Patient',
    description: 'Patient-facing access.',
  },
  {
    code: 'TRIAGE_OPERATOR',
    name: 'Triage Operator',
    description: 'Queue and intake operator access.',
  },
  {
    code: 'DOCTOR',
    name: 'Doctor',
    description: 'Doctor access to patient status flows.',
  },
  {
    code: 'SPECIALIST',
    name: 'Specialist',
    description: 'Specialist review access.',
  },
  {
    code: 'FACILITY_STAFF',
    name: 'Facility Staff',
    description: 'Facility operations access.',
  },
] as const;

async function main() {
  for (const role of roles) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: {
        name: role.name,
        description: role.description,
      },
      create: role,
    });
  }

  const adminPasswordHash = await bcrypt.hash('admin1234', 10);
  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { code: 'ADMIN' },
  });

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@local.dev' },
    update: {
      passwordHash: adminPasswordHash,
      isActive: true,
    },
    create: {
      email: 'admin@local.dev',
      passwordHash: adminPasswordHash,
      isActive: true,
    },
  });

  await prisma.profile.upsert({
    where: { userId: adminUser.id },
    update: {
      firstName: 'Hackathon',
      lastName: 'Admin',
      locale: 'en',
    },
    create: {
      userId: adminUser.id,
      firstName: 'Hackathon',
      lastName: 'Admin',
      locale: 'en',
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: adminRole.id,
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
