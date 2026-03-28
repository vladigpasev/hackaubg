import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { AUTH_TOKEN_TTL_SECONDS, isUserRole } from './auth.constants';
import type { LoginDto } from './dto/login.dto';
import type { AuthTokenPayload, AuthUser, UserRecord } from './auth.types';
import { PrismaService } from '../service/prisma.service';

interface AuthResult {
  token: string;
  user: AuthUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(credentials: LoginDto): Promise<AuthResult> {
    const username = this.normalizeUsername(credentials.username);
    const password = this.validatePassword(credentials.password);
    const user = await this.prisma.user.findUnique({ where: { username } });

    if (!user) {
      throw new UnauthorizedException('Invalid username or password.');
    }

    const isPasswordValid = await compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid username or password.');
    }

    const authUser = this.serializeUser(user);
    const payload: AuthTokenPayload = {
      sub: authUser.username,
      role: authUser.role,
    };

    const token = await this.jwtService.signAsync(payload, {
      expiresIn: AUTH_TOKEN_TTL_SECONDS,
    });

    return { token, user: authUser };
  }

  async getAuthenticatedUser(username: string): Promise<AuthUser> {
    const normalizedUsername = this.normalizeUsername(username);
    const user = await this.prisma.user.findUnique({
      where: { username: normalizedUsername },
    });

    if (!user) {
      throw new UnauthorizedException('Authentication is required.');
    }

    return this.serializeUser(user);
  }

  private normalizeUsername(username: string): string {
    if (typeof username !== 'string' || username.trim().length === 0) {
      throw new BadRequestException('Username is required.');
    }

    return username.trim();
  }

  private validatePassword(password: string): string {
    if (typeof password !== 'string' || password.trim().length === 0) {
      throw new BadRequestException('Password is required.');
    }

    return password;
  }

  private serializeUser(user: UserRecord): AuthUser {
    if (!isUserRole(user.role)) {
      throw new UnauthorizedException('The user role is invalid.');
    }

    return {
      username: user.username,
      role: user.role,
      isTester: user.role === 'doctor' ? user.isTester : false,
      specialties:
        user.role === 'doctor' ? this.parseSpecialties(user.specialties) : [],
    };
  }

  private parseSpecialties(value: string): string[] {
    try {
      const parsed: unknown = JSON.parse(value);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    } catch {
      return [];
    }
  }
}
