/**
 * DataSaver Pro - Central Gateway & Dashboard Server
 * Coordinates the local saving proxy, REST API, real-time metrics, and cross-device PAC configuration.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');

const BudgetManager = require('./lib/budgetManager');
const CacheManager = require('./lib/cacheManager');
const ProxyEngine = require('./lib/proxyEngine');
const { testUrlSavings } = require('./lib/urlTester');

const DASHBOARD_PORT = parseInt(process.env.PORT, 10) || 3000;
const PROXY_PORT = parseInt(process.env.PROXY_PORT, 10) || 8888;
const HOST = '0.0.0.0';

// Initialize singletons
const budgetManager = new BudgetManager();
const cacheManager = new CacheManager();
const proxyEngine = new ProxyEngine({
  budgetManager,
  cacheManager,
  port: PROXY_PORT,
  host: HOST
});

// Helper to determine host local IP for cross-device WiFi setup
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function serveStatic(req, res, pathname) {
  let safePath = pathname === '/' ? '/index.html' : pathname;
  safePath = path.normalize(safePath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(__dirname, 'public', safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });

    fs.createReadStream(filePath).pipe(res);
  });
}

const dashboardServer = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;
  const localIp = getLocalIpAddress();

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. PAC (Proxy Auto-Config) Script
  // Cross-device automatic configuration endpoint for iOS, Android, Windows, Mac
  if (pathname === '/proxy.pac') {
    const pacScript = `function FindProxyForURL(url, host) {
  // Pass local network traffic directly
  if (isPlainHostName(host) ||
      shExpMatch(host, "*.local") ||
      isInNet(dnsResolve(host), "10.0.0.0", "255.0.0.0") ||
      isInNet(dnsResolve(host), "172.16.0.0", "255.240.0.0") ||
      isInNet(dnsResolve(host), "192.168.0.0", "255.255.0.0") ||
      isInNet(dnsResolve(host), "127.0.0.0", "255.0.0.0")) {
    return "DIRECT";
  }
  // Route everything else through DataSaver Pro
  return "PROXY ${localIp}:${PROXY_PORT}; DIRECT";
}
`;
    res.writeHead(200, {
      'Content-Type': 'application/x-ns-proxy-autoconfig',
      'Cache-Control': 'no-cache'
    });
    res.end(pacScript);
    return;
  }

  // 2. Real-time Server-Sent Events (SSE)
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(`data: ${JSON.stringify({ type: 'init', stats: budgetManager.getSummary() })}\n\n`);

    const unsubscribe = budgetManager.subscribe((data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    });

    req.on('close', () => {
      unsubscribe();
    });
    return;
  }

  // 3. REST API: Summary Stats
  if (pathname === '/api/stats' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(budgetManager.getSummary()));
    return;
  }

  // 4. REST API: Recent Traffic Log
  if (pathname === '/api/traffic' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      requests: budgetManager.recentRequests,
      cache: cacheManager.getStats()
    }));
    return;
  }

  // 5. REST API: Update Settings
  if (pathname === '/api/settings' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const updated = budgetManager.updateSettings(payload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, settings: updated }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 6. REST API: Reset Stats
  if (pathname === '/api/reset' && req.method === 'POST') {
    budgetManager.resetStats();
    cacheManager.clear();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Counters reset successfully' }));
    return;
  }

  // 7. REST API: Device Setup Guides Info
  if (pathname === '/api/devices' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      localIp,
      proxyPort: PROXY_PORT,
      dashboardPort: DASHBOARD_PORT,
      pacUrl: `http://${localIp}:${DASHBOARD_PORT}/proxy.pac`,
      proxyAddress: `${localIp}:${PROXY_PORT}`
    }));
    return;
  }

  // 8. REST API: Interactive URL Tester
  if (pathname === '/api/test-url' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { targetUrl, mode } = JSON.parse(body);
        if (!targetUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Target URL is required' }));
          return;
        }

        const effectiveMode = mode || budgetManager.getEffectiveMode();
        const testResult = await testUrlSavings(targetUrl, effectiveMode);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, result: testResult }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 9. Static UI Files
  serveStatic(req, res, pathname);
});

// Start Servers
async function start() {
  try {
    await proxyEngine.start();
    dashboardServer.listen(DASHBOARD_PORT, HOST, () => {
      const localIp = getLocalIpAddress();
      console.log('====================================================');
      console.log('🚀 DataSaver Pro - Active & Saving Bandwidth!');
      console.log('----------------------------------------------------');
      console.log(`📊 Dashboard UI:   http://localhost:${DASHBOARD_PORT}`);
      console.log(`🌐 Network Access: http://${localIp}:${DASHBOARD_PORT}`);
      console.log(`🛡️  Proxy Engine:   ${localIp}:${PROXY_PORT}`);
      console.log(`⚙️  PAC Auto-Config: http://${localIp}:${DASHBOARD_PORT}/proxy.pac`);
      console.log('====================================================');
    });
  } catch (err) {
    console.error('Fatal startup error:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nStopping DataSaver Pro gracefully...');
  budgetManager.save();
  process.exit(0);
});

process.on('SIGTERM', () => {
  budgetManager.save();
  process.exit(0);
});

start();
