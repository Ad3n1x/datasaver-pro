/**
 * DataSaver Pro - Smart Filter Rules Engine
 * High-performance domain and URL matching for ads, trackers, heavy fonts, video prefetch, and telemetry.
 */

const AD_AND_TRACKER_DOMAINS = new Set([
  // Google Ads & Analytics
  'doubleclick.net', 'adservice.google.com', 'pagead2.googlesyndication.com',
  'googleads.g.doubleclick.net', 'google-analytics.com', 'analytics.google.com',
  'stats.g.doubleclick.net', 'partner.googleadservices.com', 'afs.googlesyndication.com',
  'ads.google.com', 'ad.doubleclick.net', 'securepubads.g.doubleclick.net',

  // Meta / Facebook Tracking
  'connect.facebook.net', 'pixel.facebook.com', 'an.facebook.com',
  'graph.facebook.com/tr', 'analytics.facebook.com',

  // Major Ad Exchanges & Networks
  'criteo.com', 'criteo.net', 'adnxs.com', 'adsystem.com',
  'amazon-adsystem.com', 'aax.amazon-adsystem.com', 'rubiconproject.com',
  'pubmatic.com', 'openx.net', 'smartadserver.com', 'bidswitch.net',
  'casalemedia.com', 'advertising.com', 'moatads.com', 'adroll.com',
  'outbrain.com', 'taboola.com', 'revcontent.com', 'zemanta.com',
  'mgid.com', 'infolinks.com', 'popads.net', 'zergnet.com',
  'adblade.com', 'mediavine.com', 'sharethrough.com', 'sovrn.com',
  'indexexchange.com', 'yieldmo.com', 'undertone.com', 'exponential.com',
  'adtechus.com', 'tribalfusion.com', 'conversantmedia.com',

  // Mobile Ad Networks
  'applovin.com', 'unityads.unity3d.com', 'vungle.com', 'ironsrc.com',
  'adcolony.com', 'chartboost.com', 'inmobi.com', 'fyber.com',
  'supersonicads.com', 'tapjoy.com', 'mintegral.com', 'liftoff.io',

  // Analytics & User Trackers
  'hotjar.com', 'script.hotjar.com', 'static.hotjar.com',
  'fullstory.com', 'segment.io', 'api.segment.io', 'cdn.segment.com',
  'mixpanel.com', 'api.mixpanel.com', 'amplitude.com', 'api.amplitude.com',
  'scorecardresearch.com', 'sb.scorecardresearch.com',
  'quantserve.com', 'pixel.quantserve.com', 'chartbeat.com', 'static.chartbeat.com',
  'crazyegg.com', 'script.crazyegg.com', 'heap.io', 'heapanalytics.com',
  'mouseflow.com', 'inspectlet.com', 'clarity.ms', 'www.clarity.ms',
  'branch.io', 'api.branch.io', 'api2.branch.io',
  'appsflyer.com', 't.appsflyer.com', 'adjust.com', 'app.adjust.com',
  'flurry.com', 'data.flurry.com', 'singular.net', 'branch-metrics.com',

  // Social Tracking & Widgets (High Bandwidth)
  'platform.twitter.com', 'syndication.twitter.com', 'analytics.twitter.com',
  'static.ads-twitter.com', 'ads-api.twitter.com',
  'px.ads.linkedin.com', 'snap.licdn.com', 'analytics.tiktok.com',
  'tr.snapchat.com', 'sc-static.net', 'ads.pinterest.com', 'ct.pinterest.com'
]);

const TELEMETRY_DOMAINS = new Set([
  // Windows & Microsoft Background Telemetry
  'v10.events.data.microsoft.com', 'v20.events.data.microsoft.com',
  'telemetry.microsoft.com', 'watson.telemetry.microsoft.com',
  'diagassets.microsoft.com', 'settings-win.data.microsoft.com',
  'feedback.windows.com', 'client.wns.windows.com',

  // OEM & Mobile Telemetry
  'telemetry.samsung.com', 'samsungadhub.com', 'diag.meethue.com',
  'metrics.icloud.com', 'diagnostics.apple.com', 'iadsdk.apple.com'
]);

const HEAVY_FONT_DOMAINS = new Set([
  'fonts.googleapis.com', 'fonts.gstatic.com',
  'use.typekit.net', 'fast.fonts.net', 'fonts.adobe.com',
  'webfonts.fontslive.com', 'f.fontdeck.com'
]);

const HEAVY_MEDIA_DOMAINS = new Set([
  'giphy.com', 'media.giphy.com', 'i.giphy.com',
  'tenor.com', 'media.tenor.com', 'c.tenor.com',
  'gfycat.com', 'v.redd.it', 'packaged-media.redd.it'
]);

// Subdomain & keyword heuristics
const AD_KEYWORD_PATTERNS = [
  /^ad(s|server|service|click|counter|zone|track|box|daemon)?\./i,
  /^pixel\./i,
  /^banner(s)?\./i,
  /^telemetry\./i,
  /^tracker(s)?\./i,
  /^stat(s)?\./i,
  /^metrics?\./i,
  /^affiliate(s)?\./i,
  /^pagead/i
];

/**
 * Normalizes hostnames (removes port, trailing dots, converts to lowercase)
 */
function cleanHostname(host) {
  if (!host) return '';
  const withoutPort = host.split(':')[0].trim().toLowerCase();
  return withoutPort.replace(/\.$/, '');
}

/**
 * Checks if a domain or its parent matches the target set
 */
function domainInSet(hostname, set) {
  if (set.has(hostname)) return true;
  const parts = hostname.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join('.');
    if (set.has(parent)) return true;
  }
  return false;
}

/**
 * Checks if a hostname matches heuristic ad/tracker patterns
 */
function matchesKeywordPattern(hostname) {
  return AD_KEYWORD_PATTERNS.some(pattern => pattern.test(hostname));
}

/**
 * Evaluates whether a network request should be blocked or modified
 * based on the active saver mode.
 *
 * Modes:
 * - 'standard': Ads, trackers, analytics, telemetry blocked.
 * - 'ultra': Standard + Heavy Fonts + Gifs/Autoplay Media CDN + Aggressive heuristics.
 * - 'emergency': Ultra + All non-essential content blocked (Max data savings).
 * - 'custom': Controlled by custom settings object.
 */
function evaluateRequest(hostname, pathname = '', settings = { mode: 'standard' }) {
  const host = cleanHostname(hostname);
  const mode = settings.mode || 'standard';

  // Check custom toggles or default to mode behaviors
  const blockAds = settings.blockAds ?? true;
  const blockTrackers = settings.blockTrackers ?? true;
  const blockTelemetry = settings.blockTelemetry ?? true;
  const blockFonts = settings.blockFonts ?? (mode === 'ultra' || mode === 'emergency');
  const blockHeavyMedia = settings.blockHeavyMedia ?? (mode === 'ultra' || mode === 'emergency');
  const emergencyMode = mode === 'emergency';

  // 1. Ads & Trackers
  if ((blockAds || blockTrackers) && domainInSet(host, AD_AND_TRACKER_DOMAINS)) {
    return {
      blocked: true,
      category: 'Ad / Tracker',
      reason: `Blocked known tracking & ad network (${host})`,
      estimatedSavingsBytes: 45000 // Average savings per ad request
    };
  }

  // 2. Keyword heuristic ad matching
  if (blockAds && matchesKeywordPattern(host)) {
    // Whitelist check for essential services like google.com, apple.com
    const isExcluded = ['google.com', 'apple.com', 'microsoft.com', 'github.com'].some(domain => host === domain || host.endsWith('.' + domain));
    if (!isExcluded) {
      return {
        blocked: true,
        category: 'Ad / Tracker (Heuristic)',
        reason: `Matched ad/analytics subdomain pattern (${host})`,
        estimatedSavingsBytes: 30000
      };
    }
  }

  // 3. Background OS & App Telemetry
  if (blockTelemetry && domainInSet(host, TELEMETRY_DOMAINS)) {
    return {
      blocked: true,
      category: 'Background Telemetry',
      reason: `Blocked non-essential OS/device telemetry bleed (${host})`,
      estimatedSavingsBytes: 25000
    };
  }

  // 4. Heavy Web Fonts (saves 200KB - 1.5MB per site)
  if (blockFonts && domainInSet(host, HEAVY_FONT_DOMAINS)) {
    return {
      blocked: true,
      category: 'Heavy Web Font',
      reason: `Blocked remote web font asset to conserve data (${host})`,
      estimatedSavingsBytes: 180000
    };
  }

  // 5. Heavy Gifs / Pre-buffered Video CDNs
  if (blockHeavyMedia && domainInSet(host, HEAVY_MEDIA_DOMAINS)) {
    return {
      blocked: true,
      category: 'Heavy Media / GIF',
      reason: `Blocked heavy media pre-buffer CDN (${host})`,
      estimatedSavingsBytes: 1500000
    };
  }

  // 6. Emergency Extreme Mode: Block media extensions by pathname if plain HTTP
  if (emergencyMode && pathname) {
    const ext = pathname.split('.').pop()?.split('?')[0]?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'mov', 'avi', 'mp3', 'wav', 'woff', 'woff2', 'ttf'].includes(ext)) {
      return {
        blocked: true,
        category: 'Emergency Media Blocker',
        reason: `Emergency mode active: suppressed media file .${ext}`,
        estimatedSavingsBytes: 250000
      };
    }
  }

  return {
    blocked: false,
    category: 'Allowed',
    reason: 'Permitted traffic'
  };
}

module.exports = {
  evaluateRequest,
  cleanHostname,
  AD_AND_TRACKER_DOMAINS,
  TELEMETRY_DOMAINS,
  HEAVY_FONT_DOMAINS,
  HEAVY_MEDIA_DOMAINS
};
