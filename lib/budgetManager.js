/**
 * DataSaver Pro - Data Budget & Usage Tracker
 * Real-time accounting of bandwidth usage, limits, and savings history.
 */

const fs = require('fs');
const path = require('path');

class BudgetManager {
  constructor(storagePath) {
    this.storagePath = storagePath || path.join(__dirname, '..', 'data', 'usage.json');
    this.state = {
      settings: {
        mode: 'standard', // 'standard' | 'ultra' | 'emergency' | 'custom'
        blockAds: true,
        blockTrackers: true,
        blockTelemetry: true,
        blockFonts: false,
        blockHeavyMedia: false,
        dataLimitMB: 2048, // 2GB default
        limitPeriod: 'daily', // 'daily' | 'monthly' | 'session'
        enforceLimit: false, // auto-switch to emergency when quota reached
        notifyThresholdPercent: 80
      },
      stats: {
        bytesDownloaded: 0,
        bytesUploaded: 0,
        bytesSaved: 0,
        requestsTotal: 0,
        requestsBlocked: 0,
        requestsCached: 0,
        categories: {
          'Ad / Tracker': 0,
          'Background Telemetry': 0,
          'Heavy Web Font': 0,
          'Heavy Media / GIF': 0,
          'Cache Hit': 0
        },
        hourlyHistory: [], // [{ timestamp, downloaded, saved }]
        lastReset: Date.now()
      }
    };

    this.recentRequests = []; // In-memory ring buffer of recent 100 requests for live feed
    this.maxRecent = 100;
    this.listeners = new Set(); // SSE listener callbacks

    this.load();
    this.checkPeriodReset();
  }

  load() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.settings) Object.assign(this.state.settings, parsed.settings);
        if (parsed.stats) Object.assign(this.state.stats, parsed.stats);
      }
    } catch (err) {
      console.warn('[BudgetManager] Could not load saved usage state, starting fresh:', err.message);
    }
  }

  save() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.storagePath, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (err) {
      console.error('[BudgetManager] Failed to persist state:', err.message);
    }
  }

  checkPeriodReset() {
    const now = new Date();
    const last = new Date(this.state.stats.lastReset || Date.now());

    let shouldReset = false;
    if (this.state.settings.limitPeriod === 'daily') {
      shouldReset = now.toDateString() !== last.toDateString();
    } else if (this.state.settings.limitPeriod === 'monthly') {
      shouldReset = now.getMonth() !== last.getMonth() || now.getFullYear() !== last.getFullYear();
    }

    if (shouldReset) {
      this.resetStats();
    }
  }

  resetStats() {
    this.state.stats.bytesDownloaded = 0;
    this.state.stats.bytesUploaded = 0;
    this.state.stats.bytesSaved = 0;
    this.state.stats.requestsTotal = 0;
    this.state.stats.requestsBlocked = 0;
    this.state.stats.requestsCached = 0;
    this.state.stats.categories = {
      'Ad / Tracker': 0,
      'Background Telemetry': 0,
      'Heavy Web Font': 0,
      'Heavy Media / GIF': 0,
      'Cache Hit': 0
    };
    this.state.stats.hourlyHistory = [];
    this.state.stats.lastReset = Date.now();
    this.recentRequests = [];
    this.save();
    this.notifyListeners({ type: 'reset' });
  }

  recordRequest({ host, path, action, category, downloaded = 0, uploaded = 0, saved = 0, status = 200 }) {
    this.state.stats.requestsTotal++;
    this.state.stats.bytesDownloaded += downloaded;
    this.state.stats.bytesUploaded += uploaded;
    this.state.stats.bytesSaved += saved;

    if (action === 'BLOCKED') {
      this.state.stats.requestsBlocked++;
    } else if (action === 'CACHED') {
      this.state.stats.requestsCached++;
    }

    if (category) {
      this.state.stats.categories[category] = (this.state.stats.categories[category] || 0) + saved;
    }

    // Append to live recent buffer
    const entry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      host: host || 'unknown',
      path: path ? (path.length > 45 ? path.substring(0, 42) + '...' : path) : '/',
      action, // 'BLOCKED' | 'PASSED' | 'CACHED' | 'OPTIMIZED'
      category: category || 'General',
      downloaded,
      saved,
      status
    };

    this.recentRequests.unshift(entry);
    if (this.recentRequests.length > this.maxRecent) {
      this.recentRequests.pop();
    }

    // Record hourly bucket
    this.recordHourlyBucket(downloaded, saved);

    // Auto-save periodically (e.g. every 25 requests)
    if (this.state.stats.requestsTotal % 25 === 0) {
      this.save();
    }

    // Notify real-time listeners
    this.notifyListeners({
      type: 'request',
      entry,
      stats: this.getSummary()
    });
  }

  recordHourlyBucket(downloaded, saved) {
    const currentHour = new Date().toISOString().slice(0, 13) + ':00'; // e.g. "2026-10-31T13:00"
    const history = this.state.stats.hourlyHistory;
    let bucket = history.find(h => h.hour === currentHour);

    if (!bucket) {
      bucket = { hour: currentHour, downloaded: 0, saved: 0 };
      history.push(bucket);
      if (history.length > 24) history.shift(); // Keep 24 hours
    }

    bucket.downloaded += downloaded;
    bucket.saved += saved;
  }

  isQuotaExceeded() {
    if (!this.state.settings.dataLimitMB || this.state.settings.dataLimitMB <= 0) return false;
    const currentMB = this.state.stats.bytesDownloaded / (1024 * 1024);
    return currentMB >= this.state.settings.dataLimitMB;
  }

  getEffectiveMode() {
    if (this.state.settings.enforceLimit && this.isQuotaExceeded()) {
      return 'emergency';
    }
    return this.state.settings.mode;
  }

  updateSettings(newSettings) {
    Object.assign(this.state.settings, newSettings);
    this.save();
    this.notifyListeners({ type: 'settings', settings: this.state.settings });
    return this.state.settings;
  }

  getSummary() {
    const downloadedMB = (this.state.stats.bytesDownloaded / (1024 * 1024)).toFixed(2);
    const savedMB = (this.state.stats.bytesSaved / (1024 * 1024)).toFixed(2);
    const totalPotentialMB = ((this.state.stats.bytesDownloaded + this.state.stats.bytesSaved) / (1024 * 1024)).toFixed(2);
    const totalPotentialBytes = this.state.stats.bytesDownloaded + this.state.stats.bytesSaved;

    const savingsPercentage = totalPotentialBytes > 0
      ? ((this.state.stats.bytesSaved / totalPotentialBytes) * 100).toFixed(1)
      : '0.0';

    const limitMB = this.state.settings.dataLimitMB;
    const percentUsed = limitMB > 0
      ? Math.min(100, ((this.state.stats.bytesDownloaded / (1024 * 1024)) / limitMB * 100)).toFixed(1)
      : '0.0';

    return {
      bytesDownloaded: this.state.stats.bytesDownloaded,
      bytesUploaded: this.state.stats.bytesUploaded,
      bytesSaved: this.state.stats.bytesSaved,
      downloadedMB: parseFloat(downloadedMB),
      savedMB: parseFloat(savedMB),
      totalPotentialMB: parseFloat(totalPotentialMB),
      savingsPercentage: parseFloat(savingsPercentage),
      requestsTotal: this.state.stats.requestsTotal,
      requestsBlocked: this.state.stats.requestsBlocked,
      requestsCached: this.state.stats.requestsCached,
      dataLimitMB: limitMB,
      percentUsed: parseFloat(percentUsed),
      isQuotaExceeded: this.isQuotaExceeded(),
      effectiveMode: this.getEffectiveMode(),
      settings: this.state.settings,
      categories: this.state.stats.categories,
      hourlyHistory: this.state.stats.hourlyHistory,
      lastReset: this.state.stats.lastReset
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners(data) {
    for (const listener of this.listeners) {
      try {
        listener(data);
      } catch (err) {
        // Ignore dead listener
      }
    }
  }
}

module.exports = BudgetManager;
