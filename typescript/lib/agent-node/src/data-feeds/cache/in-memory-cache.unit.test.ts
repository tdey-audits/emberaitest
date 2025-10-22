import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InMemoryCache } from './in-memory-cache.js';

describe('InMemoryCache', () => {
  let cache: InMemoryCache;

  beforeEach(() => {
    cache = new InMemoryCache(1000);
  });

  afterEach(() => {
    cache.destroy();
  });

  describe('get and set', () => {
    it('should store and retrieve values', async () => {
      await cache.set('test-key', { value: 'test-data' });
      const result = await cache.get<{ value: string }>('test-key');

      expect(result).toEqual({ value: 'test-data' });
    });

    it('should return null for non-existent keys', async () => {
      const result = await cache.get('non-existent');

      expect(result).toBeNull();
    });

    it('should respect custom TTL', async () => {
      await cache.set('short-lived', 'data', 100);

      const immediate = await cache.get('short-lived');
      expect(immediate).toBe('data');

      await new Promise((resolve) => setTimeout(resolve, 150));

      const expired = await cache.get('short-lived');
      expect(expired).toBeNull();
    });

    it('should use default TTL when not specified', async () => {
      await cache.set('default-ttl', 'data');

      const result = await cache.get('default-ttl');
      expect(result).toBe('data');
    });
  });

  describe('delete', () => {
    it('should delete a key', async () => {
      await cache.set('to-delete', 'data');
      await cache.delete('to-delete');

      const result = await cache.get('to-delete');
      expect(result).toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear all entries', async () => {
      await cache.set('key1', 'data1');
      await cache.set('key2', 'data2');
      await cache.clear();

      const result1 = await cache.get('key1');
      const result2 = await cache.get('key2');

      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });
  });

  describe('has', () => {
    it('should return true for existing keys', async () => {
      await cache.set('exists', 'data');

      const result = await cache.has('exists');
      expect(result).toBe(true);
    });

    it('should return false for non-existent keys', async () => {
      const result = await cache.has('non-existent');
      expect(result).toBe(false);
    });

    it('should return false for expired keys', async () => {
      await cache.set('expires', 'data', 100);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const result = await cache.has('expires');
      expect(result).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should clean up expired entries automatically', async () => {
      cache.destroy();
      cache = new InMemoryCache(100);

      await cache.set('expires-soon', 'data', 100);

      await new Promise((resolve) => setTimeout(resolve, 200));

      const result = await cache.get('expires-soon');
      expect(result).toBeNull();

      cache.destroy();
    });
  });
});
