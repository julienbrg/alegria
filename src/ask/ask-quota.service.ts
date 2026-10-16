import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import { AskLimits, parseAskLimits } from '../config/ask-limits';
import { DATABASE } from '../db/db.module';
import type { EntUser } from '../ent/session.service';

const DAY_SECONDS = 86400;

const PARIS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function paris(at: Date): { day: string; elapsed: number } {
  const part = Object.fromEntries(
    PARIS.formatToParts(at).map(({ type, value }) => [type, value]),
  );
  return {
    day: `${part.year}-${part.month}-${part.day}`,
    elapsed:
      Number(part.hour) * 3600 + Number(part.minute) * 60 + Number(part.second),
  };
}

/** Seconds from `at` to the next midnight in Paris, DST changes included. */
export function secondsToParisMidnight(at: Date): number {
  let seconds = DAY_SECONDS - paris(at).elapsed;
  // On a DST day the guess lands an hour off midnight; correct by that hour
  const off = paris(new Date(at.getTime() + seconds * 1000)).elapsed;
  if (off > 0) seconds += off < DAY_SECONDS / 2 ? -off : DAY_SECONDS - off;
  return seconds;
}

export interface AskRefusal {
  message: string;
  /** Seconds until the limit resets, for `Retry-After`. */
  retryAfter: number;
}

/**
 * Counts questions per ENT user and Paris day against `ASK_DAILY_LIMITS`.
 * Every entry point that asks a model goes through `consume`, so the limit
 * is shared between them.
 */
@Injectable()
export class AskQuotaService implements OnModuleInit {
  private readonly limits: AskLimits;

  constructor(
    @Inject(DATABASE) private readonly db: Database.Database,
    config: ConfigService,
  ) {
    this.limits = parseAskLimits(config.getOrThrow<string>('ASK_DAILY_LIMITS'));
  }

  /** Past days are never read again. */
  onModuleInit(): void {
    this.db
      .prepare('DELETE FROM ask_quota WHERE day < ?')
      .run(paris(new Date()).day);
  }

  /**
   * Counts one question for `user`, or returns why it is refused. The check
   * and the increment are one statement, so concurrent asks cannot both
   * take the last question.
   */
  consume(user: EntUser, now = new Date()): AskRefusal | null {
    const limit = this.limits[user.profile];
    if (limit === undefined) return null;

    const { changes } = this.db
      .prepare(
        `INSERT INTO ask_quota (user_id, day, count) VALUES (?, ?, 1)
         ON CONFLICT (user_id, day) DO UPDATE SET count = count + 1
         WHERE count < ?`,
      )
      .run(user.userId, paris(now).day, limit);
    if (changes > 0) return null;

    return {
      message: `Daily limit of ${limit} questions reached. It resets at midnight, Paris time.`,
      retryAfter: secondsToParisMidnight(now),
    };
  }
}
