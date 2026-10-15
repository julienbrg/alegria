import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CookieOptions } from 'express';
import { Profile, Role } from './roles';

export const SESSION_COOKIE = '__Host-alegria';

export interface EntUser {
  userId: string;
  profile: Profile;
  role: Role;
  uai: string[];
  classes: string[];
}

interface SessionClaims {
  sub: string;
  profile: Profile;
  role: Role;
  uai: string[];
  classes: string[];
  /** Login time, in seconds; fixes the absolute expiry. */
  auth: number;
  exp: number;
}

const HEADER = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

/**
 * Stateless session in a signed JWT cookie. Each verified request gets a
 * fresh token whose expiry slides by the idle timeout, capped at the
 * absolute maximum counted from login.
 */
@Injectable()
export class SessionService {
  private readonly secret: string;
  private readonly idleSeconds: number;
  private readonly maxSeconds: number;

  constructor(config: ConfigService) {
    this.secret = config.get<string>('SESSION_SECRET');
    this.idleSeconds = config.get<number>('SESSION_IDLE_SECONDS');
    this.maxSeconds = config.get<number>('SESSION_MAX_SECONDS');
  }

  issue(user: EntUser, auth = this.now()): string | null {
    const exp = Math.min(this.now() + this.idleSeconds, auth + this.maxSeconds);
    if (exp <= this.now()) return null;
    const claims: SessionClaims = {
      sub: user.userId,
      profile: user.profile,
      role: user.role,
      uai: user.uai,
      classes: user.classes,
      auth,
      exp,
    };
    const body = `${HEADER}.${base64url(JSON.stringify(claims))}`;
    return `${body}.${this.sign(body)}`;
  }

  /** Returns the user and a refreshed token, or `null` if invalid or expired. */
  verify(token: string | undefined): { user: EntUser; token: string } | null {
    const [header, payload, signature] = token?.split('.') ?? [];
    if (header !== HEADER || !payload || !signature) return null;

    const expected = Buffer.from(this.sign(`${header}.${payload}`));
    const actual = Buffer.from(signature);
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      return null;
    }

    let claims: SessionClaims;
    try {
      claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    } catch {
      return null;
    }
    if (!claims.profile || claims.exp <= this.now()) return null;

    const user: EntUser = {
      userId: claims.sub,
      profile: claims.profile,
      role: claims.role,
      uai: claims.uai,
      classes: claims.classes,
    };
    const refreshed = this.issue(user, claims.auth);
    return refreshed ? { user, token: refreshed } : null;
  }

  /** Browser-session cookie: no `maxAge`, so closing the browser ends it. */
  cookieOptions(): CookieOptions {
    return { httpOnly: true, secure: true, sameSite: 'lax', path: '/' };
  }

  private sign(data: string): string {
    return createHmac('sha256', this.secret).update(data).digest('base64url');
  }

  private now(): number {
    return Math.floor(Date.now() / 1000);
  }
}
