import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { Mock } from 'vitest';
import { MistralService } from '../mistral/mistral.service';
import { AnthropicService } from '../anthropic/anthropic.service';
import { OpenAIService } from '../openai/openai.service';
import { DeepSeekService } from '../deepseek/deepseek.service';
import { CostTracker } from '../memory/cost-tracking.service';
import { RagService } from '../rag/rag.service';
import { LLM_PROVIDERS } from '../providers/llm-provider';
import { ProviderRegistry } from '../providers/provider-registry.service';
import { asLlmProvider } from '../providers/testing';
import { AskPreparationService } from './ask-preparation.service';
import { AskResultService } from './ask-result.service';
import { AskService } from './ask.service';
import { AskStreamService } from './ask-stream.service';
import { ContextLoaderService } from './context-loader.service';

const providerMock = (extra: Record<string, Mock> = {}) => ({
  processMessage: vi.fn(),
  streamMessage: vi.fn(),
  getConversationHistory: vi.fn().mockResolvedValue({
    history: [],
    isFirstMessage: true,
  }),
  ...extra,
});

export type ProviderMock = ReturnType<typeof providerMock>;

export type AnthropicMock = ProviderMock & {
  processMessageWithWebSearch: Mock;
  streamMessageWithWebSearch: Mock;
};

/**
 * The ask pipeline wired for real, with the model providers, RAG and cost
 * tracking mocked out.
 */
export async function createAskTestingModule(logQueries = 'false') {
  const module = await Test.createTestingModule({
    providers: [
      AskService,
      AskStreamService,
      AskPreparationService,
      AskResultService,
      ContextLoaderService,
      { provide: ConfigService, useValue: { get: () => logQueries } },
      ProviderRegistry,
      { provide: MistralService, useValue: providerMock() },
      {
        provide: AnthropicService,
        useValue: providerMock({
          processMessageWithWebSearch: vi.fn(),
          streamMessageWithWebSearch: vi.fn(),
        }),
      },
      { provide: OpenAIService, useValue: providerMock() },
      { provide: DeepSeekService, useValue: providerMock() },
      {
        provide: LLM_PROVIDERS,
        useFactory: (mistral, anthropic, openai, deepseek) => [
          asLlmProvider('mistral', mistral, {
            label: 'mistral-small-latest',
          }),
          asLlmProvider('anthropic', anthropic, {
            label: 'claude-sonnet-5',
          }),
          asLlmProvider('openai', openai, { label: 'gpt-4o' }),
          asLlmProvider('deepseek', deepseek, {
            label: 'deepseek-v4-flash',
          }),
          {
            ...asLlmProvider(
              'anthropic-web-search',
              {},
              {
                label: 'claude-sonnet-5',
                fallbackEligible: false,
              },
            ),
            ask: (...args) => anthropic.processMessageWithWebSearch(...args),
            stream: (...args) => anthropic.streamMessageWithWebSearch(...args),
          },
        ],
        inject: [
          MistralService,
          AnthropicService,
          OpenAIService,
          DeepSeekService,
        ],
      },
      {
        provide: CostTracker,
        useValue: {
          trackUsageWithTokens: vi.fn().mockResolvedValue(undefined),
        },
      },
      {
        provide: RagService,
        useValue: {
          selectRelevantFiles: vi.fn().mockResolvedValue({
            selectedFiles: ['file1.md', 'file2.md'],
            selectionCost: {
              input_cost: 0.0001,
              output_cost: 0.00005,
              total_cost: 0.00015,
            },
          }),
          buildContextWithSelectedFiles: vi
            .fn()
            .mockResolvedValue('Mock RAG context'),
        },
      },
    ],
  }).compile();

  const contextLoader = module.get(ContextLoaderService);
  vi.spyOn(contextLoader, 'load').mockResolvedValue({
    systemPrompt: 'Mock context information',
  });

  return {
    askService: module.get(AskService),
    askStreamService: module.get(AskStreamService),
    contextLoader,
    mistralService: module.get(MistralService) as unknown as ProviderMock,
    anthropicService: module.get(AnthropicService) as unknown as AnthropicMock,
    openaiService: module.get(OpenAIService) as unknown as ProviderMock,
    deepseekService: module.get(DeepSeekService) as unknown as ProviderMock,
    costTracker: module.get(CostTracker) as unknown as {
      trackUsageWithTokens: Mock;
    },
  };
}
