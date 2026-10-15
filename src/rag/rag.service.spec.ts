import { Logger } from '@nestjs/common';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Mock } from 'vitest';
import { MistralService } from '../mistral/mistral.service';
import { RagService } from './rag.service';

describe('RagService', () => {
  let root: string;
  let service: RagService;
  let processMessageWithModel: Mock;

  function writeContext(name: string, files: Record<string, string>) {
    const dir = join(root, 'data', 'contexts', name);
    mkdirSync(dir, { recursive: true });
    for (const [file, content] of Object.entries(files)) {
      writeFileSync(join(dir, file), content);
    }
    writeFileSync(
      join(dir, 'index.json'),
      JSON.stringify({
        name,
        description: '',
        files: Object.keys(files).map((file) => ({
          name: file,
          description: `About ${file}`,
          size: 1,
        })),
        links: [{ title: 'Site', url: 'https://example.org', timestamp: '' }],
        queries: [],
      }),
    );
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'rag-'));
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    for (const level of ['log', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
    }
    processMessageWithModel = vi.fn().mockResolvedValue({
      content: '[3]',
      cost: { input_cost: 0.001, output_cost: 0.001, total_cost: 0.002 },
    });
    service = new RagService({
      processMessageWithModel,
    } as unknown as MistralService);
    writeContext('cours', {
      'instruction-file.md': 'Be kind.',
      'chapitre-1.md': 'Atoms.',
      'chapitre-2.md': 'Molecules.',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  describe('selectRelevantFiles', () => {
    it('returns nothing when the context has no index', async () => {
      await expect(
        service.selectRelevantFiles('missing', 'question'),
      ).resolves.toEqual({ selectedFiles: [], selectionCost: null });
      expect(processMessageWithModel).not.toHaveBeenCalled();
    });

    it('adds instruction-file.md to the files the model picks', async () => {
      const result = await service.selectRelevantFiles('cours', 'molecules?');

      expect(result.selectedFiles).toEqual([
        'instruction-file.md',
        'chapitre-2.md',
      ]);
      expect(result.selectionCost?.total_cost).toBe(0.002);
    });

    it('offers files only, not links', async () => {
      await service.selectRelevantFiles('cours', 'question');

      const prompt = processMessageWithModel.mock.calls[0][0] as string;
      expect(prompt).toContain('3. [FILE] chapitre-2.md');
      expect(prompt).not.toContain('example.org');
    });

    it('keeps every file when the answer is not a JSON array', async () => {
      processMessageWithModel.mockResolvedValue({ content: 'no idea' });

      const result = await service.selectRelevantFiles('cours', 'question');

      expect(result.selectedFiles).toHaveLength(3);
    });

    it('keeps every file when the selection call fails', async () => {
      processMessageWithModel.mockRejectedValue(new Error('429'));

      await expect(
        service.selectRelevantFiles('cours', 'question'),
      ).resolves.toEqual({
        selectedFiles: [
          'instruction-file.md',
          'chapitre-1.md',
          'chapitre-2.md',
        ],
        selectionCost: null,
      });
    });
  });

  describe('buildContextWithSelectedFiles', () => {
    it('returns an empty string when nothing is selected', async () => {
      await expect(
        service.buildContextWithSelectedFiles('cours', []),
      ).resolves.toBe('');
    });

    it('puts instruction-file.md first and skips missing files', async () => {
      const prompt = await service.buildContextWithSelectedFiles('cours', [
        'chapitre-2.md',
        'gone.md',
        'instruction-file.md',
      ]);

      expect(prompt.indexOf('Be kind.')).toBeLessThan(
        prompt.indexOf('Molecules.'),
      );
      expect(prompt).not.toContain('gone.md');
    });
  });
});
