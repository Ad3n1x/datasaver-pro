/**
 * DataSaver Pro - Cloud Gateway & Central Web Server
 * Universal bandwidth optimizer, real-time web proxy, and cross-device PAC generator.
 *
 * Architected & Engineered by Ad3n1x
 * GitHub: https://github.com/Ad3n1x/datasaver-pro
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');

const BudgetManager = require('./lib/budgetManager');
const CacheManager = require('./lib/cacheManager');
const ProxyEngine = require('./lib/proxyEngine');
const { testUrlSavings } = require('./lib/urlTester');
const { fetchRemotePage, optimizeHtmlForWeb } = require('./lib/webProxy');

// Port configuration (supports cloud environments like Render, Railway, Fly.io, Heroku)
const PORT = parseInt(process.env.PORT, 10) || 3000;
const PROXY_PORT = parseInt(process.env.PROXY_PORT, 10) || (process.env.PORT ? 0 : 8888);
const HOST = '0.0.0.0';

// Initialize singletons
const budgetManager = new BudgetManager();
const cacheManager = new CacheManager();

let proxyEngine = null;
if (PROXY_PORT > 0) {
  proxyEngine = new ProxyEngine({
    budgetManager,
    cacheManager,
    port: PROXY_PORT,
    host: HOST
  });
}

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
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function serveStatic(req, res, pathname) {
  let safePath = pathname === '/' ? '/index.html' : pathname;
  safePath = path.normalize(safePath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(__dirname, 'public', safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found - DataSaver Pro by Ad3n1x');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600'
    });

    fs.createReadStream(filePath).pipe(res);
  });
}

const dashboardServer = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;
  const searchParams = reqUrl.searchParams;
  const localIp = getLocalIpAddress();
  const currentHost = req.headers.host || `${localIp}:${PORT}`;

  // Signature & Developer Identity Headers
  res.setHeader('X-Powered-By', 'DataSaver Pro (Engineered by Ad3n1x)');
  res.setHeader('X-Developer', 'Ad3n1x (https://github.com/Ad3n1x)');
  res.setHeader('X-Author', 'Ad3n1x');
  res.setHeader('X-Repository', 'https://github.com/Ad3n1x/datasaver-pro');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-DataSaver-Client, X-DataSaver-Dev, Accept, Save-Data');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. Cloud Web Surfer / Web Gateway Endpoint
  // Allows users to browse any site on the web with live data reduction
  if (pathname === '/browse') {
    let targetUrl = searchParams.get('url');
    const mode = searchParams.get('mode') || budgetManager.getEffectiveMode();

    if (!targetUrl) {
      res.writeHead(302, { Location: '/' });
      res.end();
      return;
    }

    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = 'https://' + targetUrl;
    }

    try {
      const remote = await fetchRemotePage(targetUrl);
      const contentType = (remote.headers['content-type'] || '').toLowerCase();

      // If HTML, optimize and strip bloatware
      if (contentType.includes('text/html')) {
        const rawHtml = remote.buffer.toString('utf8');
        const optimized = optimizeHtmlForWeb(rawHtml, remote.finalUrl || targetUrl, mode);

        // Record in budget & analytics
        budgetManager.recordRequest({
          host: new URL(targetUrl).hostname,
          path: new URL(targetUrl).pathname,
          action: 'OPTIMIZED',
          category: 'Web Surfer (Cloud)',
          downloaded: optimized.deliveredBytes,
          saved: optimized.savedBytes,
          status: 200
        });

        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'X-DataSaver-Original-Bytes': optimized.originalBytes,
          'X-DataSaver-Delivered-Bytes': optimized.deliveredBytes,
          'X-DataSaver-Savings-Pct': optimized.savingsPercentage + '%'
        });
        res.end(optimized.content);
      } else {
        // Direct asset
        res.writeHead(remote.statusCode, remote.headers);
        res.end(remote.buffer);
      }
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <div style="font-family:sans-serif;padding:30px;background:#0f172a;color:#f8fafc;min-height:100vh;">
          <h2 style="color:#ef4444;">DataSaver Pro - Cloud Gateway Error</h2>
          <p>Could not fetch target page <code>${targetUrl}</code>: ${err.message}</p>
          <a href="/" style="color:#34d399;">&larr; Return to Dashboard</a>
        </div>
      `);
    }
    return;
  }

  // 2. PAC (Proxy Auto-Config) Script
  // Automatically adapts to local IP or Cloud Web Host
  if (pathname === '/proxy.pac') {
    const proxyAddress = PROXY_PORT > 0 ? `${localIp}:${PROXY_PORT}` : currentHost;
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
  // Route external traffic through DataSaver Pro by Ad3n1x
  return "PROXY ${proxyAddress}; DIRECT";
}
`;
    res.writeHead(200, {
      'Content-Type': 'application/x-ns-proxy-autoconfig',
      'Cache-Control': 'no-cache'
    });
    res.end(pacScript);
    return;
  }

  // 3. Real-time Server-Sent Events (SSE)
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

  // 4. REST API: Summary Stats
  if (pathname === '/api/stats' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(budgetManager.getSummary()));
    return;
  }

  // 5. REST API: Recent Traffic Log
  if (pathname === '/api/traffic' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      requests: budgetManager.recentRequests,
      cache: cacheManager.getStats()
    }));
    return;
  }

  // 6. REST API: Update Settings
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

  // 7. REST API: Reset Stats
  if (pathname === '/api/reset' && req.method === 'POST') {
    budgetManager.resetStats();
    cacheManager.clear();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Counters reset successfully' }));
    return;
  }

  // 8. REST API: Device Setup & Developer Identity Info
  if (pathname === '/api/devices' && req.method === 'GET') {
    const isCloud = !!process.env.PORT;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      author: 'Ad3n1x',
      github: 'https://github.com/Ad3n1x',
      repository: 'https://github.com/Ad3n1x/datasaver-pro',
      version: '1.2.0',
      isCloud,
      localIp,
      currentHost,
      dashboardPort: PORT,
      proxyPort: PROXY_PORT,
      pacUrl: `http://${currentHost}/proxy.pac`,
      proxyAddress: PROXY_PORT > 0 ? `${localIp}:${PROXY_PORT}` : currentHost
    }));
    return;
  }

  // 9. REST API: Interactive URL Tester
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

  // 10. Static UI Files
  serveStatic(req, res, pathname);
});

// Start Servers
async function start() {
  try {
    if (proxyEngine) {
      await proxyEngine.start();
    }

    dashboardServer.listen(PORT, HOST, () => {
      const localIp = getLocalIpAddress();
      console.log('====================================================');
      console.log('🚀 DataSaver Pro - Architected by Ad3n1x');
      console.log('----------------------------------------------------');
      console.log(`📊 Web Dashboard:  http://localhost:${PORT}`);
      console.log(`🌐 Public / LAN:   http://${localIp}:${PORT}`);
      console.log(`🏄 Web Surfer:     http://${localIp}:${PORT}/browse?url=https://news.ycombinator.com`);
      if (PROXY_PORT > 0) {
        console.log(`🛡️  Proxy Engine:   ${localIp}:${PROXY_PORT}`);
      }
      console.log(`⚙️  PAC Auto-Config: http://${localIp}:${PORT}/proxy.pac`);
      console.log(`👤 Developer:      https://github.com/Ad3n1x`);
      console.log('====================================================');
    });
  } catch (err) {
    console.error('Fatal startup error:', err);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  budgetManager.save();
  process.exit(0);
});

process.on('SIGTERM', () => {
  budgetManager.save();
  process.exit(0);
});

start();
