import { ConfigService } from '@nestjs/config';
import {
  InvalidGrantError,
  InvalidTargetError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { Response } from 'express';
import { openDatabase } from '../../db/db.module';
import type { EntUser } from '../../ent/session.service';
import { ClientsStore } from './clients.store';
import { McpTokenService } from './mcp-token.service';
import {
  CONSENT_PATH,
  OAuthProvider,
  PENDING_COOKIE,
  PendingAuthorization,
} from './oauth.provider';

const values = {
  PUBLIC_ORIGIN: 'https://alegria.example.fr',
  SESSION_SECRET: 'unit-session-secret-000000000000000',
  MCP_TOKEN_SECONDS: 3600,
};
const config = { get: (key: string) => values[key] } as ConfigService;

const client: OAuthClientInformationFull = {
  client_id: 'c1',
  redirect_uris: ['https://client.example/cb'],
};
const other: OAuthClientInformationFull = { ...client, client_id: 'c2' };
const teacher: EntUser = {
  userId: 'u1',
  profile: 'Teacher',
  role: 'teacher',
  uai: ['0000001A'],
  classes: ['3A'],
};

function setup() {
  const db = openDatabase(':memory:');
  const clients = new ClientsStore(db);
  clients.registerClient(client);
  clients.registerClient(other);
  return new OAuthProvider(clients, new McpTokenService(config), db, config);
}

const pending = (): PendingAuthorization => ({
  clientId: 'c1',
  redirectUri: 'https://client.example/cb',
  codeChallenge: 'challenge',
  state: 'xyz',
  exp: Math.floor(Date.now() / 1000) + 600,
});

function codeOf(redirect: string): string {
  return new URL(redirect).searchParams.get('code');
}

describe('OAuthProvider', () => {
  afterEach(() => vi.useRealTimers());

  describe('authorize', () => {
    function authorize(provider: OAuthProvider, resource?: string) {
      const res = {
        cookie: vi.fn().mockReturnThis(),
        redirect: vi.fn(),
      };
      const run = provider.authorize(
        client,
        {
          redirectUri: 'https://client.example/cb',
          codeChallenge: 'challenge',
          state: 'xyz',
          resource: resource ? new URL(resource) : undefined,
        },
        res as unknown as Response,
      );
      return { res, run };
    }

    it('parks the request and sends the user to the ENT login', async () => {
      const provider = setup();
      const { res, run } = authorize(
        provider,
        'https://alegria.example.fr/mcp',
      );
      await run;
      expect(res.redirect).toHaveBeenCalledWith(
        `/auth/login?next=${encodeURIComponent(CONSENT_PATH)}`,
      );
      const [name, cookie] = res.cookie.mock.calls[0];
      expect(name).toBe(PENDING_COOKIE);
      expect(provider.pending(cookie)).toMatchObject({
        clientId: 'c1',
        codeChallenge: 'challenge',
        state: 'xyz',
      });
    });

    it('refuses another resource', async () => {
      const { run } = authorize(setup(), 'https://other.example/mcp');
      await expect(run).rejects.toThrow(InvalidTargetError);
    });
  });

  describe('pending', () => {
    it('refuses a tampered or expired cookie', async () => {
      const provider = setup();
      const res = { cookie: vi.fn().mockReturnThis(), redirect: vi.fn() };
      await provider.authorize(
        client,
        { redirectUri: 'https://client.example/cb', codeChallenge: 'c' },
        res as unknown as Response,
      );
      const cookie: string = res.cookie.mock.calls[0][1];
      expect(provider.pending(`x${cookie}`)).toBeNull();
      expect(provider.pending(undefined)).toBeNull();
      vi.useFakeTimers({ now: Date.now() + 601 * 1000 });
      expect(provider.pending(cookie)).toBeNull();
    });
  });

  it('denies with access_denied and the state', () => {
    const url = new URL(setup().deny(pending()));
    expect(url.searchParams.get('error')).toBe('access_denied');
    expect(url.searchParams.get('state')).toBe('xyz');
  });

  describe('code exchange', () => {
    it('issues a token for the approved user, once', async () => {
      const provider = setup();
      const code = codeOf(provider.approve(pending(), teacher));
      expect(await provider.challengeForAuthorizationCode(client, code)).toBe(
        'challenge',
      );

      const tokens = await provider.exchangeAuthorizationCode(
        client,
        code,
        undefined,
        'https://client.example/cb',
        new URL('https://alegria.example.fr/mcp'),
      );
      expect(tokens).toMatchObject({ token_type: 'Bearer', expires_in: 3600 });
      const info = await provider.verifyAccessToken(tokens.access_token);
      expect(info.extra.user).toEqual(teacher);
      expect(info.resource.href).toBe('https://alegria.example.fr/mcp');

      await expect(
        provider.exchangeAuthorizationCode(
          client,
          code,
          undefined,
          'https://client.example/cb',
        ),
      ).rejects.toThrow(InvalidGrantError);
    });

    it('refuses another client', async () => {
      const provider = setup();
      const code = codeOf(provider.approve(pending(), teacher));
      await expect(
        provider.challengeForAuthorizationCode(other, code),
      ).rejects.toThrow(InvalidGrantError);
      await expect(
        provider.exchangeAuthorizationCode(
          other,
          code,
          undefined,
          'https://client.example/cb',
        ),
      ).rejects.toThrow(InvalidGrantError);
    });

    it('refuses another redirect URI', async () => {
      const provider = setup();
      const code = codeOf(provider.approve(pending(), teacher));
      await expect(
        provider.exchangeAuthorizationCode(
          client,
          code,
          undefined,
          'https://client.example/other',
        ),
      ).rejects.toThrow(InvalidGrantError);
    });

    it('refuses another resource', async () => {
      const provider = setup();
      const code = codeOf(provider.approve(pending(), teacher));
      await expect(
        provider.exchangeAuthorizationCode(
          client,
          code,
          undefined,
          'https://client.example/cb',
          new URL('https://other.example/mcp'),
        ),
      ).rejects.toThrow(InvalidTargetError);
    });

    it('refuses an expired code', async () => {
      const provider = setup();
      const code = codeOf(provider.approve(pending(), teacher));
      vi.useFakeTimers({ now: Date.now() + 61 * 1000 });
      await expect(
        provider.challengeForAuthorizationCode(client, code),
      ).rejects.toThrow(InvalidGrantError);
    });
  });

  it('issues no refresh tokens', async () => {
    await expect(setup().exchangeRefreshToken()).rejects.toThrow(
      InvalidGrantError,
    );
  });

  it('refuses an invalid access token', async () => {
    await expect(setup().verifyAccessToken('nope')).rejects.toThrow(
      InvalidTokenError,
    );
  });
});
