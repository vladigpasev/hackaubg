import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AUTH_COOKIE_NAME } from '../auth.constants';
import { AuthService } from '../auth.service';
import type { AuthTokenPayload } from '../auth.types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: unknown }>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication is required.');
    }

    let payload: AuthTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<AuthTokenPayload>(token);
    } catch {
      throw new UnauthorizedException(
        'Your session is invalid or has expired.',
      );
    }

    request.user = await this.authService.getAuthenticatedUser(payload.sub);
    return true;
  }

  private extractToken(request: Request): string | null {
    const cookieToken = request.cookies?.[AUTH_COOKIE_NAME];

    if (typeof cookieToken === 'string' && cookieToken.trim().length > 0) {
      return cookieToken;
    }

    const authorizationHeader = request.headers.authorization;

    if (typeof authorizationHeader === 'string') {
      const [scheme, rawToken] = authorizationHeader.split(' ');

      if (scheme === 'Bearer' && rawToken?.trim()) {
        return rawToken.trim();
      }
    }

    const queryToken = request.query.token;

    if (typeof queryToken === 'string' && queryToken.trim().length > 0) {
      return queryToken.trim();
    }

    return null;
  }
}
