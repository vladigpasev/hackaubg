/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import cookieParser from 'cookie-parser';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import request, {
  type SuperTest,
  type Test as SupertestRequest,
} from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from './../src/service/prisma.service';

describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let httpClient: SuperTest<SupertestRequest>;
  const databasePath = join(process.cwd(), 'auth.e2e.db');

  beforeAll(async () => {
    rmSync(databasePath, { force: true });
    process.env.DATABASE_URL = 'file:./auth.e2e.db';
    process.env.JWT_SECRET = 'test-secret';
    process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
    const { AppModule } = await import('./../src/app.module');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    httpClient = request(app.getHttpServer());

    prisma = app.get(PrismaService);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "users" (
        "username" TEXT NOT NULL PRIMARY KEY,
        "passwordHash" TEXT NOT NULL,
        "role" TEXT NOT NULL,
        "isTester" BOOLEAN NOT NULL DEFAULT false,
        "specialties" TEXT NOT NULL DEFAULT '[]'
      )
    `);

    await prisma.user.create({
      data: {
        username: 'doctor.nikola',
        passwordHash: await hash('DoctorICU!24', 12),
        role: 'doctor',
        isTester: false,
        specialties: JSON.stringify(['icu', 'pulmonology']),
      },
    });
  });

  afterAll(async () => {
    await app.close();
    rmSync(databasePath, { force: true });
  });

  it('POST /auth/login signs in a valid user', async () => {
    const response = await httpClient
      .post('/auth/login')
      .send({
        username: 'doctor.nikola',
        password: 'DoctorICU!24',
      })
      .expect(200);

    expect(response.body).toEqual({
      user: {
        username: 'doctor.nikola',
        role: 'doctor',
        isTester: false,
        specialties: ['icu', 'pulmonology'],
      },
    });
    expect(response.body.user).not.toHaveProperty('passwordHash');
    expect(response.headers['set-cookie'][0]).toContain('hospital_auth=');
  });

  it('POST /auth/login rejects invalid credentials', async () => {
    await httpClient
      .post('/auth/login')
      .send({
        username: 'doctor.nikola',
        password: 'wrong-password',
      })
      .expect(401);
  });

  it('GET /auth/me returns the authenticated user from the cookie', async () => {
    const loginResponse = await httpClient
      .post('/auth/login')
      .send({
        username: 'doctor.nikola',
        password: 'DoctorICU!24',
      })
      .expect(200);

    const cookie = loginResponse.headers['set-cookie'][0];

    await httpClient
      .get('/auth/me')
      .set('Cookie', cookie)
      .expect(200)
      .expect({
        user: {
          username: 'doctor.nikola',
          role: 'doctor',
          isTester: false,
          specialties: ['icu', 'pulmonology'],
        },
      });
  });

  it('GET /auth/me rejects requests without a valid cookie', async () => {
    await httpClient.get('/auth/me').expect(401);
  });

  it('POST /auth/logout clears the auth cookie', async () => {
    const response = await httpClient.post('/auth/logout').expect(204);

    expect(response.headers['set-cookie'][0]).toContain('hospital_auth=;');
  });
});
