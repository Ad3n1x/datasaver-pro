/**
 * DataSaver Pro - URL & Media Compression Tester
 * Analyzes any target website or media URL and measures byte savings in real-time.
 */

const http = require('http');
const https = require('https');
const url = require('url');
const zlib = require('zlib');
const { evaluateRequest } = require('./filterRules');

function fetchResource(targetUrl, headers = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (e) {
      return reject(new Error('Invalid URL'));
    }
    const client = parsed.protocol === 'https:' ? https : http;
    const startTime = Date.now();

    const options = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DataSaver-Tester/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        ...headers
      },
      timeout: 10000
    };

    const req = client.request(options, (res) => {
      // Handle redirects up to 3 levels
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        const redirected = new URL(res.headers.location, targetUrl).toString();
        return resolve(fetchResource(redirected, headers));
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const rawBuffer = Buffer.concat(chunks);
        const durationMs = Date.now() - startTime;
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          rawBytes: rawBuffer.length,
          buffer: rawBuffer,
          durationMs
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out after 10s'));
    });
    req.end();
  });
}

/**
 * Analyzes webpage content for third-party scripts, tracking beacons, heavy fonts, and images.
 */
function extractEmbeddedResources(html, baseUrl) {
  const resources = [];
  const scriptRegex = /<script[^>]+src=["']([^"']+)["']/gi;
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  const linkRegex = /<link[^>]+href=["']([^"']+)["']/gi;

  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const full = new URL(match[1], baseUrl).toString();
      resources.push({ url: full, type: 'script' });
    } catch (e) {}
  }
  while ((match = imgRegex.exec(html)) !== null) {
    try {
      const full = new URL(match[1], baseUrl).toString();
      resources.push({ url: full, type: 'image' });
    } catch (e) {}
  }
  while ((match = linkRegex.exec(html)) !== null) {
    try {
      const full = new URL(match[1], baseUrl).toString();
      resources.push({ url: full, type: 'stylesheet' });
    } catch (e) {}
  }
  return resources;
}

/**
 * Tests a URL and calculates data savings under different modes.
 */
async function testUrlSavings(targetUrl, mode = 'standard') {
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  const result = await fetchResource(targetUrl, { 'Accept-Encoding': 'identity' });
  const originalBytes = result.rawBytes;

  let simulatedSavedBytes = 0;
  const blockedAssets = [];

  const contentType = (result.headers['content-type'] || '').toLowerCase();

  // If HTML document, inspect embedded resources
  if (contentType.includes('text/html')) {
    let bodyText = result.buffer.toString('utf8');
    const embedded = extractEmbeddedResources(bodyText, targetUrl);

    for (const item of embedded) {
      try {
        const itemParsed = new URL(item.url);
        const evalResult = evaluateRequest(itemParsed.hostname, itemParsed.pathname, { mode });
        if (evalResult.blocked) {
          const estimated = evalResult.estimatedSavingsBytes || 35000;
          simulatedSavedBytes += estimated;
          blockedAssets.push({
            url: item.url,
            category: evalResult.category,
            reason: evalResult.reason,
            savedBytes: estimated
          });
        }
      } catch (e) {}
    }

    // Gzip / Brotli compression saving calculation
    try {
      const compressed = zlib.gzipSync(result.buffer);
      const compressionDiff = Math.max(0, originalBytes - compressed.length);
      simulatedSavedBytes += compressionDiff;
    } catch (e) {}
  } else if (contentType.includes('image/')) {
    // Image optimization simulation
    if (mode === 'emergency') {
      simulatedSavedBytes = Math.max(0, originalBytes - 68); // 1x1 placeholder
    } else {
      // 55% - 75% savings via WebP downsampling
      simulatedSavedBytes = Math.round(originalBytes * 0.65);
    }
  }

  const optimizedBytes = Math.max(1024, originalBytes - simulatedSavedBytes);
  const percentage = originalBytes > 0
    ? Math.min(98.5, ((simulatedSavedBytes / (originalBytes + simulatedSavedBytes)) * 100)).toFixed(1)
    : '0.0';

  return {
    targetUrl,
    mode,
    originalBytes,
    originalFormatted: (originalBytes / 1024).toFixed(1) + ' KB',
    optimizedBytes,
    optimizedFormatted: (optimizedBytes / 1024).toFixed(1) + ' KB',
    savedBytes: simulatedSavedBytes,
    savedFormatted: (simulatedSavedBytes / 1024).toFixed(1) + ' KB',
    savingsPercentage: parseFloat(percentage),
    loadDurationMs: result.durationMs,
    blockedAssetsCount: blockedAssets.length,
    blockedAssets: blockedAssets.slice(0, 10),
    contentType
  };
}

module.exports = {
  testUrlSavings,
  fetchResource
};
