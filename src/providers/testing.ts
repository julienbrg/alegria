import type { ValueProvider } from '@nestjs/common';
import type Database from 'better-sqlite3';
import { DATABASE, openDatabase } from '../db/db.module';
import { LlmProvider } from './llm-provider';

/**
 * `DATABASE` for a provider service under test, with foreign keys off so
 * history can be saved for sessions no conversation row owns.
 */
export function historyDatabase(): ValueProvider<Database.Database> {
  const db = openDatabase(':memory:');
  db.pragma('foreign_keys = OFF');
  return { provide: DATABASE, useValue: db };
}

/**
 * Gives a mocked provider service the {@link LlmProvider} surface, routing
 * `ask` and `stream` to its `processMessage` and `streamMessage` mocks.
 */
export function asLlmProvider<T extends object>(
  key: string,
  mock: T,
  { label = key, fallbackEligible = true } = {},
): T & LlmProvider {
  const service = mock as unknown as {
    processMessage: LlmProvider['ask'];
    streamMessage: LlmProvider['stream'];
  };
  return Object.assign(mock, {
    key,
    label,
    pricing: { inputCost: 0, outputCost: 0 },
    fallbackEligible,
    isAvailable: () => true,
    ask: (...args: Parameters<LlmProvider['ask']>) =>
      service.processMessage(...args),
    stream: (...args: Parameters<LlmProvider['stream']>) =>
      service.streamMessage(...args),
  });
}
