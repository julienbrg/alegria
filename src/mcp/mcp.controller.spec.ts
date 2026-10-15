import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { EntUser } from '../ent/session.service';
import { McpController, McpRequest } from './mcp.controller';

const values = {
  MCP_ROLES: 'teacher',
  PUBLIC_ORIGIN: 'https://alegria.example.fr',
};
const controller = new McpController({
  get: (key: string) => values[key],
} as unknown as ConfigService);

const teacher: EntUser = {
  userId: 'u',
  profile: 'Teacher',
  role: 'teacher',
  uai: [],
  classes: [],
};
const request = (user?: EntUser, origin?: string) =>
  ({
    headers: { origin },
    auth: user && { extra: { user } },
  }) as unknown as McpRequest;

describe('McpController', () => {
  it('refuses roles outside MCP_ROLES', async () => {
    await expect(
      controller.handle(
        request({ ...teacher, profile: 'Student', role: 'user' }),
        {} as Response,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses a request without a verified token', async () => {
    await expect(controller.handle(request(), {} as Response)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('refuses a foreign Origin', async () => {
    await expect(
      controller.handle(
        request(teacher, 'https://evil.example'),
        {} as Response,
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
