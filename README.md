<!-- DRISHTI is a working codename (दृष्टि = "sight" in Hindi). -->
<div align="center">

# DRISHTI · दृष्टि

### Know where people and signals are — never who they are.

A free-first, ESP32-powered observatory for places you cannot see into: a photo-built 3D twin, a live WiFi / Bluetooth / radar signal layer, and AI that explains what it all means — with privacy enforced by the architecture, not by promises.

[![Status](https://img.shields.io/badge/status-hackathon%20prototype-orange.svg)](https://github.com/ankitpandeynine/Rescue-system-using-wifi-and-bt)
[![Theme](https://img.shields.io/badge/theme-social%20implications%20of%20technology-blue.svg)](https://github.com/ankitpandeynine/Rescue-system-using-wifi-and-bt)
[![Hardware](https://img.shields.io/badge/hardware-ESP32%20%7C%20LD2410-informational.svg)](https://github.com/ankitpandeynine/Rescue-system-using-wifi-and-bt)
[![Stack](https://img.shields.io/badge/stack-React%20%7C%20Three.js%20%7C%20Vite%20%7C%20Node.js-brightgreen.svg)](https://github.com/ankitpandeynine/Rescue-system-using-wifi-and-bt)
[![License](https://img.shields.io/badge/license-Apache--2.0%20%2B%20responsible%20use-green.svg)](LICENSE)
[![Zero Identifiers](https://img.shields.io/badge/identifiers%20stored-0-success.svg)](#privacy-security-and-ethics)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Why This Exists](#why-this-exists)
- [The Four Pages](#the-four-pages)
  - [1. Home (Orientation & Health)](#1-home)
  - [2. Devices (Hardware Registry & Signal Lab)](#2-devices)
  - [3. Workspace (Twin Builder, DSP & Copilot)](#3-workspace)
  - [4. Observatory (12 View Modes & 3D Twin)](#4-observatory)
- [How Presence is Detected](#how-presence-is-detected)
- [RF Confirmation Loop (Physics Checks the AI)](#rf-confirmation-loop)
- [DSP Pipeline & Noise Lab](#dsp-pipeline--noise-lab)
- [Sensing Mode Governance & Audit Trail](#sensing-mode-governance--audit-trail)
- [Privacy, Security and Ethics](#privacy-security-and-ethics)
- [System Architecture & Tech Stack](#system-architecture--tech-stack)
- [Getting Started & Local Setup](#getting-started--local-setup)
- [Deployment (Vercel & Node.js)](#deployment)

---

## Overview

**DRISHTI** is a monitoring infrastructure that makes the invisible radio environment of a room, building, or collapsed structure visible. You connect whatever sensing hardware you have — today a few ESP32 nodes, tomorrow a Raspberry Pi, a WiFi card, an SDR, or an mmWave radar — and DRISHTI turns raw feeds into one living, interactive 3D twin:

1. **Where radio signals travel, attenuate, and scatter.**
2. **What has changed compared to a learned baseline** (e.g. collapsed walls, shifted rubble, opened doors).
3. **Where devices (phones, beacons) and people are**, rendered with honest uncertainty clouds rather than misleading coordinate pins.
4. **Who is moving or breathing**, even without carrying any transmitting electronic devices, through RF absorption and multipath shadowing.

The 3D structure can be seeded from photos, uploaded floor plans, or synthetic sweeps, cleaned up and validated by AI, and continuously checked against physical radio path-loss measurements — ensuring geometry and RF physics must agree.

---

## Why This Exists

During structural collapses, natural disasters, or hazardous operations, first responders face a critical information vacuum: *Is the structure stable? Which walls have fallen? Are living survivors trapped inside, and where?*

| Existing Approach | Strengths | Limitations DRISHTI Solves |
|---|---|---|
| **Phone locators (drone/vehicle)** | Locates active cellphones | Requires powered transmitting phones; no geometry or structural damage layer. |
| **Search dogs & seismic probes** | Proven and reliable | Requires direct physical access; slow; limited coverage; hazardous to handlers. |
| **Through-wall radar ($10k+)** | High resolution | Prohibitively expensive; heavy; proprietary; not deployed at scale. |
| **DRISHTI** | **$5 ESP32 hardware, photo-built 3D twin, works with or without phones, zero persistent identifiers stored.** |

---

## The Four Pages

### 1. Home
*Orientation, status, and shortcuts: "What is this, is everything healthy, what should I do next?"*
- **Live Status Strip**: Hub health, active connected nodes (e.g. 5 nodes online), current sensing mode (`BASELINE`, `ALERT`, `INCIDENT`), AI provider status, and **"identifiers stored: 0"** badge.
- **Site Cards with RF Agreement**: Displays scanned sites (e.g., *Site A: Collapsed Wing*), structural confidence, and RF Agreement score ($A_{site} = 88\%$) highlighting suspect walls ($W12, W17$).
- **Quick Action Bar**: `[+ Add Device]`, `[New Twin from Photos]`, `[Import Scan]`, `[Run RF Confirmation]`, `[Start Simulator Demo]`.
- **Live Event Feed**: Real-time log of RF shifts, node heartbeats, and audit transitions.
- **Ethics & DPDP Statement**: Clear compliance with India DPDP Act 2023 Section 7, confirming non-consensual tracking refusal and zero persistent storage of personal data.

### 2. Devices
*Hardware registry and live feeds: "All my sensors in one place, each with its own live signal view."*
- **Multi-Node Registry**:
  - `DR-CSI-01`, `DR-CSI-02`, `DR-CSI-03` (ESP32-S3 Wi-Fi CSI sniffer nodes)
  - `DR-SCN-01` (ESP32 Wi-Fi / BLE Scanner)
  - `DR-ANC-01` (Active transmitter beacon)
  - `RPI-HUB` (Edge Gateway & Coordinator)
  - `LD2410-A` (24 GHz FMCW mmWave Radar)
  - `IMU-BARO-01` (Barometric altitude & tilt sensor)
- **Per-Device Feed Controls**: Individual toggles for `csi`, `rssi_links`, `mgmt_frames` *(strictly locked to INCIDENT mode)*, `ap_scan`, `radar`, and `health`.
- **Live Subcarrier Spectrogram**: Real-time 64-subcarrier OFDM amplitude and phase display with Signal Quality Index (SQI), noise floor, and clock drift metrics.
- **Calibration Wizards**: Empty-room baseline capture, wall attenuation offset calibration, and browser-based Web Serial ESP32 flashing wizard.

### 3. Workspace
*Collaboration, setup, analysis, 3D import, and AI copilot: "Build the twin, tune the pipeline, analyse together."*
- **Twin Builder**: Multi-angle photo photogrammetry ingestion, GLTF/OBJ import, floor plan vectorizer, and synthetic procedural rubble generation.
- **Node Placement & Calibration**: Interactive node positioning tool with real-time coverage heatmaps and blind-spot calculation.
- **Pipeline & Noise Lab**: Interactive DSP filter chain toggle:
  $$\text{Raw CSI} \rightarrow \text{Decimate (100Hz)} \rightarrow \text{Hampel Outlier Removal} \rightarrow \text{EWMA} \rightarrow \text{PCA} \rightarrow \text{Bandpass (0.1--0.5 Hz)} \rightarrow \text{CUSUM Change Detection}$$
- **Analysis & Experiments**: Automated benchmark suite running experiments **E1 through E11** (path-loss exponent $n$, wall loss $L_w$, respiration SNR, blind-spot bounds).
- **Grounded AI Copilot**:
  - Answers natural language inquiries strictly grounded in structured facts (`[f_8c21]`, `[f_3a09]`).
  - Read-only tools for telemetry and zone state.
  - **Hard-coded refusal of personal identity queries**: Politely refuses questions like *"Who is in Zone C?"* or *"Whose phone is that?"*, explaining architectural privacy limits.
- **SITREP Exporter**: One-click generation of military/humanitarian standard Situation Reports in Markdown or JSON format.

### 4. Observatory
*The special view where everything comes together: "See the invisible: signals, devices, and movement on a 3D structure."*
- **12 Interactive View Modes**:
  - `[1 3D]`: Physical structural mesh and architecture
  - `[2 WIFI]`: 2.4/5 GHz link mesh with Fresnel zones
  - `[3 BT]`: Anonymous BLE emitter cluster clouds
  - `[4 FUSION]`: Integrated multi-sensor composite view
  - `[5 CHANGE]`: Differential baseline vs current disturbance heatmap
  - `[6 HEAT]`: Volumetric presence probability distribution
  - `[7 XRAY]`: Transparent geometry with interior occlusion view
  - `[8 VITALS]`: Respiration frequency halos (14--19 BPM)
  - `[9 SPECTRUM]`: 3D OFDM subcarrier terrain waterfall
  - `[0 TIME]`: Historical 4D playback trail
  - `[G GEO]`: Geographic satellite & map projection
  - `[P PRIVACY]`: Visual blind-spot masks and zero-identifier verification view
- **Peel Slider**: Cross-fade dynamically from physical 3D exterior &rarr; X-Ray transparent interior &rarr; Pure Wi-Fi Fresnel mesh.
- **Interactive 3D Viewport**:
  - 28 Fresnel link ribbons connecting active nodes, color-coded by real-time variance and disturbance.
  - Anonymous survivor uncertainty ellipsoids (confidence clouds) with chest-wall respiration pulsing.
  - Hatched 3D blind-spot volumes indicating areas without sufficient RF line-of-sight.
- **Zone Inspector Panel**: Click any zone (e.g. `Zone C2`) to inspect calibrated survivor probability, evidence breakdown, SQI, and sensor contributions.
- **4D Timeline Scrubber**: Playback historical telemetry at 1x to 60x speed with bookmark scrubbing.

---

## How Presence is Detected

DRISHTI implements multi-modal sensing to detect presence both **with** and **without** electronic devices:

```
                          ┌──────────────────────────┐
                          │   Physical Environment   │
                          └─────────────┬────────────┘
                                        │
           ┌────────────────────────────┴───────────────────────────┐
           ▼                                                        ▼
┌───────────────────────┐                               ┌───────────────────────┐
│ Device-Free Sensing   │                               │ Device-Based Sensing  │
│ (Without phone)       │                               │ (With phone/wearable) │
└──────────┬────────────┘                               └───────────┬───────────┘
           │                                                        │
           ▼                                                        ▼
┌───────────────────────┐                               ┌───────────────────────┐
│ Wi-Fi CSI Distortion  │                               │ Passive Beacon Rx     │
│ - Subcarrier variance │                               │ - Link RSSI multilater.│
│ - Phase SAN & unwrapping                               │ - Ephemeral hash salting
│ - Respiration Doppler │                               │ - Zero persistent MACs │
└──────────┬────────────┘                               └───────────┬───────────┘
           │                                                        │
           └────────────────────────────┬───────────────────────────┘
                                        ▼
                         ┌─────────────────────────────┐
                         │   Bayesian Spatial Fusion   │
                         │   - Fresnel intersection    │
                         │   - Covariance decomposition│
                         │   - Blind spot subtraction  │
                         └──────────────┬──────────────┘
                                        ▼
                         ┌─────────────────────────────┐
                         │  Calibrated Presence Cloud  │
                         │  [P = 0.88, Zone C2, ±0.7m] │
                         └─────────────────────────────┘
```

1. **Device-Free Sensing (CSI & Multipath Shadowing)**:
   - When a human body enters an RF propagation path, tissue (70% saline) absorbs and scatters 2.4 GHz photons.
   - The ESP32 captures 64 OFDM subcarrier complex channel matrices $H(f, t)$.
   - Subcarrier phase sanitization and variance extraction isolate minute chest wall displacements (0.15--0.45 Hz), revealing breathing rates (14--19 BPM) without any wearable or phone.

2. **Device-Based Sensing (Anonymous Beaconing)**:
   - Responding to standard probe requests and BLE advertisements.
   - Every detected address is salted in-memory with a session key rotated every 10 minutes:
     $$\text{AnonymousHash} = \text{HMAC-SHA256}(\text{SessionSalt}, \text{MAC})[0:6]$$
   - Raw MAC addresses, SSIDs, and Information Elements (IEs) are scrubbed at the hardware ingest boundary.

---

## RF Confirmation Loop

Geometry proposed by AI photogrammetry or blueprints is verified against measured radio attenuation:

$$\hat{r}_{ij} = P_0 - 10 n \log_{10}(d_{ij}) - \sum_{k \in \text{walls}} L_k$$

- **Residual Discrepancy**: $\Delta r_{ij} = |r_{ij}^{\text{meas}} - \hat{r}_{ij}|$
- If $\Delta r_{ij} > \tau$ (where $\tau = 6.0\text{ dB}$ threshold), the intersecting structural element is flagged as **Suspect**:
  - Example: Wall $W12$ residual $+8.4\text{ dB}$ &rarr; *Wall absent or collapsed rubble.*
  - Overall Site Agreement score $A_{\text{site}} = 100\% \times \left(1 - \frac{N_{\text{discrepant}}}{N_{\text{links}}}\right)$.

---

## Sensing Mode Governance & Audit Trail

DRISHTI enforces an immutable, append-only hash-chained audit log for state and data privacy:

| Mode | Capabilities | Access Requirement | Retention |
|---|---|---|---|
| **`BASELINE`** | CSI variance, link RSSI, aggregate statistics | Default on boot | Ephemeral RAM only |
| **`ALERT`** | Real-time presence heatmaps, respiration detection | Operator trigger | Ephemeral RAM only |
| **`INCIDENT`** | Raw management frames, high-rate Doppler tracking | **2-Responder Ed25519 signatures** or **15-minute Break-Glass** | Auto-expires after 72 hrs |
| **`PURGE`** | Immediate zeroization of volatile buffers & rolling logs | One-click emergency purge | Zero persistent residue |

**Cryptographic Audit Entry**:
$$H_k = \text{SHA256}(H_{k-1} \,\|\, t_k \,\|\, \text{actor} \,\|\, \text{action} \,\|\, \text{details})$$

---

## Privacy, Security and Ethics

- **Zero Persistent Identifiers**: The system stores **0** MAC addresses, IMSIs, or personal names.
- **Anti-Tracking by Design**: Trajectory re-identification across session boundaries is computationally infeasible due to continuous salt rotation ($\le 10$ min).
- **Compliance**: Fully conforms with **India Digital Personal Data Protection (DPDP) Act 2023 Section 7** (processing for medical emergency & disaster response with strict purpose limitation and post-incident data destruction).

---

## System Architecture & Tech Stack

```
Frontend (Vite + React 19 + Three.js)
├── ObservatoryView.jsx (12-mode 3D WebGL renderer, Fresnel ribbons, peel slider)
├── WorkspaceView.jsx   (Twin builder, DSP filter tuning, AI copilot, SITREP)
├── DevicesView.jsx     (Hardware registry, live spectrogram, Web Serial flasher)
├── HomeView.jsx        (Hub status, RF agreement cards, event feed, DPDP notice)
└── PrivacyModeModal.jsx(Dual-key Ed25519 incident declaration & audit viewer)
         │
         ▼ (REST API / SSE stream)
Backend Server (Node.js ESM + Vercel Serverless)
├── server/index.mjs    (HTTP/SSE server, serial parser, REST endpoints)
├── server/drishtiCore.mjs (State machine, path-loss model, DSP chain, audit log)
└── api/index.js        (Unified Vercel cloud serverless entrypoint)
         │
         ▼ (Web Serial / UART / Wi-Fi UDP)
Edge Sensor Hardware
├── ESP32-S3 Nodes      (Wi-Fi CSI sniffer firmware, 64-subcarrier raw capture)
├── LD2410-A Radar      (24 GHz FMCW mmWave human presence sensor)
└── IMU / Barometer     (Structural vibration & barometric floor estimation)
```

---

## Getting Started & Local Setup

### Prerequisites
- Node.js 18+ (tested on Node 20 & 22)
- npm 9+
- Optional: ESP32 development board (ESP32-S3, ESP32-WROOM-32) connected via USB

### 1. Clone & Install
```bash
git clone https://github.com/ankitpandeynine/Rescue-system-using-wifi-and-bt.git
cd Rescue-system-using-wifi-and-bt
npm install
```

### 2. Run the Development Server
```bash
# Starts both the Vite frontend and the DRISHTI backend engine
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 3. Run Standalone Backend
```bash
# In another terminal if running backend independently
npm run server
```
Backend listens on `http://localhost:4175` (or configured `PORT`).

### 4. Build for Production
```bash
npm run build
```
Generates optimized static assets into `dist/`.

---

## Deployment

### Vercel Deployment
The repository includes standard [`vercel.json`](vercel.json) and [`api/index.js`](api/index.js) configurations for zero-config deployment:

```bash
# Install Vercel CLI (if not already installed)
npm install -g vercel

# Deploy to Vercel preview
vercel

# Deploy to production
vercel --prod
```

---

## License

This project is licensed under the Apache License 2.0 with a Responsible Use addendum. See [LICENSE](LICENSE) for details.
