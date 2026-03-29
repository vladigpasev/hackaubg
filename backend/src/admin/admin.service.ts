import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import type { User } from '../../generated/prisma/client';
import { PrismaService } from '../service/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import type {
  CreateStaffPayload,
  StaffRole,
  UpdateStaffPayload,
} from './admin.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listStaff(): Promise<AuthUser[]> {
    const users = await this.prisma.user.findMany({
      where: {
        role: {
          in: ['registry', 'nurse', 'doctor'],
        },
      },
      orderBy: [{ role: 'asc' }, { username: 'asc' }],
    });

    return users.map((user) => this.serializeUser(user));
  }

  async createStaff(payload: CreateStaffPayload): Promise<AuthUser> {
    const username = payload.username.trim();
    const existingUser = await this.prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      throw new ConflictException(`User ${username} already exists.`);
    }

    const normalized = this.normalizeStaffValues(payload.role, payload);
    const passwordHash = await hash(payload.password, 12);

    const user = await this.prisma.user.create({
      data: {
        username,
        passwordHash,
        role: normalized.role,
        isTester: normalized.isTester,
        specialties: JSON.stringify(normalized.specialties),
      },
    });

    return this.serializeUser(user);
  }

  async updateStaff(
    username: string,
    payload: UpdateStaffPayload,
  ): Promise<AuthUser> {
    const currentUsername = username.trim();
    const existingUser = await this.prisma.user.findUnique({
      where: { username: currentUsername },
    });

    if (!existingUser || !this.isStaffRole(existingUser.role)) {
      throw new NotFoundException(`Staff user ${currentUsername} was not found.`);
    }

    const nextUsername = payload.username?.trim() ?? existingUser.username;
    const nextRole = (payload.role ?? existingUser.role) as StaffRole;
    const normalized = this.normalizeStaffValues(nextRole, {
      isTester: payload.isTester ?? existingUser.isTester,
      specialties:
        payload.specialties ?? this.parseSpecialties(existingUser.specialties),
    });

    if (nextUsername !== currentUsername) {
      const duplicateUser = await this.prisma.user.findUnique({
        where: { username: nextUsername },
      });

      if (duplicateUser) {
        throw new ConflictException(`User ${nextUsername} already exists.`);
      }
    }

    const nextPasswordHash = payload.password
      ? await hash(payload.password, 12)
      : existingUser.passwordHash;

    if (nextUsername !== currentUsername) {
      const user = await this.prisma.$transaction(async (transaction) => {
        const createdUser = await transaction.user.create({
          data: {
            username: nextUsername,
            passwordHash: nextPasswordHash,
            role: normalized.role,
            isTester: normalized.isTester,
            specialties: JSON.stringify(normalized.specialties),
          },
        });

        await transaction.user.delete({
          where: { username: currentUsername },
        });

        return createdUser;
      });

      return this.serializeUser(user);
    }

    const user = await this.prisma.user.update({
      where: { username: currentUsername },
      data: {
        passwordHash: nextPasswordHash,
        role: normalized.role,
        isTester: normalized.isTester,
        specialties: JSON.stringify(normalized.specialties),
      },
    });

    return this.serializeUser(user);
  }

  async deleteStaff(username: string): Promise<{ deleted: true }> {
    const normalizedUsername = username.trim();
    const existingUser = await this.prisma.user.findUnique({
      where: { username: normalizedUsername },
    });

    if (!existingUser || !this.isStaffRole(existingUser.role)) {
      throw new NotFoundException(
        `Staff user ${normalizedUsername} was not found.`,
      );
    }

    await this.prisma.user.delete({
      where: { username: normalizedUsername },
    });

    return { deleted: true };
  }

  private normalizeStaffValues(
    role: StaffRole,
    values: {
      isTester?: boolean;
      specialties?: string[];
    },
  ) {
    if (role !== 'doctor') {
      return {
        role,
        isTester: false,
        specialties: [] as string[],
      };
    }

    const specialties = (values.specialties ?? [])
      .map((specialty) => specialty.trim())
      .filter((specialty) => specialty.length > 0);

    if (specialties.length === 0) {
      throw new BadRequestException(
        'doctor must have at least one specialty',
      );
    }

    return {
      role,
      isTester: values.isTester ?? false,
      specialties,
    };
  }

  private serializeUser(user: User): AuthUser {
    return {
      username: user.username,
      role: user.role as AuthUser['role'],
      isTester: user.role === 'doctor' ? user.isTester : false,
      specialties:
        user.role === 'doctor' ? this.parseSpecialties(user.specialties) : [],
    };
  }

  private parseSpecialties(value: string): string[] {
    try {
      const parsed = JSON.parse(value) as unknown;

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter(
        (item): item is string => typeof item === 'string' && item.trim().length > 0,
      );
    } catch {
      return [];
    }
  }

  private isStaffRole(role: string): role is StaffRole {
    return role === 'registry' || role === 'nurse' || role === 'doctor';
  }
}
