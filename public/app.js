/**
 * DataSaver Pro - Web Dashboard Client Logic
 */

let currentMode = 'standard';
let trafficFilter = 'all';
let trafficChart = null;
let allTrafficRows = [];
let deviceInfo = null;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) {
    lucide.createIcons();
  }

  initChart();
  fetchInitialData();
  initSSE();
  fetchDeviceInfo();
  setupEventListeners();
});

function setupEventListeners() {
  // Device setup modal
  document.getElementById('btn-device-setup').addEventListener('click', () => {
    openModal('modal-devices');
  });

  // Budget settings modal
  document.getElementById('btn-budget-settings').addEventListener('click', () => {
    openModal('modal-budget');
  });

  // Reset stats
  document.getElementById('btn-reset-stats').addEventListener('click', async () => {
    if (confirm('Are you sure you want to reset all bandwidth counters and cache?')) {
      try {
        await fetch('/api/reset', { method: 'POST' });
        fetchInitialData();
      } catch (e) {
        console.error(e);
      }
    }
  });

  // Run URL savings test
  document.getElementById('btn-run-test').addEventListener('click', runUrlTest);
  document.getElementById('test-url-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') runUrlTest();
  });
}

function initChart() {
  const ctx = document.getElementById('traffic-chart').getContext('2d');
  trafficChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['-5h', '-4h', '-3h', '-2h', '-1h', 'Now'],
      datasets: [
        {
          label: 'Data Saved (MB)',
          data: [0, 0, 0, 0, 0, 0],
          borderColor: '#34d399',
          backgroundColor: 'rgba(52, 211, 153, 0.15)',
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 3
        },
        {
          label: 'Data Consumed (MB)',
          data: [0, 0, 0, 0, 0, 0],
          borderColor: '#22d3ee',
          backgroundColor: 'rgba(34, 211, 238, 0.05)',
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b', font: { size: 10 } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b', font: { size: 10 } },
          beginAtZero: true
        }
      }
    }
  });
}

async function fetchInitialData() {
  try {
    const statsRes = await fetch('/api/stats');
    const stats = await statsRes.json();
    updateDashboardStats(stats);

    const trafficRes = await fetch('/api/traffic');
    const trafficData = await trafficRes.json();
    allTrafficRows = trafficData.requests || [];
    renderTrafficTable();
  } catch (err) {
    console.error('Failed to fetch initial stats:', err);
  }
}

function initSSE() {
  const evtSource = new EventSource('/api/events');

  evtSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'init' || data.type === 'settings' || data.type === 'reset') {
        if (data.stats) updateDashboardStats(data.stats);
      } else if (data.type === 'request') {
        if (data.entry) {
          allTrafficRows.unshift(data.entry);
          if (allTrafficRows.length > 100) allTrafficRows.pop();
          renderTrafficTable();
        }
        if (data.stats) {
          updateDashboardStats(data.stats);
        }
      }
    } catch (e) {
      console.error('SSE parse error:', e);
    }
  };

  evtSource.onerror = () => {
    console.warn('SSE disconnected, retrying in 3s...');
  };
}

function updateDashboardStats(stats) {
  if (!stats) return;

  // Active Mode card highlights
  currentMode = stats.settings?.mode || 'standard';
  highlightModeCard(currentMode);

  // Hero numbers
  document.getElementById('metric-saved').textContent = formatBytes(stats.bytesSaved);
  document.getElementById('metric-downloaded').textContent = formatBytes(stats.bytesDownloaded);
  document.getElementById('metric-potential').textContent = formatBytes(stats.bytesDownloaded + stats.bytesSaved);
  document.getElementById('metric-percentage').textContent = stats.savingsPercentage + '%';
  document.getElementById('metric-total-requests').textContent = stats.requestsTotal.toLocaleString();
  document.getElementById('metric-blocked').textContent = stats.requestsBlocked.toLocaleString();
  document.getElementById('metric-cached').textContent = stats.requestsCached.toLocaleString();

  document.getElementById('metric-saved-sub').textContent = `${stats.savingsPercentage}% bandwidth eliminated`;

  // Budget progress bar
  const limitMB = stats.dataLimitMB || 2048;
  const currentMB = (stats.bytesDownloaded / (1024 * 1024)).toFixed(1);
  const percentUsed = Math.min(100, (currentMB / limitMB) * 100).toFixed(1);

  document.getElementById('budget-text').textContent = `${currentMB} MB / ${limitMB.toLocaleString()} MB`;
  document.getElementById('budget-percent-text').textContent = `(${percentUsed}%)`;

  const progressBar = document.getElementById('budget-progress-bar');
  progressBar.style.width = `${percentUsed}%`;

  const pill = document.getElementById('budget-status-pill');
  if (percentUsed >= 100) {
    pill.textContent = 'Quota Exceeded';
    pill.className = 'text-[10px] bg-red-500/20 text-red-400 font-semibold px-2 py-0.5 rounded-full border border-red-500/30';
    progressBar.className = 'h-full bg-red-500 rounded-full transition-all duration-500';
  } else if (percentUsed >= 80) {
    pill.textContent = 'Warning (80%+)';
    pill.className = 'text-[10px] bg-amber-500/20 text-amber-400 font-semibold px-2 py-0.5 rounded-full border border-amber-500/30';
    progressBar.className = 'h-full bg-amber-500 rounded-full transition-all duration-500';
  } else {
    pill.textContent = 'Healthy';
    pill.className = 'text-[10px] bg-emerald-500/20 text-emerald-300 font-semibold px-2 py-0.5 rounded-full border border-emerald-500/30';
    progressBar.className = 'h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500';
  }

  // Populate budget modal inputs
  const budgetInput = document.getElementById('input-budget-mb');
  if (budgetInput && !budgetInput.matches(':focus')) {
    budgetInput.value = limitMB;
  }
  const periodSelect = document.getElementById('select-budget-period');
  if (periodSelect) {
    periodSelect.value = stats.settings?.limitPeriod || 'daily';
  }
  const enforceCheck = document.getElementById('check-enforce-limit');
  if (enforceCheck) {
    enforceCheck.checked = !!stats.settings?.enforceLimit;
  }

  // Update Category Breakdown Bars
  renderCategoryBars(stats.categories || {}, stats.bytesSaved);

  // Update Chart if hourly data exists
  if (trafficChart && stats.hourlyHistory && stats.hourlyHistory.length > 0) {
    const labels = stats.hourlyHistory.map(h => h.hour.split('T')[1] || h.hour);
    const savedData = stats.hourlyHistory.map(h => (h.saved / (1024 * 1024)).toFixed(2));
    const downloadedData = stats.hourlyHistory.map(h => (h.downloaded / (1024 * 1024)).toFixed(2));

    trafficChart.data.labels = labels;
    trafficChart.data.datasets[0].data = savedData;
    trafficChart.data.datasets[1].data = downloadedData;
    trafficChart.update('none');
  }
}

function renderCategoryBars(categories, totalSaved) {
  const container = document.getElementById('category-bars');
  if (!container) return;

  const entries = Object.entries(categories);
  const total = totalSaved || entries.reduce((acc, [, val]) => acc + val, 0) || 1;

  if (entries.length === 0 || entries.every(([, val]) => val === 0)) {
    container.innerHTML = `
      <div class="text-xs text-slate-500 text-center py-4">
        Ready to filter ads, trackers, and media bloat.
      </div>
    `;
    return;
  }

  const categoryColors = {
    'Ad / Tracker': 'bg-emerald-400',
    'Background Telemetry': 'bg-purple-400',
    'Heavy Web Font': 'bg-cyan-400',
    'Heavy Media / GIF': 'bg-amber-400',
    'Cache Hit': 'bg-teal-400'
  };

  container.innerHTML = entries
    .map(([cat, bytes]) => {
      const pct = Math.min(100, ((bytes / total) * 100)).toFixed(0);
      const color = categoryColors[cat] || 'bg-blue-400';
      return `
        <div>
          <div class="flex justify-between text-xs mb-1">
            <span class="text-slate-300 font-medium">${cat}</span>
            <span class="text-slate-400 font-mono">${formatBytes(bytes)} (${pct}%)</span>
          </div>
          <div class="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div class="${color} h-full rounded-full transition-all duration-300" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    })
    .join('');
}

function highlightModeCard(mode) {
  ['standard', 'ultra', 'emergency'].forEach(m => {
    const card = document.getElementById(`card-mode-${m}`);
    if (card) {
      card.classList.remove('active-standard', 'active-ultra', 'active-emergency');
      if (m === mode) {
        card.classList.add(`active-${m}`);
      }
    }
  });
}

async function setSaverMode(mode) {
  try {
    highlightModeCard(mode);
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode })
    });
  } catch (err) {
    console.error('Failed to change mode:', err);
  }
}

function setTrafficFilter(filter) {
  trafficFilter = filter;
  ['all', 'blocked', 'cached'].forEach(f => {
    const btn = document.getElementById(`filter-${f}`);
    if (btn) {
      if (f === filter) {
        btn.className = 'px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 font-medium';
      } else {
        btn.className = 'px-2.5 py-1 rounded bg-slate-800 text-slate-400 hover:text-slate-200';
      }
    }
  });
  renderTrafficTable();
}

function renderTrafficTable() {
  const tbody = document.getElementById('traffic-table-body');
  if (!tbody) return;

  const filtered = allTrafficRows.filter(r => {
    if (trafficFilter === 'blocked') return r.action === 'BLOCKED';
    if (trafficFilter === 'cached') return r.action === 'CACHED';
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="py-8 text-center text-slate-500 font-sans">
          No traffic matching filter yet.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.slice(0, 30).map(row => {
    const timeStr = new Date(row.timestamp).toLocaleTimeString();

    let actionBadge = '';
    let bytesDisplay = '';

    if (row.action === 'BLOCKED') {
      actionBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/20 text-red-400 border border-red-500/30">BLOCKED</span>`;
      bytesDisplay = `<span class="text-emerald-400 font-bold">+${formatBytes(row.saved)} saved</span>`;
    } else if (row.action === 'CACHED') {
      actionBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">CACHED</span>`;
      bytesDisplay = `<span class="text-emerald-400 font-bold">+${formatBytes(row.saved)} saved</span>`;
    } else {
      actionBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">PASSED</span>`;
      bytesDisplay = `<span class="text-slate-400">${formatBytes(row.downloaded)}</span>`;
    }

    return `
      <tr class="hover:bg-slate-900/50 transition">
        <td class="py-2.5 px-4 text-slate-400 whitespace-nowrap">${timeStr}</td>
        <td class="py-2.5 px-4 font-semibold text-slate-200 whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px]" title="${row.host}">
          ${row.host}
        </td>
        <td class="py-2.5 px-4 text-slate-400 whitespace-nowrap">${row.category}</td>
        <td class="py-2.5 px-4 whitespace-nowrap">${actionBadge}</td>
        <td class="py-2.5 px-4 text-right whitespace-nowrap">${bytesDisplay}</td>
      </tr>
    `;
  }).join('');
}

async function runUrlTest() {
  const input = document.getElementById('test-url-input');
  const btn = document.getElementById('btn-run-test');
  const resultBox = document.getElementById('test-result-box');

  const targetUrl = input.value.trim();
  if (!targetUrl) return;

  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i><span>Analyzing...</span>`;
  if (window.lucide) lucide.createIcons();

  try {
    const res = await fetch('/api/test-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUrl, mode: currentMode })
    });
    const data = await res.json();

    if (data.success && data.result) {
      const r = data.result;
      resultBox.classList.remove('hidden');

      document.getElementById('test-original-size').textContent = r.originalFormatted;
      document.getElementById('test-optimized-size').textContent = r.optimizedFormatted;
      document.getElementById('test-saved-size').textContent = r.savedFormatted;
      document.getElementById('test-reduction-percent').textContent = `${r.savingsPercentage}% Saved`;

      const listContainer = document.getElementById('test-blocked-assets-container');
      const list = document.getElementById('test-blocked-list');

      if (r.blockedAssets && r.blockedAssets.length > 0) {
        listContainer.classList.remove('hidden');
        list.innerHTML = r.blockedAssets.map(item => `
          <li class="flex items-center justify-between py-1 border-b border-slate-900">
            <span class="truncate max-w-md font-mono text-[11px] text-slate-300">${item.url}</span>
            <span class="text-emerald-400 font-semibold font-mono text-[11px] whitespace-nowrap ml-2">~${formatBytes(item.savedBytes)}</span>
          </li>
        `).join('');
      } else {
        listContainer.classList.add('hidden');
      }
    } else {
      alert('Could not test URL: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Failed to connect to analyzer: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4"></i><span>Analyze Savings</span>`;
    if (window.lucide) lucide.createIcons();
  }
}

function fillTestUrl(url) {
  document.getElementById('test-url-input').value = url;
  runUrlTest();
}

function surfUrl(targetUrl) {
  const mode = currentMode || 'standard';
  window.location.href = `/browse?url=${encodeURIComponent(targetUrl)}&mode=${mode}`;
}

function handleSurfSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('input-surf-url');
  let url = input.value.trim();
  if (!url) return;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  surfUrl(url);
}

async function fetchDeviceInfo() {
  try {
    const res = await fetch('/api/devices');
    deviceInfo = await res.json();

    document.getElementById('pac-url-input-win').value = deviceInfo.pacUrl;
    document.getElementById('pac-url-input-android').value = deviceInfo.pacUrl;
    document.getElementById('pac-url-input-ios').value = deviceInfo.pacUrl;
  } catch (e) {
    console.error('Could not fetch device config:', e);
  }
}

async function saveBudgetSettings() {
  const mb = parseInt(document.getElementById('input-budget-mb').value, 10);
  const period = document.getElementById('select-budget-period').value;
  const enforce = document.getElementById('check-enforce-limit').checked;

  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dataLimitMB: mb,
        limitPeriod: period,
        enforceLimit: enforce
      })
    });
    closeModal('modal-budget');
  } catch (err) {
    alert('Error saving budget: ' + err.message);
  }
}

// Modal & Tab helpers
function openModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

function showDeviceTab(tab) {
  ['windows', 'android', 'ios', 'browser'].forEach(t => {
    const btn = document.getElementById(`tab-btn-${t}`);
    const content = document.getElementById(`tab-content-${t}`);
    if (t === tab) {
      btn.className = 'device-tab-btn pb-2 text-emerald-400 border-b-2 border-emerald-400';
      content.classList.remove('hidden');
    } else {
      btn.className = 'device-tab-btn pb-2 text-slate-400 hover:text-slate-200';
      content.classList.add('hidden');
    }
  });
}

function copyToClipboard(elementId) {
  const input = document.getElementById(elementId);
  if (!input) return;
  input.select();
  navigator.clipboard.writeText(input.value);

  // Temporary feedback
  const originalVal = input.value;
  input.value = '✓ Copied to clipboard!';
  setTimeout(() => {
    input.value = originalVal;
  }, 1200);
}

function formatBytes(bytes) {
  if (bytes === 0 || !bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
