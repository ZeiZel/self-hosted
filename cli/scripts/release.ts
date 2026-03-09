#!/usr/bin/env bun
/**
 * Release script for selfhost CLI
 *
 * Usage:
 *   bun run release patch   # 1.0.0 -> 1.0.1
 *   bun run release minor   # 1.0.0 -> 1.1.0
 *   bun run release major   # 1.0.0 -> 2.0.0
 *   bun run release 1.2.3   # Set specific version
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_ROOT = join(__dirname, '..');
const PACKAGE_JSON_PATH = join(CLI_ROOT, 'package.json');

interface PackageJson {
  name: string;
  version: string;
  [key: string]: unknown;
}

type BumpType = 'major' | 'minor' | 'patch';

function readPackageJson(): PackageJson {
  const content = readFileSync(PACKAGE_JSON_PATH, 'utf-8');
  return JSON.parse(content) as PackageJson;
}

function writePackageJson(pkg: PackageJson): void {
  writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(pkg, null, 2) + '\n');
}

function parseSemver(version: string): { major: number; minor: number; patch: number } {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`Invalid semver: ${version}`);
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

function bumpVersion(current: string, type: BumpType): string {
  const { major, minor, patch } = parseSemver(current);

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
  }
}

function isValidSemver(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version);
}

function isBumpType(arg: string): arg is BumpType {
  return ['major', 'minor', 'patch'].includes(arg);
}

function runGitCommand(command: string): string {
  try {
    return execSync(command, { cwd: CLI_ROOT, encoding: 'utf-8' }).trim();
  } catch (error) {
    const err = error as Error & { stderr?: string };
    throw new Error(`Git command failed: ${err.message}\n${err.stderr || ''}`);
  }
}

function checkGitStatus(): void {
  const status = runGitCommand('git status --porcelain');
  const unstagedChanges = status
    .split('\n')
    .filter((line) => line.trim() && !line.startsWith('??'))
    .filter((line) => !line.includes('package.json')); // Allow package.json changes

  if (unstagedChanges.length > 0) {
    console.error('\x1b[31mError: You have uncommitted changes. Please commit or stash them first.\x1b[0m');
    console.error('Changes:');
    unstagedChanges.forEach((line) => console.error(`  ${line}`));
    process.exit(1);
  }
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
\x1b[1mSelfhost CLI Release Script\x1b[0m

Usage:
  bun run release <bump-type>   Bump version (major, minor, patch)
  bun run release <version>     Set specific version (e.g., 1.2.3)

Examples:
  bun run release patch         1.0.0 -> 1.0.1
  bun run release minor         1.0.0 -> 1.1.0
  bun run release major         1.0.0 -> 2.0.0
  bun run release 2.0.0-beta.1  Set specific version

Options:
  --dry-run                     Show what would happen without making changes
  --help, -h                    Show this help message
`);
    process.exit(0);
  }

  const dryRun = args.includes('--dry-run');
  const versionArg = args.find((arg) => !arg.startsWith('--'));

  if (!versionArg) {
    console.error('\x1b[31mError: Please specify a version or bump type.\x1b[0m');
    process.exit(1);
  }

  // Read current version
  const pkg = readPackageJson();
  const currentVersion = pkg.version;

  // Calculate new version
  let newVersion: string;

  if (isBumpType(versionArg)) {
    newVersion = bumpVersion(currentVersion, versionArg);
  } else if (isValidSemver(versionArg)) {
    newVersion = versionArg;
  } else {
    console.error(`\x1b[31mError: Invalid version "${versionArg}". Use major/minor/patch or a valid semver.\x1b[0m`);
    process.exit(1);
  }

  console.log(`\x1b[1mRelease: v${currentVersion} -> v${newVersion}\x1b[0m\n`);

  if (dryRun) {
    console.log('\x1b[33m[DRY RUN] No changes will be made.\x1b[0m\n');
    console.log('Would perform:');
    console.log(`  1. Update package.json version to ${newVersion}`);
    console.log(`  2. Create commit: chore(cli): release v${newVersion}`);
    console.log(`  3. Create tag: v${newVersion}`);
    console.log('\nTo apply changes, run without --dry-run');
    process.exit(0);
  }

  // Check git status
  console.log('Checking git status...');
  checkGitStatus();

  // Update package.json
  console.log('Updating package.json...');
  pkg.version = newVersion;
  writePackageJson(pkg);

  // Create commit
  console.log('Creating commit...');
  runGitCommand('git add package.json');
  runGitCommand(`git commit -m "chore(cli): release v${newVersion}"`);

  // Create tag
  console.log('Creating tag...');
  runGitCommand(`git tag v${newVersion}`);

  console.log(`
\x1b[32mRelease v${newVersion} created successfully!\x1b[0m

Next steps:
  1. Review the commit: git show HEAD
  2. Review the tag: git tag -l | tail -1
  3. Push when ready: git push && git push --tags

To undo:
  git reset --hard HEAD~1 && git tag -d v${newVersion}
`);
}

main();
