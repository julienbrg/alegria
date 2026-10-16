import Database from 'better-sqlite3';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from './db.module';

const MIGRATION_COUNT = readdirSync(join(__dirname, 'migrations')).filter(
  (name) => name.endsWith('.sql'),
).length;

describe('openDatabase', () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  it('migrates an in-memory database with foreign keys on', () => {
    db = openDatabase(':memory:');

    expect(db.pragma('user_version', { simple: true })).toBe(MIGRATION_COUNT);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('deletes conversations with their assistant', () => {
    db = openDatabase(':memory:');
    db.prepare(
      "INSERT INTO assistants (name, owner_id, uai, model) VALUES ('a', 'u1', '0590123A', 'mistral')",
    ).run();
    db.prepare(
      "INSERT INTO conversations (user_id, assistant, session_id) VALUES ('u2', 'a', 's1')",
    ).run();

    db.prepare("DELETE FROM assistants WHERE name = 'a'").run();

    expect(db.prepare('SELECT count(*) FROM conversations').pluck().get()).toBe(
      0,
    );
  });

  describe('when an assistant is deleted', () => {
    beforeEach(() => {
      db = openDatabase(':memory:');
      db.exec(`
        INSERT INTO assistants (name, owner_id, uai, model) VALUES ('a', 'u1', '0590123A', 'mistral');
        INSERT INTO conversations (user_id, assistant, session_id) VALUES ('u2', 'a', 's1');
        INSERT INTO messages (session_id, role, content, timestamp) VALUES ('s1', 'user', 'hi', 1);
        INSERT INTO usage (session_id, model, input_tokens, output_tokens, input_cost, output_cost, total_cost, message)
          VALUES ('s1', 'mistral', 1, 1, 0.1, 0.2, 0.3, 'hi');
      `);
      db.prepare("DELETE FROM assistants WHERE name = 'a'").run();
    });

    it('deletes its messages', () => {
      expect(db.prepare('SELECT count(*) FROM messages').pluck().get()).toBe(0);
    });

    it('keeps the usage cost but forgets the message', () => {
      expect(
        db.prepare('SELECT session_id, message, total_cost FROM usage').get(),
      ).toEqual({ session_id: null, message: null, total_cost: 0.3 });
    });
  });

  it('refuses a message for an unknown session', () => {
    db = openDatabase(':memory:');

    expect(() =>
      db
        .prepare(
          "INSERT INTO messages (session_id, role, content, timestamp) VALUES ('missing', 'user', 'hi', 1)",
        )
        .run(),
    ).toThrow('FOREIGN KEY');
  });

  it('refuses a conversation for an unknown assistant', () => {
    db = openDatabase(':memory:');

    expect(() =>
      db
        .prepare(
          "INSERT INTO conversations (user_id, assistant, session_id) VALUES ('u', 'missing', 's')",
        )
        .run(),
    ).toThrow('FOREIGN KEY');
  });

  describe('on disk', () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'alegria-db-'));
    });

    afterEach(() => {
      db?.close();
      rmSync(dir, { recursive: true, force: true });
    });

    it('creates the directory, uses WAL and reopens without migrating again', () => {
      const path = join(dir, 'nested', 'alegria.db');
      db = openDatabase(path);
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
      db.close();

      db = openDatabase(path);
      expect(db.pragma('user_version', { simple: true })).toBe(MIGRATION_COUNT);
    });
  });
});
