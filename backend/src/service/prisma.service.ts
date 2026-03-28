import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../../generated/prisma/client';
import { Injectable } from '@nestjs/common';
import { getDatabaseUrl } from '../auth/auth.constants';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    const adapter = new PrismaBetterSqlite3({
      url: getDatabaseUrl(),
    });
    super({ adapter });
  }
}
