import type { CookieOptions } from 'express';

export const AUTH_COOKIE_NAME = 'hospital_auth';
export const AUTH_TOKEN_TTL_SECONDS = 60 * 60 * 8;
export const AUTH_TOKEN_TTL_MS = AUTH_TOKEN_TTL_SECONDS * 1000;
export const USER_ROLES = ['registry', 'nurse', 'doctor', 'admin'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

export function getDatabaseUrl() {
  const configuredUrl = process.env.DATABASE_URL?.trim();

  if (configuredUrl) {
    return configuredUrl;
  }

  const volumeMountPath = process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim();

  if (volumeMountPath) {
    return `file:${volumeMountPath.replace(/\/+$/, '')}/hospital.db`;
  }

  return 'file:./hospital.db';
}

export function getFrontendOrigins() {
  const rawValue = process.env.FRONTEND_ORIGIN?.trim();

  if (!rawValue) {
    return ['http://localhost:5173', 'http://127.0.0.1:5173'];
  }

  return rawValue
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function isUserRole(value: string): value is UserRole {
  return USER_ROLES.includes(value as UserRole);
}

export function buildAuthCookieOptions(): CookieOptions {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    maxAge: AUTH_TOKEN_TTL_MS,
    path: '/',
  };
}

export function buildAuthClearCookieOptions(): CookieOptions {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    path: '/',
  };
}
