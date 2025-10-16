# 🐝 LoRaHiveSim v0.2.1

**LoRaHiveSim** is an interactive web simulator of **LoRa mesh communication** between hives and a central server.  
It visualizes **DATA** and **ACK** waves, **relay propagation**, and **obstacle attenuation** — useful for learning, testing, or teaching how LoRa multi-hop networks behave.

---

## 🌍 Overview

- Language auto-detection (English/French) + manual selector.
- Realistic mode based on actual LoRa parameters (FSPL, sensitivity, TX power).
- Configurable obstacles with adjustable size and signal loss.
- Multi-hop relays (DATA → ACK) with TTL and retransmission.
- Pan/zoom, mini-map, measurement tool, import/export, and GeoJSON integration.
- France configuration (868 MHz) enabled by default.

---

## ⚙️ Default configuration (France)

| Parameter | Value | Description |
|------------|--------|-------------|
| Frequency | **868 MHz** | EU LoRa band |
| TX Power | **14 dBm** | EU max EIRP |
| Bandwidth | **125 kHz** | Standard narrowband |
| Spreading Factor | **7** | Adjustable 7–12 |
| Coding Rate | **4/5** | Typical value |
| Meters / pixel | **2** | For distance scaling |
| Realistic path-loss | ✅ Enabled | FSPL + sensitivity model |

Resulting theoretical free-space range (no obstacle):

| SF | Sensitivity (dBm, BW125) | Range (m) |
|----|---------------------------|-----------|
| 7  | −123 | ≈ 3 km |
| 8  | −126 | ≈ 4.6 km |
| 9  | −129 | ≈ 6.6 km |
| 10 | −132 | ≈ 9.3 km |
| 11 | −134.5 | ≈ 12 km |
| 12 | −137 | ≈ 16.7 km |

---

## 🧮 Radio model (Realistic mode)

When “Realistic path-loss” is enabled, each transmission follows a **link budget** check:

```
FSPL(dB) = 32.44 + 20*log10(f_MHz) + 20*log10(d_km)
Rx = Tx - FSPL - Obstacles_dB
```

Reception succeeds if:

```
Rx >= Sensitivity(SF,BW)
```

### Sensitivity reference (approximate)

| SF | 125 kHz | 250 kHz | 500 kHz |
|----|----------|----------|----------|
| 7  | −123 | −120 | −117 |
| 8  | −126 | −123 | −120 |
| 9  | −129 | −126 | −123 |
| 10 | −132 | −129 | −126 |
| 11 | −134.5 | −131.5 | −128.5 |
| 12 | −137 | −134 | −131 |

---

## 🌊 Visual vs. Physical signal

| Component | Affected by obstacles? | Description |
|------------|------------------------|--------------|
| **Visual wave (circle)** | ❌ No | Free-space theoretical radius (FSPL + sensitivity). Always circular. |
| **Reception logic** | ✅ Yes | Each target checks line-of-sight intersection with obstacles; losses (0–0.95) are applied as attenuation (in dB). |
| **Logs / ACKs / Relays** | ✅ Yes | Events occur only if the link budget passes. |
| **Wave opacity / shape** | ❌ No (for now) | May become direction-dependent in future versions. |

👉 The visual wave shows where the signal *could* go if no obstacle blocked it.  
👉 The reception logic determines where the signal *actually* goes.

---

## 🧱 Obstacles

- Each obstacle has:
  - a **radius** (editable via slider or wheel),
  - a **loss factor** between **0 → no attenuation** and **0.95 → almost opaque**.
- Loss is internally converted to dB:
  ```
  loss_dB = -10 * log10(1 - loss)
  ```
- Multiple obstacles on the same path accumulate their loss.
- Obstacles only affect **signal reception**, not the wave rendering (for performance and clarity).

---

## 📏 Measurement Tool

- Activate with **“Measure distance”**.
- Click two points (snaps to hives/server) to measure.
- Displays both **pixels** and **meters** using the current “Meters / pixel” scale.
- Press **ESC** to cancel, or **Clear** to reset.

---

## 📡 Import / Export

- **Export JSON (file)** — download simulation state.  
- **Export → area / Copy** — copy JSON to clipboard.  
- **Import JSON / from area** — load saved configuration.  
- Unknown or deprecated properties are safely ignored.  
- **Share link** encodes the state in the URL hash (`#data=`).

---

## 🌍 GeoJSON Import (experimental)

- Paste a **GeoJSON FeatureCollection** containing:
  - **Points** → Hives (or Server if `properties.name === "server"`),
  - **Polygons** → Obstacles (use `properties.loss` ∈ [0..0.95]).
- Configure **origin latitude/longitude** and **meters per pixel**.
- Upon import, the view automatically **fits** the area and **focuses** on the server.

---

## 🧭 Navigation

| Action | Description |
|---------|-------------|
| Left-click hive | Send DATA |
| Click obstacle | Select and edit |
| Drag element | Move it |
| Right/Middle click or Space + drag | Pan |
| Mouse wheel | Zoom |
| Mini-map click/drag | Reposition camera |

---

## 🧩 Data & ACK flow

1. Hive sends **DATA** (blue wave).  
2. Intermediate hives **relay** DATA if in range.  
3. Server receives DATA → sends **ACK** (orange wave).  
4. ACK relayed back until origin hive receives it.  
5. Each wave has a **TTL** limiting retransmission hops.  
6. **Logs** record all transmissions; **stats** track success rates and latency.

---

## 🧠 Terminology & Acronyms

| Acronym | Meaning | Role |
|----------|----------|------|
| **FSPL** | Free-Space Path Loss | Attenuation over distance |
| **SF** | Spreading Factor | Increases range, reduces bitrate |
| **BW** | Bandwidth | Wider = faster but less sensitive |
| **CR** | Coding Rate | Error correction ratio |
| **TX** | Transmission Power (dBm) | Source strength |
| **RX** | Received Power (dBm) | After propagation and losses |
| **EIRP** | Equivalent Isotropic Radiated Power | TX + antenna gain − cable loss |
| **LoS** | Line of Sight | Unobstructed path between nodes |
| **TTL** | Time To Live | Max relay depth for DATA/ACK |

---

## 🧾 License

MIT License  
Copyright (c) 2025 LoRaHiveSim Contributors  
SPDX-License-Identifier: MIT

---

## 🧱 Version

Current version: **v0.2.1**

Changelog:
- v0.1.x — base features, obstacles, stats, import/export, GeoJSON.  
- v0.2.0 — realistic range (FSPL-based visual), France defaults (868 MHz).  
- v0.2.1 — improved documentation and obstacle behavior clarification.
