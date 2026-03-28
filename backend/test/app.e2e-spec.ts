import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/main';

describe('Bootstrap API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports health status', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: expect.any(String),
      timestamp: expect.any(String),
      services: {
        postgres: expect.any(String),
        redis: expect.any(String),
      },
      namespaces: expect.arrayContaining(['triage:queue:*', 'sessions:*']),
    });
  });

  it('logs in with the seeded admin and returns the current user', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@local.dev',
        password: 'admin1234',
      });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.user.email).toBe('admin@local.dev');
    expect(loginResponse.body.user.roles).toContain('ADMIN');
    expect(loginResponse.body.accessToken).toEqual(expect.any(String));

    const meResponse = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body).toEqual({
      id: expect.any(String),
      email: 'admin@local.dev',
      roles: expect.arrayContaining(['ADMIN']),
      profile: {
        firstName: 'Hackathon',
        lastName: 'Admin',
        locale: 'en',
      },
    });
  });

  it('allows the admin to list roles', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@local.dev',
        password: 'admin1234',
      });

    const rolesResponse = await request(app.getHttpServer())
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`);

    expect(rolesResponse.status).toBe(200);
    expect(rolesResponse.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'ADMIN' }),
        expect.objectContaining({ code: 'PATIENT' }),
      ]),
    );
  });
});
