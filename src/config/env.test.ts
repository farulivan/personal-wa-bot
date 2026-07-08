import { describe, it, expect } from 'vitest';
import { appConfig, parseGroupIds, validateConfig } from './env.js';
import type { AppConfig } from './env.js';

describe('parseGroupIds', () => {
  it('parses a comma-separated list', () => {
    expect(parseGroupIds('a@g.us,b@g.us')).toEqual(['a@g.us', 'b@g.us']);
  });

  it('trims whitespace and drops empty entries', () => {
    expect(parseGroupIds(' a@g.us , , b@g.us ,')).toEqual(['a@g.us', 'b@g.us']);
  });

  it('de-duplicates while preserving first-occurrence order', () => {
    expect(parseGroupIds('a@g.us,b@g.us,a@g.us')).toEqual(['a@g.us', 'b@g.us']);
  });

  it('parses a single id', () => {
    expect(parseGroupIds('x@g.us')).toEqual(['x@g.us']);
  });

  it('returns an empty array when nothing is configured', () => {
    expect(parseGroupIds('')).toEqual([]);
  });
});

describe('validateConfig — scheduled restart', () => {
  const baseConfig: AppConfig = {
    ...appConfig,
    databaseUrl: 'postgresql://localhost:5432/test',
  };

  it('accepts the default restart schedule', () => {
    expect(() => validateConfig(baseConfig)).not.toThrow();
  });

  it('rejects an out-of-range restart hour', () => {
    expect(() => validateConfig({ ...baseConfig, scheduledRestartHour: 24 })).toThrow(
      /SCHEDULED_RESTART_HOUR must be 0-23, got 24/
    );
    expect(() => validateConfig({ ...baseConfig, scheduledRestartHour: -1 })).toThrow(
      /SCHEDULED_RESTART_HOUR must be 0-23, got -1/
    );
  });

  it('rejects an out-of-range restart minute', () => {
    expect(() => validateConfig({ ...baseConfig, scheduledRestartMinute: 60 })).toThrow(
      /SCHEDULED_RESTART_MINUTE must be 0-59, got 60/
    );
  });
});
