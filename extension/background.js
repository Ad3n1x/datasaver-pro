/**
 * DataSaver Pro - Chrome / Edge Extension Background Service Worker
 * Injects Save-Data headers into all outgoing web requests.
 */

const RULE_ID_SAVEDATA = 1;
const RULE_ID_ACCEPT = 2;

async function setupDataSaverRules() {
  const rules = [
    {
      id: RULE_ID_SAVEDATA,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Save-Data', operation: 'set', value: 'on' },
          { header: 'X-DataSaver-Client', operation: 'set', value: 'extension' }
        ]
      },
      condition: {
        urlFilter: '*',
        resourceTypes: ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest', 'ping', 'media', 'websocket', 'other']
      }
    }
  ];

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [RULE_ID_SAVEDATA, RULE_ID_ACCEPT],
      addRules: rules
    });
    console.log('[DataSaver Pro Extension] Save-Data network rules activated.');
  } catch (err) {
    console.error('Failed to update declarativeNetRequest rules:', err);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  setupDataSaverRules();
  chrome.storage.local.set({
    mode: 'standard',
    blockAutoplay: true,
    stripHeavyFonts: false
  });
});

chrome.runtime.onStartup.addListener(() => {
  setupDataSaverRules();
});
