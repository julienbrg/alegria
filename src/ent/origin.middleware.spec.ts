import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { OriginMiddleware } from './origin.middleware';

const middleware = new OriginMiddleware({
  get: () => 'https://alegria.example.fr/',
} as unknown as ConfigService);

function run(method: string, origin?: string) {
  const next = vi.fn();
  const req = { method, headers: { origin } } as Request;
  middleware.use(req, {} as Response, next);
  return next;
}

describe('OriginMiddleware', () => {
  it('lets safe methods through from anywhere', () => {
    expect(run('GET', 'https://evil.example')).toHaveBeenCalled();
  });

  it('lets same-origin writes through', () => {
    expect(run('POST', 'https://alegria.example.fr')).toHaveBeenCalled();
  });

  it.each([['https://evil.example'], [undefined]])(
    'refuses writes from %s',
    (origin) => {
      expect(() => run('POST', origin)).toThrow(ForbiddenException);
    },
  );
});
