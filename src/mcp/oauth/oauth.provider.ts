import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InvalidGrantError,
  InvalidTargetError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import Database from 'better-sqlite3';
import type { Response } from 'express';
import {
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { DATABASE } from '../../db/db.module';
import type { EntUser } from '../../ent/session.service';
import { ClientsStore } from './clients.store';
import { McpTokenService } from './mcp-token.service';

export const PENDING_COOKIE = '__Host-rukh-mcp-auth';
export const CONSENT_PATH = '/oauth/consent';
const PENDING_TTL_SECONDS = 10 * 60;
const CODE_TTL_SECONDS = 60;

/** An authorization request waiting for the ENT login and the consent screen. */
export interface PendingAuthorization {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  exp: number;
}

interface CodeRow {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  resource: string;
  user: string;
  expires_at: number;
}

function hash(code: string): string {
  return createHash('sha256').update(code).digest('base64url');
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Authorization server for MCP clients. Alegria issues its own codes and
 * tokens; who the user is still comes only from the ENT login.
 */
@Injectable()
export class OAuthProvider implements OAuthServerProvider {
  private readonly key: Buffer;

  constructor(
    readonly clientsStore: ClientsStore,
    private readonly tokens: McpTokenService,
    @Inject(DATABASE) private readonly db: Database.Database,
    config: ConfigService,
  ) {
    this.key = Buffer.from(
      hkdfSync(
        'sha256',
        config.get<string>('SESSION_SECRET'),
        '',
        'alegria mcp pending authorization',
        32,
      ),
    );
  }

  /** Parks the request in a signed cookie and sends the user through the ENT login. */
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    if (params.resource && params.resource.href !== this.tokens.resource) {
      throw new InvalidTargetError(`Unknown resource ${params.resource}`);
    }
    const pending: PendingAuthorization = {
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      state: params.state,
      exp: now() + PENDING_TTL_SECONDS,
    };
    res
      .cookie(PENDING_COOKIE, this.seal(pending), {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: PENDING_TTL_SECONDS * 1000,
      })
      .redirect(`/auth/login?${new URLSearchParams({ next: CONSENT_PATH })}`);
  }

  /** Returns the pending request from its cookie, or `null`. */
  pending(cookie: string | undefined): PendingAuthorization | null {
    const [payload, signature] = cookie?.split('.') ?? [];
    if (!payload || !signature) return null;
    const expected = Buffer.from(this.sign(payload));
    const actual = Buffer.from(signature);
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      return null;
    }
    const pending: PendingAuthorization = JSON.parse(
      Buffer.from(payload, 'base64url').toString(),
    );
    return pending.exp > now() ? pending : null;
  }

  /** Stores a single-use code for `user` and returns the client redirect. */
  approve(pending: PendingAuthorization, user: EntUser): string {
    const code = randomBytes(32).toString('base64url');
    this.db
      .prepare(
        `INSERT INTO oauth_codes
           (code_hash, client_id, redirect_uri, code_challenge, resource, user, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        hash(code),
        pending.clientId,
        pending.redirectUri,
        pending.codeChallenge,
        this.tokens.resource,
        JSON.stringify(user),
        now() + CODE_TTL_SECONDS,
      );
    return this.redirect(pending, { code });
  }

  deny(pending: PendingAuthorization): string {
    return this.redirect(pending, {
      error: 'access_denied',
      error_description: 'The user or their role was refused',
    });
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const row = this.db
      .prepare(
        'SELECT client_id, code_challenge, expires_at FROM oauth_codes WHERE code_hash = ?',
      )
      .get(hash(authorizationCode)) as CodeRow | undefined;
    if (!row || row.client_id !== client.client_id || row.expires_at <= now()) {
      throw new InvalidGrantError('Invalid authorization code');
    }
    return row.code_challenge;
  }

  /** Called once the SDK has checked the PKCE verifier. Burns the code. */
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const row = this.db
      .prepare('DELETE FROM oauth_codes WHERE code_hash = ? RETURNING *')
      .get(hash(authorizationCode)) as CodeRow | undefined;
    if (
      !row ||
      row.client_id !== client.client_id ||
      row.expires_at <= now() ||
      row.redirect_uri !== redirectUri
    ) {
      throw new InvalidGrantError('Invalid authorization code');
    }
    if (resource && resource.href !== row.resource) {
      throw new InvalidTargetError(`Unknown resource ${resource}`);
    }
    return {
      access_token: this.tokens.issue(JSON.parse(row.user), client.client_id),
      token_type: 'Bearer',
      expires_in: this.tokens.ttlSeconds,
    };
  }

  async exchangeRefreshToken(): Promise<OAuthTokens> {
    throw new InvalidGrantError('Refresh tokens are not issued');
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const verified = this.tokens.verify(token);
    if (!verified) throw new InvalidTokenError('Invalid or expired token');
    return {
      token,
      clientId: verified.clientId,
      scopes: [],
      expiresAt: verified.expiresAt,
      resource: new URL(this.tokens.resource),
      extra: { user: verified.user },
    };
  }

  private redirect(
    pending: PendingAuthorization,
    params: Record<string, string>,
  ): string {
    const url = new URL(pending.redirectUri);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    if (pending.state) url.searchParams.set('state', pending.state);
    return url.href;
  }

  private seal(pending: PendingAuthorization): string {
    const payload = Buffer.from(JSON.stringify(pending)).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  private sign(data: string): string {
    return createHmac('sha256', this.key).update(data).digest('base64url');
  }
}
