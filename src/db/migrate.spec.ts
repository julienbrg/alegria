import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadMigrations, Migration, migrate } from './migrate';

const MIGRATIONS: Migration[] = [
  { version: 1, name: '001-a.sql', sql: 'CREATE TABLE a (id INTEGER);' },
  { version: 2, name: '002-b.sql', sql: 'CREATE TABLE b (id INTEGER);' },
];

function tables(db: Database.Database): string[] {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    )
    .pluck()
    .all() as string[];
}

describe('migrate', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('applies every migration to a fresh database', () => {
    expect(migrate(db, MIGRATIONS)).toBe(2);
    expect(tables(db)).toEqual(['a', 'b']);
    expect(db.pragma('user_version', { simple: true })).toBe(2);
  });

  it('applies nothing on restart', () => {
    migrate(db, MIGRATIONS);
    expect(migrate(db, MIGRATIONS)).toBe(0);
  });

  it('applies only the new migrations', () => {
    migrate(db, MIGRATIONS.slice(0, 1));
    expect(migrate(db, MIGRATIONS)).toBe(1);
    expect(tables(db)).toEqual(['a', 'b']);
  });

  it('leaves the database unchanged when a migration fails', () => {
    migrate(db, MIGRATIONS.slice(0, 1));
    const broken = [
      ...MIGRATIONS,
      { version: 3, name: '003-broken.sql', sql: 'CREATE TABLE a (id);' },
    ];

    expect(() => migrate(db, broken)).toThrow('Migration 003-broken.sql');
    expect(tables(db)).toEqual(['a']);
    expect(db.pragma('user_version', { simple: true })).toBe(1);
  });

  it('refuses a database newer than the code', () => {
    db.pragma('user_version = 3');
    expect(() => migrate(db, MIGRATIONS)).toThrow('newer');
  });
});

describe('loadMigrations', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'alegria-migrations-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads numbered .sql files in order and ignores the rest', () => {
    writeFileSync(join(dir, '002-b.sql'), 'B');
    writeFileSync(join(dir, '001-a.sql'), 'A');
    writeFileSync(join(dir, 'README.md'), '');

    expect(loadMigrations(dir)).toEqual([
      { version: 1, name: '001-a.sql', sql: 'A' },
      { version: 2, name: '002-b.sql', sql: 'B' },
    ]);
  });

  it('refuses a gap in the numbering', () => {
    writeFileSync(join(dir, '001-a.sql'), '');
    writeFileSync(join(dir, '003-c.sql'), '');

    expect(() => loadMigrations(dir)).toThrow('003-c.sql');
  });
});
