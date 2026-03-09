import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Get the CLI version from package.json (single source of truth)
 */
export function getVersion(): string {
  try {
    // Try to find package.json relative to this file
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // Walk up to find package.json
    let searchDir = __dirname;
    for (let i = 0; i < 5; i++) {
      const pkgPath = join(searchDir, 'package.json');
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.name === 'selfhost') {
          return pkg.version;
        }
      } catch {
        // Continue searching
      }
      searchDir = dirname(searchDir);
    }

    return '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Parse a semver string into components
 */
export function parseSemver(version: string): { major: number; minor: number; patch: number } | null {
  // Remove leading 'v' if present
  const cleaned = version.replace(/^v/, '');
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);

  if (!match) {
    return null;
  }

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * Compare two semver versions
 * Returns:
 *  -1 if a < b
 *   0 if a == b
 *   1 if a > b
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const parsedA = parseSemver(a);
  const parsedB = parseSemver(b);

  if (!parsedA || !parsedB) {
    return 0;
  }

  if (parsedA.major !== parsedB.major) {
    return parsedA.major > parsedB.major ? 1 : -1;
  }

  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor > parsedB.minor ? 1 : -1;
  }

  if (parsedA.patch !== parsedB.patch) {
    return parsedA.patch > parsedB.patch ? 1 : -1;
  }

  return 0;
}

/**
 * Check if version B is newer than version A
 */
export function isNewerVersion(current: string, latest: string): boolean {
  return compareSemver(latest, current) > 0;
}
