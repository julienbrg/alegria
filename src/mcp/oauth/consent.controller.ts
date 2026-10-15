import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { EntRequest } from '../../ent/current-user.decorator';
import { Public } from '../../ent/public.decorator';
import { mcpRoles } from '../mcp-roles';
import { CONSENT_PATH, OAuthProvider, PENDING_COOKIE } from './oauth.provider';

const STYLE =
  'body{background:#000;color:#fff;font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem}button{background:#8c1c84;color:#fff;border:0;padding:.6rem 1.2rem;margin-right:.5rem;font:inherit;cursor:pointer}button[value=deny]{background:#333}';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function page(body: string): string {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Alegria</title><style>${STYLE}</style>${body}`;
}

/** `form-action` must allow the redirect that follows the form post. */
function formTarget(redirectUri: string): string {
  const url = new URL(redirectUri);
  return url.protocol === 'http:' || url.protocol === 'https:'
    ? url.origin
    : url.protocol;
}

/**
 * Consent screen of the MCP authorization flow, reached after the ENT
 * login. It names the client, as required of a server that delegates
 * sign-in to a third party.
 */
@Public()
@ApiExcludeController()
@Controller(CONSENT_PATH.slice(1))
export class ConsentController {
  private readonly roles: Set<string>;

  constructor(
    private readonly provider: OAuthProvider,
    config: ConfigService,
  ) {
    this.roles = mcpRoles(config);
  }

  @Get()
  async show(@Req() req: EntRequest, @Res() res: Response) {
    if (!req.user) {
      return res.redirect(
        `/auth/login?${new URLSearchParams({ next: CONSENT_PATH })}`,
      );
    }
    const pending = this.provider.pending(req.cookies?.[PENDING_COOKIE]);
    if (!pending) return this.expired(res);
    if (!this.roles.has(req.user.role)) {
      return this.finish(res, this.provider.deny(pending));
    }

    const client = await this.provider.clientsStore.getClient(pending.clientId);
    const name = escapeHtml(client?.client_name ?? pending.clientId);
    const host = escapeHtml(
      new URL(pending.redirectUri).host || pending.redirectUri,
    );
    res
      .type('html')
      .setHeader('Cache-Control', 'no-store')
      .setHeader(
        'Content-Security-Policy',
        `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${formTarget(pending.redirectUri)}; frame-ancestors 'none'; base-uri 'none'`,
      )
      .send(
        page(
          `<h1>Connect ${name}</h1><p><strong>${name}</strong> asks to use Alegria as you (${escapeHtml(req.user.profile)}). It will be able to call the Alegria tools with your identity, and will receive their answers at <strong>${host}</strong>.</p><form method="post"><button name="decision" value="approve">Allow</button><button name="decision" value="deny">Deny</button></form>`,
        ),
      );
  }

  @Post()
  decide(
    @Body('decision') decision: string,
    @Req() req: EntRequest,
    @Res() res: Response,
  ) {
    const pending = this.provider.pending(req.cookies?.[PENDING_COOKIE]);
    if (!req.user || !pending) return this.expired(res);
    const allowed = decision === 'approve' && this.roles.has(req.user.role);
    this.finish(
      res,
      allowed
        ? this.provider.approve(pending, req.user)
        : this.provider.deny(pending),
    );
  }

  private finish(res: Response, redirect: string) {
    res
      .clearCookie(PENDING_COOKIE, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      })
      .redirect(303, redirect);
  }

  private expired(res: Response) {
    res
      .status(400)
      .type('html')
      .send(
        page(
          '<h1>Request expired</h1><p>Start the connection again from your MCP client.</p>',
        ),
      );
  }
}
