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
