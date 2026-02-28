import { join, dirname } from 'path';
import { existsSync } from 'fs';

/**
 * Find the repository root by looking for characteristic files
 */
export function findRepoRoot(): string | null {
  let currentDir = process.cwd();

  while (currentDir !== '/') {
    // Check for repository markers
    if (
      existsSync(join(currentDir, 'kubernetes')) &&
      existsSync(join(currentDir, 'ansible')) &&
      existsSync(join(currentDir, 'CLAUDE.md'))
    ) {
      return currentDir;
    }

    // Check if we're in the cli directory
    if (
      existsSync(join(currentDir, 'cli')) &&
      existsSync(join(currentDir, 'kubernetes'))
    ) {
      return currentDir;
    }

    currentDir = dirname(currentDir);
  }

  return null;
}

/**
 * Get paths relative to repository root
 */
export function getRepoPaths(repoRoot: string) {
  return {
    root: repoRoot,
    cli: join(repoRoot, 'cli'),
    kubernetes: join(repoRoot, 'kubernetes'),
    ansible: join(repoRoot, 'ansible'),
    charts: join(repoRoot, 'kubernetes', 'charts'),
    releases: join(repoRoot, 'kubernetes', 'releases'),
    appsRegistry: join(repoRoot, 'kubernetes', 'apps', '_others.yaml'),
    helmfile: join(repoRoot, 'kubernetes', '.helmfile'),
    inventory: join(repoRoot, 'ansible', 'inventory'),
    groupVars: join(repoRoot, 'ansible', 'group_vars'),
    docs: join(repoRoot, '.docs'),
  };
}

export type RepoPaths = ReturnType<typeof getRepoPaths>;
