/**
 * DataSaver Pro - Smart Caching Engine
 * Reuses static assets across browsing sessions to prevent redundant downloads.
 */

const crypto = require('crypto');

class CacheManager {
  constructor(options = {}) {
    this.maxItems = options.maxItems || 1000;
    this.maxBytes = options.maxBytes || 100 * 1024 * 1024; // 100 MB max memory cache
    this.currentBytes = 0;
    this.cache = new Map(); // key -> { headers, data, size, expiresAt, hits, lastAccessed }
    this.totalSavedBytes = 0;
    this.totalHits = 0;
  }

  hashKey(method, url) {
    return `${method}:${url}`;
  }

  get(method, url) {
    if (method !== 'GET' && method !== 'HEAD') return null;
    const key = this.hashKey(method, url);
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      return null;
    }

    entry.lastAccessed = Date.now();
    entry.hits++;
    this.totalHits++;
    this.totalSavedBytes += entry.size;

    return {
      headers: entry.headers,
      data: entry.data,
      size: entry.size,
      fromCache: true
    };
  }

  set(method, url, statusCode, headers, buffer) {
    if (method !== 'GET') return false;
    if (statusCode !== 200) return false;
    if (!buffer || buffer.length === 0) return false;
    if (buffer.length > 5 * 1024 * 1024) return false; // Don't cache single items > 5MB

    // Determine cacheability
    const cacheControl = (headers['cache-control'] || '').toLowerCase();
    if (cacheControl.includes('no-store') || cacheControl.includes('private')) {
      // In ultra mode we could optionally cache, but let's respect private data for security
      return false;
    }

    const key = this.hashKey(method, url);
    const size = buffer.length;

    // Prune if necessary
    while ((this.currentBytes + size > this.maxBytes || this.cache.size >= this.maxItems) && this.cache.size > 0) {
      this.evictOldest();
    }

    // Default TTL: 1 hour, or respect max-age
    let ttlMs = 3600 * 1000;
    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
    if (maxAgeMatch) {
      ttlMs = parseInt(maxAgeMatch[1], 10) * 1000;
    }

    // Ensure minimum cache TTL of 10 minutes to save data on repeat requests
    ttlMs = Math.max(ttlMs, 600 * 1000);

    const entry = {
      headers: { ...headers, 'x-datasaver-cache': 'HIT' },
      data: buffer,
      size,
      expiresAt: Date.now() + ttlMs,
      hits: 0,
      lastAccessed: Date.now()
    };

    if (this.cache.has(key)) {
      this.currentBytes -= this.cache.get(key).size;
    }

    this.cache.set(key, entry);
    this.currentBytes += size;
    return true;
  }

  evictOldest() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
    }
  }

  delete(key) {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentBytes -= entry.size;
      this.cache.delete(key);
    }
  }

  clear() {
    this.cache.clear();
    this.currentBytes = 0;
  }

  getStats() {
    return {
      cachedItems: this.cache.size,
      cacheSizeBytes: this.currentBytes,
      totalHits: this.totalHits,
      totalSavedBytes: this.totalSavedBytes
    };
  }
}

module.exports = CacheManager;
