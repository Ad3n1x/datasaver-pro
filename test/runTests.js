/**
 * DataSaver Pro - Comprehensive Automated Test Suite
 */

const assert = require('assert');
const http = require('http');
const net = require('net');
const path = require('path');
const fs = require('fs');

const { evaluateRequest, cleanHostname } = require('../lib/filterRules');
const CacheManager = require('../lib/cacheManager');
const BudgetManager = require('../lib/budgetManager');
const ProxyEngine = require('../lib/proxyEngine');

let passedTests = 0;
let totalTests = 0;

function it(desc, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(`    ${err.message}`);
  }
}

async function itAsync(desc, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(`    ${err.message}`);
  }
}

async function run() {
  console.log('\n--- 1. Filter Rules Unit Tests ---');

  it('cleanHostname strips port and trailing dot', () => {
    assert.strictEqual(cleanHostname('DOUBLECLICK.NET:443'), 'doubleclick.net');
    assert.strictEqual(cleanHostname('analytics.google.com.'), 'analytics.google.com');
  });

  it('Blocks known ad networks in standard mode', () => {
    const res = evaluateRequest('doubleclick.net', '/', { mode: 'standard' });
    assert.strictEqual(res.blocked, true);
    assert.strictEqual(res.category, 'Ad / Tracker');
  });

  it('Blocks ad keywords via heuristics', () => {
    const res = evaluateRequest('adserver.some-random-domain.xyz', '/', { mode: 'standard' });
    assert.strictEqual(res.blocked, true);
    assert.strictEqual(res.category, 'Ad / Tracker (Heuristic)');
  });

  it('Blocks Windows background telemetry bleed', () => {
    const res = evaluateRequest('v10.events.data.microsoft.com', '', { mode: 'standard' });
    assert.strictEqual(res.blocked, true);
    assert.strictEqual(res.category, 'Background Telemetry');
  });

  it('Permits clean traffic in standard mode but blocks web fonts in ultra mode', () => {
    const standardRes = evaluateRequest('fonts.googleapis.com', '', { mode: 'standard' });
    assert.strictEqual(standardRes.blocked, false);

    const ultraRes = evaluateRequest('fonts.googleapis.com', '', { mode: 'ultra' });
    assert.strictEqual(ultraRes.blocked, true);
    assert.strictEqual(ultraRes.category, 'Heavy Web Font');
  });

  it('Emergency mode blocks heavy media by extension', () => {
    const res = evaluateRequest('example.com', '/hero-banner.jpg', { mode: 'emergency' });
    assert.strictEqual(res.blocked, true);
    assert.strictEqual(res.category, 'Emergency Media Blocker');
  });

  console.log('\n--- 2. Cache Manager Unit Tests ---');

  it('Caches eligible GET requests and returns cache hits', () => {
    const cache = new CacheManager({ maxItems: 10, maxBytes: 1024 * 1024 });
    const buffer = Buffer.from('hello world from cached asset');
    const headers = { 'content-type': 'text/plain', 'cache-control': 'max-age=3600' };

    cache.set('GET', 'http://example.com/asset.js', 200, headers, buffer);
    const hit = cache.get('GET', 'http://example.com/asset.js');

    assert.ok(hit);
    assert.strictEqual(hit.fromCache, true);
    assert.strictEqual(hit.data.toString(), 'hello world from cached asset');

    const stats = cache.getStats();
    assert.strictEqual(stats.totalHits, 1);
    assert.strictEqual(stats.totalSavedBytes, buffer.length);
  });

  it('Ignores non-GET methods or uncacheable items', () => {
    const cache = new CacheManager();
    const buffer = Buffer.from('post data');
    const setRes = cache.set('POST', 'http://example.com/api', 200, {}, buffer);
    assert.strictEqual(setRes, false);
    assert.strictEqual(cache.get('POST', 'http://example.com/api'), null);
  });

  console.log('\n--- 3. Budget Manager Unit Tests ---');

  it('Calculates usage, savings percentage, and category accounting', () => {
    const testUsageFile = path.join(__dirname, 'test-usage.json');
    if (fs.existsSync(testUsageFile)) fs.unlinkSync(testUsageFile);

    const budget = new BudgetManager(testUsageFile);
    budget.recordRequest({
      host: 'doubleclick.net',
      path: ':443',
      action: 'BLOCKED',
      category: 'Ad / Tracker',
      downloaded: 0,
      saved: 45000
    });

    budget.recordRequest({
      host: 'example.com',
      path: '/page.html',
      action: 'PASSED',
      category: 'Web Asset',
      downloaded: 5000,
      saved: 0
    });

    const summary = budget.getSummary();
    assert.strictEqual(summary.requestsTotal, 2);
    assert.strictEqual(summary.requestsBlocked, 1);
    assert.strictEqual(summary.bytesSaved, 45000);
    assert.strictEqual(summary.bytesDownloaded, 5000);
    assert.strictEqual(summary.categories['Ad / Tracker'], 45000);
    assert.ok(summary.savingsPercentage > 80);

    if (fs.existsSync(testUsageFile)) fs.unlinkSync(testUsageFile);
  });

  console.log('\n--- 4. Integration Test: Proxy & Dashboard Engine ---');

  const { PassThrough } = require('stream');
  const testBudget = new BudgetManager(path.join(__dirname, 'temp-budget.json'));
  const testCache = new CacheManager();
  const testProxy = new ProxyEngine({
    budgetManager: testBudget,
    cacheManager: testCache
  });

  it('Proxy blocks HTTPS CONNECT to ad domains before handshake', () => {
    const mockClientSocket = new PassThrough();
    let written = '';
    mockClientSocket.on('data', chunk => {
      written += chunk.toString();
    });

    const mockReq = { url: 'doubleclick.net:443' };
    testProxy.handleConnectRequest(mockReq, mockClientSocket, Buffer.alloc(0));

    assert.ok(written.includes('403 Forbidden') || written.includes('Blocked by DataSaver Pro'));
    assert.strictEqual(testBudget.getSummary().requestsBlocked, 1);
  });

  it('Proxy injects Save-Data: on header and serves empty placeholder for blocked images in HTTP', () => {
    const mockRes = {
      statusCode: 0,
      headers: {},
      body: Buffer.alloc(0),
      writeHead(code, headers) {
        this.statusCode = code;
        this.headers = headers;
      },
      end(data) {
        if (data) this.body = data;
      }
    };

    const mockReq = Object.assign(new PassThrough(), {
      method: 'GET',
      url: 'http://ads.google.com/banner.png',
      headers: { host: 'ads.google.com' }
    });

    testProxy.handleHttpRequest(mockReq, mockRes);

    assert.strictEqual(mockRes.statusCode, 200);
    assert.strictEqual(mockRes.headers['Content-Type'], 'image/png');
    assert.strictEqual(mockRes.headers['X-DataSaver-Action'], 'Image-Replaced');
    assert.strictEqual(mockRes.body.length, 68); // 1x1 transparent PNG
  });

  const tempBudgetFile = path.join(__dirname, 'temp-budget.json');
  if (fs.existsSync(tempBudgetFile)) fs.unlinkSync(tempBudgetFile);

  console.log(`\n========================================`);
  console.log(`Test Results: ${passedTests}/${totalTests} Passed!`);
  console.log(`========================================\n`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
