# 🛡️ DataSaver Pro — Universal Bandwidth Optimizer & Data Reducer

**DataSaver Pro** is an intelligent, cross-platform application and local network gateway designed to significantly reduce internet data consumption **everywhere** — across computers, phones, tablets, and web browsers.

By combining an on-the-fly network proxy, telemetry and ad/tracker suppression, aggressive HTTP caching, automated video autoplay neutralization, and a smart client extension, DataSaver Pro cuts bandwidth consumption by **50% to over 95%**.

---

## 🌟 Why Data Usage Explodes & How DataSaver Pro Fixes It

| The Hidden Data Hog | Impact on Your Data Plan | How DataSaver Pro Fixes It |
|---|---|---|
| **Ad Networks & Tracking Beacons** | 40% – 60% of total web bandwidth | Intercepts & terminates connection before TLS handshake, preventing MBs of tracking scripts from downloading. |
| **Video Autoplay & Pre-buffering** | 30MB – 150MB per video on feeds | Strips `autoplay` and forces `preload="none"`, saving hundreds of megabytes on social feeds and news sites. |
| **Heavy Remote Web Fonts** | 300KB – 2MB per new page | Suppresses non-critical Google Fonts & Typekit files in Ultra/Emergency modes, falling back to clean system fonts. |
| **Redundant Asset Downloads** | Repeated downloads of common assets | Aggressive in-memory and disk cache layer serves static resources instantly with synthetic cache hits. |
| **Background OS & App Telemetry** | Silent bandwidth bleed on hotspots | Blocks background diagnostics and telemetry endpoints (Windows, Samsung, Apple). |
| **`Save-Data: on` Header Injection** | Ignored by default in many browsers | Automatically injects the standard HTTP Client Hint `Save-Data: on` so compatible servers return lightweight assets. |

---

## ⚡ 3 Adaptive Optimization Modes

1. **🚀 Standard Saver (~50% Data Reduction)**
   - Blocks known ad networks, analytics beacons, and telemetry bleed.
   - Injects `Save-Data: on` Client Hints.
   - Reuses static assets via local cache.
   - Keeps complete visual fidelity and browsing experience intact.

2. **🔥 Ultra Saver (~80% Data Reduction)**
   - Everything in Standard Saver.
   - Suppresses heavy custom web fonts (Google Fonts, Typekit).
   - Blocks heavy animated GIF providers and video pre-buffer CDNs.
   - Ideal for mobile hotspots, tethering, and hotel Wi-Fi.

3. **🛑 Emergency Text Mode (95%+ Data Reduction)**
   - Extreme bandwidth conservation.
   - Replaces heavy images with 68-byte transparent placeholders.
   - Blocks videos, audio, and heavy media.
   - Delivers pure text and essential styling — perfect for roaming, near-zero account balances, or satellite links.

---

## 🚀 Quick Start

### 1. Start the DataSaver Pro Gateway
No external npm install required (runs with standard Node.js runtime):

```bash
node server.js
```
*(Or `npm start`)*

Once running, you will see:
```text
====================================================
🚀 DataSaver Pro - Active & Saving Bandwidth!
----------------------------------------------------
📊 Dashboard UI:    http://localhost:3000
🌐 Network Access:  http://192.168.x.x:3000
🛡️  Proxy Engine:    192.168.x.x:8888
⚙️  PAC Auto-Config: http://192.168.x.x:3000/proxy.pac
====================================================
```

Open **`http://localhost:3000`** in your browser to view the interactive live dashboard!

---

## 📱 How to Save Data on Every Device

DataSaver Pro exposes a **Proxy Auto-Configuration (PAC)** file and a local HTTP proxy that any device on your local network or computer can use.

### 🪟 Windows (PC / Laptop)
1. Open **Settings** &gt; **Network & internet** &gt; **Proxy**.
2. Under **Automatic proxy setup**, turn **Use setup script** ON.
3. In **Script address**, paste:
   ```text
   http://127.0.0.1:3000/proxy.pac
   ```
4. Click **Save**. All system browsers and apps now route through DataSaver Pro.

### 📱 Android (Phone / Tablet)
1. Open **Settings** &gt; **Wi-Fi** (or **Network & Internet**).
2. Tap the gear icon next to your connected Wi-Fi network &gt; tap **Modify** or **Advanced**.
3. Under **Proxy**, select **Auto-config (PAC)** (or **Manual**).
4. Enter your computer's PAC URL (shown in the dashboard):
   ```text
   http://<YOUR_LOCAL_IP>:3000/proxy.pac
   ```
5. Tap **Save**. Your phone's browsing traffic is now compressed and filtered!

### 🍏 iPhone & iPad (iOS)
1. Open **Settings** &gt; **Wi-Fi**.
2. Tap the blue **(i)** next to your connected Wi-Fi network.
3. Scroll to the bottom and tap **Configure Proxy** &gt; choose **Automatic**.
4. Enter the PAC URL:
   ```text
   http://<YOUR_LOCAL_IP>:3000/proxy.pac
   ```
5. Tap **Save**.

### 🌐 Chrome / Edge Browser Extension
Included in the `extension/` folder:
1. Open `chrome://extensions` (or `edge://extensions`) in your browser.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** and select the `extension` folder in this project.
4. The extension icon will appear in your toolbar, enabling one-click mode switching, video autoplay neutralization, and `Save-Data` header injection directly in the browser!

### 💻 Command Line & Developer Tools
To route CLI downloads, `curl`, or `git` through the data saver:
```bash
# Windows PowerShell
$env:HTTP_PROXY = "http://127.0.0.1:8888"
$env:HTTPS_PROXY = "http://127.0.0.1:8888"

# macOS / Linux / Bash
export http_proxy=http://127.0.0.1:8888
export https_proxy=http://127.0.0.1:8888
```

---

## 📊 Features & Dashboard Highlights

- **Real-Time Data Accounting**: Live metrics on MBs consumed vs MBs saved, overall efficiency percentage, and blocked requests.
- **Data Budget & Quota Limiter**: Set daily or monthly data budgets (e.g. 2,048 MB). Features warning states and optional strict cutoff enforcement.
- **Live Traffic Stream**: Real-time websocket/SSE table showing intercepted hostnames, status (`BLOCKED`, `CACHED`, `PASSED`), and byte savings.
- **Interactive URL Savings Analyzer**: Test any website or media URL directly in the dashboard to see before-and-after download sizes and blocked bloatware.
- **Persistent State**: Usage logs and budget preferences are persisted to `data/usage.json`.

---

## 🧪 Automated Tests

Run the test suite:
```bash
node test/runTests.js
```

11/11 automated unit and integration tests verify filter rules, domain heuristic engines, cache eviction, budget calculations, and proxy interceptors.
