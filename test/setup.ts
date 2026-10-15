import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import { AddressInfo, createServer } from 'node:net';
import request, { Response } from 'supertest';
import { vi } from 'vitest';
import { configureApp } from '../src/app.setup';

export interface E2eApp {
  app: INestApplication;
  server: Server;
  /** Value of `PUBLIC_ORIGIN`, to send as `Origin` on non-GET requests. */
  origin: string;
}

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

/**
 * Boots the full `AppModule` against the mock ENT, with `env` on top of
 * the defaults. It listens on a real port because the OAuth client reaches
 * `/mock-ent` over `fetch`.
 */
export async function bootApp(
  env: Record<string, string> = {},
): Promise<E2eApp> {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  Object.assign(process.env, {
    NODE_ENV: 'test',
    ENT_MOCK: 'true',
    ENT_BASE_URL: `${origin}/mock-ent`,
    ENT_CLIENT_ID: 'alegria',
    ENT_CLIENT_SECRET: 'e2e',
    ENT_REDIRECT_URI: `${origin}/auth/callback`,
    ENT_USERINFO_VERSION: '2.0',
    ENT_ALLOWED_MODELS: 'model-a,model-b',
    PUBLIC_ORIGIN: origin,
    SESSION_SECRET: 'e2e-session-secret-0000000000000000',
    MCP_ENABLED: 'true',
    MCP_ROLES: 'teacher',
    PORT: String(port),
    SWAGGER_ENABLED: 'false',
    DB_PATH: ':memory:',
    ...env,
  });

  // Imported late and fresh: `ConfigModule.forRoot` and `ConditionalModule`
  // read the environment set above when the module is evaluated.
  vi.resetModules();
  const { AppModule } = await import('../src/app.module');
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(port, '127.0.0.1');
  return { app, server: app.getHttpServer(), origin };
}

/**
 * Minimal cookie jar. Superagent's own jar never sends `Secure` cookies
 * over plain HTTP, and every Alegria cookie is `__Host-` and `Secure`.
 */
export class CookieJar {
  private readonly cookies = new Map<string, string>();

  update(res: Response): this {
    const header = res.headers['set-cookie'] as unknown as string[] | undefined;
    for (const line of header ?? []) {
      const [pair, ...attributes] = line.split(';').map((s) => s.trim());
      const [name, value] = [
        pair.slice(0, pair.indexOf('=')),
        pair.slice(pair.indexOf('=') + 1),
      ];
      const expires = attributes.find((a) => /^expires=/i.test(a));
      const expired =
        expires && new Date(expires.slice('expires='.length)) <= new Date();
      if (!value || expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return this;
  }

  get(name: string): string | undefined {
    return this.cookies.get(name);
  }

  header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

/** Starts the OAuth flow and returns the jar holding the `state` cookie. */
export async function startLogin(
  server: Server,
): Promise<{ jar: CookieJar; authorize: URL }> {
  const res = await request(server).get('/auth/login').expect(302);
  return {
    jar: new CookieJar().update(res),
    authorize: new URL(res.headers.location),
  };
}

/** Picks a profile on the mock ENT and returns its redirect to `/auth/callback`. */
export async function approve(
  server: Server,
  authorize: URL,
  login: string,
): Promise<URL> {
  const params = new URLSearchParams({ login });
  for (const key of ['client_id', 'redirect_uri', 'state']) {
    params.set(key, authorize.searchParams.get(key));
  }
  const res = await request(server)
    .get(`/mock-ent/auth/oauth2/approve?${params}`)
    .expect(302);
  return new URL(res.headers.location);
}

/** Full login as a mock ENT profile. The jar holds the session, if any. */
export async function login(
  server: Server,
  profile: string,
): Promise<{ jar: CookieJar; res: Response }> {
  const { jar, authorize } = await startLogin(server);
  const callback = await approve(server, authorize, profile);
  const res = await request(server)
    .get(`${callback.pathname}${callback.search}`)
    .set('Cookie', jar.header())
    .expect(302);
  return { jar: jar.update(res), res };
}
