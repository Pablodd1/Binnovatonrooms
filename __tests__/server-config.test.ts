import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getRuntimeHealth, requireGeminiConfig } from '../src/lib/server-config';

describe('server-config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset process.env for each test
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe('getRuntimeHealth', () => {
    it('should report missing for all required variables when completely empty', () => {
      delete process.env.GEMINI_API_KEY;
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.SUPABASE_BUCKET;
      delete process.env.GEMINI_MODEL;

      const health = getRuntimeHealth();
      expect(health.geminiConfigured).toBe(false);
      expect(health.supabaseConfigured).toBe(false);
      expect(health.storageConfigured).toBe(false);
      expect(health.model).toBe('gemini-3.5-flash');
      expect(health.missing).toEqual([
        'GEMINI_API_KEY',
        'NEXT_PUBLIC_SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
        'SUPABASE_BUCKET'
      ]);
    });

    it('should report fully configured when all variables are present', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://test-url';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-role-key';
      process.env.SUPABASE_BUCKET = 'test-bucket';

      const health = getRuntimeHealth();
      expect(health.geminiConfigured).toBe(true);
      expect(health.supabaseConfigured).toBe(true);
      expect(health.storageConfigured).toBe(true);
      expect(health.missing).toEqual([]);
    });

    it('should be partially configured when bucket is missing', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://test-url';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-role-key';
      delete process.env.SUPABASE_BUCKET;

      const health = getRuntimeHealth();
      expect(health.geminiConfigured).toBe(true);
      expect(health.supabaseConfigured).toBe(true);
      expect(health.storageConfigured).toBe(false);
      expect(health.missing).toEqual(['SUPABASE_BUCKET']);
    });

    it('should report supabaseConfigured false if SUPABASE_SERVICE_ROLE_KEY is missing', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://test-url';
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      process.env.SUPABASE_BUCKET = 'test-bucket';

      const health = getRuntimeHealth();
      expect(health.supabaseConfigured).toBe(false);
      expect(health.storageConfigured).toBe(false);
      expect(health.missing).toEqual(['SUPABASE_SERVICE_ROLE_KEY']);
    });

    it('should respect custom GEMINI_MODEL', () => {
      process.env.GEMINI_MODEL = 'gemini-1.5-pro';

      const health = getRuntimeHealth();
      expect(health.model).toBe('gemini-1.5-pro');
    });
  });

  describe('requireGeminiConfig', () => {
    it('should return config when API key is present', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.GEMINI_MODEL = 'custom-model';

      const config = requireGeminiConfig();
      expect(config).toEqual({
        apiKey: 'test-key',
        model: 'custom-model'
      });
    });

    it('should throw an error when API key is missing', () => {
      delete process.env.GEMINI_API_KEY;

      expect(() => requireGeminiConfig()).toThrow('Missing GEMINI_API_KEY. Add it in Vercel Project Settings.');
    });

    it('should use default model if GEMINI_MODEL is not set', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      delete process.env.GEMINI_MODEL;

      const config = requireGeminiConfig();
      expect(config).toEqual({
        apiKey: 'test-key',
        model: 'gemini-3.5-flash'
      });
    });
  });
});
