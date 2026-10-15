import {
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { allowedModels } from '../config/allowed-models';
import { CurrentUser } from './current-user.decorator';
import { EntOAuthService } from './ent-oauth.service';
import { Public } from './public.decorator';
import { EntUser, SESSION_COOKIE, SessionService } from './session.service';

export const STATE_COOKIE = '__Host-alegria-state';
export const NEXT_COOKIE = '__Host-alegria-next';
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

/** Same-origin path to land on after login, or `null`. */
export function safeNext(next: string | undefined): string | null {
  return next && /^\/(?![/\\])/.test(next) ? next : null;
}

function sameState(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

@Controller()
export class EntController {
  private readonly allowedModels: string[];

  constructor(
    private readonly oauth: EntOAuthService,
    private readonly sessions: SessionService,
    config: ConfigService,
  ) {
    this.allowedModels = allowedModels(config);
  }

  /**
   * Always starts a fresh OAuth flow, so a shared computer never reuses a
   * session. `next` is where the callback lands, `/` by default.
   */
  @Public()
  @Get('auth/login')
  login(@Query('next') next: string | undefined, @Res() res: Response) {
    const state = randomBytes(32).toString('base64url');
    const flow = { ...this.sessions.cookieOptions(), maxAge: STATE_MAX_AGE_MS };
    res
      .clearCookie(SESSION_COOKIE, this.sessions.cookieOptions())
      .clearCookie(NEXT_COOKIE, this.sessions.cookieOptions())
      .cookie(STATE_COOKIE, state, flow);
    const target = safeNext(next);
    if (target) res.cookie(NEXT_COOKIE, target, flow);
    res.redirect(this.oauth.authorizeUrl(state));
  }

  @Public()
  @Get('auth/callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const expected = req.cookies?.[STATE_COOKIE];
    const next = safeNext(req.cookies?.[NEXT_COOKIE]) ?? '/';
    res
      .clearCookie(STATE_COOKIE, this.sessions.cookieOptions())
      .clearCookie(NEXT_COOKIE, this.sessions.cookieOptions());
    if (!code || !sameState(state, expected)) {
      return res.redirect('/?error=state');
    }

    const user = await this.oauth.userFromCode(code);
    if (!user.role) return res.redirect('/?error=refused');

    res
      .cookie(
        SESSION_COOKIE,
        this.sessions.issue(user as EntUser),
        this.sessions.cookieOptions(),
      )
      .redirect(next);
  }

  @Public()
  @Post('auth/logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, this.sessions.cookieOptions());
  }

  @Get('me')
  me(@CurrentUser() user: EntUser) {
    return {
      userId: user.userId,
      profile: user.profile,
      role: user.role,
      schools: user.uai,
      classes: user.classes,
      allowedModels: this.allowedModels,
    };
  }
}
