import { BaseMemory } from '@langchain/core/memory';
import type Database from 'better-sqlite3';

export interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  sessionId: string;
}

/** A session's history, in the `messages` table. */
export class ConversationMemory extends BaseMemory {
  constructor(
    private readonly db: Database.Database,
    private readonly sessionId: string,
  ) {
    super();
  }

  get memoryKeys() {
    return ['history'];
  }

  async loadMemoryVariables(): Promise<{ history: StoredMessage[] }> {
    const history = this.db
      .prepare(
        'SELECT role, content, timestamp, session_id AS sessionId FROM messages WHERE session_id = ? ORDER BY id',
      )
      .all(this.sessionId) as StoredMessage[];
    return { history };
  }

  /** Both messages land together, or neither does. */
  async saveContext(
    input: { input: string },
    output: { response: string },
  ): Promise<void> {
    const insert = this.db.prepare(
      'INSERT INTO messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)',
    );
    this.db.transaction(() => {
      const now = Date.now();
      insert.run(this.sessionId, 'user', input.input, now);
      insert.run(this.sessionId, 'assistant', output.response, now);
    })();
  }

  /** Returns whether there was anything to delete. */
  clear(): boolean {
    return (
      this.db
        .prepare('DELETE FROM messages WHERE session_id = ?')
        .run(this.sessionId).changes > 0
    );
  }
}
