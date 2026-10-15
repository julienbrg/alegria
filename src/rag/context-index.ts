import { join } from 'path';

export interface ContextFile {
  name: string;
  description: string;
  size: number;
}

export interface ContextLink {
  title: string;
  url: string;
  description?: string;
  timestamp: string;
}

export interface ContextQuery {
  timestamp: string;
  origin: string;
  /** Only with `ENT_LOG_QUERIES=true`. */
  message?: string;
  contextFilesUsed: string[];
}

/**
 * Upstream `index.json`, without the ENT fields: ownership, school, classes
 * and model live in the `assistants` table.
 */
export interface ContextIndex {
  name: string;
  description: string;
  numberOfFiles: number;
  totalSize: number;
  files: ContextFile[];
  links: ContextLink[];
  queries: ContextQuery[];
}

/** `data/contexts/<name>`, where the Markdown documents live. */
export function contextDir(name: string): string {
  return join(process.cwd(), 'data', 'contexts', name);
}

export function contextIndexPath(name: string): string {
  return join(contextDir(name), 'index.json');
}
