import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntOAuthService } from './ent-oauth.service';

const values = {
  ENT_BASE_URL: 'https://ent.example.fr/',
  ENT_CLIENT_ID: 'alegria',
  ENT_CLIENT_SECRET: 'secret',
  ENT_REDIRECT_URI: 'https://alegria.example.fr/auth/callback',
  ENT_USERINFO_VERSION: '2.0',
};
const oauth = new EntOAuthService({
  get: (key: string) => values[key],
} as unknown as ConfigService);

function respond(...bodies: unknown[]) {
  const fetchMock = vi.fn();
  for (const body of bodies) {
    fetchMock.mockResolvedValueOnce({
      ok: body !== null,
      json: async () => body,
    });
  }
  global.fetch = fetchMock;
  return fetchMock;
}

describe('EntOAuthService', () => {
  it('builds the authorize URL', () => {
    const url = new URL(oauth.authorizeUrl('s1'));
    expect(url.origin + url.pathname).toBe(
      'https://ent.example.fr/auth/oauth2/auth',
    );
    expect(url.searchParams.get('state')).toBe('s1');
    expect(url.searchParams.get('redirect_uri')).toBe(values.ENT_REDIRECT_URI);
  });

  it('maps the userinfo payload', async () => {
    const fetchMock = respond(
      { access_token: 'at' },
      {
        userId: 'u-1',
        type: 'Student',
        classNames: ['3A'],
        uai: '0750001A',
      },
    );
    await expect(oauth.userFromCode('c1')).resolves.toEqual({
      userId: 'u-1',
      profile: 'Student',
      role: 'user',
      uai: ['0750001A'],
      classes: ['3A'],
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://ent.example.fr/auth/oauth2/userinfo?version=2.0',
    );
  });

  it('returns a null role for guests', async () => {
    respond({ access_token: 'at' }, { userId: 'u-2', type: 'Guest' });
    await expect(oauth.userFromCode('c1')).resolves.toMatchObject({
      profile: null,
      role: null,
    });
  });

  it('fails when the token exchange fails', async () => {
    respond(null);
    await expect(oauth.userFromCode('c1')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
