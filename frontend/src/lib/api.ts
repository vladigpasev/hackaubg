import { env } from './env.ts';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  services: {
    postgres: 'up' | 'down';
    redis: 'up' | 'down';
  };
  namespaces: string[];
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    roles: string[];
  };
}

export interface MeResponse {
  id: string;
  email: string;
  roles: string[];
  profile: {
    firstName: string;
    lastName: string;
    locale: string;
  } | null;
}

async function request<T>(
  path: string,
  init?: RequestInit,
  token?: string,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${env.apiUrl}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export function fetchHealth() {
  return request<HealthResponse>('/health');
}

export function login(payload: LoginPayload) {
  return request<LoginResponse>(
    '/auth/login',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export function fetchCurrentUser(token: string) {
  return request<MeResponse>('/auth/me', undefined, token);
}
