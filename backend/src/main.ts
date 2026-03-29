import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import 'dotenv/config';
import { AppModule } from './app.module';
import {
  AUTH_COOKIE_NAME,
  getFrontendOrigins,
  getRequiredEnv,
} from './auth/auth.constants';

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

  try {
    console.log('Attempting to connect to centralised server...');
    const resp = await fetch(
      `${process.env.CENTRALISED_API_URL}/add-instance?lat=${process.env.HOSPITAL_LAT}&lng=${process.env.HOSPITAL_LNG}`,
    );
    if (!resp.ok) {
      console.error('WARNING: Failed to connect to centralised server');
    }
    console.log(resp);
  } catch (error) {
    console.error('WARNING: Failed to connect to centralised server');
  }

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
