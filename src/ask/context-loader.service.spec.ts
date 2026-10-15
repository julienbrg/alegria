import { Logger } from '@nestjs/common';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Mock } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { ContextLoaderService } from './context-loader.service';
import { RagService } from '../rag/rag.service';

describe('ContextLoaderService', () => {
  let cwd: string;
  let rag: {
    selectRelevantFiles: Mock;
    buildContextWithSelectedFiles: Mock;
  };
  let service: ContextLoaderService;

  const writeContext = (
    name: string,
    index: Record<string, unknown> | string,
    files: Record<string, string> = {},
  ) => {
    const dir = join(cwd, 'data', 'contexts', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'index.json'),
      typeof index === 'string' ? index : JSON.stringify(index),
    );
    for (const [file, content] of Object.entries(files)) {
      writeFileSync(join(dir, file), content);
    }
    return dir;
  };

  const queries = (name: string) =>
    JSON.parse(
      readFileSync(join(cwd, 'data', 'contexts', name, 'index.json'), 'utf-8'),
    ).queries;

  const loader = (logQueries: string) =>
    new ContextLoaderService(
      rag as unknown as RagService,
      {
        get: () => logQueries,
      } as unknown as ConfigService,
    );

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'context-loader-'));
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    for (const level of ['log', 'error', 'warn'] as const) {
      vi.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
    }

    rag = {
      selectRelevantFiles: vi.fn().mockResolvedValue({
        selectedFiles: ['a.md'],
        selectionCost: { input_cost: 0.1, output_cost: 0.2, total_cost: 0.3 },
      }),
      buildContextWithSelectedFiles: vi.fn().mockResolvedValue('RAG prompt'),
    };
    service = loader('false');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(cwd, { recursive: true, force: true });
  });

  it('creates the contexts directory on init', async () => {
    await service.onModuleInit();

    expect(existsSync(join(cwd, 'data', 'contexts'))).toBe(true);
  });

  describe('load', () => {
    it('returns an empty prompt for a context without documents', async () => {
      await expect(service.load('missing', 'hi')).resolves.toEqual({
        systemPrompt: '',
      });
    });

    it('loads every markdown file and records the query', async () => {
      writeContext(
        'docs',
        { files: [{ name: 'a.md' }] },
        { 'a.md': 'Alpha', 'b.md': 'Beta', 'README.md': 'skip me' },
      );

      const { systemPrompt, ragMetadata } = await service.load('docs', 'hi');

      expect(systemPrompt).toContain('# Context: docs');
      expect(systemPrompt).toContain('### File: a.md\nAlpha');
      expect(systemPrompt).toContain('### File: b.md\nBeta');
      expect(systemPrompt).not.toContain('skip me');
      expect(ragMetadata).toBeUndefined();
      expect(rag.selectRelevantFiles).not.toHaveBeenCalled();
      expect(queries('docs')).toEqual([
        {
          timestamp: expect.any(String),
          origin: 'anon',
          contextFilesUsed: ['a.md', 'b.md'],
        },
      ]);
    });

    it('keeps the message in the query log with ENT_LOG_QUERIES=true', async () => {
      writeContext('docs', { files: [] }, { 'a.md': 'Alpha' });

      await loader('true').load('docs', 'hi');

      expect(queries('docs')[0].message).toBe('hi');
    });

    it('uses two-step RAG when there are several files', async () => {
      writeContext('docs', {
        files: [{ name: 'a.md' }, { name: 'b.md' }],
        links: [{ url: 'https://example.com' }],
      });

      const { systemPrompt, ragMetadata } = await service.load('docs', 'hi');

      expect(rag.selectRelevantFiles).toHaveBeenCalledWith('docs', 'hi', 5);
      expect(systemPrompt).toBe('RAG prompt');
      expect(ragMetadata).toEqual({
        selectedFiles: ['a.md'],
        totalFilesAvailable: 2,
        selectionMethod: 'rag-two-step',
        selectionCost: { input_cost: 0.1, output_cost: 0.2, total_cost: 0.3 },
      });
      expect(queries('docs')).toEqual([
        {
          timestamp: expect.any(String),
          origin: 'anon',
          contextFilesUsed: ['a.md'],
        },
      ]);
    });

    it('does not count links as resources to select from', async () => {
      writeContext(
        'docs',
        {
          files: [{ name: 'a.md' }],
          links: [{ url: 'https://example.com' }],
        },
        { 'a.md': 'Alpha' },
      );

      await service.load('docs', 'hi');

      expect(rag.selectRelevantFiles).not.toHaveBeenCalled();
    });

    it('falls back to every file when RAG fails', async () => {
      rag.selectRelevantFiles.mockRejectedValue(new Error('boom'));
      writeContext(
        'docs',
        { files: [{ name: 'a.md' }, { name: 'b.md' }] },
        { 'a.md': 'Alpha' },
      );

      const { systemPrompt, ragMetadata } = await service.load('docs', 'hi');

      expect(systemPrompt).toContain('### File: a.md\nAlpha');
      expect(ragMetadata).toBeUndefined();
    });

    it('still loads files from a context with a damaged index', async () => {
      writeContext('broken', '{"files":[]}\n  ]\n}', { 'a.md': 'Alpha' });

      const { systemPrompt } = await service.load('broken', 'hi');

      expect(systemPrompt).toContain('### File: a.md\nAlpha');
    });

    it('keeps every record when queries land concurrently', async () => {
      writeContext('docs', { files: [] }, { 'a.md': 'Alpha' });
      const logging = loader('true');

      await Promise.all(
        ['one', 'two', 'three'].map((m) => logging.load('docs', m)),
      );

      // The queue guarantees no record is lost, not the order they land in
      expect(
        queries('docs')
          .map((q: { message: string }) => q.message)
          .sort(),
      ).toEqual(['one', 'three', 'two']);
    });
  });
});
