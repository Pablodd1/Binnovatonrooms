import { describe, it, expect } from 'vitest';
import { generateRequestId } from '../src/lib/logger';

describe('generateRequestId', () => {
  it('should return a string in the expected format', () => {
    const id = generateRequestId();
    expect(typeof id).toBe('string');
    // Format should be timestamp-uuid
    const parts = id.split('-');
    expect(parts.length).toBeGreaterThan(1);

    // First part should be a valid timestamp
    const timestamp = parseInt(parts[0], 10);
    expect(!isNaN(timestamp)).toBe(true);
    expect(timestamp).toBeLessThanOrEqual(Date.now());

    // Rest should be a uuid format: 8-4-4-4-12
    const uuidStr = parts.slice(1).join('-');
    expect(uuidStr).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('should generate unique IDs', () => {
    const id1 = generateRequestId();
    const id2 = generateRequestId();
    expect(id1).not.toBe(id2);
  });
});
