import { NestFactory } from '@nestjs/core';
import 'dotenv/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  // Set 10-second timeout for all requests
  app.use((req, res, next) => {
    res.setTimeout(10000, () => {
      res.status(408).json({ message: 'Request timeout' });
    });
    next();
  });

  await app.listen(process.env.PORT ?? 3001, '::');
}
void bootstrap();
