import { ConfigService } from '@nestjs/config';
import { EntUser, SessionService } from '../../ent/session.service';
import { McpTokenService } from './mcp-token.service';

const values = {
  PUBLIC_ORIGIN: 'https://alegria.example.fr',
  SESSION_SECRET: 'unit-session-secret-000000000000000',
  SESSION_IDLE_SECONDS: 1800,
  SESSION_MAX_SECONDS: 28800,
  MCP_TOKEN_SECONDS: 3600,
};
const config = (overrides: Record<string, unknown> = {}) =>
  ({
    get: (key: string) => ({ ...values, ...overrides })[key],
  }) as unknown as ConfigService;

const teacher: EntUser = {
  userId: 'u1',
  profile: 'Teacher',
  role: 'teacher',
  uai: ['0000001A'],
  classes: ['3A'],
};

describe('McpTokenService', () => {
  const tokens = new McpTokenService(config());

  afterEach(() => vi.useRealTimers());

  it('binds tokens to /mcp', () => {
    expect(tokens.resource).toBe('https://alegria.example.fr/mcp');
  });

  it('round-trips the user and client', () => {
    expect(tokens.verify(tokens.issue(teacher, 'c1'))).toMatchObject({
      user: teacher,
      clientId: 'c1',
    });
  });

  it('refuses a tampered token', () => {
    const [header, , signature] = tokens.issue(teacher, 'c1').split('.');
    const payload = Buffer.from(
      JSON.stringify({ sub: 'u1', role: 'teacher' }),
    ).toString('base64url');
    expect(tokens.verify(`${header}.${payload}.${signature}`)).toBeNull();
  });

  it('refuses an expired token', () => {
    const token = tokens.issue(teacher, 'c1');
    vi.useFakeTimers({ now: Date.now() + 3601 * 1000 });
    expect(tokens.verify(token)).toBeNull();
  });

  it('refuses a token for another resource', () => {
    const other = new McpTokenService(
      config({ PUBLIC_ORIGIN: 'https://other.example.fr' }),
    );
    expect(tokens.verify(other.issue(teacher, 'c1'))).toBeNull();
  });

  it('refuses a session cookie', () => {
    const session = new SessionService(config()).issue(teacher);
    expect(tokens.verify(session)).toBeNull();
  });
});
