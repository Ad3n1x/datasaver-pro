/**
 * DataSaver Pro - Core Proxy Engine
 * Intercepts HTTP and HTTPS (CONNECT) traffic, enforces data saver rules, blocks ad/trackers,
 * and tracks bandwidth savings across all connected devices.
 */

const http = require('http');
const net = require('net');
const url = require('url');
const zlib = require('zlib');
const { evaluateRequest, cleanHostname } = require('./filterRules');

// 1x1 transparent PNG for replacing blocked images in emergency mode (68 bytes)
const EMPTY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

class ProxyEngine {
  constructor({ budgetManager, cacheManager, port = 8888, host = '0.0.0.0' }) {
    this.budgetManager = budgetManager;
    this.cacheManager = cacheManager;
    this.port = port;
    this.host = host;
    this.server = null;
    this.activeConnections = 0;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleHttpRequest(req, res));
      this.server.on('connect', (req, clientSocket, head) => this.handleConnectRequest(req, clientSocket, head));

      this.server.on('error', (err) => {
        console.error('[ProxyEngine] Server error:', err.message);
        reject(err);
      });

      this.server.listen(this.port, this.host, () => {
        console.log(`[ProxyEngine] DataSaver Proxy listening on ${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(resolve);
      } else {
        resolve();
      }
    });
  }

  /**
   * Handles HTTPS CONNECT tunneling.
   * This is where modern devices send 95%+ of their web traffic.
   */
  handleConnectRequest(req, clientSocket, head) {
    const [targetHost, targetPortStr] = (req.url || '').split(':');
    const targetPort = parseInt(targetPortStr, 10) || 443;
    const cleanHost = cleanHostname(targetHost);

    const currentMode = this.budgetManager.getEffectiveMode();
    const settings = {
      ...this.budgetManager.state.settings,
      mode: currentMode
    };

    // Check quota hard cutoff if enabled
    if (this.budgetManager.state.settings.enforceLimit && this.budgetManager.isQuotaExceeded()) {
      // Only permit critical whitelist domains or block
      clientSocket.write('HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\n[DataSaver Pro] Data Quota Exceeded.\r\n');
      clientSocket.destroy();
      this.budgetManager.recordRequest({
        host: cleanHost,
        path: ':443',
        action: 'BLOCKED',
        category: 'Quota Enforcement',
        downloaded: 0,
        saved: 50000,
        status: 403
      });
      return;
    }

    // Evaluate rules
    const rule = evaluateRequest(cleanHost, '', settings);
    if (rule.blocked) {
      // Block connection before TLS handshake saves ~40KB - 2MB
      clientSocket.write('HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nBlocked by DataSaver Pro\r\n');
      clientSocket.destroy();

      this.budgetManager.recordRequest({
        host: cleanHost,
        path: ':443 (HTTPS)',
        action: 'BLOCKED',
        category: rule.category,
        downloaded: 0,
        saved: rule.estimatedSavingsBytes || 45000,
        status: 403
      });
      return;
    }

    // Connect to upstream destination
    this.activeConnections++;
    const serverSocket = net.connect(targetPort, cleanHost, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\nProxy-Agent: DataSaver-Pro\r\n\r\n');
      if (head && head.length > 0) {
        serverSocket.write(head);
      }
    });

    let bytesDownloaded = 0;
    let bytesUploaded = 0;

    // Track throughput
    serverSocket.on('data', (chunk) => {
      bytesDownloaded += chunk.length;
      clientSocket.write(chunk);
    });

    clientSocket.on('data', (chunk) => {
      bytesUploaded += chunk.length;
      serverSocket.write(chunk);
    });

    const cleanup = () => {
      this.activeConnections = Math.max(0, this.activeConnections - 1);
      this.budgetManager.recordRequest({
        host: cleanHost,
        path: ':443 (HTTPS)',
        action: 'PASSED',
        category: 'Encrypted Stream',
        downloaded: bytesDownloaded,
        uploaded: bytesUploaded,
        saved: 0,
        status: 200
      });
    };

    serverSocket.on('end', () => {
      clientSocket.end();
      cleanup();
    });

    clientSocket.on('end', () => {
      serverSocket.end();
    });

    serverSocket.on('error', (err) => {
      clientSocket.destroy();
      this.activeConnections = Math.max(0, this.activeConnections - 1);
    });

    clientSocket.on('error', (err) => {
      serverSocket.destroy();
      this.activeConnections = Math.max(0, this.activeConnections - 1);
    });
  }

  /**
   * Handles standard HTTP proxy requests.
   * Allows injecting Save-Data headers, caching, and image replacement.
   */
  handleHttpRequest(req, res) {
    let targetUrl;
    try {
      targetUrl = req.url.startsWith('http://') || req.url.startsWith('https://')
        ? new URL(req.url)
        : new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    } catch (e) {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }

    const host = cleanHostname(targetUrl.hostname || req.headers.host);
    const pathname = targetUrl.pathname || '/';
    const currentMode = this.budgetManager.getEffectiveMode();
    const settings = {
      ...this.budgetManager.state.settings,
      mode: currentMode
    };

    // Check rules
    const rule = evaluateRequest(host, pathname, settings);
    if (rule.blocked) {
      if (pathname.match(/\.(png|jpe?g|gif|webp|svg)$/i)) {
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Length': EMPTY_PNG.length,
          'X-DataSaver-Action': 'Image-Replaced'
        });
        res.end(EMPTY_PNG);
      } else {
        res.writeHead(403, { 'Content-Type': 'text/plain', 'X-DataSaver-Action': 'Blocked' });
        res.end(`Blocked by DataSaver Pro: ${rule.reason}`);
      }

      this.budgetManager.recordRequest({
        host,
        path: pathname,
        action: 'BLOCKED',
        category: rule.category,
        downloaded: 0,
        saved: rule.estimatedSavingsBytes || 35000,
        status: 403
      });
      return;
    }

    // Check Cache
    const cached = this.cacheManager.get(req.method, req.url);
    if (cached) {
      res.writeHead(200, cached.headers);
      res.end(cached.data);

      this.budgetManager.recordRequest({
        host,
        path: pathname,
        action: 'CACHED',
        category: 'Cache Hit',
        downloaded: 0,
        saved: cached.size,
        status: 200
      });
      return;
    }

    // Prepare outgoing request
    const outgoingHeaders = { ...req.headers };
    // Inject Data Saver headers!
    outgoingHeaders['save-data'] = 'on';
    outgoingHeaders['x-datasaver'] = '1';

    // Strip proxy-specific headers
    delete outgoingHeaders['proxy-connection'];
    delete outgoingHeaders['proxy-authorization'];

    const targetPort = targetUrl.port || 80;
    const options = {
      hostname: host,
      port: targetPort,
      path: targetUrl.pathname + targetUrl.search,
      method: req.method,
      headers: outgoingHeaders
    };

    const proxyReq = http.request(options, (proxyRes) => {
      const responseChunks = [];
      let totalBytes = 0;

      res.writeHead(proxyRes.statusCode, proxyRes.headers);

      proxyRes.on('data', (chunk) => {
        totalBytes += chunk.length;
        responseChunks.push(chunk);
        res.write(chunk);
      });

      proxyRes.on('end', () => {
        res.end();
        const fullBuffer = Buffer.concat(responseChunks);

        // Store in cache if cacheable
        this.cacheManager.set(req.method, req.url, proxyRes.statusCode, proxyRes.headers, fullBuffer);

        this.budgetManager.recordRequest({
          host,
          path: pathname,
          action: 'PASSED',
          category: 'Web Asset',
          downloaded: totalBytes,
          saved: 0,
          status: proxyRes.statusCode
        });
      });
    });

    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(`DataSaver Pro Bad Gateway: ${err.message}`);
    });

    req.pipe(proxyReq);
  }
}

module.exports = ProxyEngine;
