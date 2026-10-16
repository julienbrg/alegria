import Database from 'better-sqlite3';
import { Logger } from '@nestjs/common';
import { openDatabase } from '../db/db.module';
import { CostTracker } from './cost-tracking.service';

describe('CostTracker', () => {
  let db: Database.Database;
  let service: CostTracker;

  const rows = () =>
    db.prepare('SELECT * FROM usage ORDER BY id').all() as Record<
      string,
      unknown
    >[];

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    db = openDatabase(':memory:');
    db.exec(`
      INSERT INTO assistants (name, owner_id, uai, model) VALUES ('a', 'u1', '0590123A', 'mistral');
      INSERT INTO conversations (user_id, assistant, session_id) VALUES ('u1', 'a', 's1');
    `);
    service = new CostTracker(db);
  });

  afterEach(() => {
    db.close();
    vi.restoreAllMocks();
  });

  it('estimates tokens at four characters each', () => {
    expect(service.estimateTokens('This is a test message')).toBe(6);
  });

  describe('trackUsageWithTokens', () => {
    it('records tokens and cost at the model rate', async () => {
      await service.trackUsageWithTokens(
        'anonymous',
        'test message',
        's1',
        'gpt-4o',
        'input',
        'output',
        1000,
        500,
      );

      expect(rows()).toEqual([
        expect.objectContaining({
          session_id: 's1',
          model: 'gpt-4o',
          input_tokens: 1000,
          output_tokens: 500,
          input_cost: 0.0025,
          output_cost: 0.005,
          total_cost: 0.0075,
          message: 'test message',
        }),
      ]);
    });

    it('estimates tokens when none are given', async () => {
      await service.trackUsageWithTokens(
        'anonymous',
        '',
        's1',
        'gpt-4o',
        'abcdefgh',
        'abcd',
      );

      expect(rows()[0]).toMatchObject({ input_tokens: 2, output_tokens: 1 });
    });

    it('stores an empty message as NULL', async () => {
      await service.trackUsageWithTokens(
        'anonymous',
        '',
        's1',
        'gpt-4o',
        'i',
        'o',
        1,
        1,
      );

      expect(rows()[0].message).toBeNull();
    });

    it('uses the default rates for an unknown model', async () => {
      await service.trackUsageWithTokens(
        'anonymous',
        '',
        's1',
        'unknown-model',
        'i',
        'o',
        1000,
        1000,
      );

      expect(rows()[0].total_cost).toBe(0.09);
    });

    it('logs instead of throwing when the insert fails', async () => {
      await expect(
        service.trackUsageWithTokens(
          'anonymous',
          '',
          'missing',
          'gpt-4o',
          'i',
          'o',
          1,
          1,
        ),
      ).resolves.toBeUndefined();
      expect(rows()).toEqual([]);
      expect(Logger.prototype.error).toHaveBeenCalled();
    });
  });

  it('trackUsage estimates tokens from the texts', async () => {
    await service.trackUsage('anonymous', '', 's1', 'gpt-4o', 'abcd', 'abcd');

    expect(rows()[0]).toMatchObject({ input_tokens: 1, output_tokens: 1 });
  });

  describe('generateUsageReport', () => {
    it('is empty with no usage', async () => {
      const report = await service.generateUsageReport();

      expect(report.requests).toEqual([]);
      expect(report.global).toMatchObject({
        totalCost: 0,
        totalRequests: 0,
        modelsUsage: {},
      });
    });

    it('sums usage overall and per model', async () => {
      for (const model of ['gpt-4o', 'gpt-4o', 'claude-sonnet-5']) {
        await service.trackUsageWithTokens(
          'anonymous',
          'q',
          's1',
          model,
          'i',
          'o',
          1000,
          1000,
        );
      }

      const report = await service.generateUsageReport();

      expect(report.requests).toHaveLength(3);
      expect(report.requests[0]).toMatchObject({
        sessionId: 's1',
        model: 'gpt-4o',
        message: 'q',
        totalCost: 0.0125,
      });
      expect(report.global).toMatchObject({
        totalInputTokens: 3000,
        totalOutputTokens: 3000,
        totalRequests: 3,
      });
      expect(report.global.totalCost).toBeCloseTo(0.037);
      expect(report.global.modelsUsage['gpt-4o']).toMatchObject({
        requests: 2,
        inputTokens: 2000,
        outputTokens: 2000,
      });
      expect(report.global.modelsUsage['gpt-4o'].cost).toBeCloseTo(0.025);
    });
  });
});
