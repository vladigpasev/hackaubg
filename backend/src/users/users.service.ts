import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

const userWithRelations = Prisma.validator<Prisma.UserDefaultArgs>()({
  include: {
    profile: true,
    userRoles: {
      include: {
        role: true,
      },
    },
  },
});

export type UserWithRelations = Prisma.UserGetPayload<typeof userWithRelations>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      ...userWithRelations,
    });
  }

  async findByIdOrThrow(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      ...userWithRelations,
    });

    if (!user || !user.isActive) {
      throw new NotFoundException('User not found.');
    }

    return user;
  }
}
