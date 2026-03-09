import { describe, test, expect } from 'bun:test';
import { getVersion, parseSemver, compareSemver, isNewerVersion } from '../../utils/version';

describe('version utilities', () => {
  describe('getVersion', () => {
    test('returns a valid semver string', () => {
      const version = getVersion();
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('parseSemver', () => {
    test('parses valid semver string', () => {
      expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    });

    test('parses semver with v prefix', () => {
      expect(parseSemver('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    });

    test('parses semver with prerelease suffix', () => {
      expect(parseSemver('1.2.3-beta.1')).toEqual({ major: 1, minor: 2, patch: 3 });
    });

    test('returns null for invalid semver', () => {
      expect(parseSemver('not-a-version')).toBeNull();
      expect(parseSemver('1.2')).toBeNull();
      expect(parseSemver('')).toBeNull();
    });
  });

  describe('compareSemver', () => {
    test('returns 0 for equal versions', () => {
      expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
      expect(compareSemver('v1.0.0', '1.0.0')).toBe(0);
    });

    test('returns -1 when first version is older', () => {
      expect(compareSemver('1.0.0', '1.0.1')).toBe(-1);
      expect(compareSemver('1.0.0', '1.1.0')).toBe(-1);
      expect(compareSemver('1.0.0', '2.0.0')).toBe(-1);
    });

    test('returns 1 when first version is newer', () => {
      expect(compareSemver('1.0.1', '1.0.0')).toBe(1);
      expect(compareSemver('1.1.0', '1.0.0')).toBe(1);
      expect(compareSemver('2.0.0', '1.0.0')).toBe(1);
    });

    test('major version takes precedence', () => {
      expect(compareSemver('2.0.0', '1.9.9')).toBe(1);
      expect(compareSemver('1.9.9', '2.0.0')).toBe(-1);
    });

    test('minor version takes precedence over patch', () => {
      expect(compareSemver('1.2.0', '1.1.9')).toBe(1);
      expect(compareSemver('1.1.9', '1.2.0')).toBe(-1);
    });
  });

  describe('isNewerVersion', () => {
    test('returns true when latest is newer', () => {
      expect(isNewerVersion('1.0.0', '1.0.1')).toBe(true);
      expect(isNewerVersion('1.0.0', '1.1.0')).toBe(true);
      expect(isNewerVersion('1.0.0', '2.0.0')).toBe(true);
    });

    test('returns false when versions are equal', () => {
      expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
    });

    test('returns false when current is newer', () => {
      expect(isNewerVersion('1.0.1', '1.0.0')).toBe(false);
      expect(isNewerVersion('2.0.0', '1.0.0')).toBe(false);
    });
  });
});
