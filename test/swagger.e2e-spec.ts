import request from 'supertest';
import { bootApp, E2eApp } from './setup';

type Operation = { security?: Record<string, string[]>[] };

/** No `security` inherits the session; `[{}]` is anonymous. */
function accessLevel(security: Operation['security']): string {
  if (!security) return 'session';
  if (JSON.stringify(security) === '[{}]') return 'public';
  if (JSON.stringify(security) === '[{"mcp":[]}]') return 'bearer';
  return JSON.stringify(security);
}

describe('Swagger enabled', () => {
  let e2e: E2eApp;
  let paths: Record<string, Record<string, Operation>>;

  beforeAll(async () => {
    e2e = await bootApp({ SWAGGER_ENABLED: 'true' });
    paths = (await request(e2e.server).get('/api-json').expect(200)).body.paths;
  });

  afterAll(() => e2e.app.close());

  it('serves Swagger UI on /api', async () => {
    const res = await request(e2e.server).get('/api').expect(200);
    expect(res.text).toContain('<title>Swagger UI</title>');
  });

  it('documents the session cookie as the default security scheme', async () => {
    const { body } = await request(e2e.server).get('/api-json').expect(200);
    expect(body.components.securitySchemes.session).toEqual({
      type: 'apiKey',
      in: 'cookie',
      name: '__Host-alegria',
    });
    expect(body.security).toEqual([{ session: [] }]);
  });

  it('lists every route with its access level', () => {
    const access = Object.entries(paths).flatMap(([path, methods]) =>
      Object.entries(methods).map(
        ([method, op]) =>
          `${method.toUpperCase()} ${path} ${accessLevel(op.security)}`,
      ),
    );
    expect(access.sort()).toEqual([
      'DELETE /ask/conversation/{context} session',
      'DELETE /context/{name} session',
      'GET /auth/callback public',
      'GET /auth/login public',
      'GET /context session',
      'GET /context/{name} session',
      'GET /me session',
      'PATCH /context/{name} session',
      'POST /ask session',
      'POST /auth/logout public',
      'POST /context session',
      'POST /mcp bearer',
    ]);
  });

  it('leaves the mock ENT out', () => {
    expect(Object.keys(paths).some((p) => p.startsWith('/mock-ent'))).toBe(
      false,
    );
  });
});

describe('Swagger disabled', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await bootApp({ SWAGGER_ENABLED: 'false' });
  });

  afterAll(() => e2e.app.close());

  it.each(['/api', '/api/', '/api-json'])('does not serve %s', async (path) => {
    await request(e2e.server).get(path).expect(404);
  });
});
