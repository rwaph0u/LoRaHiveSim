# LoRaHiveSim — v1.2.0

> **LoRa mesh playground** with a realistic radio model (FSPL + LoRa sensitivity), **realistic material-based obstacles**, minimap, import/export, distance measurement, sharable simulation state via URL, and full bilingual UI (EN/FR).  
> License: **MIT**

---

## 🚀 Overview

LoRaHiveSim simulates **LoRa packet propagation** between **hives (nodes)** and a **central server**, including **relay** logic and **ACK** returns.  
When **realistic mode** is enabled, range is computed from **path loss (FSPL)** and **receiver sensitivity**, then converted to pixels via _Meters per pixel_.  
**Obstacles** locally attenuate the signal by sector, possibly blocking communication.

- **Version**: 1.2.0 (SemVer)
- **Languages**: English / French (auto-detected, can be switched)
- **License**: MIT

---

## 🗂️ Files & Installation

No build needed — just open `index.html` in any modern browser (Chrome, Edge, Firefox).

```
index.html
styles.css
app.js
i18n.js
```

> Free hosting suggestions: GitHub Pages, Netlify, or Vercel (drag-and-drop deployment).

---

## ✨ Features

- **Wave propagation** of DATA and ACK messages, with relay and TTL.
- **Realistic mode** using FSPL + LoRa sensitivity (SF/BW) and TX power (default 10 dBm @ 868 MHz).
- **Progressive acceleration** — waves start slowly and reach their full realistic range in exactly **10 seconds** with smooth acceleration curve.
- **Realistic material-based obstacles** (concrete, brick, wood, glass, metal, vegetation, water, earth) with **exponential attenuation** model.  
  Obstacles are colored according to their material type and apply physics-based signal attenuation.
- **Polygonal obstacles** preserve their original shape from GeoJSON import, supporting complex building geometries.
- **Infinite canvas** with smooth **pan/zoom**.
- **Mini-map** for fast navigation.
- **Distance measurement tool** (px ↔ m) and **“Focus server”** shortcut.
- **Import/Export JSON**, **shareable URLs**, and **GeoJSON** (points → nodes/server, polygons → realistic polygon obstacles).
- **Real-time stats**: delivery rate, hops, latency, relays, losses.
- **Smart ACK handling**: nodes only relay ACKs for others, not their own.

---

## 🕹️ Controls

- **Add**: drag “+ Hive” or “+ Obstacle” from the palette to the canvas.
- **Move**: drag & drop (node or obstacle).
- **Send data**: click a hive → emits DATA (server replies with ACK if received).
- **Obstacle selected**:
  - Scroll = radius; **Shift + scroll = loss**.
  - Or use the sliders/inputs in the left panel.
- **Pan**: spacebar / middle + drag / right + drag.  
  **Zoom**: mouse wheel (centered on cursor).
- **Measure**: click “Measure distance”, then click **two points** (ESC cancels).
- **Delete**: Delete/Backspace or “Delete selection” button.
- **Reset**: “Reset all” button (clears the board).
- **Focus**: “Focus server” recenters and scales to show the server.

---

## ⚙️ LoRa Parameters (European defaults)

| Parameter | Description          | Default         |
| --------- | -------------------- | --------------- |
| Frequency | MHz                  | 868             |
| TX Power  | dBm                  | 10              |
| SF        | Spreading Factor     | 7–12            |
| BW        | Bandwidth            | 125/250/500 kHz |
| CR        | Coding Rate          | 4/5–4/8         |
| Meters/px | Scale world ↔ screen | 2 m/px          |

> Visual radius corresponds to realistic range scaled by _Meters / px_.  
> Max render radius: **200 000 px**.

### Realistic model (simplified)

- **Sensitivity (dBm)** ≈  
  SF7:-118, SF8:-121, SF9:-124, SF10:-127, SF11:-129.5, SF12:-132  
  (+3 dB for 250 kHz, +6 dB for 500 kHz).  
  _Values account for real-world conditions and implementation losses._
- **FSPL(dB)** = 32.44 + 20·log₁₀(f_MHz) + 20·log₁₀(d_km).
- Reception occurs when **Rx ≥ Sensitivity**, with `Rx = TX_dBm – FSPL – Obstacle_dB`.
- **Obstacles** apply directional attenuation (product of losses across affected sectors).  
  High-loss obstacles (>90%) add 60dB penalty, effectively blocking communication.

### Progressive Acceleration

Waves use a **3-phase acceleration curve** over exactly 10 seconds:

- **Phase 1 (0-2s)**: Very slow start for immediate visual feedback
- **Phase 2 (2-6s)**: Gradual acceleration with quartic easing
- **Phase 3 (6-10s)**: Smooth completion to full range

This ensures consistent timing regardless of range while providing natural visual progression.

---

## 🧱 Realistic Material-Based Obstacles

Obstacles now use **exponential attenuation** based on material properties instead of simple loss percentages:

### Available Materials

| Material   | Alpha (α) | Color      | Description                  |
| ---------- | --------- | ---------- | ---------------------------- |
| Concrete   | 0.8       | Gray       | Dense building material      |
| Brick      | 0.6       | Red-brown  | Traditional building walls   |
| Wood       | 0.3       | Brown      | Timber construction          |
| Glass      | 0.1       | Light blue | Windows, minimal attenuation |
| Metal      | 1.2       | Steel gray | High RF blocking (Faraday)   |
| Vegetation | 0.4       | Green      | Trees, foliage               |
| Water      | 0.2       | Blue       | Ponds, rivers                |
| Earth/Rock | 0.5       | Tan        | Natural terrain, hills       |

### Physics Model

**Attenuation formula**: `signal_strength *= exp(-α × distance_inside_obstacle)`

- **α (Alpha coefficient)**: Material-specific attenuation constant
- **Distance inside**: Approximate thickness the signal travels through the obstacle
- **Exponential decay**: Realistic RF propagation physics (Beer-Lambert law)
- Higher α values = stronger attenuation (metal blocks signals most)

### Usage

- **Circular obstacles**: Create by dragging from palette, select material from dropdown
- **Polygonal obstacles**: Import from GeoJSON with `material` property, or edit after creation
- **Visual feedback**: Obstacles are colored according to their material type
- **Legacy support**: Existing obstacles default to "concrete" material

---

## 🔁 Import / Export

### Export

- **JSON file** → “Export JSON (file)” → `lorahivesim.json`
- **To text area** → “Export → area” (copy/paste).
- **Share link** → “Copy share link” (encodes full state in URL hash).

### Import

- From **file** or **area** (tolerant to unknown/invalid properties).
- **GeoJSON**: FeatureCollection with _Point_ and _Polygon_ geometries.
  - _Point_ → hive/server (`properties.name === "server"` → central server).
  - _Polygon_ → **realistic polygonal obstacle** preserving original shape with `properties.loss` ∈ [0..0.95].
  - Uses "Origin lat/lon" + "Meters per pixel" to convert to canvas coordinates.

**Example:**

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [2.3522, 48.8566] },
      "properties": { "name": "server" }
    },
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [2.3622, 48.8569] },
      "properties": { "name": "hive" }
    },
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [2.35, 48.857],
            [2.355, 48.857],
            [2.355, 48.859],
            [2.35, 48.859],
            [2.35, 48.857]
          ]
        ]
      },
      "properties": {
        "loss": 0.6,
        "material": "brick"
      }
    }
  ]
}
```

> **Material support**: Add `"material": "concrete"` (or brick, wood, glass, metal, vegetation, water, earth) to polygon properties.  
> **Legacy support**: If no material is specified, obstacles default to "concrete".  
> Upon import, the view automatically **fits** and **focuses on the server**.

---

## 📊 Statistics

- `DATA sent` — total DATA transmissions.
- `To server` — unique DATA packets received by the server.
- `ACK to origin` — ACKs returned to the originating hive (% success).
- `Relayed DATA/ACK` — number of forwarded packets.
- `TTL drops`, `Shadow drops` (signal reached but not decodable), `Dup ignored`.
- `Avg hops`, `Avg latency` — average hops and round-trip time.

---

## 🧭 Distance Measurement

Click “Measure distance”, then two points: result shows both **pixels** and **meters**.  
Nodes snap automatically if near cursor.

---

## 🔧 Troubleshooting

- **Waves too slow/fast** → All waves now take exactly 10 seconds with progressive acceleration for consistent timing.
- **Missing ACK** → Check LoRa parameters, obstacles, and _Meters / px_ scale.
- **Too much loss** → Reduce `loss` or resize/reposition the obstacle.
- **GeoJSON import** → Ensure valid FeatureCollection, correct geometry types and properties.

---

## 🗺️ Roadmap Ideas

- Non-circular / polygonal obstacles, terrain & Fresnel zone.
- Noise, fading, duty-cycle and temporal collisions.
- Coverage heatmaps & path-loss visualization.

---

## 📝 Changelog

- **1.2.0** — **Realistic material-based obstacles**: Exponential attenuation model with 8 material types (concrete, brick, wood, glass, metal, vegetation, water, earth). Physics-based RF propagation with material-specific alpha coefficients and color-coded visualization.
- **1.1.0** — **Time-on-Air (ToA) calculation, EU868 duty-cycle enforcement, and Adaptive Data Rate (ADR)**: Realistic LoRaWAN protocol compliance with packet duration calculation, regulatory duty-cycle restrictions, and automatic SF/power adaptation.
- **1.0.0** — **First stable release**: Complete LoRa mesh simulation with realistic radio model, polygonal obstacles, progressive wave acceleration, smart ACK handling, and comprehensive GeoJSON support.
- **0.3.0** — Progressive wave acceleration (exactly 10s), realistic LoRa parameters, improved obstacle blocking, fixed ACK relay logic, **polygonal obstacles** from GeoJSON with realistic shape preservation.
- **0.2.x** — Realistic mode, obstacle sectors, import/export, GeoJSON, minimap, distance tool, i18n.
- **0.1.x** — Initial prototype with relay and ACK simulation.

---
