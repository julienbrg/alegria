import { Inject, Injectable } from '@nestjs/common';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { DATABASE } from '../db/db.module';

/**
 * Owns the Rukh `sessionId` of each user and assistant pair, so a client
 * can never pick, and so continue, someone else's conversation.
 */
@Injectable()
export class ConversationService {
  constructor(@Inject(DATABASE) private readonly db: Database.Database) {}

  /** The pair's session, created on first use. */
  sessionFor(userId: string, assistant: string): string {
    this.db
      .prepare(
        'INSERT INTO conversations (user_id, assistant, session_id) VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
      )
      .run(userId, assistant, randomUUID());
    return this.db
      .prepare(
        'SELECT session_id FROM conversations WHERE user_id = ? AND assistant = ?',
      )
      .pluck()
      .get(userId, assistant) as string;
  }

  /** Drops the pair's session; the next `sessionFor` starts a new one. */
  reset(userId: string, assistant: string): void {
    this.db
      .prepare('DELETE FROM conversations WHERE user_id = ? AND assistant = ?')
      .run(userId, assistant);
  }
}
