import 'dotenv/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import {
  AUTH_COOKIE_NAME,
  getFrontendOrigins,
  getRequiredEnv,
} from './auth/auth.constants';

async function bootstrap() {
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

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
