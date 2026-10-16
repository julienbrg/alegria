import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import { openDatabase } from '../db/db.module';
import type { EntUser } from '../ent/session.service';
import { AskQuotaService, secondsToParisMidnight } from './ask-quota.service';

const student: EntUser = {
  userId: 's1',
  profile: 'Student',
  role: 'user',
  uai: ['0000001A'],
  classes: ['3A'],
};

describe('AskQuotaService', () => {
  let db: Database.Database;
  let quota: AskQuotaService;

  beforeEach(() => {
    db = openDatabase(':memory:');
    quota = new AskQuotaService(db, {
      getOrThrow: () => 'Student:2',
    } as unknown as ConfigService);
  });

  afterEach(() => db.close());

  // 10:00 in Paris (UTC+2 in October)
  const morning = new Date('2026-10-16T08:00:00Z');

  it('allows the limit, then refuses until midnight in Paris', () => {
    expect(quota.consume(student, morning)).toBeNull();
    expect(quota.consume(student, morning)).toBeNull();
    expect(quota.consume(student, morning)).toEqual({
      message:
        'Daily limit of 2 questions reached. It resets at midnight, Paris time.',
      retryAfter: 14 * 3600,
    });
  });

  it('starts afresh on the next Paris day', () => {
    const lateEvening = new Date('2026-10-16T21:59:59Z');
    quota.consume(student, lateEvening);
    quota.consume(student, lateEvening);
    expect(quota.consume(student, lateEvening)).not.toBeNull();
    expect(quota.consume(student, new Date('2026-10-16T22:00:00Z'))).toBeNull();
  });

  it('counts each user separately', () => {
    quota.consume(student, morning);
    quota.consume(student, morning);
    expect(quota.consume({ ...student, userId: 's2' }, morning)).toBeNull();
  });

  it('leaves an unlisted profile unlimited', () => {
    const teacher: EntUser = { ...student, profile: 'Teacher' };
    for (let i = 0; i < 5; i++) {
      expect(quota.consume(teacher, morning)).toBeNull();
    }
    expect(db.prepare('SELECT count(*) FROM ask_quota').pluck().get()).toBe(0);
  });

  it('drops past days on start', () => {
    db.prepare(
      "INSERT INTO ask_quota (user_id, day, count) VALUES ('s1', '2000-01-01', 3)",
    ).run();
    quota.onModuleInit();
    expect(db.prepare('SELECT count(*) FROM ask_quota').pluck().get()).toBe(0);
  });
});

describe('secondsToParisMidnight', () => {
  it.each([
    ['an ordinary day', '2026-10-16T21:00:00Z', 3600],
    ['the day clocks go back', '2026-10-25T00:00:00Z', 23 * 3600],
    ['the day clocks go forward', '2026-03-29T00:00:00Z', 22 * 3600],
  ])('counts real seconds on %s', (_, at, seconds) => {
    expect(secondsToParisMidnight(new Date(at))).toBe(seconds);
  });
});
