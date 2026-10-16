import { Inject, Injectable, Logger } from '@nestjs/common';
import Database from 'better-sqlite3';
import { DATABASE } from '../db/db.module';

export interface CostDatabase {
  requests: {
    timestamp: string;
    inputCost: number;
    outputCost: number;
    totalCost: number;
    inputTokens: number;
    outputTokens: number;
    message: string;
    sessionId: string;
    model: string;
  }[];
  global: {
    totalInputCost: number;
    totalOutputCost: number;
    totalCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalRequests: number;
    modelsUsage: {
      [modelName: string]: {
        requests: number;
        inputTokens: number;
        outputTokens: number;
        cost: number;
      };
    };
    lastUpdated: string;
  };
}

/** Per-request model usage and cost, in the `usage` table. */
@Injectable()
export class CostTracker {
  private readonly logger = new Logger(CostTracker.name);

  // Cost per 1K tokens in USD, per model. Rates verified 2026-09-11 against
  // https://mistral.ai/pricing/api, https://developers.openai.com/api/docs/pricing
  // and https://platform.claude.com/docs/en/about-claude/pricing
  private readonly COST_RATES = {
    // Mistral rates - https://mistral.ai/pricing/api (verified 2026-09-11)
    'mistral-small-latest': {
      inputCost: 0.00015, // $0.15 per million tokens = $0.00015 per 1K tokens
      outputCost: 0.0006, // $0.60 per million tokens = $0.0006 per 1K tokens
    },
    'mistral-medium-latest': {
      inputCost: 0.0015, // $1.50 per million tokens = $0.0015 per 1K tokens
      outputCost: 0.0075, // $7.50 per million tokens = $0.0075 per 1K tokens
    },
    'mistral-large-latest': {
      inputCost: 0.0005, // $0.50 per million tokens = $0.0005 per 1K tokens
      outputCost: 0.0015, // $1.50 per million tokens = $0.0015 per 1K tokens
    },
    'ministral-3b-latest': {
      inputCost: 0.0001, // $0.10 per million tokens = $0.0001 per 1K tokens
      outputCost: 0.0001, // $0.10 per million tokens = $0.0001 per 1K tokens
    },
    // Ministral snapshot ID no longer listed by Mistral - kept at the rate it
    // was billed at, for historical cost records
    'ministral-3b-2410': {
      inputCost: 0.00004, // $0.04 per million tokens = $0.00004 per 1K tokens
      outputCost: 0.00004, // $0.04 per million tokens = $0.00004 per 1K tokens
    },
    // OpenAI rates - https://developers.openai.com/api/docs/pricing
    // (verified 2026-09-11). gpt-4o is the model OpenAIService calls.
    'gpt-4o': {
      inputCost: 0.0025, // $2.50 per million tokens = $0.0025 per 1K tokens
      outputCost: 0.01, // $10 per million tokens = $0.01 per 1K tokens
    },
    // Claude Sonnet 5 rates (current default Anthropic model). The $2/$10
    // launch pricing is now the standard price - the increase to $3/$15 that
    // had been scheduled for 2026-09-01 was cancelled.
    'claude-sonnet-5': {
      inputCost: 0.002, // $2 per million tokens = $0.002 per 1K tokens
      outputCost: 0.01, // $10 per million tokens = $0.01 per 1K tokens
    },
    // Retired Claude models - kept for historical cost records, at the rates
    // they were billed at. Requests to these now fail.
    'claude-3-7-sonnet-20250219': {
      // retired 2026-02-19
      inputCost: 0.003, // $3 per million tokens = $0.003 per 1K tokens
      outputCost: 0.015, // $15 per million tokens = $0.015 per 1K tokens
    },
    'claude-3-opus-20240229': {
      // retired 2026-01-05
      inputCost: 0.015, // $15 per million tokens = $0.015 per 1K tokens
      outputCost: 0.075, // $75 per million tokens = $0.075 per 1K tokens
    },
    'claude-3-sonnet-20240229': {
      // retired 2025-07-21
      inputCost: 0.003, // $3 per million tokens = $0.003 per 1K tokens
      outputCost: 0.015, // $15 per million tokens = $0.015 per 1K tokens
    },
    'claude-3-haiku-20240307': {
      // retired 2026-04-20
      inputCost: 0.0005, // $0.5 per million tokens = $0.0005 per 1K tokens
      outputCost: 0.0025, // $2.5 per million tokens = $0.0025 per 1K tokens
    },
    // DeepSeek rates - https://api-docs.deepseek.com/quick_start/pricing
    // (verified 2026-09-11), standard (peak) rate. `deepseek-v4-flash` is a
    // legacy alias, still accepted, routed to and billed at the current
    // `deepseek-flash` price. `DeepSeekService.pricing` also breaks this
    // out by cache hit/miss; this table only needs the blended input rate.
    'deepseek-v4-flash': {
      inputCost: 0.0003, // $0.30 per million tokens = $0.0003 per 1K tokens
      outputCost: 0.0012, // $1.20 per million tokens = $0.0012 per 1K tokens
    },
  };

  constructor(@Inject(DATABASE) private readonly db: Database.Database) {}

  estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  /** An empty `message` is stored as NULL. */
  async trackUsageWithTokens(
    _walletAddress: string,
    message: string,
    sessionId: string,
    modelName: string,
    inputText: string,
    outputText: string,
    inputTokens: number = 0,
    outputTokens: number = 0,
  ): Promise<void> {
    try {
      if (!inputTokens || inputTokens <= 0) {
        inputTokens = this.estimateTokens(inputText);
      }
      if (!outputTokens || outputTokens <= 0) {
        outputTokens = this.estimateTokens(outputText);
      }

      const modelRates = this.COST_RATES[modelName] || {
        inputCost: 0.015,
        outputCost: 0.075,
      };
      const inputCost = Number(
        ((inputTokens / 1000) * modelRates.inputCost).toFixed(6),
      );
      const outputCost = Number(
        ((outputTokens / 1000) * modelRates.outputCost).toFixed(6),
      );
      const totalCost = Number((inputCost + outputCost).toFixed(6));

      this.db
        .prepare(
          `INSERT INTO usage (session_id, model, input_tokens, output_tokens,
                              input_cost, output_cost, total_cost, message)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          sessionId,
          modelName,
          inputTokens,
          outputTokens,
          inputCost,
          outputCost,
          totalCost,
          message || null,
        );

      this.logger.debug(
        `Tracked usage with ${modelName}: $${totalCost.toFixed(6)} (${inputTokens} input tokens, ${outputTokens} output tokens)`,
      );
    } catch (error) {
      this.logger.error('Error tracking usage:', error);
    }
  }

  // Keep the old method for backward compatibility
  async trackUsage(
    _origin: string,
    message: string,
    sessionId: string,
    modelName: string,
    inputText: string,
    outputText: string,
  ): Promise<void> {
    // Estimate tokens (legacy method)
    const inputTokens = this.estimateTokens(inputText);
    const outputTokens = this.estimateTokens(outputText);

    // Call the newer method with estimated tokens
    await this.trackUsageWithTokens(
      _origin,
      message,
      sessionId,
      modelName,
      inputText,
      outputText,
      inputTokens,
      outputTokens,
    );
  }

  /** Every request, oldest first, with totals overall and per model. */
  async generateUsageReport(): Promise<CostDatabase> {
    const requests = this.db
      .prepare(
        `SELECT timestamp, input_cost AS inputCost, output_cost AS outputCost,
                total_cost AS totalCost, input_tokens AS inputTokens,
                output_tokens AS outputTokens, coalesce(message, '') AS message,
                coalesce(session_id, '') AS sessionId, model
         FROM usage ORDER BY id`,
      )
      .all() as CostDatabase['requests'];

    const totals = this.db
      .prepare(
        `SELECT coalesce(sum(input_cost), 0) AS totalInputCost,
                coalesce(sum(output_cost), 0) AS totalOutputCost,
                coalesce(sum(total_cost), 0) AS totalCost,
                coalesce(sum(input_tokens), 0) AS totalInputTokens,
                coalesce(sum(output_tokens), 0) AS totalOutputTokens,
                count(*) AS totalRequests,
                coalesce(max(timestamp), strftime('%Y-%m-%dT%H:%M:%fZ')) AS lastUpdated
         FROM usage`,
      )
      .get() as Omit<CostDatabase['global'], 'modelsUsage'>;

    const modelsUsage: CostDatabase['global']['modelsUsage'] = {};
    for (const row of this.db
      .prepare(
        `SELECT model, count(*) AS requests, sum(input_tokens) AS inputTokens,
                sum(output_tokens) AS outputTokens, sum(total_cost) AS cost
         FROM usage GROUP BY model`,
      )
      .all() as ({
      model: string;
    } & CostDatabase['global']['modelsUsage'][string])[]) {
      const { model, ...stats } = row;
      modelsUsage[model] = stats;
    }

    return { requests, global: { ...totals, modelsUsage } };
  }
}
