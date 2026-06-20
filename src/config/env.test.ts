import { describe, it, expect } from 'vitest';
import { parseGroupIds } from './env.js';

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
