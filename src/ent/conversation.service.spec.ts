import Database from 'better-sqlite3';
import { openDatabase } from '../db/db.module';
import { ConversationService } from './conversation.service';

describe('ConversationService', () => {
  let db: Database.Database;
  let conversations: ConversationService;

  beforeEach(() => {
    db = openDatabase(':memory:');
    for (const name of ['a', 'b']) {
      db.prepare(
        "INSERT INTO assistants (name, owner_id, uai, model) VALUES (?, 't1', '0000001A', 'm')",
      ).run(name);
    }
    conversations = new ConversationService(db);
  });

  afterEach(() => db.close());

  it('creates a session on first use and keeps it', () => {
    const first = conversations.sessionFor('u1', 'a');
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(conversations.sessionFor('u1', 'a')).toBe(first);
  });

  it('gives each user and assistant its own session', () => {
    const session = conversations.sessionFor('u1', 'a');
    expect(conversations.sessionFor('u2', 'a')).not.toBe(session);
    expect(conversations.sessionFor('u1', 'b')).not.toBe(session);
  });

  it('starts a new session after reset', () => {
    const before = conversations.sessionFor('u1', 'a');
    const other = conversations.sessionFor('u2', 'a');
    conversations.reset('u1', 'a');
    expect(conversations.sessionFor('u1', 'a')).not.toBe(before);
    expect(conversations.sessionFor('u2', 'a')).toBe(other);
  });
});
