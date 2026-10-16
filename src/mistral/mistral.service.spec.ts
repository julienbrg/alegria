import type { Mock } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ChatMistralAI } from '@langchain/mistralai';
import { MistralService } from './mistral.service';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FinalStreamEvent } from '../types/llm-stream';
import { historyDatabase } from '../providers/testing';

// Mock the ChatMistralAI
vi.mock('@langchain/mistralai', () => {
  return {
    ChatMistralAI: vi.fn().mockImplementation(function () {
      return {
        invoke: vi.fn().mockResolvedValue({
          content: 'Mocked response from Mistral',
        }),
        stream: vi.fn().mockImplementation(async function* () {
          yield { content: 'Mocked response ' };
          yield { content: 'from Mistral' };
        }),
      };
    }),
  };
});

const configWithKey = (key: string | undefined) =>
  ({ get: vi.fn(() => key) }) as unknown as ConfigService;

describe('MistralService', () => {
  let service: MistralService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        historyDatabase(),
        MistralService,
        { provide: ConfigService, useValue: configWithKey('test-api-key') },
      ],
    }).compile();

    service = module.get<MistralService>(MistralService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should be unavailable, not fail to boot, without MISTRAL_API_KEY', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const keyless = new MistralService(configWithKey(undefined));

    expect(keyless.isAvailable()).toBe(false);
    await expect(keyless.processMessage('hi')).rejects.toThrow(
      'Mistral service unavailable',
    );
    vi.restoreAllMocks();
  });

  it('should cap retries so a rate limit fails over instead of backing off', () => {
    // LangChain's own default is 6 retries with exponential backoff, which
    // spent ~90s on a 429 before the fallback chain could try another model.
    const calls = (ChatMistralAI as unknown as Mock).mock.calls;
    const [config] = calls[calls.length - 1] as [{ maxRetries?: number }];

    expect(config.maxRetries).toBe(1);
  });

  it('should log a rate limit as a warning rather than a generic error', async () => {
    (ChatMistralAI as unknown as Mock).mockImplementationOnce(function () {
      return {
        invoke: vi.fn(),
        stream: vi
          .fn()
          .mockRejectedValue(
            new Error('API error occurred: Status 429\nBody: {"code":"1300"}'),
          ),
      };
    });

    const loggerWarnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const loggerErrorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const rateLimited = Object.assign(
      new MistralService(configWithKey('test-api-key')),
      { db: historyDatabase().useValue },
    );

    await expect(
      (async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _event of rateLimited.streamMessage('Hello')) {
          // drain the stream so the rejection surfaces
        }
      })(),
    ).rejects.toThrow('Failed to stream message with Mistral AI');

    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('rate limited (429)'),
    );
    expect(loggerErrorSpy).not.toHaveBeenCalled();

    loggerWarnSpy.mockRestore();
    loggerErrorSpy.mockRestore();
  });

  describe('processMessage', () => {
    it('should process a message successfully', async () => {
      const message = 'Hello, Mistral!';
      const result = await service.processMessage(message);

      expect(result).toBeDefined();
      expect(result.content).toBe('Mocked response from Mistral');
      expect(result.sessionId).toBeDefined();
      expect(result.usage).toBeDefined();
      expect(result.usage.input_tokens).toBeGreaterThan(0);
      expect(result.usage.output_tokens).toBeGreaterThan(0);
      expect(result.cost).toBeDefined();
      expect(result.cost.total_cost).toBeGreaterThanOrEqual(0);
    });

    it('should process a message with session ID', async () => {
      const message = 'Hello, Mistral!';
      const sessionId = 'test-session-id';
      const result = await service.processMessage(message, sessionId);

      expect(result.sessionId).toBe(sessionId);
    });

    it('should process a message with system prompt', async () => {
      const message = 'Hello, Mistral!';
      const systemPrompt = 'You are a helpful assistant.';
      const result = await service.processMessage(
        message,
        undefined,
        systemPrompt,
      );

      expect(result).toBeDefined();
      expect(result.content).toBe('Mocked response from Mistral');
    });
  });

  describe('processMessageWithModel', () => {
    it('should process a message with specific model', async () => {
      const message = 'Test message';
      const modelName = 'mistral-small-latest';
      const result = await service.processMessageWithModel(message, modelName);

      expect(result).toBeDefined();
      expect(result.content).toBe('Mocked response from Mistral');
      expect(result.usage).toBeDefined();
      expect(result.cost).toBeDefined();
    });

    it('should process a message with custom model and session ID', async () => {
      const message = 'Test message';
      const modelName = 'mistral-small-latest';
      const sessionId = 'custom-session';
      const result = await service.processMessageWithModel(
        message,
        modelName,
        sessionId,
      );

      expect(result.sessionId).toBe(sessionId);
    });

    it('should process a message with system prompt', async () => {
      const message = 'Test message';
      const modelName = 'mistral-small-latest';
      const systemPrompt = 'You are an expert.';
      const result = await service.processMessageWithModel(
        message,
        modelName,
        undefined,
        systemPrompt,
      );

      expect(result).toBeDefined();
      expect(result.content).toBe('Mocked response from Mistral');
    });
  });

  describe('getConversationHistory', () => {
    it('should return empty history for new session', async () => {
      const sessionId = 'new-session';
      const result = await service.getConversationHistory(sessionId);

      expect(result).toBeDefined();
      expect(result.history).toBeDefined();
      expect(result.isFirstMessage).toBe(true);
    });

    it('should return conversation history for existing session', async () => {
      const sessionId = 'test-session';
      // First, create a conversation
      await service.processMessage('Hello', sessionId);

      const result = await service.getConversationHistory(sessionId);

      expect(result).toBeDefined();
      expect(result.isFirstMessage).toBe(false);
    });
  });

  describe('deleteConversation', () => {
    it('should return false for non-existent session', async () => {
      const sessionId = 'non-existent-session';
      const result = await service.deleteConversation(sessionId);

      expect(result).toBe(false);
    });

    it('should delete existing conversation', async () => {
      const sessionId = 'test-delete-session';
      // First, create a conversation
      await service.processMessage('Hello', sessionId);

      const result = await service.deleteConversation(sessionId);

      expect(result).toBe(true);
    });
  });

  describe('streamMessage', () => {
    it('should yield text deltas then a final event with usage and cost', async () => {
      const events = [];
      for await (const event of service.streamMessage(
        'Hello',
        'stream-session-id',
      )) {
        events.push(event);
      }

      expect(events.filter((e) => e.type === 'text')).toEqual([
        { type: 'text', text: 'Mocked response ' },
        { type: 'text', text: 'from Mistral' },
      ]);

      const final = events[events.length - 1] as FinalStreamEvent;
      expect(final.type).toBe('final');
      expect(final.content).toBe('Mocked response from Mistral');
      expect(final.sessionId).toBe('stream-session-id');
      // Mistral over LangChain reports no counts, so they're estimated
      expect(final.usage.output_tokens).toBeGreaterThan(0);
      expect(final.cost.total_cost).toBeGreaterThanOrEqual(0);
    });
  });
});
