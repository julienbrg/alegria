import { Injectable, Logger } from '@nestjs/common';
import { MistralService } from '../mistral/mistral.service';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { StreamCost } from '../types/llm-stream';
import { ContextIndex, contextDir, contextIndexPath } from './context-index';

interface FileMetadata {
  name: string;
  description: string;
  index: number;
}

/**
 * Two-step selection over a context's Markdown files. Upstream also offers
 * the context's links, fetched through the web reader; the fork leaves
 * links out until that reader is ported.
 */
@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  // Files always included in the context, regardless of selection
  private readonly REQUIRED_FILES = ['instruction-file.md'];

  constructor(private readonly mistralService: MistralService) {}

  /**
   * Step 1: Select relevant files based on user's question
   * Uses ministral-3b for cost-effective, low-latency selection
   * Returns the selected files and the selection cost
   */
  async selectRelevantFiles(
    contextName: string,
    userMessage: string,
    maxFiles: number = 5,
  ): Promise<{
    selectedFiles: string[];
    selectionCost: StreamCost | null;
  }> {
    try {
      this.logger.log(
        `Starting file selection for context: ${contextName}, max files: ${maxFiles}`,
      );

      const indexPath = contextIndexPath(contextName);

      if (!existsSync(indexPath)) {
        this.logger.warn(`Context index not found for: ${contextName}`);
        return { selectedFiles: [], selectionCost: null };
      }

      const indexData = await readFile(indexPath, 'utf-8');
      const contextIndex: ContextIndex = JSON.parse(indexData);

      if (!contextIndex.files || contextIndex.files.length === 0) {
        this.logger.warn(`No files found in context: ${contextName}`);
        return { selectedFiles: [], selectionCost: null };
      }

      const fileMetadata: FileMetadata[] = contextIndex.files.map(
        (file, index) => ({
          name: file.name,
          description: file.description || 'No description',
          index: index + 1,
        }),
      );

      this.logger.debug(
        `Found ${fileMetadata.length} files in context: ${contextName}`,
      );

      const selectionPrompt = this.buildSelectionPrompt(
        userMessage,
        fileMetadata,
        maxFiles,
      );

      this.logger.debug('Calling ministral-3b for file selection');
      const response = await this.mistralService.processMessageWithModel(
        selectionPrompt,
        'ministral-3b-latest', // Use Ministral 3B: cheapest and fastest, well-suited to simple resource selection
        undefined, // No session needed for this one-off request
        undefined, // No system prompt needed
      );

      let selectedFiles = this.parseSelectionResponse(
        response.content,
        fileMetadata,
      );

      // Always include required files if they exist in the context
      for (const requiredFile of this.REQUIRED_FILES) {
        const fileExists = contextIndex.files.find(
          (f) => f.name === requiredFile,
        );

        if (fileExists && !selectedFiles.includes(requiredFile)) {
          selectedFiles = [requiredFile, ...selectedFiles];
          this.logger.log(`Added ${requiredFile} as a required file`);
        }
      }

      this.logger.log(`Selected ${selectedFiles.length} files`);
      this.logger.debug(`Files: ${selectedFiles.join(', ')}`);

      return {
        selectedFiles,
        selectionCost: response.cost ?? null,
      };
    } catch (error) {
      this.logger.error(
        `Error in file selection for context ${contextName}: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Fallback: return all files if selection fails
      try {
        const indexData = await readFile(
          contextIndexPath(contextName),
          'utf-8',
        );
        const contextIndex: ContextIndex = JSON.parse(indexData);
        return {
          selectedFiles: contextIndex.files.map((f) => f.name),
          selectionCost: null,
        };
      } catch (fallbackError) {
        this.logger.error(
          `Fallback also failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}, returning empty array`,
        );
        return { selectedFiles: [], selectionCost: null };
      }
    }
  }

  private buildSelectionPrompt(
    userMessage: string,
    fileMetadata: FileMetadata[],
    maxFiles: number,
  ): string {
    const fileList = fileMetadata
      .map(
        (file) => `${file.index}. [FILE] ${file.name} - "${file.description}"`,
      )
      .join('\n');

    return `You are a resource selection assistant. Given a user's question and a list of available files, select the most relevant files to answer the question.

User's question: "${userMessage}"

Available files:
${fileList}

Instructions:
- Select up to ${maxFiles} most relevant files
- Return ONLY a JSON array of file numbers (integers)
- If no files are relevant, return an empty array []
- Do not include any explanation, only the JSON array

Example response format: [1, 3, 5]

Your response:`;
  }

  /** File names for the indices the model returned; every file if unparsable. */
  private parseSelectionResponse(
    response: string,
    fileMetadata: FileMetadata[],
  ): string[] {
    try {
      this.logger.debug(`Parsing selection response: ${response}`);

      const jsonMatch = response.match(/\[[\d,\s]*\]/);
      if (!jsonMatch) {
        this.logger.warn('No valid JSON array found in response');
        return fileMetadata.map((f) => f.name);
      }

      const selectedIndices: number[] = JSON.parse(jsonMatch[0]);
      this.logger.debug(`Parsed indices: ${selectedIndices.join(', ')}`);

      return selectedIndices
        .map((index) => fileMetadata.find((f) => f.index === index)?.name)
        .filter((name): name is string => name !== undefined);
    } catch (error) {
      this.logger.error(
        `Error parsing selection response: ${error instanceof Error ? error.message : String(error)}`,
      );
      return fileMetadata.map((f) => f.name);
    }
  }

  /**
   * Step 2: Build context content with only the selected files
   */
  async buildContextWithSelectedFiles(
    contextName: string,
    selectedFiles: string[],
  ): Promise<string> {
    try {
      if (selectedFiles.length === 0) {
        this.logger.warn('No files selected, returning empty context');
        return '';
      }

      this.logger.log(
        `Building context with ${selectedFiles.length} selected files`,
      );

      const contextPath = contextDir(contextName);

      let contextContent = `# Context: ${contextName}\n\n`;
      contextContent += `## Selected Context Files\n\n`;

      // Sort files: required files first (in order), then other files
      const sortedFiles = [...selectedFiles].sort((a, b) => {
        const aIsRequired = this.REQUIRED_FILES.includes(a);
        const bIsRequired = this.REQUIRED_FILES.includes(b);

        if (aIsRequired && !bIsRequired) return -1;
        if (!aIsRequired && bIsRequired) return 1;
        if (aIsRequired && bIsRequired) {
          return (
            this.REQUIRED_FILES.indexOf(a) - this.REQUIRED_FILES.indexOf(b)
          );
        }
        return 0;
      });

      for (const fileName of sortedFiles) {
        try {
          const filePath = join(contextPath, fileName);

          if (!existsSync(filePath)) {
            this.logger.warn(`File not found: ${fileName}`);
            continue;
          }

          const fileContent = await readFile(filePath, 'utf-8');
          contextContent += `### File: ${fileName}\n${fileContent}\n\n`;
          this.logger.debug(`Added file to context: ${fileName}`);
        } catch (error) {
          this.logger.error(
            `Error reading file ${fileName}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      this.logger.log(
        `Context built successfully with ${selectedFiles.length} files (${contextContent.length} characters)`,
      );

      return contextContent.trim();
    } catch (error) {
      this.logger.error(
        `Error building context: ${error instanceof Error ? error.message : String(error)}`,
      );
      return '';
    }
  }
}
