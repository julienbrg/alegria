import { Logger } from '@nestjs/common';
import type { Mock } from 'vitest';
import { AskPreparationService } from './ask-preparation.service';
import { AskRequest } from './ask-request';
import { ContextLoaderService } from './context-loader.service';
import { ProviderRegistry } from '../providers/provider-registry.service';
import { asLlmProvider } from '../providers/testing';

describe('AskPreparationService', () => {
  let contextLoader: { load: Mock };
  let service: AskPreparationService;

  const request = (overrides: Partial<AskRequest> = {}): AskRequest => ({
    message: 'hi',
    context: 'docs',
    model: 'anthropic',
    sessionId: 'session-1',
    ...overrides,
  });

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const providers = new ProviderRegistry([
      asLlmProvider('anthropic', {}),
      asLlmProvider('mistral', {}),
      asLlmProvider('anthropic-web-search', {}, { fallbackEligible: false }),
    ]);
    contextLoader = {
      load: vi.fn().mockResolvedValue({ systemPrompt: 'Context prompt' }),
    };
    service = new AskPreparationService(
      providers,
      contextLoader as unknown as ContextLoaderService,
    );
  });

  afterEach(() => vi.restoreAllMocks());

  describe('models', () => {
    it('uses the assistant model first, then falls back', async () => {
      const { modelsToTry } = await service.prepare(
        request({ model: 'mistral' }),
      );

      expect(modelsToTry).toEqual(['mistral', 'anthropic']);
    });

    it('keeps web search out of the fallback chain', async () => {
      const { modelsToTry } = await service.prepare(request());

      expect(modelsToTry).toEqual(['anthropic', 'mistral']);
    });

    it('defaults to mistral for an unknown model', async () => {
      const { modelsToTry } = await service.prepare(
        request({ model: 'not-a-real-model' }),
      );

      expect(modelsToTry[0]).toBe('mistral');
    });
  });

  describe('context', () => {
    it('loads the assistant context', async () => {
      await service.prepare(request());

      expect(contextLoader.load).toHaveBeenCalledWith('docs', 'hi');
    });

    it('passes the RAG metadata through', async () => {
      contextLoader.load.mockResolvedValue({
        systemPrompt: 'RAG prompt',
        ragMetadata: {
          selectedFiles: ['a.md'],
          totalFilesAvailable: 1,
          selectionMethod: 'rag-two-step',
        },
      });

      const { ragMetadata } = await service.prepare(request());

      expect(ragMetadata).toEqual({
        selectedFiles: ['a.md'],
        totalFilesAvailable: 1,
        selectionMethod: 'rag-two-step',
      });
    });
  });

  describe('prompt', () => {
    it('fences the user turn when there is a system prompt', async () => {
      const prepared = await service.prepare(request());

      expect(prepared.systemPrompt).toBe('Context prompt');
      expect(prepared.userMessage).toContain('<user_message>\nhi\n');
      expect(prepared.fullInput).toBe(
        `Context prompt\n\n${prepared.userMessage}`,
      );
    });

    it('leaves the user turn alone without a system prompt', async () => {
      contextLoader.load.mockResolvedValue({ systemPrompt: '' });

      const prepared = await service.prepare(request());

      expect(prepared.systemPrompt).toBeUndefined();
      expect(prepared.userMessage).toBe('hi');
      expect(prepared.fullInput).toBe('hi');
    });
  });

  it('keeps the session it is given', async () => {
    const { sessionId } = await service.prepare(request());

    expect(sessionId).toBe('session-1');
  });
});
