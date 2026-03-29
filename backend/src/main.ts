import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { INestApplication } from '@nestjs/common';
import 'dotenv/config';
import { AppModule } from './app.module';
import {
  AUTH_COOKIE_NAME,
  getFrontendOrigins,
  getRequiredEnv,
} from './auth/auth.constants';
import { PatientService } from './patient/patient.service';
import { PrismaService } from './service/prisma.service';
import { RedisService } from './service/redis.service';
import { HospitalSeedRunner } from '../prisma/seed/hospital.seed';

async function maybeSeedDemoData(app: INestApplication) {
  if (process.env.NODE_ENV === 'production') {
    if (process.env.SEED_ON_BOOT?.trim() === 'true') {
      console.warn(
        'SEED_ON_BOOT is enabled, but demo seeding is disabled in production.',
      );
    }

    return;
  }

  if (process.env.SEED_ON_BOOT?.trim() !== 'true') {
    return;
  }

  console.log('Seeding hospital demo data...');

  const prisma = app.get(PrismaService);
  const patientService = app.get(PatientService);
  const redisService = app.get(RedisService);
  const runner = new HospitalSeedRunner(prisma, patientService, redisService);
  const summary = await runner.run();

  console.log(
    `Seeded ${summary.users.length} staff accounts and ${summary.patients.length} patient scenarios.`,
  );
}

function getHospitalBaseUrl() {
  const configuredBaseUrl = process.env.HOSPITAL_BASE_URL?.trim();

  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, '');
  }

  const privateDomain = process.env.RAILWAY_PRIVATE_DOMAIN?.trim();
  const port = process.env.PORT?.trim();

  if (privateDomain && port) {
    return `http://${privateDomain}:${port}`;
  }

  return undefined;
}

async function bootstrap() {
  if (process.env.HOSPITAL_LAT == undefined)
    throw new Error('Environment variable "HOSPITAL_LAT" is not defined');
  if (process.env.HOSPITAL_LNG == undefined)
    throw new Error('Environment variable "HOSPITAL_LNG" is not defined');

  getRequiredEnv('JWT_SECRET');
  const app = await NestFactory.create(AppModule);
  const allowedOrigins = new Set(getFrontendOrigins());
  app.use(cookieParser());
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin is not allowed by CORS.'), false);
    },
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('Hospital API')
    .setDescription('The hospital MVP API')
    .setVersion('1.0')
    .addTag('hospital')
    .addCookieAuth(AUTH_COOKIE_NAME)
    .build();

  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);

  await maybeSeedDemoData(app);
  await app.listen(process.env.PORT ?? 3000, '::');

  try {
    console.log('Attempting to connect to centralised server...');
    const url = new URL(
      `${process.env.CENTRALISED_API_URL}/add-instance`,
    );
    url.searchParams.set('lat', process.env.HOSPITAL_LAT);
    url.searchParams.set('lng', process.env.HOSPITAL_LNG);

    const hospitalBaseUrl = getHospitalBaseUrl();

    if (hospitalBaseUrl) {
      url.searchParams.set('baseUrl', hospitalBaseUrl);
    }

    const resp = await fetch(url);
    if (!resp.ok) {
      console.error('WARNING: Failed to connect to centralised server');
    }
    console.log(resp);
  } catch (error) {
    console.error('WARNING: Failed to connect to centralised server');
  }
}
void bootstrap();
