# 🛡️ DataSaver Pro — Universal Bandwidth Optimizer & Data Reducer

<div align="center">

[![Developer: Ad3n1x](https://img.shields.io/badge/Architect%20%26%20Developer-Ad3n1x-10b981?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Ad3n1x)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)
[![Tests: Passing](https://img.shields.io/badge/Tests-12%2F12%20Passing-emerald?style=for-the-badge)](test/runTests.js)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-339933?style=for-the-badge&logo=node.js&logoColor=white)](package.json)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](Dockerfile)

**Universal cloud & edge bandwidth optimizer, real-time web proxy, ad/tracker suppressor, and data reduction suite.**  
*Architected and engineered by [Ad3n1x](https://github.com/Ad3n1x).*

[Live Cloud Demo](#-deploy-to-the-web-in-1-click) • [Features](#-key-features) • [Cloud Web Surfer](#-cloud-web-surfer--reader-gateway) • [Cross-Device Setup](#-save-data-on-every-device) • [Identity & Metadata](#-developer-identity--metadata)

</div>

---

## 🌐 Deploy to the Web in 1-Click

DataSaver Pro runs seamlessly on the web without requiring local hosting. Deploy to any cloud platform with free-tier support:

### Option A: Render (Recommended)
1. Fork or push to your GitHub account (`https://github.com/Ad3n1x/datasaver-pro`).
2. Go to [render.com](https://render.com) &gt; **New Web Service** &gt; Connect your `datasaver-pro` repository.
3. Render automatically detects [`render.yaml`](render.yaml) or Node environment:
   - **Build Command**: `npm test`
   - **Start Command**: `node server.js`
4. Click **Deploy**. Your cloud gateway is live at `https://<your-app>.onrender.com`!

### Option B: Docker Container
```bash
docker build -t ad3n1x/datasaver-pro .
docker run -p 3000:3000 ad3n1x/datasaver-pro
```

### Option C: Railway / Heroku / Fly.io
Deploy using the included [`Procfile`](Procfile) and [`Dockerfile`](Dockerfile):
```bash
# Railway
railway up

# Fly.io
fly launch
```

---

## 🏄 Cloud Web Surfer & Reader Gateway

When hosted on the web, DataSaver Pro acts as a cloud-powered web gateway:

1. **Direct Web Browsing**:
   Visit `https://<your-domain>/browse?url=https://example.com` to view any site stripped of ads, trackers, and autoplay video pre-buffering with a real-time data savings bar.
2. **One-Click Bookmarklet**:
   Drag the bookmarklet from the dashboard to your mobile or desktop browser. Clicking it on any heavy website instantly loads it inside DataSaver Pro.
3. **Automated Hyperlink Routing**:
   Internal page navigation automatically persists inside the DataSaver gateway.

---

## 🌟 Why Data Usage Explodes & How DataSaver Pro Fixes It

| The Hidden Data Hog | Impact on Your Plan | How DataSaver Pro Fixes It |
|---|---|---|
| **Ad Networks & Tracking Beacons** | 40% – 60% of total bandwidth | Terminates connections before TLS handshake, preventing megabytes of tracking scripts from downloading. |
| **Video Autoplay & Pre-buffering** | 30MB – 150MB per video on feeds | Strips `autoplay` and forces `preload="none"`, saving hundreds of megabytes on social feeds. |
| **Heavy Remote Web Fonts** | 300KB – 2MB per page | Suppresses non-critical Google Fonts & Typekit files in Ultra/Emergency modes. |
| **Redundant Asset Downloads** | Repeated downloads of assets | Aggressive in-memory cache layer serves static resources instantly. |
| **Background OS & App Telemetry** | Silent bandwidth bleed on hotspots | Blocks background diagnostics and telemetry endpoints (Windows, Samsung, Apple). |
| **`Save-Data: on` Header** | Ignored by default in browsers | Automatically injects the standard HTTP Client Hint `Save-Data: on`. |

---

## ⚡ 3 Adaptive Optimization Modes

1. **🚀 Standard Saver (~50% Data Reduction)**
   - Blocks known ad networks, analytics beacons, and telemetry bleed.
   - Injects `Save-Data: on` Client Hints.
   - Reuses static assets via local cache.
   - Preserves complete visual fidelity.

2. **🔥 Ultra Saver (~80% Data Reduction)**
   - Everything in Standard Saver.
   - Suppresses heavy custom web fonts (Google Fonts, Typekit).
   - Blocks heavy animated GIF providers and video pre-buffer CDNs.
   - Ideal for mobile hotspots, tethering, and hotel Wi-Fi.

3. **🛑 Emergency Text Mode (95%+ Data Reduction)**
   - Extreme bandwidth conservation.
   - Replaces heavy images with 68-byte transparent placeholders.
   - Blocks videos, audio, and heavy media.
   - Core text and essential CSS only — perfect for roaming, near-zero credit, or satellite links.

---

## 📱 Save Data on Every Device

DataSaver Pro generates a **Proxy Auto-Configuration (PAC)** file and a local HTTP proxy that any phone, tablet, computer, or web browser can use.

### 🪟 Windows (PC / Laptop)
1. Open **Settings** &gt; **Network & internet** &gt; **Proxy**.
2. Under **Automatic proxy setup**, turn **Use setup script** ON.
3. In **Script address**, paste your PAC URL (e.g. `http://<domain-or-ip>:3000/proxy.pac`).
4. Click **Save**.

### 📱 Android (Phone / Tablet)
1. Open **Settings** &gt; **Wi-Fi**.
2. Tap the gear icon next to your connected Wi-Fi &gt; **Proxy** &gt; **Auto-config (PAC)**.
3. Enter your PAC URL and tap **Save**.

### 🍏 iPhone & iPad (iOS)
1. Open **Settings** &gt; **Wi-Fi** &gt; tap **(i)** next to your Wi-Fi name.
2. Scroll down to **Configure Proxy** &gt; choose **Automatic**.
3. Paste the PAC URL and tap **Save**.

### 🌐 Chrome / Edge Browser Extension
Included in the [`extension/`](extension/) directory:
1. Open `chrome://extensions` in Chrome, Edge, or Brave.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the [`extension/`](extension/) folder.

---

## 👤 Developer Identity & Metadata

DataSaver Pro is architected, authored, and maintained by **Ad3n1x**:

- **GitHub Profile**: [@Ad3n1x](https://github.com/Ad3n1x)
- **Email**: `adenix271@gmail.com`
- **Repository**: [https://github.com/Ad3n1x/datasaver-pro](https://github.com/Ad3n1x/datasaver-pro)
- **JSON-LD Schema**: Verified `SoftwareApplication` schema embedded in web client
- **PWA Manifest**: Progressive Web App configured with developer metadata ([`public/manifest.json`](public/manifest.json))
- **Standards**: [`humans.txt`](public/humans.txt) and [`robots.txt`](public/robots.txt) declare developer authorship
- **HTTP Headers**: All responses include `X-Developer: Ad3n1x` and `X-Powered-By: DataSaver Pro`

---

## 🧪 Automated Test Suite

Run the full automated unit and integration suite:
```bash
npm test
```
*(All 12 tests verify filter rules, domain heuristic engines, cache eviction, budget calculations, cloud web proxying, and interceptors).*

---

## 📄 License

Released under the [MIT License](LICENSE) &copy; 2026 **Ad3n1x**.
