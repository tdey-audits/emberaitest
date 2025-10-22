import type { CacheStore } from '../types/common.js';

interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number }): Promise<string | null>;
  del(key: string): Promise<number>;
  exists(key: string): Promise<number>;
  flushAll(): Promise<string>;
}

export class RedisCache implements CacheStore {
  constructor(
    private client: RedisClient,
    private defaultTTL: number = 60,
  ) {}

  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);

    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const effectiveTTL = ttl ? Math.floor(ttl / 1000) : this.defaultTTL;
    const serialized = JSON.stringify(value);

    await this.client.set(key, serialized, { EX: effectiveTTL });
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async clear(): Promise<void> {
    await this.client.flushAll();
  }

  async has(key: string): Promise<boolean> {
    const exists = await this.client.exists(key);
    return exists === 1;
  }
}
