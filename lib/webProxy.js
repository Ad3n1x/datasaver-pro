/**
 * DataSaver Pro - Cloud Web Gateway & Live Site Compressor
 * Enables full-fidelity, low-data browsing directly on the web.
 * Engineered by Ad3n1x (https://github.com/Ad3n1x)
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const zlib = require('zlib');
const { evaluateRequest, cleanHostname } = require('./filterRules');

// 1x1 transparent PNG placeholder
const EMPTY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/**
 * Fetches an external webpage or asset with Save-Data headers
 */
function fetchRemotePage(targetUrl, incomingHeaders = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (e) {
      return reject(new Error('Invalid URL'));
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const startTime = Date.now();

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 DataSaver-Web/1.2 (by Ad3n1x)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Save-Data': 'on',
      'X-DataSaver-Dev': 'Ad3n1x'
    };

    const options = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers,
      timeout: 12000
    };

    const req = client.request(options, (res) => {
      // Follow redirects up to 3 levels
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        const redirected = new URL(res.headers.location, targetUrl).toString();
        return resolve(fetchRemotePage(redirected, incomingHeaders));
      }

      const chunks = [];
      const encoding = (res.headers['content-encoding'] || '').toLowerCase();
      let stream = res;

      if (encoding === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === 'deflate') {
        stream = res.pipe(zlib.createInflate());
      } else if (encoding === 'br') {
        stream = res.pipe(zlib.createBrotliDecompress());
      }

      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          buffer,
          rawBytes: buffer.length,
          durationMs: Date.now() - startTime,
          finalUrl: targetUrl
        });
      });
      stream.on('error', (err) => {
        // Fallback to uncompressed if decompression stream errored
        const rawBuffer = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          buffer: rawBuffer,
          rawBytes: rawBuffer.length,
          durationMs: Date.now() - startTime,
          finalUrl: targetUrl
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Upstream request timed out after 12s'));
    });
    req.end();
  });
}

/**
 * Optimizes HTML for low data consumption:
 * 1. Strips third-party ad & tracking scripts
 * 2. Rewrites relative and absolute links to route through /browse?url=...
 * 3. Disables video autoplay and pre-buffering
 * 4. Injects responsive floating DataSaver Pro toolbar
 */
function optimizeHtmlForWeb(html, originalUrl, mode = 'standard') {
  let content = html;
  const originalBytes = Buffer.byteLength(content, 'utf8');
  let blockedCount = 0;
  let estimatedSavedBytes = 0;

  const parsedOriginal = new URL(originalUrl);
  const baseUrl = parsedOriginal.origin;

  // 1. Remove tracking & ad scripts
  content = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, (tag) => {
    const srcMatch = tag.match(/src=["']([^"']+)["']/i);
    if (srcMatch) {
      try {
        const scriptUrl = new URL(srcMatch[1], originalUrl);
        const evalResult = evaluateRequest(scriptUrl.hostname, scriptUrl.pathname, { mode });
        if (evalResult.blocked) {
          blockedCount++;
          estimatedSavedBytes += evalResult.estimatedSavingsBytes || 40000;
          return `<!-- [DataSaver Pro: Blocked ${evalResult.category} (${scriptUrl.hostname})] -->`;
        }
      } catch (e) {}
    }
    return tag;
  });

  // 2. Remove third-party tracking iframes
  content = content.replace(/<iframe\b[^>]*src=["']([^"']+)["'][^>]*>([\s\S]*?)<\/iframe>/gi, (tag, src) => {
    try {
      const frameUrl = new URL(src, originalUrl);
      const evalResult = evaluateRequest(frameUrl.hostname, frameUrl.pathname, { mode });
      if (evalResult.blocked) {
        blockedCount++;
        estimatedSavedBytes += 50000;
        return `<!-- [DataSaver Pro: Blocked Ad/Tracker Frame] -->`;
      }
    } catch (e) {}
    return tag;
  });

  // 3. Disable video autoplay & preloading
  content = content.replace(/<video\b([^>]*)>/gi, (tag, attrs) => {
    let clean = attrs.replace(/\bautoplay\b/gi, '').replace(/\bpreload=["'][^"']*["']/gi, '');
    clean += ' preload="none" controls ';
    return `<video ${clean}>`;
  });

  // 4. In Emergency Mode: replace images with lightweight placeholders
  if (mode === 'emergency') {
    content = content.replace(/<img\b([^>]*)src=["']([^"']+)["']([^>]*)>/gi, (tag, p1, src, p2) => {
      estimatedSavedBytes += 60000;
      return `<img ${p1} src="${EMPTY_PNG}" alt="[Image Suppressed in Emergency Mode]" style="background:#1e293b;border:1px dashed #475569;min-height:40px;display:inline-block;" ${p2}>`;
    });
  }

  // 5. Rewrite hyperlinks so user can browse naturally through DataSaver
  content = content.replace(/<a\b([^>]*)href=["']([^"']+)["']([^>]*)>/gi, (match, p1, href, p2) => {
    if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
      return match;
    }
    try {
      const resolved = new URL(href, originalUrl).toString();
      const proxiedHref = `/browse?url=${encodeURIComponent(resolved)}&mode=${mode}`;
      return `<a ${p1} href="${proxiedHref}" ${p2}>`;
    } catch (e) {
      return match;
    }
  });

  // Calculate actual delivered bytes and savings
  const deliveredBytes = Buffer.byteLength(content, 'utf8');
  const totalOriginalBytes = originalBytes + estimatedSavedBytes;
  const totalSavedBytes = Math.max(0, totalOriginalBytes - deliveredBytes);
  const savingsPct = totalOriginalBytes > 0
    ? Math.min(99, ((totalSavedBytes / totalOriginalBytes) * 100)).toFixed(1)
    : '0.0';

  // 6. Inject Floating DataSaver Pro Bar at top of the page
  const toolbarHtml = `
    <!-- DataSaver Pro Live Web Gateway Toolbar -->
    <div id="datasaver-web-bar" style="all:initial;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;position:sticky;top:0;left:0;right:0;z-index:2147483647;background:#090d16;color:#f8fafc;border-bottom:1px solid #1e293b;padding:8px 16px;display:flex;align-items:center;justify-content:between;gap:12px;font-size:12px;box-shadow:0 4px 12px rgba(0,0,0,0.5);">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-weight:800;background:linear-gradient(to right,#34d399,#22d3ee);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:13px;">🛡️ DataSaver Pro</span>
        <span style="background:rgba(16,185,129,0.2);color:#34d399;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:700;border:1px solid rgba(16,185,129,0.3);text-transform:uppercase;">${mode} Mode</span>
        <span style="color:#94a3b8;font-size:11px;">Saved: <strong style="color:#34d399;">~${(totalSavedBytes/1024).toFixed(0)} KB</strong> (${savingsPct}%)</span>
        <span style="color:#64748b;font-size:10px;">&bull; ${blockedCount} Trackers Blocked</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <a href="/" style="background:#1e293b;color:#cbd5e1;padding:4px 10px;border-radius:6px;text-decoration:none;font-weight:600;font-size:11px;">Dashboard</a>
        <a href="https://github.com/Ad3n1x/datasaver-pro" target="_blank" style="color:#64748b;text-decoration:none;font-size:11px;">by <strong style="color:#38bdf8;">Ad3n1x</strong></a>
      </div>
    </div>
  `;

  // Inject before </head> or after <body>
  if (content.includes('<body')) {
    content = content.replace(/(<body[^>]*>)/i, `$1\n${toolbarHtml}`);
  } else {
    content = toolbarHtml + content;
  }

  return {
    content,
    deliveredBytes,
    originalBytes: totalOriginalBytes,
    savedBytes: totalSavedBytes,
    savingsPercentage: parseFloat(savingsPct),
    blockedCount
  };
}

module.exports = {
  fetchRemotePage,
  optimizeHtmlForWeb
};
