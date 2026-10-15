import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile, readdir, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { RagService } from '../rag/rag.service';
import {
  ContextQuery,
  contextDir,
  contextIndexPath,
} from '../rag/context-index';
import { writeFileAtomic } from '../storage/write-file-atomic';
import { RagMetadataDto } from './rag-metadata.dto';

export interface LoadedContext {
  systemPrompt: string;
  ragMetadata?: RagMetadataDto;
}

/**
 * Turns a context name into the system prompt a request runs with: two-step
 * RAG selection when the context has something to choose between, every
 * markdown file otherwise, and a record of what was used in the context's
 * index.json.
 */
@Injectable()
export class ContextLoaderService implements OnModuleInit {
  private readonly logger = new Logger(ContextLoaderService.name);
  // Maximum number of files the two-step RAG selection step may pick
  private readonly RAG_MAX_FILES = 5;
  private writeQueue: Map<string, Promise<void>> = new Map();
  private readonly logQueries: boolean;

  constructor(
    private readonly ragService: RagService,
    config: ConfigService,
  ) {
    this.logQueries = config.get<string>('ENT_LOG_QUERIES') === 'true';
  }

  async onModuleInit() {
    const contextsPath = join(process.cwd(), 'data', 'contexts');
    if (!existsSync(contextsPath)) {
      this.logger.log('Creating contexts directory');
      await mkdir(contextsPath, { recursive: true });
    }
  }

  async load(contextName: string, message: string): Promise<LoadedContext> {
    // Two-step selection only kicks in when there is more than one file to
    // choose between
    const indexPath = contextIndexPath(contextName);
    let totalFiles = 0;
    if (existsSync(indexPath)) {
      try {
        const indexData = await readFile(indexPath, 'utf-8');
        const contextIndex = JSON.parse(indexData);
        totalFiles = contextIndex.files?.length || 0;
      } catch (error) {
        this.logger.warn(
          `Failed to read index for context ${contextName}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    let loaded: LoadedContext;

    if (totalFiles > 1) {
      try {
        loaded = await this.loadWithRag(contextName, message, totalFiles);
      } catch (error) {
        this.logger.error(
          `Two-step RAG failed: ${error instanceof Error ? error.message : String(error)}, falling back to old method`,
        );
        loaded = {
          systemPrompt: await this.loadAllFiles(contextName, message),
        };
      }
    } else {
      this.logger.log(
        `Loading context information (legacy method): ${contextName}`,
      );
      loaded = { systemPrompt: await this.loadAllFiles(contextName, message) };
    }

    this.logger.debug(
      `Generated system prompt with context information (${loaded.systemPrompt.length} characters)`,
    );
    return loaded;
  }

  private async loadWithRag(
    contextName: string,
    message: string,
    totalFiles: number,
  ): Promise<LoadedContext> {
    const maxFiles = this.RAG_MAX_FILES;
    this.logger.log(`Using two-step RAG for context: ${contextName}`);

    this.logger.log(`Step 1: Selecting relevant files (max: ${maxFiles})`);
    const { selectedFiles, selectionCost } =
      await this.ragService.selectRelevantFiles(contextName, message, maxFiles);

    this.logger.log(`Step 2: Building context with selected files`);
    const systemPrompt = await this.ragService.buildContextWithSelectedFiles(
      contextName,
      selectedFiles,
    );

    try {
      await this.recordContextQuery(contextName, selectedFiles, message);
    } catch (error) {
      this.logger.warn(
        `Failed to record context query: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    this.logger.log(
      `Two-step RAG completed: ${selectedFiles.length}/${totalFiles} files selected (${systemPrompt.length} characters)`,
    );

    if (selectionCost) {
      this.logger.log(
        `Selection cost: $${selectionCost.total_cost.toFixed(6)} (input: $${selectionCost.input_cost.toFixed(6)}, output: $${selectionCost.output_cost.toFixed(6)})`,
      );
    }

    return {
      systemPrompt,
      ragMetadata: {
        selectedFiles,
        totalFilesAvailable: totalFiles,
        selectionMethod: 'rag-two-step',
        selectionCost,
      },
    };
  }

  /** Every markdown file in the context, as one system prompt. */
  private async loadAllFiles(
    contextName: string,
    userMessage: string = '',
  ): Promise<string> {
    try {
      const contextPath = contextDir(contextName);

      if (!existsSync(contextPath)) {
        this.logger.warn(`Context ${contextName} not found`);
        return '';
      }

      const files = await this.getMarkdownFiles(contextPath);
      const usedFiles: string[] = [];

      let contextContent = `# Context: ${contextName}\n\n`;

      if (files && files.length > 0) {
        this.logger.log(
          `Loading ${files.length} files for context '${contextName}':`,
        );
        contextContent += `## Context Files\n\n`;

        for (const file of files) {
          try {
            const fileContent = await readFile(
              join(contextPath, file),
              'utf-8',
            );

            contextContent += `### File: ${file}\n${fileContent}\n\n`;
            usedFiles.push(file);
            this.logger.debug(`- Added file: ${file}`);
          } catch (error) {
            this.logger.error(
              `Error reading file ${file}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }

      if (usedFiles.length > 0) {
        try {
          await this.recordContextQuery(contextName, usedFiles, userMessage);
        } catch (error) {
          this.logger.warn(
            `Failed to record context query: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      this.logger.log(
        `Generated system prompt from context: ${contextName} (${contextContent.length} characters, ${usedFiles.length} items)`,
      );
      return contextContent.trim();
    } catch (error) {
      this.logger.error(
        `Error generating system prompt from context: ${error instanceof Error ? error.message : String(error)}`,
      );
      return '';
    }
  }

  private async getMarkdownFiles(directoryPath: string): Promise<string[]> {
    try {
      const files = await readdir(directoryPath);
      return files.filter(
        (file) =>
          file.toLowerCase().endsWith('.md') &&
          file !== 'README.md' &&
          file !== 'index.json',
      );
    } catch (error) {
      this.logger.error(
        `Error reading directory: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /** The message is kept only with `ENT_LOG_QUERIES=true`. */
  private async recordContextQuery(
    contextName: string,
    filesUsed: string[],
    message: string,
  ): Promise<void> {
    const indexPath = contextIndexPath(contextName);

    if (!existsSync(indexPath)) {
      throw new Error(`Context index file not found for ${contextName}`);
    }

    const query: ContextQuery = {
      timestamp: new Date().toISOString(),
      origin: 'anon',
      ...(this.logQueries && { message }),
      contextFilesUsed: filesUsed,
    };

    const writeOperation = async () => {
      let retries = 3;
      let lastError: Error | null = null;

      while (retries > 0) {
        try {
          const indexData = await readFile(indexPath, 'utf-8');

          if (!indexData || indexData.trim() === '') {
            this.logger.warn(
              `Empty index file for ${contextName}, skipping query record`,
            );
            return;
          }

          const index = JSON.parse(indexData);

          if (!index.queries) {
            index.queries = [];
          }

          index.queries.push(query);

          await writeFileAtomic(indexPath, JSON.stringify(index, null, 2));
          return;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          retries--;
          if (retries > 0) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }
      }

      // Only log instead of throwing, so a failed record never breaks the
      // request
      this.logger.warn(
        `Failed to record context query after retries: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      );
    };

    // Queue writes to the same index so concurrent requests cannot clobber
    // each other's records
    const existingWrite = this.writeQueue.get(indexPath);
    const newWrite = existingWrite
      ? existingWrite.then(writeOperation).catch(() => writeOperation())
      : writeOperation();

    this.writeQueue.set(indexPath, newWrite);

    newWrite.finally(() => {
      if (this.writeQueue.get(indexPath) === newWrite) {
        this.writeQueue.delete(indexPath);
      }
    });

    await newWrite;
  }
}
