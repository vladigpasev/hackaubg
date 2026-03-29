import { NestFactory } from '@nestjs/core';
import 'dotenv/config';
import { AppModule } from './app.module';

async function bootstrap() {
  if (process.env.HOSPITAL_NODE_PORT == undefined)
    throw new Error('Environment variable "HOSPITAL_NODE_PORT" is not defined');

  const app = await NestFactory.create(AppModule);

  // Set 10-second timeout for all requests
  app.use((req, res, next) => {
    res.setTimeout(10000, () => {
      res.status(408).json({ message: 'Request timeout' });
    });
    next();
  });

  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
