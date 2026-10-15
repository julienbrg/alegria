import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { MockEntController } from './mock-ent.controller';

const REDIRECT = 'http://localhost:3000/auth/callback';
const BASIC = `Basic ${Buffer.from('alegria:s').toString('base64')}`;

function setup() {
  const values = {
    ENT_CLIENT_ID: 'alegria',
    ENT_CLIENT_SECRET: 's',
    ENT_REDIRECT_URI: REDIRECT,
  };
  const controller = new MockEntController({
    get: (key: string) => values[key],
  } as unknown as ConfigService);
  const res = { redirect: vi.fn() };
  controller.approve(
    'student',
    'alegria',
    REDIRECT,
    'st',
    res as unknown as Response,
  );
  const code = new URL(res.redirect.mock.calls[0][0]).searchParams.get('code');
  return { controller, code };
}

const grant = (code: string) => ({
  grant_type: 'authorization_code',
  code,
  redirect_uri: REDIRECT,
});

describe('MockEntController', () => {
  it('refuses an unknown redirect_uri', () => {
    const { controller } = setup();
    expect(() =>
      controller.authorize('alegria', 'https://evil.example/cb', 'st'),
    ).toThrow(BadRequestException);
  });

  it('serves userinfo for a single-use code and token', () => {
    const { controller, code } = setup();
    const { access_token } = controller.token(BASIC, grant(code));
    expect(() => controller.token(BASIC, grant(code))).toThrow(
      BadRequestException,
    );
    expect(controller.userinfo(`Bearer ${access_token}`, '2.0')).toMatchObject({
      type: 'Student',
      classNames: ['3A'],
    });
    expect(() => controller.userinfo(`Bearer ${access_token}`, '2.0')).toThrow(
      UnauthorizedException,
    );
  });

  it('refuses bad client credentials', () => {
    const { controller, code } = setup();
    expect(() => controller.token('Basic eA==', grant(code))).toThrow(
      UnauthorizedException,
    );
  });
});
