import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import type { EntUser } from '../../ent/session.service';

interface AccessClaims {
  iss: string;
  aud: string;
  sub: string;
  client_id: string;
  profile: EntUser['profile'];
  role: EntUser['role'];
  uai: string[];
  classes: string[];
  iat: number;
  exp: number;
}

export interface VerifiedAccessToken {
  user: EntUser;
  clientId: string;
  expiresAt: number;
}

const HEADER = Buffer.from(
  JSON.stringify({ alg: 'HS256', typ: 'at+jwt' }),
).toString('base64url');

/** The resource every MCP access token is bound to (RFC 8707). */
export function mcpResource(publicOrigin: string): URL {
  return new URL('/mcp', new URL(publicOrigin).origin);
}

/**
 * Stateless MCP access tokens (RFC 9068 shape). The key is derived from
 * `SESSION_SECRET` under its own label, so a session cookie never
 * verifies as an access token, nor the reverse.
 */
@Injectable()
export class McpTokenService {
  readonly resource: string;
  readonly ttlSeconds: number;
  private readonly issuer: string;
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const origin = config.get<string>('PUBLIC_ORIGIN');
    this.issuer = new URL(origin).origin;
    this.resource = mcpResource(origin).href;
    this.ttlSeconds = config.get<number>('MCP_TOKEN_SECONDS');
    this.key = Buffer.from(
      hkdfSync(
        'sha256',
        config.get<string>('SESSION_SECRET'),
        '',
        'alegria mcp access token',
        32,
      ),
    );
  }

  issue(user: EntUser, clientId: string): string {
    const iat = Math.floor(Date.now() / 1000);
    const claims: AccessClaims = {
      iss: this.issuer,
      aud: this.resource,
      sub: user.userId,
      client_id: clientId,
      profile: user.profile,
      role: user.role,
      uai: user.uai,
      classes: user.classes,
      iat,
      exp: iat + this.ttlSeconds,
    };
    const body = `${HEADER}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}`;
    return `${body}.${this.sign(body)}`;
  }

  /** Returns `null` unless the token is ours, unexpired and bound to `/mcp`. */
  verify(token: string): VerifiedAccessToken | null {
    const [header, payload, signature] = token.split('.');
    if (header !== HEADER || !payload || !signature) return null;

    const expected = Buffer.from(this.sign(`${header}.${payload}`));
    const actual = Buffer.from(signature);
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      return null;
    }

    let claims: AccessClaims;
    try {
      claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    } catch {
      return null;
    }
    if (
      claims.iss !== this.issuer ||
      claims.aud !== this.resource ||
      !(claims.exp > Math.floor(Date.now() / 1000))
    ) {
      return null;
    }
    return {
      user: {
        userId: claims.sub,
        profile: claims.profile,
        role: claims.role,
        uai: claims.uai,
        classes: claims.classes,
      },
      clientId: claims.client_id,
      expiresAt: claims.exp,
    };
  }

  private sign(data: string): string {
    return createHmac('sha256', this.key).update(data).digest('base64url');
  }
}
