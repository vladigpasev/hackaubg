import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  listRoles() {
    return this.prisma.role.findMany({
      orderBy: {
        code: 'asc',
      },
    });
  }
}
