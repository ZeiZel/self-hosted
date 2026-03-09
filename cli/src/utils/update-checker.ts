import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import { getVersion, isNewerVersion } from './version';
import { GITHUB_INFO } from '../core/constants';

interface VersionCache {
  latestVersion: string;
  checkedAt: number;
}

const CACHE_DIR = join(homedir(), '.selfhosted', 'cache');
const CACHE_FILE = join(CACHE_DIR, 'version-check.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CHECK_TIMEOUT_MS = 3000; // 3 seconds

/**
 * Ensure cache directory exists
 */
function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Read cached version info
 */
function readCache(): VersionCache | null {
  try {
    if (!existsSync(CACHE_FILE)) {
      return null;
    }

    const data = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
    return data as VersionCache;
  } catch {
    return null;
  }
}

/**
 * Write version info to cache
 */
function writeCache(cache: VersionCache): void {
  try {
    ensureCacheDir();
    writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch {
    // Ignore cache write errors
  }
}

/**
 * Check if cache is still valid
 */
function isCacheValid(cache: VersionCache): boolean {
  return Date.now() - cache.checkedAt < CACHE_TTL_MS;
}

/**
 * Fetch latest version from GitHub API
 */
async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_INFO.OWNER}/${GITHUB_INFO.REPO}/releases/latest`,
      {
        signal: controller.signal,
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'selfhost-cli',
        },
      },
    );

    clearTimeout(timeout);

    if (!response.ok) {
      // Try tags if no releases
      if (response.status === 404) {
        return await fetchLatestTag();
      }
      return null;
    }

    const data = (await response.json()) as { tag_name?: string };
    return data.tag_name ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch latest tag if no releases exist
 */
async function fetchLatestTag(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_INFO.OWNER}/${GITHUB_INFO.REPO}/tags?per_page=1`,
      {
        signal: controller.signal,
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'selfhost-cli',
        },
      },
    );

    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as Array<{ name?: string }>;
    return data[0]?.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Check for updates (uses cache when valid)
 */
export async function checkForUpdate(): Promise<{ hasUpdate: boolean; latestVersion: string | null }> {
  const currentVersion = getVersion();

  // Check cache first
  const cache = readCache();
  if (cache && isCacheValid(cache)) {
    return {
      hasUpdate: isNewerVersion(currentVersion, cache.latestVersion),
      latestVersion: cache.latestVersion,
    };
  }

  // Fetch from GitHub
  const latestVersion = await fetchLatestVersion();

  if (latestVersion) {
    writeCache({
      latestVersion,
      checkedAt: Date.now(),
    });

    return {
      hasUpdate: isNewerVersion(currentVersion, latestVersion),
      latestVersion,
    };
  }

  return { hasUpdate: false, latestVersion: null };
}

/**
 * Print update notification box
 */
export function printUpdateNotification(currentVersion: string, latestVersion: string): void {
  const installUrl = `https://raw.githubusercontent.com/${GITHUB_INFO.OWNER}/${GITHUB_INFO.REPO}/main/scripts/install.sh`;

  const lines = [
    `Update available! ${chalk.gray(currentVersion)} ${chalk.white('→')} ${chalk.green(latestVersion)}`,
    `Run: ${chalk.cyan(`curl -fsSL ${installUrl} | bash`)}`,
  ];

  const maxLength = Math.max(...lines.map((l) => stripAnsi(l).length));
  const boxWidth = maxLength + 4;

  const horizontalLine = '─'.repeat(boxWidth - 2);
  const topBorder = chalk.yellow(`┌${horizontalLine}┐`);
  const bottomBorder = chalk.yellow(`└${horizontalLine}┘`);

  console.log();
  console.log(topBorder);
  for (const line of lines) {
    const padding = ' '.repeat(maxLength - stripAnsi(line).length);
    console.log(`${chalk.yellow('│')} ${line}${padding} ${chalk.yellow('│')}`);
  }
  console.log(bottomBorder);
  console.log();
}

/**
 * Strip ANSI codes from string (for length calculation)
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Run update check in background (non-blocking)
 * Call this early in CLI startup
 */
export function runBackgroundUpdateCheck(): void {
  // Run check asynchronously without blocking
  checkForUpdate()
    .then(({ hasUpdate, latestVersion }) => {
      if (hasUpdate && latestVersion) {
        // Store for later display (after command output)
        (globalThis as Record<string, unknown>).__selfhost_update = {
          hasUpdate,
          latestVersion,
          currentVersion: getVersion(),
        };
      }
    })
    .catch(() => {
      // Silently ignore errors
    });
}

/**
 * Show update notification if available (call after command completes)
 */
export function showPendingUpdateNotification(): void {
  const update = (globalThis as Record<string, unknown>).__selfhost_update as
    | {
        hasUpdate: boolean;
        latestVersion: string;
        currentVersion: string;
      }
    | undefined;

  if (update?.hasUpdate) {
    printUpdateNotification(update.currentVersion, update.latestVersion);
    delete (globalThis as Record<string, unknown>).__selfhost_update;
  }
}
