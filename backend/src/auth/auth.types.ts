import type { Request } from 'express';
import type { User } from '../../generated/prisma/client';
import type { UserRole } from './auth.constants';

export interface AuthUser {
  username: string;
  role: UserRole;
  isTester: boolean;
  specialties: string[];
}

export interface AuthResponse {
  user: AuthUser;
}

export interface AuthTokenPayload {
  sub: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

export type UserRecord = User;
