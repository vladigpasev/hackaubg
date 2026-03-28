import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { LoginDto } from './dto/login.dto';
import { UsersService, type UserWithRelations } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const isValidPassword = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const authUser = this.toAuthenticatedUser(user);

    return {
      accessToken: await this.jwtService.signAsync({
        sub: authUser.id,
        email: authUser.email,
        roles: authUser.roles,
      }),
      user: authUser,
    };
  }

  async getCurrentUser(userId: string) {
    const user = await this.usersService.findByIdOrThrow(userId);

    return {
      id: user.id,
      email: user.email,
      roles: user.userRoles.map((userRole) => userRole.role.code),
      profile: user.profile
        ? {
            firstName: user.profile.firstName,
            lastName: user.profile.lastName,
            locale: user.profile.locale,
          }
        : null,
    };
  }

  private toAuthenticatedUser(user: UserWithRelations): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      roles: user.userRoles.map((userRole) => userRole.role.code),
    };
  }
}
