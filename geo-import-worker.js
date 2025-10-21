// LoRaHiveSim - GeoJSON Import Web Worker
// Handles large GeoJSON parsing asynchronously to keep UI responsive

// Douglas-Peucker line simplification
function simplifyRing(pts, tol) {
  if (pts.length < 3) return pts;
  const sqTol = tol * tol;
  const keep = Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;

  function d2(p, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    if (dx === 0 && dy === 0) return Math.pow(p[0] - a[0], 2) + Math.pow(p[1] - a[1], 2);
    const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
    if (t < 0) return Math.pow(p[0] - a[0], 2) + Math.pow(p[1] - a[1], 2);
    if (t > 1) return Math.pow(p[0] - b[0], 2) + Math.pow(p[1] - b[1], 2);
    const proj = [a[0] + t * dx, a[1] + t * dy];
    return Math.pow(p[0] - proj[0], 2) + Math.pow(p[1] - proj[1], 2);
  }

  function rdp(a, b) {
    let idx = -1, max = 0;
    for (let i = a + 1; i < b; i++) {
      const dist = d2(pts[i], pts[a], pts[b]);
      if (dist > max) { idx = i; max = dist; }
    }
    if (max > sqTol) { 
      keep[idx] = true; 
      rdp(a, idx); 
      rdp(idx, b); 
    }
  }

  rdp(0, pts.length - 1);
  return pts.filter((_, i) => keep[i]);
}

// Calculate polygon area in degrees squared
function polygonArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(area) / 2;
}

// Material mapping function (from main specification)
function mapGeoFeatureToMaterial(props) {
  const materialMap = [
    { key: "building", match: /industrial|warehouse|bunker/, material: "concrete", k: 1.15 },
    { key: "building", match: /yes|house|residential|commercial/, material: "brick", k: 0.35 },
    { key: "landuse", match: /forest|wood|scrub/, material: "forest", k: 0.15 },
    { key: "landuse", match: /grass|meadow|pasture|farmland/, material: "field", k: 0.03 },
    { key: "natural", match: /water|wetland|river|lake/, material: "water", k: 3.0 },
    { key: "natural", match: /rock|mountain/, material: "rock", k: 1.8 },
    { key: "landuse", match: /urban|residential/, material: "urban_mix", k: 0.25 },
    { key: "landuse", match: /military/, material: "metal", k: 2.5 },
    { key: "landuse", match: /cemetery|park/, material: "wood", k: 0.05 },
    { key: "natural", match: /sand|beach/, material: "sand", k: 0.08 },
  ];
  
  for (const m of materialMap) {
    if (props[m.key] && m.match.test(props[m.key])) {
      return { material: m.material, k: m.k };
    }
  }
  return { material: "default", k: 0.1 };
}

// Main message handler
self.onmessage = function(e) {
  const { type, payload } = e.data;
  
  if (type === 'parse') {
    try {
      const { text, options } = payload;
      const { 
        batchSize = 1000, 
        simplifyTolerance = 0.00001, // ~1 meter at equator
        minAreaDeg2 = 5e-8,
        originLat,
        originLon,
        metersPerPixel
      } = options;

      const obj = JSON.parse(text);
      if (!obj || obj.type !== 'FeatureCollection') {
        throw new Error('Must be a FeatureCollection');
      }

      let processedCount = 0;
      let batch = [];

      // Helper function to convert lat/lon to x/y
      function llToXY(lat, lon, lat0, lon0, mpp) {
        const R = 6378137; // Earth radius in meters
        const x = (lon - lon0) * (Math.PI/180) * R * Math.cos(lat0 * Math.PI/180);
        const y = (lat - lat0) * (Math.PI/180) * R;
        return { x: x / mpp, y: -y / mpp };
      }

      // Process features
      for (const f of obj.features || []) {
        const g = f.geometry || {};
        const p = f.properties || {};

        if (g.type === 'Point') {
          const [lon, lat] = g.coordinates;
          const xy = llToXY(lat, lon, originLat, originLon, metersPerPixel);
          
          batch.push({
            type: 'point',
            x: xy.x,
            y: xy.y,
            properties: p
          });

        } else if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
          const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
          
          for (const polygonCoords of polygons) {
            const ring = polygonCoords[0]; // Exterior ring only
            
            // Filter tiny polygons
            const area = polygonArea(ring);
            if (area < minAreaDeg2) continue;
            
            // Simplify geometry
            const simplified = simplifyRing(ring, simplifyTolerance);
            if (simplified.length < 3) continue;
            
            // Convert to canvas coordinates
            const points = simplified.map(([lon, lat]) => {
              const xy = llToXY(lat, lon, originLat, originLon, metersPerPixel);
              return { x: xy.x, y: xy.y };
            });

            // Auto-detect material
            const { material, k } = p.material ? 
              { material: p.material, k: p.k || 0.35 } : 
              mapGeoFeatureToMaterial(p);

            batch.push({
              type: 'polygon',
              points,
              properties: p,
              material,
              k,
              originalVertices: ring.length,
              simplifiedVertices: simplified.length
            });
          }
        }

        processedCount++;

        // Send batch when full
        if (batch.length >= batchSize) {
          self.postMessage({
            type: 'batch',
            payload: batch
          });
          batch = [];
        }

        // Progress update every 5000 features
        if (processedCount % 5000 === 0) {
          self.postMessage({
            type: 'progress',
            payload: { processed: processedCount, total: obj.features.length }
          });
        }
      }

      // Send remaining batch
      if (batch.length > 0) {
        self.postMessage({
          type: 'batch',
          payload: batch
        });
      }

      // Send completion message
      self.postMessage({
        type: 'done',
        payload: { 
          count: processedCount,
          features: obj.features.length
        }
      });

    } catch (error) {
      self.postMessage({
        type: 'error',
        payload: error.message
      });
    }
  }
};