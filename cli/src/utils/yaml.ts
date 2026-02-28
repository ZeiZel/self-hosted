import { parse, stringify } from 'yaml';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export function loadYaml<T>(filePath: string): T | null {
  try {
    if (!existsSync(filePath)) {
      return null;
    }
    const content = readFileSync(filePath, 'utf-8');
    return parse(content) as T;
  } catch {
    return null;
  }
}

export function saveYaml<T>(filePath: string, data: T): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const content = stringify(data, {
    indent: 2,
    lineWidth: 120,
    singleQuote: true,
  });

  writeFileSync(filePath, content, 'utf-8');
}

export function parseYaml<T>(content: string): T {
  return parse(content) as T;
}

export function stringifyYaml<T>(data: T): string {
  return stringify(data, {
    indent: 2,
    lineWidth: 120,
    singleQuote: true,
  });
}
