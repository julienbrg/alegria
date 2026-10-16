import Database from 'better-sqlite3';
import { openDatabase } from '../db/db.module';
import { ConversationMemory } from './conversation-memory';

describe('ConversationMemory', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
    db.exec(`
      INSERT INTO assistants (name, owner_id, uai, model) VALUES ('a', 'u1', '0590123A', 'mistral');
      INSERT INTO conversations (user_id, assistant, session_id) VALUES ('u1', 'a', 's1'), ('u2', 'a', 's2');
    `);
  });

  afterEach(() => {
    db.close();
  });

  it('starts empty', async () => {
    const { history } = await new ConversationMemory(
      db,
      's1',
    ).loadMemoryVariables();

    expect(history).toEqual([]);
  });

  it('returns its own session in order', async () => {
    const memory = new ConversationMemory(db, 's1');
    await memory.saveContext({ input: 'q1' }, { response: 'a1' });
    await new ConversationMemory(db, 's2').saveContext(
      { input: 'other' },
      { response: 'other' },
    );
    await memory.saveContext({ input: 'q2' }, { response: 'a2' });

    const { history } = await memory.loadMemoryVariables();

    expect(history.map(({ role, content }) => [role, content])).toEqual([
      ['user', 'q1'],
      ['assistant', 'a1'],
      ['user', 'q2'],
      ['assistant', 'a2'],
    ]);
    expect(history.every((m) => m.sessionId === 's1')).toBe(true);
  });

  it('keeps every turn of concurrent saves', async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        new ConversationMemory(db, 's1').saveContext(
          { input: `q${i}` },
          { response: `a${i}` },
        ),
      ),
    );

    const { history } = await new ConversationMemory(
      db,
      's1',
    ).loadMemoryVariables();
    expect(history).toHaveLength(20);
  });

  it('saves nothing for an unknown session', async () => {
    await expect(
      new ConversationMemory(db, 'missing').saveContext(
        { input: 'q' },
        { response: 'a' },
      ),
    ).rejects.toThrow('FOREIGN KEY');
    expect(db.prepare('SELECT count(*) FROM messages').pluck().get()).toBe(0);
  });

  it('clears its own session only', async () => {
    await new ConversationMemory(db, 's1').saveContext(
      { input: 'q' },
      { response: 'a' },
    );
    await new ConversationMemory(db, 's2').saveContext(
      { input: 'q' },
      { response: 'a' },
    );

    expect(new ConversationMemory(db, 's1').clear()).toBe(true);
    expect(new ConversationMemory(db, 's1').clear()).toBe(false);
    expect(db.prepare('SELECT count(*) FROM messages').pluck().get()).toBe(2);
  });
});
